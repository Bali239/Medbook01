import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { AppError, ConflictError, ForbiddenError } from '../../errors/AppError.js';
import { getStripeClient } from '../../integrations/stripe/stripe.js';
import Appointment from '../../models/Appointment.js';
import Payment from '../../models/Payment.js';
import SlotHold from '../../models/SlotHold.js';
import User from '../../models/User.js';
import { AppointmentBookingService } from '../appointments/appointment-booking.service.js';
import { fetchPkrUsdQuote } from './fx-rate.service.js';
import { createPricingSnapshot } from './payment-pricing.js';
import { StripeCustomerService } from './stripe-customer.service.js';
import { StripeProductService } from './stripe-product.service.js';
import { env } from '../../config/env.js';

const requestFingerprint = ({ doctorId, startAt }) => createHash('sha256')
  .update(`${doctorId}:${new Date(startAt).toISOString()}`)
  .digest('hex');

const sameId = (left, right) => String(left) === String(right);

export class PaymentInitializationService {
  constructor({
    stripeClientProvider = getStripeClient,
    customerService = new StripeCustomerService(),
    productService = new StripeProductService(),
    bookingService = new AppointmentBookingService(),
    fxQuoteProvider = fetchPkrUsdQuote,
    appointmentModel = Appointment,
    paymentModel = Payment,
    slotHoldModel = SlotHold,
    userModel = User,
    connection = mongoose,
  } = {}) {
    this.stripeClientProvider = stripeClientProvider;
    this.customerService = customerService;
    this.productService = productService;
    this.bookingService = bookingService;
    this.fxQuoteProvider = fxQuoteProvider;
    this.appointmentModel = appointmentModel;
    this.paymentModel = paymentModel;
    this.slotHoldModel = slotHoldModel;
    this.userModel = userModel;
    this.connection = connection;
  }

  async initialize(patientId, payload) {
    this.stripeClientProvider();
    const fingerprint = requestFingerprint(payload);
    const existing = await this.paymentModel.findOne({ idempotencyKey: payload.idempotencyKey });
    if (existing) {
      this.assertSameAttempt(existing, patientId, fingerprint);
      return this.createOrRetrieveIntent(existing);
    }

    const patient = await this.userModel.findById(patientId).select('role isActive');
    if (!patient || patient.role !== 'patient' || !patient.isActive) {
      throw new ForbiddenError('An active patient account is required.');
    }

    const { profile } = await this.bookingService.validateSlot(payload);
    const quote = await this.fxQuoteProvider();
    const pricingSnapshot = createPricingSnapshot({
      feePaisa: profile.consultationFeePaisa,
      quote,
      currency: env.PAYMENT_CURRENCY,
    });

    let stripeCustomer;
    let product;
    try {
      [stripeCustomer, product] = await Promise.all([
        this.customerService.getOrCreateForPatient(patientId),
        this.productService.ensureConsultationProduct(),
      ]);
    } catch {
      throw new AppError('Payment setup is temporarily unavailable. Please try again.', 503);
    }

    let payment;
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const concurrentAttempt = await this.paymentModel.findOne({
          idempotencyKey: payload.idempotencyKey,
        }).session(session);
        if (concurrentAttempt) {
          this.assertSameAttempt(concurrentAttempt, patientId, fingerprint);
          payment = concurrentAttempt;
          return;
        }

        const booking = await this.bookingService.reservePaymentBooking({
          patientId,
          ...payload,
          pricingSnapshot,
          session,
        });
        const [createdPayment] = await this.paymentModel.create([{
          appointment: booking.appointment._id,
          patient: patientId,
          doctor: booking.doctor._id,
          stripeCustomerId: stripeCustomer.id,
          amountMinor: pricingSnapshot.amountMinor,
          currency: pricingSnapshot.currency,
          pricingSnapshot,
          status: 'pending',
          idempotencyKey: payload.idempotencyKey,
          requestFingerprint: fingerprint,
          activePaymentKey: `appointment:${booking.appointment._id}`,
          statusHistory: [{ status: 'pending', source: 'api' }],
        }], { session });

        booking.appointment.payment = createdPayment._id;
        await booking.appointment.save({ session });
        await this.slotHoldModel.updateMany(
          { appointment: booking.appointment._id },
          { $set: { payment: createdPayment._id } },
          { session },
        );
        payment = createdPayment;
      });
    } catch (error) {
      if (error.code === 11000) {
        const concurrentAttempt = await this.paymentModel.findOne({
          idempotencyKey: payload.idempotencyKey,
        });
        if (concurrentAttempt) {
          this.assertSameAttempt(concurrentAttempt, patientId, fingerprint);
          payment = concurrentAttempt;
        } else {
          throw new ConflictError('That appointment time has just been reserved.');
        }
      } else {
        throw error;
      }
    } finally {
      await session.endSession();
    }

    return this.createOrRetrieveIntent(payment, stripeCustomer.id, product.id);
  }

  async retry(patientId, paymentId) {
    const payment = await this.paymentModel.findOne({ _id: paymentId, patient: patientId });
    if (!payment) throw new ForbiddenError('This payment attempt does not belong to you.');
    if (!['pending', 'failed', 'requires_action'].includes(payment.status)) {
      throw new ConflictError('This payment attempt cannot be retried.');
    }
    return this.createOrRetrieveIntent(payment);
  }

  assertSameAttempt(payment, patientId, fingerprint) {
    if (!sameId(payment.patient, patientId)) {
      throw new ForbiddenError('This payment attempt does not belong to you.');
    }
    if (payment.requestFingerprint !== fingerprint) {
      throw new ConflictError('This idempotency key was already used for a different appointment.');
    }
  }

  async createOrRetrieveIntent(payment, customerId = payment.stripeCustomerId, productId) {
    const stripeClient = this.stripeClientProvider();
    const [appointment, hold] = await Promise.all([
      this.appointmentModel.findById(payment.appointment),
      this.slotHoldModel.findOne({ appointment: payment.appointment }),
    ]);
    let intent;

    try {
      if (payment.stripePaymentIntentId) {
        intent = await stripeClient.paymentIntents.retrieve(payment.stripePaymentIntentId);
      } else {
        intent = await stripeClient.paymentIntents.create({
          amount: payment.amountMinor,
          currency: payment.currency,
          customer: customerId,
          automatic_payment_methods: { enabled: true },
          description: 'Medical consultation appointment',
          metadata: {
            payment_id: String(payment._id),
            appointment_id: String(payment.appointment),
            patient_id: String(payment.patient),
            doctor_id: String(payment.doctor),
            ...(productId ? { product_id: productId } : {}),
          },
        }, {
          idempotencyKey: `medbook-payment-${payment.idempotencyKey}`,
        });
      }
    } catch {
      throw new AppError('Payment could not be initialized. Retry the same payment attempt shortly.', 503);
    }

    if (!payment.stripePaymentIntentId) {
      await this.paymentModel.updateOne(
        { _id: payment._id, stripePaymentIntentId: { $exists: false } },
        { $set: { stripePaymentIntentId: intent.id } },
      );
    }

    return {
      paymentId: String(payment._id),
      appointmentId: String(payment.appointment),
      status: payment.status,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      pricingSnapshot: payment.pricingSnapshot,
      appointmentSummary: appointment ? {
        appointmentDate: appointment.appointmentDate,
        startAt: appointment.appointmentStartAt,
        endAt: appointment.appointmentEndAt,
        doctor: appointment.doctorSnapshot,
        durationMinutes: appointment.appointmentDurationMinutes,
      } : null,
      holdExpiresAt: hold?.expiresAt || appointment?.holdExpiresAt || null,
      clientSecret: ['succeeded', 'canceled', 'refunded', 'partially_refunded', 'disputed'].includes(payment.status)
        || intent.status === 'canceled'
        ? null
        : intent.client_secret,
    };
  }
}