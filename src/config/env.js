import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),
  API_VERSION: z.string().default('v1'),
  CLIENT_URL: z.string().url().optional(),
  MONGODB_URI: z.string().optional(),
  JWT_SECRET: z.string().default('dev-secret'),
  JWT_EXPIRE: z.string().default('7d'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  GMAIL_SENDER: z.string().email().optional(),
  GMAIL_CLIENT_ID: z.string().optional(),
  GMAIL_CLIENT_SECRET: z.string().optional(),
  GMAIL_REDIRECT_URI: z.string().url().default('http://localhost:5000/api/auth/gmail/callback'),
  GMAIL_REFRESH_TOKEN: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  ADMIN_EMAIL: z.string().email().or(z.literal('')).optional(),
  STRIPE_SECRET_KEY: z.preprocess(
    (value) => value === '' ? undefined : value,
    z.string().regex(/^sk_test_/, 'Only Stripe test-mode secret keys are accepted').optional(),
  ),
  STRIPE_PUBLISHABLE_KEY: z.preprocess(
    (value) => value === '' ? undefined : value,
    z.string().regex(/^pk_test_/, 'Only Stripe test-mode publishable keys are accepted').optional(),
  ),
  STRIPE_WEBHOOK_SECRET: z.preprocess(
    (value) => value === '' ? undefined : value,
    z.string().regex(/^whsec_/, 'A valid Stripe webhook signing secret is required').optional(),
  ),
  STRIPE_CONSULTATION_PRODUCT_ID: z.preprocess(
    (value) => value === '' ? undefined : value,
    z.string().optional(),
  ),
  PAYMENTS_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  PAYMENT_CURRENCY: z.enum(['USD']).default('USD').transform((value) => value.toLowerCase()),
  PAYMENT_HOLD_DURATION_MINUTES: z.coerce.number().int().positive().default(10),
  FX_RATE_URL: z.string().url().default('https://open.er-api.com/v6/latest/PKR'),
  FX_RATE_MAX_AGE_MINUTES: z.coerce.number().int().positive().default(1500),
}).superRefine((values, context) => {
  if (!values.PAYMENTS_ENABLED) return;

  for (const key of ['STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET']) {
    if (!values[key]) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} is required when payments are enabled`,
      });
    }
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables');
}

export const env = parsed.data;
