import { BadRequestError, ConflictError, NotFoundError } from '../../errors/AppError.js';
import { getStripeClient } from '../../integrations/stripe/stripe.js';
import Appointment from '../../models/Appointment.js';
import Payment from '../../models/Payment.js';
import SlotHold from '../../models/SlotHold.js';
import Refund from '../../models/Refund.js';
import User from '../../models/User.js';
import RefundRequest from '../../models/RefundRequest.js';

const paymentDto = (payment) => ({
  id: String(payment._id),
  appointmentId: String(payment.appointment),
  doctorId: String(payment.doctor),
  amountMinor: payment.amountMinor,
  currency: payment.currency,
  pricingSnapshot: payment.pricingSnapshot,
  status: payment.status,
  refundStatus: payment.refundStatus,
  refundedAmountMinor: payment.refundedAmountMinor,
  failure: payment.failure,
  paymentMethod: payment.paymentMethod,
  statusHistory: payment.statusHistory,
  createdAt: payment.createdAt,
  updatedAt: payment.updatedAt,
  refundRequestStatus: payment.refundRequestStatus,
});

export class PaymentQueryService {
  constructor({ paymentModel = Payment, appointmentModel = Appointment, userModel = User, refundRequestModel = RefundRequest, stripeClientProvider = getStripeClient } = {}) {
    this.paymentModel = paymentModel;
    this.appointmentModel = appointmentModel;
    this.userModel = userModel;
    this.refundRequestModel = refundRequestModel;
    this.stripeClientProvider = stripeClientProvider;
  }

  ownershipFilter(actor) {
    return actor.role === 'admin' ? {} : { patient: actor.id };
  }

  async toDto(payment, actor) {
    const [appointment, hold, patient, refundRequest] = await Promise.all([
      this.appointmentModel.findById(payment.appointment),
      SlotHold.findOne({ appointment: payment.appointment }),
      actor.role === 'admin'
        ? this.userModel.findById(payment.patient).select('name email')
        : Promise.resolve(null),
      this.refundRequestModel.findOne({ appointment: payment.appointment, status: { $in: ['doctor_pending', 'admin_pending', 'refund_pending'] } }).select('status action'),
    ]);
    return {
      ...paymentDto(payment),
      refundRequestStatus: refundRequest?.status || null,
      refundRequestAction: refundRequest?.action || null,
      ...(patient ? { patient: { id: String(patient._id), name: patient.name, email: patient.email } } : {}),
      appointmentSummary: appointment ? {
        appointmentDate: appointment.appointmentDate,
        startAt: appointment.appointmentStartAt,
        endAt: appointment.appointmentEndAt,
        doctor: appointment.doctorSnapshot,
        durationMinutes: appointment.appointmentDurationMinutes,
        status: appointment.status,
        paymentStatus: appointment.paymentStatus,
      } : null,
      holdExpiresAt: hold?.expiresAt || appointment?.holdExpiresAt || null,
    };
  }

  async getById(paymentId, actor) {
    const payment = await this.paymentModel.findOne({ _id: paymentId, ...this.ownershipFilter(actor) });
    if (!payment) throw new NotFoundError('Payment not found.');
    return this.toDto(payment, actor);
  }

  async getByAppointment(appointmentId, actor) {
    const appointment = await this.appointmentModel.findOne({
      _id: appointmentId,
      ...(actor.role === 'admin' ? {} : { patient: actor.id }),
    });
    if (!appointment) throw new NotFoundError('Appointment not found.');
    const payment = await this.paymentModel.findOne({ appointment: appointment._id }).sort({ createdAt: -1 });
    return payment ? this.toDto(payment, actor) : null;
  }

  async list(actor, { page = 1, limit = 20 } = {}) {
    const filter = this.ownershipFilter(actor);
    const [payments, total] = await Promise.all([
      this.paymentModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      this.paymentModel.countDocuments(filter),
    ]);
    return { payments: await Promise.all(payments.map((payment) => this.toDto(payment, actor))), total, page, limit };
  }

  async cancel(paymentId, actor) {
    const payment = await this.paymentModel.findOne({ _id: paymentId, ...this.ownershipFilter(actor) });
    if (!payment) throw new NotFoundError('Payment not found.');
    if (!['pending', 'requires_action', 'failed'].includes(payment.status) || !payment.stripePaymentIntentId) {
      throw new ConflictError('This payment can no longer be canceled.');
    }

    try {
      const stripeClient = this.stripeClientProvider();
      const intent = await stripeClient.paymentIntents.retrieve(payment.stripePaymentIntentId);
      if (!['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(intent.status)) {
        throw new ConflictError('The payment is already processing and cannot be canceled.');
      }
      await stripeClient.paymentIntents.cancel(intent.id, {}, {
        idempotencyKey: `medbook-cancel-${payment._id}`,
      });
    } catch (error) {
      if (error instanceof ConflictError) throw error;
      throw new BadRequestError('The payment could not be canceled. Refresh its status and try again.');
    }

    return { paymentId: String(payment._id), status: payment.status, cancellationRequested: true };
  }

  async getRefunds(paymentId, actor) {
    const payment = await this.paymentModel.findOne({ _id: paymentId, ...this.ownershipFilter(actor) });
    if (!payment) throw new NotFoundError('Payment not found.');
    const refunds = await Refund.find({ payment: payment._id }).sort({ createdAt: -1 });
    return refunds;
  }
}
