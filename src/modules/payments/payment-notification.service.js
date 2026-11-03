import { NotificationService } from '../notifications/notification.service.js';
import { EmailDeliveryService } from '../notifications/email-delivery.service.js';
import Appointment from '../../models/Appointment.js';
import User from '../../models/User.js';
import { env } from '../../config/env.js';

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

const appointmentDateLabel = (appointment) => {
  if (!appointment?.appointmentStartAt) return 'your appointment';
  try {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: appointment.doctorSnapshot?.clinicTimeZone || 'UTC',
    }).format(appointment.appointmentStartAt);
  } catch {
    return appointment.appointmentStartAt.toISOString();
  }
};

export class PaymentNotificationService {
  constructor({ notificationService = new NotificationService(), emailDeliveryService = new EmailDeliveryService(), appointmentModel = Appointment, userModel = User } = {}) {
    this.notificationService = notificationService;
    this.emailDeliveryService = emailDeliveryService;
    this.appointmentModel = appointmentModel;
    this.userModel = userModel;
  }

  async notifyAdmins({ type, title, message, data, dedupeKey }) {
    const adminCriteria = [{ role: 'admin' }];
    if (env.ADMIN_EMAIL) adminCriteria.push({ email: env.ADMIN_EMAIL.toLowerCase() });
    const admins = await this.userModel.find({ isActive: true, $or: adminCriteria }).select('_id');
    await Promise.all(admins.map((admin) => this.notificationService.createNotification({
      recipient: admin._id,
      type,
      title,
      message,
      data,
      dedupeKey: `${dedupeKey}:admin:${admin._id}`,
    })));
  }

  async notifyBookingConfirmed(payment) {
    const appointment = await this.appointmentModel.findById(payment.appointment);
    if (!appointment) return;
    const [patient, doctor] = await Promise.all([
      this.userModel.findById(payment.patient).select('name email'),
      this.userModel.findById(payment.doctor).select('name email'),
    ]);
    const when = appointmentDateLabel(appointment);
    const reference = String(appointment._id);

    if (patient) {
      await this.notificationService.createNotification({
        recipient: patient._id,
        type: 'appointment_confirmed',
        title: 'Appointment confirmed',
        message: `Your appointment with ${appointment.doctorSnapshot?.name || 'your doctor'} is confirmed for ${when}.`,
        data: { appointmentId: reference, paymentId: String(payment._id) },
        dedupeKey: `appointment:${reference}:confirmed:patient`,
      });
      await this.emailDeliveryService.enqueue({
        to: patient.email,
        subject: 'Your MedBook appointment is confirmed',
        text: `Your appointment with ${appointment.doctorSnapshot?.name || 'your doctor'} is confirmed for ${when}. Payment reference: ${payment.stripePaymentIntentId}.`,
        html: `<p>Your appointment with ${escapeHtml(appointment.doctorSnapshot?.name || 'your doctor')} is confirmed for <strong>${escapeHtml(when)}</strong>.</p><p>Payment reference: ${escapeHtml(payment.stripePaymentIntentId)}</p>`,
        dedupeKey: `appointment:${reference}:confirmed:patient`,
      });
    }
    if (doctor) {
      await this.notificationService.createNotification({
        recipient: doctor._id,
        type: 'appointment_confirmed',
        title: 'New appointment confirmed',
        message: `An appointment was confirmed for ${when}.`,
        data: { appointmentId: reference },
        dedupeKey: `appointment:${reference}:confirmed:doctor`,
      });
      await this.emailDeliveryService.enqueue({
        to: doctor.email,
        subject: 'A MedBook appointment was confirmed',
        text: `An appointment was confirmed for ${when}. Open your MedBook dashboard for details.`,
        html: `<p>An appointment was confirmed for <strong>${when}</strong>.</p><p>Open your MedBook dashboard for details.</p>`,
        dedupeKey: `appointment:${reference}:confirmed:doctor`,
      });
    }
    await this.notifyAdmins({
      type: 'appointment_confirmed',
      title: 'New appointment confirmed',
      message: `A new appointment was confirmed for ${when}.`,
      data: { appointmentId: reference, paymentId: String(payment._id) },
      dedupeKey: `appointment:${reference}:confirmed`,
    });
  }

  async notifyUnfulfillablePayment(payment) {
    const patient = await this.userModel.findById(payment.patient).select('name email');
    if (!patient) return;
    const dedupeKey = `payment:${payment._id}:appointment-unavailable`;
    await this.notificationService.createNotification({
      recipient: patient._id,
      type: 'payment_reconciliation',
      title: 'Appointment time is no longer available',
      message: 'Your payment was received after the appointment time became unavailable. A full refund has been started.',
      data: { appointmentId: String(payment.appointment), paymentId: String(payment._id) },
      dedupeKey,
    });
    await this.notifyAdmins({
      type: 'payment_reconciliation',
      title: 'Appointment payment needs attention',
      message: 'A payment was received after its appointment time became unavailable and a refund was started.',
      data: { appointmentId: String(payment.appointment), paymentId: String(payment._id) },
      dedupeKey,
    });
    await this.emailDeliveryService.enqueue({
      to: patient.email,
      subject: 'MedBook payment refund started',
      text: 'Your payment was received after the appointment time became unavailable. A full refund has been started.',
      html: '<p>Your payment was received after the appointment time became unavailable. A full refund has been started.</p>',
      dedupeKey,
    });
  }

  async notifyPaymentFailed(payment) {
    const patient = await this.userModel.findById(payment.patient).select('email');
    if (!patient) return;
    const dedupeKey = `payment:${payment._id}:failed`;
    const message = 'Your appointment payment was not completed. You can retry from your payment history.';
    await this.notificationService.createNotification({
      recipient: payment.patient,
      type: 'payment_failed',
      title: 'Payment was not completed',
      message,
      data: { appointmentId: String(payment.appointment), paymentId: String(payment._id) },
      dedupeKey,
    });
    await this.notifyAdmins({
      type: 'payment_failed',
      title: 'Appointment payment failed',
      message: 'An appointment payment was not completed.',
      data: { appointmentId: String(payment.appointment), paymentId: String(payment._id) },
      dedupeKey,
    });
    await this.emailDeliveryService.enqueue({
      to: patient.email,
      subject: 'MedBook payment was not completed',
      text: message,
      html: `<p>${escapeHtml(message)}</p>`,
      dedupeKey,
    });
  }

  async notifyAppointmentCancelled(appointment, { refundEligible }) {
    const [patient, doctor] = await Promise.all([
      this.userModel.findById(appointment.patient).select('email'),
      this.userModel.findById(appointment.doctor).select('email'),
    ]);
    const appointmentId = String(appointment._id);
    const when = appointmentDateLabel(appointment);
    const patientMessage = refundEligible
      ? `Your appointment for ${when} was canceled. A full refund is being processed.`
      : `Your appointment for ${when} was canceled. It was outside the automatic refund window.`;

    await this.notificationService.createNotification({
      recipient: appointment.patient,
      type: 'appointment_cancelled',
      title: 'Appointment canceled',
      message: patientMessage,
      data: { appointmentId, refundEligible },
      dedupeKey: `appointment:${appointmentId}:cancelled:patient`,
    });
    if (patient) {
      await this.emailDeliveryService.enqueue({
        to: patient.email,
        subject: 'Your MedBook appointment was canceled',
        text: patientMessage,
        html: `<p>${escapeHtml(patientMessage)}</p>`,
        dedupeKey: `appointment:${appointmentId}:cancelled:patient`,
      });
    }
    if (doctor) {
      await this.notificationService.createNotification({
        recipient: appointment.doctor,
        type: 'appointment_cancelled',
        title: 'Appointment canceled',
        message: `The appointment scheduled for ${when} was canceled.`,
        data: { appointmentId },
        dedupeKey: `appointment:${appointmentId}:cancelled:doctor`,
      });
      await this.emailDeliveryService.enqueue({
        to: doctor.email,
        subject: 'A MedBook appointment was canceled',
        text: `The appointment scheduled for ${when} was canceled.`,
        html: `<p>The appointment scheduled for ${escapeHtml(when)} was canceled.</p>`,
        dedupeKey: `appointment:${appointmentId}:cancelled:doctor`,
      });
    }
    await this.notifyAdmins({
      type: 'appointment_cancelled',
      title: 'Appointment canceled',
      message: `An appointment scheduled for ${when} was canceled.`,
      data: { appointmentId },
      dedupeKey: `appointment:${appointmentId}:cancelled`,
    });
  }

  async notifyRefundUpdated(refund, payment) {
    const dedupeKey = `refund:${refund._id}:${refund.status}`;
    const message = refund.status === 'succeeded'
      ? 'Your appointment refund has been completed.'
      : refund.status === 'failed'
        ? 'Your appointment refund could not be completed yet. Our team has been notified.'
        : 'Your appointment refund is being processed.';
    await this.notificationService.createNotification({
      recipient: refund.patient,
      type: 'refund_status_changed',
      title: 'Refund status updated',
      message,
      data: { appointmentId: String(refund.appointment), paymentId: String(payment._id), refundId: String(refund._id) },
      dedupeKey,
    });
    await this.notifyAdmins({
      type: 'refund_status_changed',
      title: 'Refund status updated',
      message,
      data: { appointmentId: String(refund.appointment), paymentId: String(payment._id), refundId: String(refund._id) },
      dedupeKey,
    });
    const patient = await this.userModel.findById(refund.patient).select('name email');
    if (patient) {
      await this.emailDeliveryService.enqueue({
        to: patient.email,
        subject: 'MedBook refund status updated',
        text: message,
        html: `<p>${escapeHtml(message)}</p>`,
        dedupeKey,
      });
    }
  }
}
