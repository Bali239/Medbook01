import { z } from 'zod';

const clinicTimeZone = z.string().trim().min(1).max(100).refine((value) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, 'Enter a valid IANA clinic time zone');

export const bookingSettingsSchema = {
  body: z.object({
    appointmentDurationMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]),
    clinicTimeZone,
  }).strict(),
};