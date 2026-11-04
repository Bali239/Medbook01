import test from 'node:test';
import assert from 'node:assert/strict';
import { runAppointmentReminderJob } from '../src/jobs/appointmentReminders.js';

test('appointment reminders target confirmed visits in the 24-hour clinic-time window and deduplicate', async () => {
  const now = Date.parse('2026-11-04T12:00:00.000Z');
  const appointment = {
    _id: 'appointment-1',
    status: 'confirmed',
    appointmentStartAt: new Date(now + 24 * 60 * 60_000),
    doctorSnapshot: { name: 'Dr. Example', clinicTimeZone: 'Asia/Karachi', clinicName: 'Central Clinic' },
    patient: { name: 'Amina', email: 'amina@example.test' },
  };
  let filter;
  const queued = new Map();
  const dependencies = {
    appointmentModel: {
      find: (query) => {
        filter = query;
        return { populate: () => ({ lean: async () => [appointment] }) };
      },
    },
    emailDeliveryService: {
      enqueue: async (email) => {
        if (!queued.has(email.dedupeKey)) queued.set(email.dedupeKey, email);
      },
    },
    now: () => now,
    logger: { error() {} },
  };

  await runAppointmentReminderJob(dependencies);
  await runAppointmentReminderJob(dependencies);

  assert.equal(filter.status, 'confirmed');
  assert.equal(filter.appointmentStartAt.$lte.valueOf(), now + 24 * 60 * 60_000);
  assert.equal(filter.appointmentStartAt.$gt.valueOf(), now + 24 * 60 * 60_000 - 5 * 60_000);
  assert.equal(queued.size, 1);
  assert.match(queued.get('appointment:appointment-1:reminder-24h').text, /Central Clinic/);
});