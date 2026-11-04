import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    role: z.enum(['patient', 'doctor']).default('patient'),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
    role: z.enum(['patient', 'doctor', 'admin']),
  }),
});

export const completeGoogleLoginSchema = z.object({
  body: z.object({
    token: z.string().min(1),
    role: z.enum(['patient', 'doctor']),
  }),
});
