import crypto from 'node:crypto';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../errors/AppError.js';
import Appointment from '../../models/Appointment.js';
import Payment from '../../models/Payment.js';
import RefundRequest from '../../models/RefundRequest.js';
import User from '../../models/User.js';
import { AppointmentBookingService } from '../appointments/appointment-booking.service.js';
import { PaymentInitializationService } from './payment-initialization.service.js';
import { RefundService } from './refund.service.js';
import { NotificationService } from '../notifications/notification.service.js';
import { EmailDeliveryService } from '../notifications/email-delivery.service.js';
import { refundRequestEmail } from '../notifications/email-templates.js';

const appointmentDateLabel = (appointment, date = appointment?.appointmentStartAt) => {
  if (!date) return undefined;
  try {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: appointment.doctorSnapshot?.clinicTimeZone || 'UTC',
    }).format(date);
  } catch {
    return new Date(date).toISOString();
  }
};

const clientUrl = () => process.env.CLIENT_URL || 'http://localhost:3000';
const safeErrorCode = (error) => /^[a-z0-9_]{1,60}$/i.test(error?.code || '') ? error.code : 'email_enqueue_failed';

const activeStatuses = ['doctor_pending', 'admin_pending', 'refund_pending'];

export class RefundRequestService {
  constructor({
    appointmentModel = Appointment,
    paymentModel = Payment,
    requestModel = RefundRequest,
    userModel = User,
    bookingService = new AppointmentBookingService(),
    paymentInitializationService = new PaymentInitializationService(),
    refundService = new RefundService(),
    notificationService = new NotificationService(),
    emailDeliveryService = new EmailDeliveryService(),
    now = Date.now,
  } = {}) {
    this.appointmentModel = appointmentModel;
    this.paymentModel = paymentModel;
    this.requestModel = requestModel;
    this.userModel = userModel;
    this.bookingService = bookingService;
    this.paymentInitializationService = paymentInitializationService;
    this.refundService = refundService;
    this.notificationService = notificationService;
    this.emailDeliveryService = emailDeliveryService;
    this.now = now;
  }

  async createForPatient(appointmentId, patientId, { action, reason, newStartAt } = {}) {
    if (!['cancel', 'reschedule'].includes(action)) throw new BadRequestError('Choose cancel or reschedule.');
    const appointment = await this.appointmentModel.findById(appointmentId);
    if (!appointment) throw new NotFoundError('Appointment not found.');
    if (String(appointment.patient) !== String(patientId)) throw new ForbiddenError('You cannot change this appointment.');
    if (appointment.status !== 'confirmed') throw new ConflictError('Only confirmed appointments can be changed.');

    const payment = await this.paymentModel.findOne({ appointment: appointment._id, status: 'succeeded' }).sort({ createdAt: -1 });
    if (!payment) throw new ConflictError('Only appointments with a successful payment can be changed.');

    const existing = await this.requestModel.findOne({ appointment: appointment._id, status: { $in: activeStatuses } });
    if (existing) throw new ConflictError('A cancellation or reschedule request is already under review.');

    let requestedStartAt;
    if (action === 'reschedule') {
      requestedStartAt = new Date(newStartAt || '');
      if (Number.isNaN(requestedStartAt.valueOf()) || requestedStartAt.valueOf() <= this.now()) {
        throw new BadRequestError('Choose a future appointment time.');
      }
      await this.bookingService.validateSlot({
        doctorId: appointment.doctor,
        startAt: requestedStartAt,
        excludeAppointmentId: appointment._id,
        excludeHoldAppointmentId: appointment._id,
      });
    }

    const request = await this.requestModel.create({
      appointment: appointment._id,
      payment: payment._id,
      patient: appointment.patient,
      doctor: appointment.doctor,
      action,
      reason: reason?.trim(),
      requestedStartAt,
      status: 'doctor_pending',
      idempotencyKey: crypto.randomUUID(),
      statusHistory: [{ status: 'doctor_pending', actor: patientId, role: 'patient' }],
    });
    await this.notifyDoctorAndAdmins(request, 'refund_request_created');
    return this.toDto(request);
  }

  async listForDoctor(doctorId, { status = 'doctor_pending' } = {}) {
    const filter = { doctor: doctorId };
    if (status !== 'all') filter.status = status;
    return this.requestModel.find(filter)
      .populate('patient', 'name email')
      .populate('appointment', 'appointmentStartAt appointmentEndAt doctorSnapshot status')
      .sort({ createdAt: -1 })
      .lean();
  }

  async listForAdmin({ status = 'all' } = {}) {
    const filter = status === 'all' ? {} : { status };
    return this.requestModel.find(filter)
      .populate('patient', 'name email')
      .populate('doctor', 'name email')
      .populate('appointment', 'appointmentStartAt appointmentEndAt doctorSnapshot status')
      .sort({ createdAt: -1 })
      .lean();
  }

  async doctorDecision(requestId, doctorId, { decision, reason } = {}) {
    if (!['approve', 'reject'].includes(decision)) throw new BadRequestError('Choose approve or reject.');
    const request = await this.requestModel.findOne({ _id: requestId, doctor: doctorId });
    if (!request) throw new NotFoundError('Refund request not found.');
    if (request.status !== 'doctor_pending') throw new ConflictError('This request is no longer awaiting doctor review.');
    if (decision === 'reject' && !reason?.trim()) throw new BadRequestError('A rejection reason is required.');

    request.status = decision === 'approve' ? 'admin_pending' : 'rejected';
    request.rejectionReason = decision === 'reject' ? reason.trim() : undefined;
    request.statusHistory.push({
      status: request.status,
      actor: doctorId,
      role: 'doctor',
      reason: reason?.trim(),
    });
    await request.save();
    await this.notifyPatient(
      request,
      decision === 'approve' ? 'Your request is awaiting final admin approval.' : `Your request was declined: ${reason.trim()}`,
      decision === 'approve' ? 'doctor_approved' : 'doctor_rejected',
    );
    if (decision === 'approve') await this.notifyAdmins(request, 'refund_request_admin_review');
    return this.toDto(request);
  }

  async adminDecision(requestId, adminId, { decision, reason } = {}) {
    if (!['approve', 'reject'].includes(decision)) throw new BadRequestError('Choose approve or reject.');
    const request = await this.requestModel.findById(requestId);
    if (!request) throw new NotFoundError('Refund request not found.');
    if (request.status !== 'admin_pending') throw new ConflictError('This request is not awaiting admin approval.');
    if (decision === 'reject' && !reason?.trim()) throw new BadRequestError('A rejection reason is required.');

    if (decision === 'reject') {
      request.status = 'rejected';
      request.rejectionReason = reason.trim();
      request.statusHistory.push({ status: 'rejected', actor: adminId, role: 'admin', reason: reason.trim() });
      await request.save();
      await this.notifyPatient(request, `Your request was declined: ${reason.trim()}`, 'rejected');
      return this.toDto(request);
    }

    const payment = await this.paymentModel.findById(request.payment);
    if (!payment || payment.status !== 'succeeded') throw new ConflictError('The original payment is no longer refundable.');

    let replacement;
    if (request.action === 'reschedule') {
      await this.bookingService.validateSlot({
        doctorId: request.doctor,
        startAt: request.requestedStartAt,
        excludeAppointmentId: request.appointment,
        excludeHoldAppointmentId: request.appointment,
      });
      replacement = await this.paymentInitializationService.initialize(request.patient, {
        doctorId: request.doctor,
        startAt: request.requestedStartAt.toISOString(),
        idempotencyKey: `reschedule:${request._id}`,
      });
    }

    const refund = await this.refundService.createFullRefund({
      payment,
      reason: 'patient_cancellation',
      initiatedBy: adminId,
      idempotencyKey: `refund-request:${request._id}`,
      refundRequest: request._id,
    });

    const appointment = await this.appointmentModel.findById(request.appointment);
    if (!appointment) throw new NotFoundError('Appointment not found.');
    const cancelledAt = new Date(this.now());
    appointment.status = 'cancelled';
    appointment.paymentStatus = 'refund_pending';
    appointment.cancellation = {
      actor: request.patient,
      role: 'patient',
      reason: request.reason || (request.action === 'reschedule' ? 'Patient requested a date change.' : 'Patient requested cancellation.'),
      at: cancelledAt,
      refundEligible: true,
    };
    appointment.cancellationHistory.push({
      actor: request.patient,
      role: 'patient',
      reason: appointment.cancellation.reason,
      at: cancelledAt,
    });
    await appointment.save();

    request.status = 'refund_pending';
    request.refund = refund._id;
    request.replacementAppointment = replacement?.appointmentId;
    request.replacementPayment = replacement?.paymentId;
    request.statusHistory.push({ status: 'refund_pending', actor: adminId, role: 'admin' });
    await request.save();
    await this.notifyPatient(request, request.action === 'reschedule'
      ? 'Your date-change request was approved. Complete payment for the new appointment; your original payment refund is processing.'
      : 'Your cancellation was approved. Your full refund is processing.', 'approved');
    return { ...this.toDto(request), refundStatus: refund.status, replacement };
  }

  toDto(request) {
    return { ...request.toObject(), id: String(request._id) };
  }

  async notifyDoctorAndAdmins(request, type) {
    await this.notificationService.createNotification({
      recipient: request.doctor,
      type,
      title: request.action === 'reschedule' ? 'Date-change request needs review' : 'Refund request needs review',
      message: 'A patient request is waiting for your approval before final admin review.',
      data: { appointmentId: String(request.appointment), refundRequestId: String(request._id) },
      dedupeKey: `refund-request:${request._id}:doctor:${type}`,
    });
    const [doctor, appointment] = await Promise.all([
      this.userModel.findById(request.doctor).select('email'),
      this.appointmentModel.findById(request.appointment),
    ]);
    if (doctor?.email) {
      try {
        await this.emailDeliveryService.enqueue({
          to: doctor.email,
          ...refundRequestEmail({
            recipientRole: 'doctor',
            status: 'created',
            action: request.action,
            appointmentDate: appointmentDateLabel(appointment),
            requestedDate: appointmentDateLabel(appointment, request.requestedStartAt),
            reason: request.reason,
            reference: String(request.appointment),
            url: `${clientUrl()}/doctor/appointments`,
          }),
          dedupeKey: `refund-request:${request._id}:doctor-email:${type}`,
        });
      } catch (error) {
        console.error('Unable to queue doctor request email', { code: safeErrorCode(error) });
      }
    }
    const admins = await this.userModel.find({ role: 'admin', isActive: true }).select('_id');
    await Promise.all(admins.map((admin) => this.notificationService.createNotification({
      recipient: admin._id,
      type,
      title: 'Refund request opened',
      message: 'A patient refund request is waiting for doctor review.',
      data: { appointmentId: String(request.appointment), refundRequestId: String(request._id) },
      dedupeKey: `refund-request:${request._id}:admin:${admin._id}:${type}`,
    })));
  }

  async notifyAdmins(request, type) {
    const admins = await this.userModel.find({ role: 'admin', isActive: true }).select('_id');
    await Promise.all(admins.map((admin) => this.notificationService.createNotification({
      recipient: admin._id,
      type,
      title: 'Refund request ready for final approval',
      message: 'A doctor-approved refund request is ready for your review.',
      data: { appointmentId: String(request.appointment), refundRequestId: String(request._id) },
      dedupeKey: `refund-request:${request._id}:admin:${admin._id}:${type}`,
    })));
  }

  async notifyPatient(request, message, emailStatus) {
    await this.notificationService.createNotification({
      recipient: request.patient,
      type: 'refund_request_updated',
      title: 'Appointment request updated',
      message,
      data: { appointmentId: String(request.appointment), refundRequestId: String(request._id), status: request.status },
      dedupeKey: `refund-request:${request._id}:patient:${request.status}`,
    });
    const [patient, appointment] = await Promise.all([
      this.userModel.findById(request.patient).select('email'),
      this.appointmentModel.findById(request.appointment),
    ]);
    if (!patient?.email) return;
    try {
      await this.emailDeliveryService.enqueue({
        to: patient.email,
        ...refundRequestEmail({
          recipientRole: 'patient',
          status: emailStatus,
          action: request.action,
          appointmentDate: appointmentDateLabel(appointment),
          requestedDate: appointmentDateLabel(appointment, request.requestedStartAt),
          reason: request.rejectionReason,
          reference: String(request.appointment),
          url: `${clientUrl()}/patient/appointments?appointment=${request.appointment}`,
        }),
        dedupeKey: `refund-request:${request._id}:patient-email:${emailStatus}`,
      });
    } catch (error) {
      console.error('Unable to queue patient request email', { code: safeErrorCode(error) });
    }
  }
}
