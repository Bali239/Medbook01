import test from 'node:test';
import assert from 'node:assert/strict';
import { NotificationService } from '../src/modules/notifications/notification.service.js';
import { EmailDeliveryService } from '../src/modules/notifications/email-delivery.service.js';
import { PaymentNotificationService } from '../src/modules/payments/payment-notification.service.js';
import { RefundRequestService } from '../src/modules/payments/refund-request.service.js';

test('notification creation uses a stable deduplication key', async () => {
  let query;
  const notification = { _id: 'notification-1' };
  const service = new NotificationService({
    notificationModel: {
      findOneAndUpdate: async (...args) => { query = args; return notification; },
    },
  });
  const result = await service.createNotification({
    recipient: 'patient-1',
    type: 'payment_failed',
    title: 'Payment was not completed',
    message: 'Retry from payment history.',
    dedupeKey: 'payment:payment-1:failed',
  });

  assert.equal(result, notification);
  assert.deepEqual(query[0], { dedupeKey: 'payment:payment-1:failed' });
  assert.equal(query[1].$setOnInsert.dedupeKey, 'payment:payment-1:failed');
});

test('email delivery outbox does not mark development fallback as sent', async () => {
  const delivery = { _id: 'email-1', attempts: 1 };
  let update;
  const service = new EmailDeliveryService({
    deliveryModel: {
      findOneAndUpdate: () => ({ select: async () => delivery }),
      updateOne: async (_filter, updateDocument) => { update = updateDocument; },
    },
    emailSender: async () => ({ delivered: false }),
    now: () => 1_800_000_000_000,
    logger: { error() {} },
  });

  assert.equal(await service.processNext(), true);
  assert.equal(update.$set.status, 'skipped');
  assert.ok(update.$set.skippedAt instanceof Date);
  assert.equal(update.$unset.html, 1);
});

test('email delivery failures enter bounded retry without logging message content', async () => {
  const delivery = { _id: 'email-2', attempts: 1, lastError: undefined };
  let update;
  let log;
  const service = new EmailDeliveryService({
    deliveryModel: {
      findOneAndUpdate: () => ({ select: async () => delivery }),
      updateOne: async (_filter, updateDocument) => { update = updateDocument; },
    },
    emailSender: async () => { throw new Error('recipient and message details'); },
    now: () => 1_800_000_000_000,
    logger: { error: (...args) => { log = args; } },
  });

  assert.equal(await service.processNext(), true);
  assert.equal(update.$set.status, 'failed');
  assert.equal(update.$set.lastError, 'email_delivery_failed');
  assert.equal(JSON.stringify(log).includes('recipient and message details'), false);
  assert.ok(update.$set.nextAttemptAt > new Date(1_800_000_000_000));
});

test('appointment reminder delivery is skipped if the appointment was canceled after queueing', async () => {
  const delivery = { _id: 'email-reminder', attempts: 1, appointmentReminderFor: 'appointment-1' };
  let update;
  let sent = false;
  const service = new EmailDeliveryService({
    deliveryModel: {
      findOneAndUpdate: () => ({ select: async () => delivery }),
      updateOne: async (_filter, updateDocument) => { update = updateDocument; },
    },
    appointmentModel: {
      findById: () => ({ select: async () => ({ status: 'cancelled' }) }),
    },
    emailSender: async () => { sent = true; },
    now: () => 1_800_000_000_000,
    logger: { error() {} },
  });

  assert.equal(await service.processNext(), true);
  assert.equal(sent, false);
  assert.equal(update.$set.status, 'skipped');
  assert.equal(update.$unset.to, 1);
});

test('booking confirmation emails give patients and doctors role-specific details', async () => {
  const appointment = {
    _id: 'appointment-1',
    appointmentStartAt: new Date('2026-11-05T05:00:00.000Z'),
    doctorSnapshot: {
      name: 'Dr. Example',
      clinicName: 'Central Clinic',
      clinicAddress: '1 Main Street',
      clinicCity: 'Lahore',
      clinicTimeZone: 'Asia/Karachi',
    },
  };
  const users = {
    'patient-1': { _id: 'patient-1', name: 'Amina Patient', email: 'patient@example.test' },
    'doctor-1': { _id: 'doctor-1', name: 'Dr. Example', email: 'doctor@example.test' },
  };
  const emails = [];
  const service = new PaymentNotificationService({
    notificationService: { createNotification: async () => {} },
    emailDeliveryService: { enqueue: async (email) => emails.push(email) },
    appointmentModel: { findById: async () => appointment },
    userModel: {
      findById: (id) => ({ select: async () => users[id] }),
      find: () => ({ select: async () => [] }),
    },
  });

  await service.notifyBookingConfirmed({
    _id: 'payment-1',
    appointment: 'appointment-1',
    patient: 'patient-1',
    doctor: 'doctor-1',
    amountMinor: 7500,
    currency: 'usd',
    stripePaymentIntentId: 'private-provider-reference',
  });

  assert.equal(emails.length, 2);
  assert.match(emails[0].text, /Amount paid: \$75\.00/);
  assert.match(emails[0].text, /Central Clinic/);
  assert.match(emails[0].text, /patient\/appointments/);
  assert.match(emails[1].text, /Patient: Amina Patient/);
  assert.match(emails[1].text, /doctor\/appointments/);
  assert.doesNotMatch(emails[0].text, /private-provider-reference/);
});

test('patient request decisions are queued with dates, reason, and a stable event key', async () => {
  const emails = [];
  const service = new RefundRequestService({
    notificationService: { createNotification: async () => {} },
    emailDeliveryService: { enqueue: async (email) => emails.push(email) },
    appointmentModel: {
      findById: async () => ({
        appointmentStartAt: new Date('2026-11-05T05:00:00.000Z'),
        doctorSnapshot: { clinicTimeZone: 'Asia/Karachi' },
      }),
    },
    userModel: { findById: () => ({ select: async () => ({ email: 'patient@example.test' }) }) },
  });
  const request = {
    _id: 'request-1',
    appointment: 'appointment-1',
    patient: 'patient-1',
    action: 'reschedule',
    status: 'rejected',
    requestedStartAt: new Date('2026-11-08T07:00:00.000Z'),
    rejectionReason: 'The requested time is unavailable.',
  };

  await service.notifyPatient(request, 'Your date-change request was declined.', 'rejected');

  assert.equal(emails.length, 1);
  assert.equal(emails[0].to, 'patient@example.test');
  assert.match(emails[0].text, /The requested time is unavailable/);
  assert.match(emails[0].text, /November 8/);
  assert.equal(emails[0].dedupeKey, 'refund-request:request-1:patient-email:rejected');
});