import mongoose from 'mongoose';

const stripeWebhookEventSchema = new mongoose.Schema(
  {
    stripeEventId: { type: String, required: true, unique: true, trim: true },
    eventType: { type: String, required: true, trim: true },
    relatedObjectId: { type: String, trim: true },
    payload: { type: mongoose.Schema.Types.Mixed, required: true, select: false },
    status: {
      type: String,
      enum: ['received', 'processing', 'processed', 'failed'],
      default: 'received',
      index: true,
    },
    attemptCount: { type: Number, min: 0, default: 0 },
    lastError: { type: String, maxlength: 200 },
    nextAttemptAt: { type: Date, default: Date.now, index: true },
    leaseExpiresAt: Date,
    processedAt: Date,
    receivedAt: { type: Date, default: Date.now, required: true },
  },
  { timestamps: true },
);

stripeWebhookEventSchema.index({ status: 1, nextAttemptAt: 1, receivedAt: 1 });

const StripeWebhookEvent = mongoose.model('StripeWebhookEvent', stripeWebhookEventSchema);

export default StripeWebhookEvent;