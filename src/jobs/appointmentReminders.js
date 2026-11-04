import Appointment from '../models/Appointment.js';
import { env } from '../config/env.js';
import { EmailDeliveryService } from '../modules/notifications/email-delivery.service.js';
import { appointmentReminderEmail } from '../modules/notifications/email-templates.js';

const reminderLeadMs = 24 * 60 * 60_000;
const pollingIntervalMs = 60_000;
const reminderWindowMs = 5 * 60_000;

const appointmentDateLabel = (appointment) => {
  try {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: appointment.doctorSnapshot?.clinicTimeZone || 'UTC',
    }).format(appointment.appointmentStartAt);
  } catch {
    return new Date(appointment.appointmentStartAt).toISOString();
  }
};

const clinicLabel = (appointment) => [
  appointment.doctorSnapshot?.clinicName,
  appointment.doctorSnapshot?.clinicAddress,
  appointment.doctorSnapshot?.clinicCity,
].filter(Boolean).join(', ') || undefined;

export const runAppointmentReminderJob = async ({
  appointmentModel = Appointment,
  emailDeliveryService = new EmailDeliveryService(),
  now = Date.now,
  logger = console,
} = {}) => {
  const currentTime = now();
  const windowEnd = new Date(currentTime + reminderLeadMs);
  const windowStart = new Date(windowEnd.valueOf() - reminderWindowMs);
  const appointments = await appointmentModel.find({
    status: 'confirmed',
    appointmentStartAt: { $gt: windowStart, $lte: windowEnd },
  }).populate('patient', 'name email').lean();

  let queued = 0;
  for (const appointment of appointments) {
    if (!appointment.patient?.email) continue;
    try {
      await emailDeliveryService.enqueue({
        to: appointment.patient.email,
        ...appointmentReminderEmail({
          patientName: appointment.patient.name,
          doctorName: appointment.doctorSnapshot?.name || 'your doctor',
          appointmentDate: appointmentDateLabel(appointment),
          clinic: clinicLabel(appointment),
          reference: String(appointment._id),
          url: `${env.CLIENT_URL || 'http://localhost:3000'}/patient/appointments?appointment=${appointment._id}`,
        }),
        dedupeKey: `appointment:${appointment._id}:reminder-24h`,
        appointmentReminderFor: appointment._id,
      });
      queued += 1;
    } catch (error) {
      logger.error('Appointment reminder enqueue failed', { code: error?.code || 'reminder_enqueue_failed' });
    }
  }
  return queued;
};

export const startAppointmentReminderJob = () => {
  void runAppointmentReminderJob().catch((error) => {
    console.error('Appointment reminder scan failed', { code: error?.code || 'reminder_scan_failed' });
  });
  const timer = setInterval(() => {
    void runAppointmentReminderJob().catch((error) => {
      console.error('Appointment reminder scan failed', { code: error?.code || 'reminder_scan_failed' });
    });
  }, pollingIntervalMs);
  timer.unref?.();
};