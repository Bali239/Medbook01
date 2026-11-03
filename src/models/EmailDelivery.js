import mongoose from 'mongoose';

const emailDeliverySchema = new mongoose.Schema(
  {
    dedupeKey: { type: String, required: true, unique: true, trim: true },
    to: { type: String, required: true, lowercase: true, trim: true, select: false },
    subject: { type: String, required: true, maxlength: 200 },
    text: { type: String, required: true, maxlength: 10000, select: false },
    html: { type: String, maxlength: 20000, select: false },
    status: { type: String, enum: ['queued', 'processing', 'sent', 'failed', 'skipped'], default: 'queued', index: true },
    attempts: { type: Number, min: 0, default: 0 },
    nextAttemptAt: { type: Date, default: Date.now, index: true },
    leaseExpiresAt: Date,
    sentAt: Date,
    skippedAt: Date,
    lastError: { type: String, maxlength: 80 },
  },
  { timestamps: true },
);

emailDeliverySchema.index({ status: 1, nextAttemptAt: 1, createdAt: 1 });

const EmailDelivery = mongoose.model('EmailDelivery', emailDeliverySchema);

export default EmailDelivery;