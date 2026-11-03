import { z } from 'zod';

const timeValue = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:mm time');

const schedule = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: timeValue,
  endTime: timeValue,
  breakStartTime: timeValue.optional(),
  breakEndTime: timeValue.optional(),
  isActive: z.literal(true).default(true),
}).strict().superRefine((value, context) => {
  if (value.startTime >= value.endTime) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['endTime'], message: 'End time must be after start time' });
  }
  const hasBreakStart = Boolean(value.breakStartTime);
  const hasBreakEnd = Boolean(value.breakEndTime);
  const breakStartTime = value.breakStartTime || '';
  const breakEndTime = value.breakEndTime || '';
  if (hasBreakStart !== hasBreakEnd) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['breakEndTime'], message: 'Provide both break start and end times' });
  }
  if (hasBreakStart && hasBreakEnd && (
    breakStartTime <= value.startTime
    || breakEndTime >= value.endTime
    || breakStartTime >= breakEndTime
  )) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['breakStartTime'], message: 'Break must be inside the working hours' });
  }
  if ([value.startTime, value.endTime, value.breakStartTime, value.breakEndTime]
    .filter((time) => typeof time === 'string')
    .some((time) => Number(time.slice(3, 5)) % 5 !== 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['startTime'], message: 'Times must align to five-minute increments' });
  }
});

export const setAvailabilitySchema = {
  body: z.object({
    schedules: z.array(schedule).max(7),
  }).strict().superRefine(({ schedules }, context) => {
    const days = schedules.map(({ dayOfWeek }) => dayOfWeek);
    if (new Set(days).size !== days.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['schedules'], message: 'Only one weekly schedule per weekday is allowed' });
    }
  }),
};