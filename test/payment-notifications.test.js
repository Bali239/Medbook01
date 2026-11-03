import test from 'node:test';
import assert from 'node:assert/strict';
import { NotificationService } from '../src/modules/notifications/notification.service.js';
import { EmailDeliveryService } from '../src/modules/notifications/email-delivery.service.js';

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