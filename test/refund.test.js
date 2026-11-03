import test from 'node:test';
import assert from 'node:assert/strict';
import { RefundService } from '../src/modules/payments/refund.service.js';

const paymentRecord = () => ({
  _id: 'payment-1',
  appointment: 'appointment-1',
  patient: 'patient-1',
  stripePaymentIntentId: 'pi_test',
  amountMinor: 1000,
  currency: 'usd',
  status: 'succeeded',
  refundedAmountMinor: 0,
  refundReservedAmountMinor: 0,
  async save() {},
});

test('refund creation reserves the requested minor-unit amount and uses Stripe idempotency', async () => {
  const payment = paymentRecord();
  let refundData;
  let stripeArgs;
  const service = new RefundService({
    paymentModel: {
      findOneAndUpdate: async (_filter, update) => {
        payment.refundReservedAmountMinor += update.$inc.refundReservedAmountMinor;
        return payment;
      },
      updateOne: async () => {},
    },
    refundModel: {
      findOne: async () => null,
      create: async (data) => {
        refundData = { ...data, _id: 'refund-1', async save() {} };
        return refundData;
      },
    },
    auditLogModel: { create: async () => {} },
    stripeClientProvider: () => ({
      refunds: {
        create: async (...args) => {
          stripeArgs = args;
          return { id: 're_test', status: 'pending' };
        },
      },
    }),
  });

  const refund = await service.createRefund({
    payment,
    amountMinor: 375,
    reason: 'admin_override',
    adminReason: 'Courtesy refund approved by support',
    initiatedBy: 'admin-1',
    idempotencyKey: 'refund-attempt-1',
  });

  assert.equal(refund.amountMinor, 375);
  assert.equal(refund.adminReason, 'Courtesy refund approved by support');
  assert.equal(payment.refundReservedAmountMinor, 375);
  assert.equal(stripeArgs[0].amount, 375);
  assert.equal(stripeArgs[1].idempotencyKey, 'medbook-refund-refund-attempt-1');
});

test('refund amount cannot exceed the remaining captured balance', async () => {
  let stripeCalled = false;
  const service = new RefundService({
    paymentModel: {},
    refundModel: { findOne: async () => null },
    stripeClientProvider: () => ({ refunds: { create: async () => { stripeCalled = true; } } }),
  });

  await assert.rejects(
    service.createRefund({
      payment: { ...paymentRecord(), refundedAmountMinor: 800, refundReservedAmountMinor: 100 },
      amountMinor: 101,
      reason: 'admin_override',
      adminReason: 'Manual adjustment',
      idempotencyKey: 'refund-attempt-2',
    }),
    /refundable balance/i,
  );
  assert.equal(stripeCalled, false);
});

test('verified full refund updates payment and appointment refund states once', async () => {
  const payment = { ...paymentRecord(), refundReservedAmountMinor: 400 };
  const refund = {
    _id: 'refund-1',
    payment: payment._id,
    appointment: payment.appointment,
    amountMinor: 400,
    currency: 'usd',
    status: 'pending',
    stripeRefundId: undefined,
    statusHistory: [],
    async save() {},
  };
  let appointmentUpdate;
  const service = new RefundService({
    refundModel: { findOne: async () => refund },
    paymentModel: { findById: async () => payment },
    appointmentModel: { updateOne: async (...args) => { appointmentUpdate = args; } },
    invoiceModel: { updateOne: async () => {} },
    paymentNotificationService: { notifyRefundUpdated: async () => {} },
  });

  await service.updateFromStripe({
    stripeRefund: { id: 're_test', status: 'succeeded', amount: 400, currency: 'usd', metadata: { refund_id: refund._id } },
    eventId: 'evt_refund_succeeded',
  });

  assert.equal(payment.refundedAmountMinor, 400);
  assert.equal(payment.refundReservedAmountMinor, 0);
  assert.equal(payment.refundStatus, 'partially_refunded');
  assert.equal(payment.status, 'partially_refunded');
  assert.equal(appointmentUpdate[1].$set.paymentStatus, 'partially_refunded');
});