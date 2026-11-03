import test from 'node:test';
import assert from 'node:assert/strict';
import { setAvailabilitySchema } from '../src/modules/availability/availability.schema.js';

const validSchedule = {
  dayOfWeek: 1,
  startTime: '09:00',
  endTime: '17:00',
  breakStartTime: '12:00',
  breakEndTime: '13:00',
  isActive: true,
};

test('weekly availability accepts one valid work window and break', () => {
  const result = setAvailabilitySchema.body.safeParse({ schedules: [validSchedule] });
  assert.equal(result.success, true);
});

test('weekly availability rejects duplicate weekdays', () => {
  const result = setAvailabilitySchema.body.safeParse({
    schedules: [validSchedule, { ...validSchedule, startTime: '10:00', endTime: '18:00' }],
  });
  assert.equal(result.success, false);
});

test('weekly availability rejects reversed work hours and out-of-window breaks', () => {
  assert.equal(setAvailabilitySchema.body.safeParse({
    schedules: [{ ...validSchedule, startTime: '17:00', endTime: '09:00' }],
  }).success, false);
  assert.equal(setAvailabilitySchema.body.safeParse({
    schedules: [{ ...validSchedule, breakStartTime: '08:00', breakEndTime: '09:30' }],
  }).success, false);
});

test('weekly availability rejects times that do not align to five-minute slots', () => {
  const result = setAvailabilitySchema.body.safeParse({
    schedules: [{ ...validSchedule, startTime: '09:02' }],
  });
  assert.equal(result.success, false);
});