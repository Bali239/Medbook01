import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getZonedAppointmentSlot,
  getSlotClaimIntervals,
  localDateTimeToUtc,
  timeRangesOverlap,
} from '../src/modules/appointments/appointment-time.js';

const fixedNow = Date.parse('2026-11-02T00:00:00.000Z');

test('appointment instants map to clinic-local date, weekday, and time', () => {
  const slot = getZonedAppointmentSlot(
    '2026-11-03T04:00:00.000Z',
    30,
    'Asia/Karachi',
    fixedNow,
  );

  assert.equal(slot.startTime, '09:00');
  assert.equal(slot.endTime, '09:30');
  assert.equal(slot.dayOfWeek, 2);
  assert.equal(slot.appointmentDate.toISOString(), '2026-11-03T00:00:00.000Z');
});

test('appointment slots that cross a daylight-saving transition are rejected', () => {
  assert.throws(
    () => getZonedAppointmentSlot(
      '2026-03-08T06:45:00.000Z',
      30,
      'America/New_York',
      Date.parse('2026-03-01T00:00:00.000Z'),
    ),
    /time change/i,
  );
});

test('schedule range overlap uses half-open interval boundaries', () => {
  assert.equal(timeRangesOverlap(540, 570, '09:15', '09:45'), true);
  assert.equal(timeRangesOverlap(540, 570, '09:30', '10:00'), false);
});

test('local clinic times convert to UTC and nonexistent daylight-saving times are omitted', () => {
  assert.equal(
    localDateTimeToUtc('2026-11-03', '09:00', 'Asia/Karachi')?.toISOString(),
    '2026-11-03T04:00:00.000Z',
  );
  assert.equal(localDateTimeToUtc('2026-03-08', '02:30', 'America/New_York'), null);
});

test('ambiguous daylight-saving clinic times resolve deterministically to the earlier instant', () => {
  assert.equal(
    localDateTimeToUtc('2026-11-01', '01:30', 'America/New_York')?.toISOString(),
    '2026-11-01T05:30:00.000Z',
  );
});

test('reservation claims cover every five-minute interval and reject misaligned starts', () => {
  const claims = getSlotClaimIntervals(540, 570);
  assert.equal(claims.length, 6);
  assert.deepEqual(claims[0], { startTime: '09:00', endTime: '09:05' });
  assert.deepEqual(claims.at(-1), { startTime: '09:25', endTime: '09:30' });
  assert.throws(() => getSlotClaimIntervals(542, 572), /reservation grid/i);
});