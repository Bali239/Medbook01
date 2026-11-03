import test from 'node:test';
import assert from 'node:assert/strict';

process.env.PAYMENTS_ENABLED = 'false';
process.env.STRIPE_SECRET_KEY = '';
process.env.STRIPE_PUBLISHABLE_KEY = '';
process.env.STRIPE_WEBHOOK_SECRET = '';

const { env } = await import('../src/config/env.js');
const { stripe, getStripeClient } = await import('../src/integrations/stripe/stripe.js');

test('payments default to disabled without Stripe credentials', () => {
  assert.equal(env.PAYMENTS_ENABLED, false);
  assert.equal(stripe, null);
  assert.throws(getStripeClient, (error) => error.statusCode === 503);
});