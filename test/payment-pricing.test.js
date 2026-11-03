import test from 'node:test';
import assert from 'node:assert/strict';
import {
  convertPaisaToUsdMinor,
  createPricingSnapshot,
  parseRateToScaledInteger,
} from '../src/modules/payments/payment-pricing.js';

test('PKR paisa converts to USD cents using integer half-up rounding', () => {
  const rateScaled = parseRateToScaledInteger('0.003614');
  assert.equal(convertPaisaToUsdMinor(500000, rateScaled), 1807);
  assert.equal(convertPaisaToUsdMinor(100, parseRateToScaledInteger('0.005')), 1);
});

test('pricing snapshot freezes the FX details and does not add taxes or fees', () => {
  const quote = {
    provider: 'rates.example.test',
    rateScaled: parseRateToScaledInteger('0.003614'),
    quotedAt: new Date('2026-11-03T00:00:00.000Z'),
    validUntil: new Date('2026-11-04T00:00:00.000Z'),
  };
  const snapshot = createPricingSnapshot({ feePaisa: 500000, quote });

  assert.equal(snapshot.sourceCurrency, 'pkr');
  assert.equal(snapshot.currency, 'usd');
  assert.equal(snapshot.amountMinor, 1807);
  assert.equal(snapshot.taxMinor, 0);
  assert.equal(snapshot.additionalChargesMinor, 0);
  assert.equal(snapshot.fxRateScaled, '3614000');
});

test('invalid exchange rates and unsupported amounts are rejected', () => {
  assert.throws(() => parseRateToScaledInteger('0'), /exchange rate is invalid/i);
  assert.throws(() => parseRateToScaledInteger('1e-3'), /exchange rate is invalid/i);
  assert.throws(() => convertPaisaToUsdMinor(0, 1000000n), /fee is invalid/i);
  assert.throws(() => createPricingSnapshot({
    feePaisa: 1,
    quote: { rateScaled: 1000000n },
  }), /minimum payable amount/i);
});