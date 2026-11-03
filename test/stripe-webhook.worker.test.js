import test from 'node:test';
import assert from 'node:assert/strict';
import { StripeWebhookWorker } from '../src/modules/payments/stripe-webhook.worker.js';

const createEventModel = (event) => ({
  findOneAndUpdate() {
    return { select: async () => event };
  },
  async updateOne(_filter, update) {
    Object.assign(event, update.$set || {});
    for (const key of Object.keys(update.$unset || {})) delete event[key];
  },
});

const pendingEvent = () => ({
  _id: 'webhook-event-id',
  stripeEventId: 'evt_worker_test',
  eventType: 'payment_intent.processing',
  attemptCount: 0,
  payload: { object: { id: 'pi_worker_test' } },
});

test('webhook event is marked processed only after its business operation succeeds', async () => {
  const event = pendingEvent();
  const worker = new StripeWebhookWorker({
    eventModel: createEventModel(event),
    logger: { error() {} },
  });
  let processed = false;
  worker.processEvent = async () => { processed = true; };

  assert.equal(await worker.processNext(), true);
  assert.equal(processed, true);
  assert.equal(event.status, 'processed');
  assert.ok(event.processedAt instanceof Date);
  assert.equal(event.leaseExpiresAt, undefined);
});

test('failed webhook operations are scheduled for bounded retry and not marked processed', async () => {
  const event = pendingEvent();
  const worker = new StripeWebhookWorker({
    eventModel: createEventModel(event),
    logger: { error() {} },
    now: () => 1_800_000_000_000,
  });
  worker.processEvent = async () => {
    const error = new Error('private provider response');
    error.code = 'stripe_unavailable';
    throw error;
  };

  assert.equal(await worker.processNext(), true);
  assert.equal(event.status, 'failed');
  assert.equal(event.lastError, 'stripe_unavailable');
  assert.ok(event.nextAttemptAt > new Date(1_800_000_000_000));
  assert.equal(event.processedAt, undefined);
  assert.equal(event.leaseExpiresAt, undefined);
});

test('stale pending PaymentIntents are reconciled from Stripe state', async () => {
  const payment = { _id: 'payment-1', stripePaymentIntentId: 'pi_stale' };
  const worker = new StripeWebhookWorker({
    paymentModel: {
      find: () => ({ sort() { return this; }, limit: async () => [payment] }),
    },
    stripeClientProvider: () => ({
      paymentIntents: { retrieve: async () => ({ id: 'pi_stale', status: 'succeeded' }) },
    }),
    logger: { error() {} },
    now: () => 1_800_000_000_000,
  });
  let processedEvent;
  worker.processPaymentIntent = async (event, intent) => { processedEvent = { event, intent }; };

  assert.equal(await worker.reconcileStalePayments(), 1);
  assert.equal(processedEvent.event.source, 'reconciliation');
  assert.equal(processedEvent.event.eventType, 'payment_intent.succeeded');
  assert.equal(processedEvent.intent.id, 'pi_stale');
});