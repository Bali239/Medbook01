import { BadRequestError, ConflictError, NotFoundError } from '../../errors/AppError.js';
import { getStripeClient } from '../../integrations/stripe/stripe.js';
import Payment from '../../models/Payment.js';
import Refund from '../../models/Refund.js';
import AuditLog from '../../models/AuditLog.js';
import Appointment from '../../models/Appointment.js';
import { PaymentNotificationService } from './payment-notification.service.js';
import Invoice from '../../models/Invoice.js';

export class RefundService {
  constructor({ stripeClientProvider = getStripeClient, paymentModel = Payment, refundModel = Refund, auditLogModel = AuditLog, appointmentModel = Appointment, invoiceModel = Invoice, paymentNotificationService = new PaymentNotificationService() } = {}) {
    this.stripeClientProvider = stripeClientProvider;
    this.paymentModel = paymentModel;
    this.refundModel = refundModel;
    this.auditLogModel = auditLogModel;
    this.appointmentModel = appointmentModel;
    this.invoiceModel = invoiceModel;
    this.paymentNotificationService = paymentNotificationService;
  }

  async createFullRefund({ payment, reason, adminReason, initiatedBy, idempotencyKey }) {
    const existing = await this.refundModel.findOne({ idempotencyKey });
    if (existing) {
      if (existing.status !== 'pending' || existing.stripeRefundId) return existing;
      return this.submitToStripe(existing, payment);
    }
    if (!payment || !['succeeded', 'partially_refunded'].includes(payment.status)) {
      throw new ConflictError('Only a successful payment can be refunded.');
    }
    const remaining = payment.amountMinor - payment.refundedAmountMinor - payment.refundReservedAmountMinor;
    if (!Number.isSafeInteger(remaining) || remaining <= 0) {
      throw new ConflictError('No refundable balance remains.');
    }

    return this.createRefund({
      payment,
      amountMinor: remaining,
      reason,
      adminReason,
      initiatedBy,
      idempotencyKey,
    });
  }

  async createRefund({ payment, amountMinor, reason, adminReason, initiatedBy, idempotencyKey }) {
    let existing = await this.refundModel.findOne({ idempotencyKey });
    if (existing) {
      if (existing.amountMinor !== amountMinor) {
        throw new ConflictError('This idempotency key was already used for a different refund amount.');
      }
      if (existing.status !== 'pending' || existing.stripeRefundId) return existing;
      return this.submitToStripe(existing, payment);
    }
    if (!payment || !['succeeded', 'partially_refunded'].includes(payment.status)) {
      throw new ConflictError('Only a successful payment can be refunded.');
    }
    const remaining = payment.amountMinor - payment.refundedAmountMinor - payment.refundReservedAmountMinor;
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > remaining) {
      throw new BadRequestError('The refund amount exceeds the refundable balance.');
    }

    if (reason === 'admin_override') {
      await this.auditLogModel.create({
        user: initiatedBy,
        action: 'payment.refund_requested',
        resource: 'payment',
        resourceId: String(payment._id),
        details: { amountMinor, reason: adminReason },
      });
    }

    const reservedPayment = await this.paymentModel.findOneAndUpdate(
      {
        _id: payment._id,
        status: { $in: ['succeeded', 'partially_refunded'] },
        $expr: {
          $lte: [
            { $add: ['$refundedAmountMinor', '$refundReservedAmountMinor', amountMinor] },
            '$amountMinor',
          ],
        },
      },
      { $inc: { refundReservedAmountMinor: amountMinor } },
      { new: true },
    );
    if (!reservedPayment) throw new ConflictError('The refundable payment balance changed.');

    let refund;
    try {
      refund = await this.refundModel.create({
        payment: payment._id,
        appointment: payment.appointment,
        patient: payment.patient,
        amountMinor,
        currency: payment.currency,
        reason,
        adminReason,
        initiatedBy,
        idempotencyKey,
        status: 'pending',
        statusHistory: [{ status: 'pending', source: 'api' }],
      });
    } catch (error) {
      await this.paymentModel.updateOne(
        { _id: payment._id },
        { $inc: { refundReservedAmountMinor: -amountMinor } },
      );
      if (error.code === 11000) {
        const duplicate = await this.refundModel.findOne({ idempotencyKey });
        if (duplicate) return duplicate;
      }
      throw error;
    }

    return this.submitToStripe(refund, payment);
  }

  async submitToStripe(refund, payment) {
    try {
      const stripeRefund = await this.stripeClientProvider().refunds.create({
        payment_intent: payment.stripePaymentIntentId,
        amount: refund.amountMinor,
        reason: 'requested_by_customer',
        metadata: {
          refund_id: String(refund._id),
          payment_id: String(payment._id),
          appointment_id: String(payment.appointment),
        },
      }, { idempotencyKey: `medbook-refund-${refund.idempotencyKey}` });

      refund.stripeRefundId = stripeRefund.id;
      refund.failureCode = stripeRefund.status === 'failed' ? stripeRefund.failure_reason : undefined;
      await refund.save();
      if (['succeeded', 'failed', 'canceled'].includes(stripeRefund.status)) {
        return this.updateFromStripe({ stripeRefund, source: 'api' });
      }
      return refund;
    } catch {
      throw new BadRequestError('The refund could not be submitted. It remains pending and can be safely retried.');
    }
  }

  async updateFromStripe({ stripeRefund, eventId, source = 'stripe_webhook' }) {
    const refund = await this.refundModel.findOne({
      $or: [
        { stripeRefundId: stripeRefund.id },
        ...(stripeRefund.metadata?.refund_id ? [{ _id: stripeRefund.metadata.refund_id }] : []),
      ],
    });
    if (!refund) throw new NotFoundError('Refund record was not found.');
    if (stripeRefund.amount !== refund.amountMinor || stripeRefund.currency !== refund.currency) {
      throw new ConflictError('Stripe refund does not match the stored refund amount.');
    }

    const nextStatus = stripeRefund.status === 'succeeded'
      ? 'succeeded'
      : stripeRefund.status === 'failed'
        ? 'failed'
        : stripeRefund.status === 'canceled'
          ? 'canceled'
          : 'pending';
    const payment = await this.paymentModel.findById(refund.payment);
    if (!payment) throw new NotFoundError('Payment record was not found.');
    const unchanged = refund.status === nextStatus && refund.stripeRefundId === stripeRefund.id;
    const reservedDelta = refund.status === 'pending' && nextStatus !== 'pending'
      ? -refund.amountMinor
      : 0;
    const refundedDelta = nextStatus === 'succeeded' && refund.status !== 'succeeded'
      ? refund.amountMinor
      : 0;

    refund.stripeRefundId = stripeRefund.id;
    refund.status = nextStatus;
    refund.failureCode = stripeRefund.failure_reason || undefined;
    if (!unchanged) refund.statusHistory.push({ status: nextStatus, source, eventId });
    await refund.save();

    payment.refundReservedAmountMinor = Math.max(0, payment.refundReservedAmountMinor + reservedDelta);
    payment.refundedAmountMinor += refundedDelta;
    payment.refundStatus = nextStatus === 'failed' || nextStatus === 'canceled'
      ? 'failed'
      : payment.refundedAmountMinor >= payment.amountMinor
        ? 'refunded'
        : payment.refundedAmountMinor > 0
          ? 'partially_refunded'
          : 'pending';
    if (payment.refundStatus === 'refunded') payment.status = 'refunded';
    else if (payment.refundedAmountMinor > 0) payment.status = 'partially_refunded';
    await payment.save();

    await this.appointmentModel.updateOne(
      { _id: refund.appointment },
      {
        $set: {
          paymentStatus: payment.refundStatus === 'refunded'
            ? 'refunded'
            : payment.refundedAmountMinor > 0
              ? 'partially_refunded'
              : 'refund_pending',
        },
      },
    );
    await this.invoiceModel.updateOne(
      { payment: payment._id },
      { $set: { paymentStatus: payment.refundStatus === 'refunded' ? 'refunded' : payment.refundedAmountMinor > 0 ? 'partially_refunded' : 'paid' } },
    );
    await this.paymentNotificationService.notifyRefundUpdated(refund, payment);

    return refund;
  }
}