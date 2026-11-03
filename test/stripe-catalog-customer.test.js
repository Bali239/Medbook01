import test from 'node:test';
import assert from 'node:assert/strict';
import { StripeProductService } from '../src/modules/payments/stripe-product.service.js';
import { StripeCustomerService } from '../src/modules/payments/stripe-customer.service.js';

test('consultation Product initialization is idempotent and stores its Stripe ID', async () => {
  let catalog;
  let createCount = 0;
  const service = new StripeProductService({
    stripeClientProvider: () => ({
      products: {
        create: async (_params, options) => {
          createCount += 1;
          assert.equal(options.idempotencyKey, 'medbook-consultation-product-v0');
          return { id: 'prod_consultation' };
        },
      },
    }),
    catalogModel: {
      findOne: async () => null,
      findOneAndUpdate: async (_filter, update) => { catalog = update; return update; },
    },
  });

  const product = await service.ensureConsultationProduct();
  assert.equal(product.id, 'prod_consultation');
  assert.equal(createCount, 1);
  assert.equal(catalog.stripeProductId, 'prod_consultation');
});

test('existing consultation Product is reused and its catalog details are updated', async () => {
  let updateCount = 0;
  const service = new StripeProductService({
    stripeClientProvider: () => ({
      products: {
        retrieve: async (id) => ({ id, deleted: false }),
        update: async (id, fields) => { updateCount += 1; return { id, ...fields }; },
      },
    }),
    catalogModel: {
      findOne: async () => ({ stripeProductId: 'prod_existing' }),
      findOneAndUpdate: async (_filter, update) => update,
    },
  });

  const product = await service.ensureConsultationProduct();
  assert.equal(product.id, 'prod_existing');
  assert.equal(updateCount, 1);
});

test('patient Stripe Customer is created from verified user/profile data and persisted', async () => {
  const profile = { stripeCustomerGeneration: 0 };
  let createParams;
  let createOptions;
  let profileUpdate;
  const service = new StripeCustomerService({
    stripeClientProvider: () => ({
      customers: {
        create: async (params, options) => {
          createParams = params;
          createOptions = options;
          return { id: 'cus_created' };
        },
      },
    }),
    userModel: { findById: async () => ({ role: 'patient', isActive: true, email: 'patient@example.test' }) },
    patientProfileModel: {
      findOne: () => ({ select: async () => ({ ...profile, firstName: 'Patient', lastName: 'Example' }) }),
      updateOne: async (_filter, update) => { profileUpdate = update; },
    },
  });

  const customer = await service.getOrCreateForPatient('patient-1');
  assert.equal(customer.id, 'cus_created');
  assert.equal(createParams.email, 'patient@example.test');
  assert.equal(createParams.name, 'Patient Example');
  assert.equal(createParams.metadata.patient_id, 'patient-1');
  assert.equal(createOptions.idempotencyKey, 'medbook-patient-patient-1-customer-v0');
  assert.equal(profileUpdate.$set.stripeCustomerId, 'cus_created');
});

test('deleted Stripe Customer is replaced with a new generation idempotency key', async () => {
  let createKey;
  const service = new StripeCustomerService({
    stripeClientProvider: () => ({
      customers: {
        retrieve: async () => ({ id: 'cus_deleted', deleted: true }),
        create: async (_params, options) => { createKey = options.idempotencyKey; return { id: 'cus_replacement' }; },
      },
    }),
    userModel: { findById: async () => ({ role: 'patient', isActive: true, email: 'patient@example.test' }) },
    patientProfileModel: {
      findOne: () => ({ select: async () => ({ stripeCustomerId: 'cus_deleted', stripeCustomerGeneration: 0, firstName: 'Patient', lastName: 'Example' }) }),
      updateOne: async () => {},
    },
  });

  const customer = await service.getOrCreateForPatient('patient-1');
  assert.equal(customer.id, 'cus_replacement');
  assert.equal(createKey, 'medbook-patient-patient-1-customer-v1');
});