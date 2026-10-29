import Stripe from 'stripe';
import { env } from '../../config/env.js';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy', {
  apiVersion: '2023-10-16',
});
