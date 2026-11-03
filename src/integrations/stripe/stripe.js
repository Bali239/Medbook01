import Stripe from 'stripe';
import { env } from '../../config/env.js';
import { AppError } from '../../errors/AppError.js';

export const stripe = env.STRIPE_SECRET_KEY
  ? new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
  : null;

export const getStripeClient = () => {
  if (!env.PAYMENTS_ENABLED || !stripe) {
    throw new AppError('Payments are temporarily unavailable.', 503);
  }

  return stripe;
};
