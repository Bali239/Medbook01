import test from 'node:test';
import assert from 'node:assert/strict';
import { DoctorProfileService } from '../src/modules/doctor-profiles/doctor-profile.service.js';
import { bookingSettingsSchema } from '../src/modules/doctor-profiles/doctor-booking-settings.schema.js';

const transactionConnection = () => ({
  startSession: async () => ({
    withTransaction: async (operation) => operation(),
    endSession: async () => {},
  }),
});

test('approved doctor booking settings update profile and application atomically', async () => {
  let profileFilter;
  let profileUpdate;
  let applicationUpdate;
  const updatedProfile = { user: 'doctor-1', status: 'approved' };
  const service = new DoctorProfileService({
    profileModel: {
      findOneAndUpdate: async (filter, update) => {
        profileFilter = filter;
        profileUpdate = update;
        return updatedProfile;
      },
    },
    applicationModel: { updateOne: async (filter, update) => { applicationUpdate = { filter, update }; } },
    connection: transactionConnection(),
  });

  const result = await service.updateBookingSettings('doctor-1', {
    appointmentDurationMinutes: 30,
    clinicTimeZone: 'Asia/Karachi',
  });

  assert.equal(result, updatedProfile);
  assert.deepEqual(profileFilter, { user: 'doctor-1', status: 'approved' });
  assert.deepEqual(profileUpdate.$set, { appointmentDurationMinutes: 30, clinicTimeZone: 'Asia/Karachi' });
  assert.deepEqual(applicationUpdate.filter, { user: 'doctor-1', status: 'approved' });
  assert.deepEqual(applicationUpdate.update.$set, profileUpdate.$set);
});

test('booking settings cannot be updated for an unapproved doctor', async () => {
  let applicationTouched = false;
  const service = new DoctorProfileService({
    profileModel: { findOneAndUpdate: async () => null },
    applicationModel: { updateOne: async () => { applicationTouched = true; } },
    connection: transactionConnection(),
  });

  await assert.rejects(
    service.updateBookingSettings('doctor-1', {
      appointmentDurationMinutes: 30,
      clinicTimeZone: 'Asia/Karachi',
    }),
    (error) => error.statusCode === 404,
  );
  assert.equal(applicationTouched, false);
});

test('booking settings schema accepts supported duration and IANA timezone only', () => {
  assert.equal(bookingSettingsSchema.body.safeParse({
    appointmentDurationMinutes: 15,
    clinicTimeZone: 'Asia/Karachi',
  }).success, true);
  assert.equal(bookingSettingsSchema.body.safeParse({
    appointmentDurationMinutes: 20,
    clinicTimeZone: 'Not/A_Timezone',
  }).success, false);
});