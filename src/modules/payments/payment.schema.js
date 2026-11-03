import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier');

export const initializePaymentSchema = {
  body: z.object({
    doctorId: objectId,
    startAt: z.string().datetime({ offset: true }),
    idempotencyKey: z.string().uuid(),
  }).strict(),
};

export const paymentIdParamsSchema = {
  params: z.object({ paymentId: objectId }),
};

export const appointmentPaymentParamsSchema = {
  params: z.object({ appointmentId: objectId }),
};

export const paginationSchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
};

export const refundCreateSchema = {
  params: z.object({ paymentId: objectId }),
  body: z.object({
    amountMinor: z.number().int().positive(),
    reason: z.string().trim().min(1).max(1000),
    idempotencyKey: z.string().uuid(),
  }).strict(),
};