import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import Stripe from 'stripe';

process.env.PAYMENTS_ENABLED = 'true';
process.env.STRIPE_SECRET_KEY = 'sk_test_webhook_signature';
process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_webhook_signature';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_webhook_signature';

const { StripeWebhookService } = await import('../src/modules/payments/stripe-webhook.service.js');

const eventPayload = () => ({
  id: 'evt_test_payment_succeeded',
  object: 'event',
  type: 'payment_intent.succeeded',
  created: 1793664151,
  data: {
    object: {
      id: 'pi_test_payment',
      object: 'payment_intent',
      status: 'succeeded',
      amount: 1807,
      currency: 'usd',
      client_secret: 'pi_test_payment_secret_do_not_persist',
      metadata: {
        payment_id: 'payment-id',
        patient_id: 'patient-id',
        unsupported_personal_data: 'should-not-persist',
      },
    },
  },
});

const signedHeader = (body, secret, timestamp = Math.floor(Date.now() / 1000)) => {
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${body.toString('utf8')}`)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
};

test('valid Stripe signatures are durably accepted with a minimized event payload', async () => {
  const records = [];
  const eventModel = {
    create: async (record) => {
      records.push(record);
      return record;
    },
  };
  const service = new StripeWebhookService({
    stripeClientProvider: () => new Stripe(process.env.STRIPE_SECRET_KEY),
    eventModel,
  });
  const body = Buffer.from(JSON.stringify(eventPayload()));
  const result = await service.accept(body, signedHeader(body, process.env.STRIPE_WEBHOOK_SECRET));

  assert.equal(result.accepted, true);
  assert.equal(result.duplicate, false);
  assert.equal(records.length, 1);
  assert.equal(records[0].payload.object.id, 'pi_test_payment');
  assert.equal(records[0].payload.object.client_secret, undefined);
  assert.equal(records[0].payload.object.metadata.unsupported_personal_data, undefined);
});

test('invalid Stripe signatures are rejected without persisting an event', async () => {
  let persisted = false;
  const service = new StripeWebhookService({
    stripeClientProvider: () => new Stripe(process.env.STRIPE_SECRET_KEY),
    eventModel: { create: async () => { persisted = true; } },
  });
  const body = Buffer.from(JSON.stringify(eventPayload()));

  await assert.rejects(
    service.accept(body, signedHeader(body, 'whsec_wrong_secret')),
    (error) => error.statusCode === 400,
  );
  assert.equal(persisted, false);
});

test('duplicate webhook event IDs are accepted without a second business event record', async () => {
  const service = new StripeWebhookService({
    stripeClientProvider: () => new Stripe(process.env.STRIPE_SECRET_KEY),
    eventModel: {
      create: async () => {
        const duplicate = new Error('duplicate key');
        duplicate.code = 11000;
        throw duplicate;
      },
    },
  });
  const body = Buffer.from(JSON.stringify(eventPayload()));
  const result = await service.accept(body, signedHeader(body, process.env.STRIPE_WEBHOOK_SECRET));

  assert.equal(result.accepted, true);
  assert.equal(result.duplicate, true);
});