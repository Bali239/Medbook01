import { z } from 'zod';

const specialtyId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid specialty identifier');

const createBody = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional().default(''),
  sortOrder: z.number().int().min(0).max(10000).optional().default(0),
}).strict();

const updateBody = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(500).optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  isActive: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const specialtyIdSchema = { params: z.object({ id: specialtyId }) };
export const createSpecialtySchema = { body: createBody };
export const updateSpecialtySchema = { params: z.object({ id: specialtyId }), body: updateBody };