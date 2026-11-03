import test from 'node:test';
import assert from 'node:assert/strict';
import { AppointmentLifecycleService } from '../src/modules/appointments/appointment-lifecycle.service.js';

const makeAppointment = (startAt) => ({
  _id: 'appointment-1',
  patient: 'patient-1',
  doctor: 'doctor-1',
  status: 'confirmed',
  appointmentStartAt: new Date(startAt),
  cancellationHistory: [],
  async save() {},
});

const createService = ({ appointment, now, payment = null, refundService = {} }) => {
  const saved = { appointment };
  return {
    saved,
    service: new AppointmentLifecycleService({
      appointmentModel: {
        findById: () => ({ session: async () => appointment }),
      },
      paymentModel: {
        findOne: () => ({ sort: async () => payment }),
      },
      auditLogModel: { create: async () => {} },
      refundService: { createFullRefund: async () => ({ _id: 'refund-1', status: 'pending' }), ...refundService },
      paymentNotificationService: { notifyAppointmentCancelled: async () => {} },
      connection: {
        startSession: async () => ({
          withTransaction: async (operation) => operation(),
          endSession: async () => {},
        }),
      },
      now: () => now,
    }),
  };
};

test('patient cancellation 24 hours before start receives an automatic full refund', async () => {
  const now = Date.parse('2026-11-03T00:00:00.000Z');
  const appointment = makeAppointment('2026-11-04T00:00:00.000Z');
  let refundRequest;
  const { service } = createService({
    appointment,
    now,
    payment: { status: 'succeeded' },
    refundService: { createFullRefund: async (request) => { refundRequest = request; return { _id: 'refund-1', status: 'pending' }; } },
  });

  const result = await service.cancel(appointment._id, { id: 'patient-1', role: 'patient' });
  assert.equal(result.refundEligible, true);
  assert.equal(result.refundStatus, 'pending');
  assert.equal(appointment.status, 'cancelled');
  assert.equal(refundRequest.reason, 'patient_cancellation');
});

test('patient cancellation inside the 24-hour window does not request an automatic refund', async () => {
  const now = Date.parse('2026-11-03T00:00:00.000Z');
  const appointment = makeAppointment('2026-11-03T12:00:00.000Z');
  let refundRequested = false;
  const { service } = createService({
    appointment,
    now,
    payment: { status: 'succeeded' },
    refundService: { createFullRefund: async () => { refundRequested = true; } },
  });

  const result = await service.cancel(appointment._id, { id: 'patient-1', role: 'patient' });
  assert.equal(result.refundEligible, false);
  assert.equal(refundRequested, false);
});

test('doctor cancellation requires a reason and is fully refundable', async () => {
  const appointment = makeAppointment('2026-11-04T00:00:00.000Z');
  const { service } = createService({ appointment, now: Date.parse('2026-11-03T00:00:00.000Z') });

  await assert.rejects(service.cancel(appointment._id, { id: 'doctor-1', role: 'doctor' }), /reason is required/i);
  const result = await service.cancel(appointment._id, { id: 'doctor-1', role: 'doctor' }, { reason: 'Doctor unavailable' });
  assert.equal(result.refundEligible, true);
  assert.equal(appointment.cancellation.role, 'doctor');
});

test('a different doctor cannot cancel another doctor appointment', async () => {
  const appointment = makeAppointment('2026-11-04T00:00:00.000Z');
  const { service } = createService({ appointment, now: Date.parse('2026-11-03T00:00:00.000Z') });

  await assert.rejects(
    service.cancel(appointment._id, { id: 'other-doctor', role: 'doctor' }, { reason: 'Not mine' }),
    (error) => error.statusCode === 403,
  );
});