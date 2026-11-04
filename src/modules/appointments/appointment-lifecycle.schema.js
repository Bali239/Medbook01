import { z } from 'zod';

export const cancelAppointmentSchema = {
  params: z.object({ appointmentId: z.string().regex(/^[a-f\d]{24}$/i) }),
  body: z.object({ reason: z.string().trim().max(1000).optional() }).strict(),
};

export const refundRequestSchema = {
  params: z.object({ appointmentId: z.string().regex(/^[a-f\d]{24}$/i) }),
  body: z.object({
    action: z.enum(['cancel', 'reschedule']),
    reason: z.string().trim().max(1000).optional(),
    newStartAt: z.string().datetime().optional(),
  }).strict().superRefine((value, context) => {
    if (value.action === 'reschedule' && !value.newStartAt) context.addIssue({ code: z.ZodIssueCode.custom, path: ['newStartAt'], message: 'A new appointment time is required.' });
    if (value.action === 'cancel' && value.newStartAt) context.addIssue({ code: z.ZodIssueCode.custom, path: ['newStartAt'], message: 'A new appointment time is not valid for cancellation.' });
  }),
};

export const refundRequestDecisionSchema = {
  params: z.object({ requestId: z.string().regex(/^[a-f\d]{24}$/i) }),
  body: z.object({ decision: z.enum(['approve', 'reject']), reason: z.string().trim().max(1000).optional() }).strict(),
};

export const updateAppointmentStatusSchema = {
  params: z.object({ appointmentId: z.string().regex(/^[a-f\d]{24}$/i) }),
  body: z.object({
    status: z.enum(['confirmed', 'cancelled', 'completed']),
    reason: z.string().trim().max(1000).optional(),
  }).strict(),
};

export const listDoctorAppointmentsSchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(['pending', 'pending_payment', 'confirmed', 'completed', 'cancelled', 'expired', 'no-show']).optional(),
  }).strict(),
};
