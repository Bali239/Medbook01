import { BadRequestError } from '../../errors/AppError.js';

const weekdayNumbers = new Map([
  ['Sun', 0],
  ['Mon', 1],
  ['Tue', 2],
  ['Wed', 3],
  ['Thu', 4],
  ['Fri', 5],
  ['Sat', 6],
]);

const getZonedParts = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
};

export const timeStringToMinutes = (value) => {
  const match = /^(\d{2}):(\d{2})$/.exec(value || '');
  if (!match) throw new BadRequestError('The doctor availability contains an invalid time.');
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new BadRequestError('The doctor availability contains an invalid time.');
  return (hour * 60) + minute;
};

export const getZonedAppointmentSlot = (startAtValue, durationMinutes, timeZone, now = Date.now()) => {
  const startAt = new Date(startAtValue);
  if (Number.isNaN(startAt.valueOf()) || startAt <= new Date(now)) {
    throw new BadRequestError('Choose a future appointment time.');
  }
  if (startAt.getUTCSeconds() !== 0 || startAt.getUTCMilliseconds() !== 0) {
    throw new BadRequestError('Appointment times must start on a whole minute.');
  }
  if (![15, 30, 60].includes(durationMinutes)) {
    throw new BadRequestError('The doctor has not configured a valid appointment duration.');
  }

  let startParts;
  let endParts;
  const endAt = new Date(startAt.valueOf() + (durationMinutes * 60_000));
  try {
    startParts = getZonedParts(startAt, timeZone);
    endParts = getZonedParts(endAt, timeZone);
  } catch {
    throw new BadRequestError('The doctor has not configured a valid clinic time zone.');
  }

  const startDate = `${startParts.year}-${startParts.month}-${startParts.day}`;
  const endDate = `${endParts.year}-${endParts.month}-${endParts.day}`;
  const startTime = `${startParts.hour}:${startParts.minute}`;
  const endTime = `${endParts.hour}:${endParts.minute}`;
  const startMinute = timeStringToMinutes(startTime);
  const endMinute = timeStringToMinutes(endTime);

  if (startDate !== endDate || endMinute - startMinute !== durationMinutes) {
    throw new BadRequestError('This appointment crosses a clinic time change and cannot be booked.');
  }

  return {
    startAt,
    endAt,
    appointmentDate: new Date(Date.UTC(
      Number(startParts.year),
      Number(startParts.month) - 1,
      Number(startParts.day),
    )),
    startTime,
    endTime,
    startMinute,
    endMinute,
    dayOfWeek: weekdayNumbers.get(startParts.weekday),
  };
};

export const localDateTimeToUtc = (dateValue, timeValue, timeZone) => {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue || '');
  if (!dateMatch) throw new BadRequestError('Choose a valid appointment date.');
  const minutes = timeStringToMinutes(timeValue);
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const baseUtc = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60);
  const results = [];

  try {
    for (let offsetMinutes = -14 * 60; offsetMinutes <= 14 * 60; offsetMinutes += 15) {
      const candidate = new Date(baseUtc + (offsetMinutes * 60_000));
      const parts = getZonedParts(candidate, timeZone);
      if (
        parts.year === dateMatch[1]
        && parts.month === dateMatch[2]
        && parts.day === dateMatch[3]
        && parts.hour === String(Math.floor(minutes / 60)).padStart(2, '0')
        && parts.minute === String(minutes % 60).padStart(2, '0')
      ) results.push(candidate);
    }
  } catch {
    throw new BadRequestError('The doctor has not configured a valid clinic time zone.');
  }

  return results.sort((left, right) => left - right)[0] || null;
};

export const timeRangesOverlap = (startMinute, endMinute, otherStart, otherEnd) => (
  startMinute < timeStringToMinutes(otherEnd)
  && timeStringToMinutes(otherStart) < endMinute
);

export const getSlotClaimIntervals = (startMinute, endMinute, granularityMinutes = 5) => {
  if (
    !Number.isInteger(startMinute)
    || !Number.isInteger(endMinute)
    || !Number.isInteger(granularityMinutes)
    || startMinute % granularityMinutes !== 0
    || endMinute <= startMinute
    || (endMinute - startMinute) % granularityMinutes !== 0
  ) throw new BadRequestError('The appointment does not align with the reservation grid.');

  const intervals = [];
  for (let minute = startMinute; minute < endMinute; minute += granularityMinutes) {
    intervals.push({
      startTime: `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`,
      endTime: `${String(Math.floor((minute + granularityMinutes) / 60)).padStart(2, '0')}:${String((minute + granularityMinutes) % 60).padStart(2, '0')}`,
    });
  }
  return intervals;
};