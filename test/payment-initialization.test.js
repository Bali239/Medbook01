import test from 'node:test';
import assert from 'node:assert/strict';
import { PaymentInitializationService } from '../src/modules/payments/payment-initialization.service.js';
import { initializePaymentSchema } from '../src/modules/payments/payment.schema.js';

const query = (value) => ({
  session() { return this; },
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
});

const setupService = ({ existingPayment = null, stripeIntentStatus = 'requires_payment_method' } = {}) => {
  const stripeCalls = [];
  const savedPayments = [];
  const pricingSnapshot = {
    doctorFeePaisa: 500000,
    sourceCurrency: 'pkr',
    fxProvider: 'rates.example.test',
    fxRateScaled: '3614000',
    fxRateScale: 1000000000,
    fxQuotedAt: new Date('2026-11-03T00:00:00.000Z'),
    fxValidUntil: new Date('2026-11-04T00:00:00.000Z'),
    currency: 'usd',
    taxMinor: 0,
    additionalChargesMinor: 0,
    discountMinor: 0,
    amountMinor: 1807,
    rounding: 'half_up_to_cent',
  };
  const appointment = {
    _id: 'appointment-1',
    doctorSnapshot: { name: 'Dr. Example', clinicTimeZone: 'Asia/Karachi' },
    appointmentStartAt: new Date('2026-11-04T04:00:00.000Z'),
    appointmentEndAt: new Date('2026-11-04T04:30:00.000Z'),
    appointmentDurationMinutes: 30,
    async save() {},
  };
  const hold = { _id: 'hold-1', expiresAt: new Date('2026-11-03T05:10:00.000Z') };
  const paymentModel = {
    findOne: (filter) => query(existingPayment && filter.idempotencyKey ? existingPayment : null),
    create: async (records) => {
      savedPayments.push(...records);
      return [{ ...records[0], _id: 'payment-1', status: 'pending', stripeCustomerId: 'cus_1' }];
    },
    updateOne: async () => {},
  };
  const appointmentModel = { findById: async () => appointment };
  const slotHoldModel = {
    updateMany: async () => {},
    findOne: async () => hold,
  };
  const service = new PaymentInitializationService({
    stripeClientProvider: () => ({
      paymentIntents: {
        create: async (params, options) => {
          stripeCalls.push({ params, options });
          return { id: 'pi_test', client_secret: 'pi_test_secret', status: stripeIntentStatus };
        },
        retrieve: async (id) => ({ id, client_secret: 'pi_test_secret', status: stripeIntentStatus }),
      },
    }),
    customerService: { getOrCreateForPatient: async () => ({ id: 'cus_1' }) },
    productService: { ensureConsultationProduct: async () => ({ id: 'prod_1' }) },
    bookingService: {
      validateSlot: async () => ({ profile: { consultationFeePaisa: 500000 } }),
      reservePaymentBooking: async () => ({
        appointment,
        hold,
        doctor: { _id: 'doctor-1' },
      }),
    },
    fxQuoteProvider: async () => ({
      provider: 'rates.example.test',
      rateScaled: 3614000n,
      quotedAt: pricingSnapshot.fxQuotedAt,
      validUntil: pricingSnapshot.fxValidUntil,
    }),
    appointmentModel,
    paymentModel,
    slotHoldModel,
    userModel: { findById: () => ({ select: async () => ({ role: 'patient', isActive: true }) }) },
    connection: {
      startSession: async () => ({
        withTransaction: async (callback) => callback(),
        endSession: async () => {},
      }),
    },
  });
  return { service, stripeCalls, savedPayments };
};

test('PaymentIntent amount comes from backend pricing, not a submitted amount', async () => {
  const { service, stripeCalls, savedPayments } = setupService();
  const result = await service.initialize('patient-1', {
    doctorId: 'doctor-1',
    startAt: '2026-11-04T04:00:00.000Z',
    idempotencyKey: '2a0a9456-8a38-4e02-9d91-4bd0f986e201',
    amountMinor: 1,
  });

  assert.equal(stripeCalls[0].params.amount, 1807);
  assert.equal(stripeCalls[0].params.currency, 'usd');
  assert.equal(stripeCalls[0].params.customer, 'cus_1');
  assert.equal(stripeCalls[0].params.metadata.payment_id, 'payment-1');
  assert.equal(savedPayments[0].pricingSnapshot.amountMinor, 1807);
  assert.equal(result.clientSecret, 'pi_test_secret');
});

test('terminal Stripe PaymentIntents do not return a client secret for Elements', async () => {
  const { service } = setupService({ stripeIntentStatus: 'succeeded' });
  const result = await service.initialize('patient-1', {
    doctorId: 'doctor-1',
    startAt: '2026-11-04T04:00:00.000Z',
    idempotencyKey: '3a0a9456-8a38-4e02-9d91-4bd0f986e201',
  });

  assert.equal(result.clientSecret, null);
});

test('payment initialization schema rejects a client-supplied amount', () => {
  const result = initializePaymentSchema.body.safeParse({
    doctorId: '507f1f77bcf86cd799439011',
    startAt: '2026-11-04T04:00:00.000Z',
    idempotencyKey: '2a0a9456-8a38-4e02-9d91-4bd0f986e201',
    amountMinor: 1,
  });
  assert.equal(result.success, false);
});

test('an existing idempotency key cannot be reused by another patient', async () => {
  const existingPayment = {
    patient: 'patient-other',
    requestFingerprint: '0'.repeat(64),
  };
  const { service } = setupService({ existingPayment });

  await assert.rejects(
    service.initialize('patient-1', {
      doctorId: 'doctor-1',
      startAt: '2026-11-04T04:00:00.000Z',
      idempotencyKey: '2a0a9456-8a38-4e02-9d91-4bd0f986e201',
    }),
    (error) => error.statusCode === 403,
  );
});
