import mongoose from 'mongoose';
import { AppError, NotFoundError } from '../../errors/AppError.js';
import { getStripeClient } from '../../integrations/stripe/stripe.js';
import Appointment from '../../models/Appointment.js';
import Payment from '../../models/Payment.js';
import SlotHold from '../../models/SlotHold.js';
import StripeWebhookEvent from '../../models/StripeWebhookEvent.js';
import { AppointmentBookingService } from '../appointments/appointment-booking.service.js';
import { RefundService } from './refund.service.js';
import { InvoiceService } from './invoice.service.js';
import { PaymentNotificationService } from './payment-notification.service.js';
import { EmailDeliveryService } from '../notifications/email-delivery.service.js';

const terminalPaymentStates = ['succeeded', 'partially_refunded', 'refunded', 'disputed'];
const stringId = (value) => (typeof value === 'string' ? value : value?.id);

export class StripeWebhookWorker {
  constructor({
    eventModel = StripeWebhookEvent,
    paymentModel = Payment,
    appointmentModel = Appointment,
    holdModel = SlotHold,
    stripeClientProvider = getStripeClient,
    bookingService = new AppointmentBookingService(),
    refundService = new RefundService(),
    invoiceService = new InvoiceService(),
    paymentNotificationService = new PaymentNotificationService(),
    emailDeliveryService = new EmailDeliveryService(),
    connection = mongoose,
    now = Date.now,
    logger = console,
  } = {}) {
    this.eventModel = eventModel;
    this.paymentModel = paymentModel;
    this.appointmentModel = appointmentModel;
    this.holdModel = holdModel;
    this.stripeClientProvider = stripeClientProvider;
    this.bookingService = bookingService;
    this.refundService = refundService;
    this.invoiceService = invoiceService;
    this.paymentNotificationService = paymentNotificationService;
    this.emailDeliveryService = emailDeliveryService;
    this.connection = connection;
    this.now = now;
    this.logger = logger;
    this.isRunning = false;
    this.lastReconciliationAt = 0;
  }

  async processNext() {
    const now = new Date(this.now());
    const event = await this.eventModel.findOneAndUpdate(
      {
        $or: [
          { status: 'received' },
          { status: 'failed', nextAttemptAt: { $lte: now } },
          { status: 'processing', leaseExpiresAt: { $lte: now } },
        ],
      },
      {
        $set: { status: 'processing', leaseExpiresAt: new Date(this.now() + 60_000) },
        $inc: { attemptCount: 1 },
      },
      { sort: { receivedAt: 1 }, returnDocument: 'after' },
    ).select('+payload');

    if (!event) return false;
    try {
      await this.processEvent(event);
      await this.eventModel.updateOne(
        { _id: event._id, status: 'processing' },
        { $set: { status: 'processed', processedAt: new Date(this.now()) }, $unset: { leaseExpiresAt: 1, lastError: 1 } },
      );
    } catch (error) {
      const delayMs = Math.min(60 * 60_000, 1000 * (2 ** Math.min(event.attemptCount, 12)));
      await this.eventModel.updateOne(
        { _id: event._id, status: 'processing' },
        {
          $set: {
            status: 'failed',
            nextAttemptAt: new Date(this.now() + delayMs),
            lastError: this.safeErrorCode(error),
          },
          $unset: { leaseExpiresAt: 1 },
        },
      );
      this.logger.error('Stripe webhook processing failed', {
        eventId: event.stripeEventId,
        eventType: event.eventType,
        code: this.safeErrorCode(error),
      });
    }
    return true;
  }

  safeErrorCode(error) {
    return /^[a-z0-9_]{1,60}$/i.test(error?.code || '')
      ? error.code
      : 'webhook_processing_failed';
  }

  async processEvent(event) {
    const object = event.payload?.object;
    if (!object?.id) throw new AppError('Stripe event object is missing.', 400);

    if (event.eventType.startsWith('payment_intent.')) {
      return this.processPaymentIntent(event, object);
    }
    if (event.eventType === 'charge.succeeded') return this.processChargeSucceeded(object);
    if (event.eventType.startsWith('refund.')) {
      const refund = await this.stripeClientProvider().refunds.retrieve(object.id);
      return this.refundService.updateFromStripe({ stripeRefund: refund, eventId: event.stripeEventId });
    }
    if (event.eventType === 'charge.refunded') {
      const refunds = await this.stripeClientProvider().refunds.list({ charge: object.id, limit: 100 });
      for (const refund of refunds.data) {
        await this.refundService.updateFromStripe({ stripeRefund: refund, eventId: event.stripeEventId });
      }
      return;
    }
    if (event.eventType === 'charge.dispute.created' || event.eventType === 'charge.dispute.closed') {
      return this.processDispute(event, object);
    }
  }

  async processPaymentIntent(event, eventObject) {
    let payment = await this.paymentModel.findOne({ stripePaymentIntentId: eventObject.id });
    if (!payment && eventObject.metadata?.payment_id) {
      payment = await this.paymentModel.findById(eventObject.metadata.payment_id);
    }
    if (!payment) throw new NotFoundError('Payment record for the Stripe intent was not found.');
    if (payment.stripePaymentIntentId && payment.stripePaymentIntentId !== eventObject.id) {
      throw new AppError('Payment intent does not match the stored payment.', 409);
    }

    const stripeClient = this.stripeClientProvider();
    const intent = await stripeClient.paymentIntents.retrieve(eventObject.id);
    if (
      intent.amount !== payment.amountMinor
      || intent.currency !== payment.currency
      || stringId(intent.customer) !== payment.stripeCustomerId
    ) {
      throw new AppError('Payment intent does not match the stored pricing.', 409);
    }

    if (intent.status === 'succeeded') {
      if (typeof intent.latest_charge === 'string') {
        intent.latest_charge = await stripeClient.charges.retrieve(intent.latest_charge);
      }
      return this.confirmOrRefund(event, payment, intent);
    }
    if (intent.status === 'processing') {
      await this.setPaymentState(event, payment, 'processing', 'processing');
      return;
    }
    if (intent.status === 'canceled') {
      await this.setPaymentState(event, payment, 'canceled', 'cancelled');
      return;
    }
    if (intent.last_payment_error || event.eventType === 'payment_intent.payment_failed') {
      await this.setPaymentState(event, payment, 'failed', 'failed', intent.last_payment_error?.code);
      await this.paymentNotificationService.notifyPaymentFailed(payment);
    }
  }

  async processChargeSucceeded(charge) {
    const intentId = stringId(charge.payment_intent);
    if (!intentId) return;
    let payment = await this.paymentModel.findOne({ stripePaymentIntentId: intentId });
    if (!payment) {
      const intent = await this.stripeClientProvider().paymentIntents.retrieve(intentId);
      if (intent.metadata?.payment_id) payment = await this.paymentModel.findById(intent.metadata.payment_id);
    }
    if (!payment) throw new NotFoundError('Payment record for the Stripe charge was not found.');
    if (!payment.stripeChargeId) {
      payment.stripeChargeId = charge.id;
      const methodDetails = charge.payment_method_details;
      if (methodDetails) {
        payment.paymentMethod = {
          type: methodDetails.type,
          brand: methodDetails.card?.brand,
          last4: methodDetails.card?.last4,
        };
      }
      await payment.save();
    }
  }

  async reconcileStalePayments({ olderThanMs = 5 * 60_000, limit = 25 } = {}) {
    const cutoff = new Date(this.now() - olderThanMs);
    const payments = await this.paymentModel.find({
      status: { $in: ['pending', 'processing'] },
      stripePaymentIntentId: { $exists: true, $ne: null },
      updatedAt: { $lte: cutoff },
    }).sort({ updatedAt: 1 }).limit(limit);
    let reconciled = 0;

    for (const payment of payments) {
      try {
        const intent = await this.stripeClientProvider().paymentIntents.retrieve(payment.stripePaymentIntentId);
        await this.processPaymentIntent({
          stripeEventId: `reconcile:${intent.id}:${intent.status}`,
          eventType: `payment_intent.${intent.status}`,
          source: 'reconciliation',
        }, intent);
        reconciled += 1;
      } catch (error) {
        this.logger.error('Stripe payment reconciliation failed', {
          paymentId: String(payment._id),
          code: this.safeErrorCode(error),
        });
      }
    }
    return reconciled;
  }

  async setPaymentState(event, payment, paymentStatus, appointmentPaymentStatus, reasonCode) {
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const currentPayment = await this.paymentModel.findById(payment._id).session(session);
        if (!currentPayment || terminalPaymentStates.includes(currentPayment.status)) return;
        currentPayment.status = paymentStatus;
        currentPayment.statusHistory.push({
          status: paymentStatus,
          source: event.source || 'stripe_webhook',
          eventId: event.stripeEventId,
          reasonCode,
          at: new Date(this.now()),
        });
        if (reasonCode) currentPayment.failure = { code: reasonCode };
        await currentPayment.save({ session });

        const appointment = await this.appointmentModel.findById(currentPayment.appointment).session(session);
        if (appointment && appointment.status === 'pending_payment') {
          appointment.paymentStatus = appointmentPaymentStatus;
          if (paymentStatus === 'canceled') appointment.status = 'cancelled';
          await appointment.save({ session });
        }
        if (paymentStatus === 'canceled') {
          await this.holdModel.updateMany(
            { appointment: appointment?._id, patient: currentPayment.patient, status: 'active' },
            { $set: { status: 'released', expiresAt: new Date(this.now()) } },
            { session },
          );
        }
      });
    } finally {
      await session.endSession();
    }
  }

  async confirmOrRefund(event, payment, intent) {
    let fulfillable = false;
    let shouldCompensate = true;
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const currentPayment = await this.paymentModel.findById(payment._id).session(session);
        const appointment = await this.appointmentModel.findById(payment.appointment).session(session);
        if (!currentPayment || !appointment) throw new NotFoundError('Payment booking record was not found.');
        if (terminalPaymentStates.includes(currentPayment.status)) {
          fulfillable = currentPayment.status === 'succeeded';
          shouldCompensate = false;
          return;
        }

        if (['pending_payment', 'expired'].includes(appointment.status)) {
          try {
            await this.bookingService.validateSlot({
              doctorId: appointment.doctor,
              startAt: appointment.appointmentStartAt,
              session,
              excludeAppointmentId: appointment._id,
              excludeHoldAppointmentId: appointment._id,
            });
            fulfillable = true;
          } catch (error) {
            if (!(error.statusCode >= 400 && error.statusCode < 500)) throw error;
            fulfillable = false;
          }
        }

        currentPayment.stripePaymentIntentId = intent.id;
        currentPayment.stripeChargeId = stringId(intent.latest_charge);
        const methodDetails = intent.latest_charge?.payment_method_details;
        if (methodDetails) {
          currentPayment.paymentMethod = {
            type: methodDetails.type,
            brand: methodDetails.card?.brand,
            last4: methodDetails.card?.last4,
          };
        }
        currentPayment.status = 'succeeded';
        currentPayment.statusHistory.push({
          status: 'succeeded',
          source: event.source || 'stripe_webhook',
          eventId: event.stripeEventId,
          at: new Date(this.now()),
        });
        await currentPayment.save({ session });

        if (fulfillable) {
          appointment.status = 'confirmed';
          appointment.paymentStatus = 'paid';
          await appointment.save({ session });
          await this.holdModel.updateMany(
            { appointment: appointment._id, status: 'active' },
            { $set: { status: 'consumed', expiresAt: new Date(this.now()) } },
            { session },
          );
          return;
        }

        appointment.status = 'expired';
        appointment.paymentStatus = 'refund_pending';
        await appointment.save({ session });
        currentPayment.refundStatus = 'pending';
        await currentPayment.save({ session });
        await this.holdModel.updateMany(
          { appointment: appointment._id, status: 'active' },
          { $set: { status: 'released', expiresAt: new Date(this.now()) } },
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    if (!fulfillable && shouldCompensate) {
      const currentPayment = await this.paymentModel.findById(payment._id);
      await this.refundService.createFullRefund({
        payment: currentPayment,
        reason: 'appointment_unavailable',
        idempotencyKey: `late-payment-${payment._id}`,
      });
      await this.paymentNotificationService.notifyUnfulfillablePayment(currentPayment);
    } else if (fulfillable) {
      await this.invoiceService.createForSuccessfulPayment(payment._id);
      const currentPayment = await this.paymentModel.findById(payment._id);
      await this.paymentNotificationService.notifyBookingConfirmed(currentPayment);
    }
  }

  async processDispute(event, dispute) {
    const intentId = stringId(dispute.payment_intent);
    if (!intentId) return;
    const payment = await this.paymentModel.findOne({ stripePaymentIntentId: intentId });
    if (!payment) throw new NotFoundError('Payment record for the dispute was not found.');
    payment.status = event.eventType === 'charge.dispute.created'
      ? 'disputed'
      : dispute.status === 'won'
        ? 'succeeded'
        : 'disputed';
    payment.statusHistory.push({
      status: payment.status,
      source: 'stripe_webhook',
      eventId: event.stripeEventId,
      reasonCode: dispute.reason,
      at: new Date(this.now()),
    });
    await payment.save();
  }

  start({ pollIntervalMs = 1000 } = {}) {
    if (this.isRunning) return;
    this.isRunning = true;
    const poll = async () => {
      if (!this.isRunning) return;
      try {
        const processed = await this.processNext();
        if (processed) return setImmediate(poll);
        const processedEmail = await this.emailDeliveryService.processNext();
        if (processedEmail) return setImmediate(poll);
        if (this.now() - this.lastReconciliationAt >= 60_000) {
          this.lastReconciliationAt = this.now();
          await this.reconcileStalePayments();
        }
      } catch (error) {
        this.logger.error('Stripe webhook worker polling failed', { code: this.safeErrorCode(error) });
      }
      const timer = setTimeout(poll, pollIntervalMs);
      timer.unref?.();
    };
    void poll();
  }

  stop() {
    this.isRunning = false;
  }
}
