import { AppError, BadRequestError } from '../../errors/AppError.js';
import { getStripeClient } from '../../integrations/stripe/stripe.js';
import { env } from '../../config/env.js';
import StripeWebhookEvent from '../../models/StripeWebhookEvent.js';

const allowedMetadataKeys = new Set([
  'payment_id',
  'appointment_id',
  'patient_id',
  'doctor_id',
  'refund_id',
]);

export const sanitizeStripeObject = (object) => {
  const allowedFields = [
    'id', 'object', 'status', 'amount', 'amount_received', 'amount_refunded',
    'currency', 'customer', 'payment_intent', 'latest_charge', 'charge',
    'refunded', 'reason', 'created', 'dispute', 'outcome', 'metadata',
  ];
  const safeObject = {};
  for (const field of allowedFields) {
    if (object[field] !== undefined) safeObject[field] = object[field];
  }

  if (object.metadata) {
    safeObject.metadata = Object.fromEntries(
      Object.entries(object.metadata).filter(([key]) => allowedMetadataKeys.has(key)),
    );
  }
  if (object.last_payment_error?.code) {
    safeObject.last_payment_error = { code: object.last_payment_error.code };
  }
  if (object.payment_method_details?.card) {
    safeObject.payment_method_details = {
      type: object.payment_method_details.type,
      card: {
        brand: object.payment_method_details.card.brand,
        last4: object.payment_method_details.card.last4,
      },
    };
  }
  if (object.payment_method_details && !object.payment_method_details.card) {
    safeObject.payment_method_details = { type: object.payment_method_details.type };
  }
  return safeObject;
};

export class StripeWebhookService {
  constructor({ stripeClientProvider = getStripeClient, eventModel = StripeWebhookEvent } = {}) {
    this.stripeClientProvider = stripeClientProvider;
    this.eventModel = eventModel;
  }

  async accept(rawBody, signature) {
    if (!Buffer.isBuffer(rawBody) || !signature) {
      throw new BadRequestError('Invalid Stripe webhook request.');
    }
    if (!env.STRIPE_WEBHOOK_SECRET) {
      throw new AppError('Stripe webhooks are not configured.', 503);
    }

    const stripeClient = this.stripeClientProvider();
    let event;
    try {
      event = stripeClient.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch {
      throw new BadRequestError('Invalid Stripe webhook signature.');
    }

    const object = sanitizeStripeObject(event.data.object);
    try {
      const saved = await this.eventModel.create({
        stripeEventId: event.id,
        eventType: event.type,
        relatedObjectId: object.id,
        payload: {
          id: event.id,
          type: event.type,
          created: event.created,
          object,
        },
      });
      return { accepted: true, duplicate: false, eventId: saved.stripeEventId };
    } catch (error) {
      if (error.code === 11000) {
        return { accepted: true, duplicate: true, eventId: event.id };
      }
      throw error;
    }
  }
}