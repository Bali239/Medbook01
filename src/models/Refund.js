import mongoose from 'mongoose';

const refundHistorySchema = new mongoose.Schema(
  {
    status: { type: String, enum: ['pending', 'succeeded', 'failed', 'canceled'], required: true },
    source: { type: String, enum: ['api', 'stripe_webhook', 'admin'], required: true },
    eventId: String,
    at: { type: Date, default: Date.now, required: true },
  },
  { _id: false },
);

const refundSchema = new mongoose.Schema(
  {
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true, index: true },
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true, index: true },
    refundRequest: { type: mongoose.Schema.Types.ObjectId, ref: 'RefundRequest', index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amountMinor: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    currency: { type: String, required: true, lowercase: true, enum: ['usd'] },
    reason: { type: String, required: true, enum: ['patient_cancellation', 'doctor_cancellation', 'admin_override', 'appointment_unavailable'] },
    adminReason: { type: String, trim: true, maxlength: 1000 },
    initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['pending', 'succeeded', 'failed', 'canceled'], default: 'pending', index: true },
    stripeRefundId: { type: String, trim: true },
    idempotencyKey: { type: String, required: true, unique: true, trim: true },
    failureCode: String,
    statusHistory: { type: [refundHistorySchema], default: [] },
  },
  { timestamps: true },
);

refundSchema.index({ stripeRefundId: 1 }, { unique: true, sparse: true });
refundSchema.index({ patient: 1, createdAt: -1 });

const Refund = mongoose.model('Refund', refundSchema);

export default Refund;
