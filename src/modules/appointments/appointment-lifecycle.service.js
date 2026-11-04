import mongoose from 'mongoose';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../errors/AppError.js';
import Appointment from '../../models/Appointment.js';
import Payment from '../../models/Payment.js';
import AuditLog from '../../models/AuditLog.js';
import { RefundService } from '../payments/refund.service.js';
import { PaymentNotificationService } from '../payments/payment-notification.service.js';

const patientCancellationCutoffMs = 24 * 60 * 60 * 1000;

export class AppointmentLifecycleService {
  constructor({ appointmentModel = Appointment, paymentModel = Payment, auditLogModel = AuditLog, refundService = new RefundService(), paymentNotificationService = new PaymentNotificationService(), connection = mongoose, now = Date.now } = {}) {
    this.appointmentModel = appointmentModel;
    this.paymentModel = paymentModel;
    this.auditLogModel = auditLogModel;
    this.refundService = refundService;
    this.paymentNotificationService = paymentNotificationService;
    this.connection = connection;
    this.now = now;
  }

  async updateStatus(appointmentId, actor, { status, reason } = {}) {
    const appointment = await this.appointmentModel.findById(appointmentId);
    if (!appointment) throw new NotFoundError('We could not find this appointment.');
    if (actor.role !== 'doctor' || String(appointment.doctor) !== String(actor.id)) {
      throw new ForbiddenError('You can only update your own appointments.');
    }

    if (status === 'cancelled') {
      return this.cancel(appointmentId, actor, { reason: reason || 'Cancelled by doctor.' });
    }
    if (status === 'confirmed') {
      if (appointment.status !== 'pending') {
        throw new ConflictError('Only pending appointments can be confirmed.');
      }
      appointment.status = 'confirmed';
    } else if (status === 'completed') {
      if (appointment.status !== 'confirmed') {
        throw new ConflictError('Only confirmed appointments can be marked complete.');
      }
      const appointmentStart = appointment.appointmentStartAt
        || new Date(`${appointment.appointmentDate.toISOString().slice(0, 10)}T${appointment.startTime}:00.000Z`);
      if (appointmentStart.valueOf() > this.now()) {
        throw new ConflictError('This appointment has not started yet. You can mark it complete after the scheduled start time.');
      }
      appointment.status = 'completed';
    }

    await appointment.save();
    return {
      ...appointment.toObject(),
      id: String(appointment._id),
      appointmentId: String(appointment._id),
      status: appointment.status,
    };
  }

  async cancel(appointmentId, actor, { reason } = {}) {
    if (['doctor', 'admin'].includes(actor.role) && !reason?.trim()) {
      throw new BadRequestError('A cancellation reason is required.');
    }

    let appointment;
    let refundEligible = false;
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        appointment = await this.appointmentModel.findById(appointmentId).session(session);
        if (!appointment) throw new NotFoundError('Appointment not found.');

        if (actor.role === 'patient' && String(appointment.patient) !== String(actor.id)) {
          throw new ForbiddenError('You cannot cancel this appointment.');
        }
        if (actor.role === 'doctor' && String(appointment.doctor) !== String(actor.id)) {
          throw new ForbiddenError('You cannot cancel this appointment.');
        }
        if (!['patient', 'doctor', 'admin'].includes(actor.role)) {
          throw new ForbiddenError('You cannot cancel this appointment.');
        }

        if (appointment.status === 'cancelled') {
          refundEligible = Boolean(appointment.cancellation?.refundEligible);
          return;
        }
        if (appointment.status !== 'confirmed') {
          throw new ConflictError('Only confirmed appointments can be canceled through this workflow.');
        }

        const appointmentStart = appointment.appointmentStartAt
          || new Date(`${appointment.appointmentDate.toISOString().slice(0, 10)}T${appointment.startTime}:00.000Z`);
        refundEligible = actor.role !== 'patient'
          || appointmentStart.valueOf() - this.now() >= patientCancellationCutoffMs;

        const cancelledAt = new Date(this.now());
        appointment.status = 'cancelled';
        appointment.cancellation = {
          actor: actor.id,
          role: actor.role,
          reason: reason?.trim(),
          at: cancelledAt,
          refundEligible,
        };
        appointment.cancellationHistory.push({
          actor: actor.id,
          role: actor.role,
          reason: reason?.trim(),
          at: cancelledAt,
        });
        await appointment.save({ session });

        if (actor.role === 'admin') {
          await this.auditLogModel.create([{
            user: actor.id,
            action: 'appointment.cancelled',
            resource: 'appointment',
            resourceId: String(appointment._id),
            details: { reason: reason.trim(), refundEligible },
          }], { session });
        }
      });
    } finally {
      await session.endSession();
    }

    const payment = await this.paymentModel.findOne({ appointment: appointment._id }).sort({ createdAt: -1 });
    let refund = null;
    if (refundEligible && payment && ['succeeded', 'partially_refunded'].includes(payment.status)) {
      refund = await this.refundService.createFullRefund({
        payment,
        reason: actor.role === 'patient' ? 'patient_cancellation' : actor.role === 'doctor' ? 'doctor_cancellation' : 'admin_override',
        adminReason: actor.role === 'admin' ? reason.trim() : undefined,
        initiatedBy: actor.id,
        idempotencyKey: `appointment-cancellation:${appointment._id}`,
      });
      appointment.paymentStatus = refund.status === 'succeeded' ? 'refunded' : 'refund_pending';
      await appointment.save();
    }
    await this.paymentNotificationService.notifyAppointmentCancelled(appointment, { refundEligible });

    return {
      appointmentId: String(appointment._id),
      status: appointment.status,
      refundEligible,
      refundStatus: refund?.status || payment?.refundStatus || 'none',
      refundId: refund ? String(refund._id) : null,
    };
  }
}
