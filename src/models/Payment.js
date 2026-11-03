import mongoose from 'mongoose';

const pricingSnapshotSchema = new mongoose.Schema(
  {
    doctorFeePaisa: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    sourceCurrency: { type: String, required: true, enum: ['pkr'] },
    fxProvider: { type: String, required: true },
    fxRateScaled: { type: String, required: true, match: /^\d+$/ },
    fxRateScale: { type: Number, required: true, min: 1 },
    fxQuotedAt: { type: Date, required: true },
    fxValidUntil: { type: Date, required: true },
    currency: { type: String, required: true, lowercase: true, enum: ['usd'] },
    taxMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    additionalChargesMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    discountMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    amountMinor: { type: Number, required: true, min: 50, validate: Number.isSafeInteger },
    rounding: { type: String, required: true, enum: ['half_up_to_cent'] },
  },
  { _id: false },
);

const statusHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['pending', 'processing', 'requires_action', 'succeeded', 'failed', 'canceled', 'partially_refunded', 'refunded', 'disputed'],
      required: true,
    },
    source: { type: String, enum: ['api', 'stripe_webhook', 'reconciliation', 'admin'], required: true },
    eventId: String,
    reasonCode: String,
    at: { type: Date, default: Date.now, required: true },
  },
  { _id: false },
);

const paymentSchema = new mongoose.Schema(
  {
    appointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      required: true,
    },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    stripeCustomerId: String,
    amount: {
      type: Number,
      min: 0,
    },
    amountMinor: { type: Number, min: 0, validate: Number.isSafeInteger },
    currency: {
      type: String,
      lowercase: true,
      default: 'usd',
    },
    pricingSnapshot: pricingSnapshotSchema,
    status: {
      type: String,
      enum: ['pending', 'processing', 'requires_action', 'succeeded', 'failed', 'canceled', 'partially_refunded', 'refunded', 'disputed'],
      default: 'pending',
    },
    stripePaymentIntentId: { type: String, trim: true },
    stripeChargeId: { type: String, trim: true },
    stripeSessionId: String,
    idempotencyKey: { type: String, trim: true },
    requestFingerprint: { type: String, match: /^[a-f\d]{64}$/i },
    activePaymentKey: { type: String, trim: true },
    paymentMethod: {
      type: { type: String },
      brand: { type: String, lowercase: true },
      last4: { type: String, match: /^\d{4}$/ },
    },
    failure: {
      code: String,
      safeMessage: String,
    },
    refundStatus: {
      type: String,
      enum: ['none', 'pending', 'partially_refunded', 'refunded', 'failed'],
      default: 'none',
    },
    refundedAmountMinor: { type: Number, min: 0, default: 0, validate: Number.isSafeInteger },
    refundReservedAmountMinor: { type: Number, min: 0, default: 0, validate: Number.isSafeInteger },
    statusHistory: { type: [statusHistorySchema], default: [] },
  },
  {
    timestamps: true,
  }
);

paymentSchema.index({ stripePaymentIntentId: 1 }, { unique: true, sparse: true });
paymentSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
paymentSchema.index({ activePaymentKey: 1 }, { unique: true, sparse: true });
paymentSchema.index({ patient: 1, createdAt: -1 });
paymentSchema.index({ appointment: 1, createdAt: -1 });

const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;
