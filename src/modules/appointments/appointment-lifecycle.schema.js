import { z } from 'zod';

export const cancelAppointmentSchema = {
  params: z.object({ appointmentId: z.string().regex(/^[a-f\d]{24}$/i) }),
  body: z.object({ reason: z.string().trim().max(1000).optional() }).strict(),
};