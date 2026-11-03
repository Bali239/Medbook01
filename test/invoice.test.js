import test from 'node:test';
import assert from 'node:assert/strict';
import { InvoiceService } from '../src/modules/payments/invoice.service.js';

const invoice = {
  _id: 'invoice-1',
  invoiceNumber: 'MB-2026-ABCDEF123456',
  patient: 'patient-1',
  doctor: 'doctor-1',
  appointment: 'appointment-1',
  payment: 'payment-1',
  patientName: 'Patient Example',
  patientEmail: 'patient@example.test',
  doctorName: 'Dr. Example',
  doctorSpecialty: 'Family medicine',
  appointmentStartAt: new Date('2026-11-04T04:00:00.000Z'),
  appointmentTimeZone: 'Asia/Karachi',
  description: 'In-person medical consultation appointment',
  consultationFeePaisa: 500000,
  fxRateScaled: '3614000',
  fxRateScale: 1000000000,
  fxProvider: 'rates.example.test',
  amountMinor: 1807,
  currency: 'usd',
  taxMinor: 0,
  totalMinor: 1807,
  paymentStatus: 'paid',
  paymentIntentReference: 'pi_test',
  paidAt: new Date('2026-11-03T00:00:00.000Z'),
  issuedAt: new Date('2026-11-03T00:00:00.000Z'),
};

test('patient-owned receipt download generates a PDF document', async () => {
  const service = new InvoiceService({
    invoiceModel: { findOne: async () => invoice },
  });
  const result = await service.download(invoice._id, { id: 'patient-1', role: 'patient' });

  assert.equal(result.invoice.invoiceNumber, invoice.invoiceNumber);
  assert.equal(result.pdf.subarray(0, 4).toString(), '%PDF');
});

test('a patient cannot retrieve another patient receipt', async () => {
  const service = new InvoiceService({
    invoiceModel: { findOne: async () => null },
  });

  await assert.rejects(
    service.getById(invoice._id, { id: 'other-patient', role: 'patient' }),
    (error) => error.statusCode === 404,
  );
});