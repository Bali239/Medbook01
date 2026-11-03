import mongoose from 'mongoose';

const pricingSnapshotSchema = new mongoose.Schema(
  {
    doctorFeePaisa: { type: Number, min: 1 },
    sourceCurrency: { type: String, enum: ['pkr'] },
    fxProvider: String,
    fxRateScaled: { type: String, match: /^\d+$/ },
    fxRateScale: Number,
    fxQuotedAt: Date,
    fxValidUntil: Date,
    currency: { type: String, lowercase: true },
    taxMinor: { type: Number, min: 0, default: 0 },
    additionalChargesMinor: { type: Number, min: 0, default: 0 },
    discountMinor: { type: Number, min: 0, default: 0 },
    amountMinor: { type: Number, min: 0, validate: Number.isSafeInteger },
    rounding: String,
  },
  { _id: false },
);

const appointmentSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    appointmentDate: {
      type: Date,
      required: true,
    },
    startTime: {
      type: String,
      required: true,
    },
    endTime: {
      type: String,
      required: true,
    },
    appointmentStartAt: Date,
    appointmentEndAt: Date,
    status: {
      type: String,
      enum: ['pending', 'pending_payment', 'confirmed', 'completed', 'cancelled', 'expired', 'no-show'],
      default: 'pending',
    },
    fee: {
      type: Number,
      min: 0,
    },
    feePaisa: { type: Number, min: 0, validate: Number.isSafeInteger },
    currency: { type: String, lowercase: true, default: 'pkr' },
    pricingSnapshot: pricingSnapshotSchema,
    appointmentDurationMinutes: { type: Number, enum: [15, 30, 60] },
    slotHold: { type: mongoose.Schema.Types.ObjectId, ref: 'SlotHold' },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
    cancellation: {
      actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      role: { type: String, enum: ['patient', 'doctor', 'admin'] },
      reason: { type: String, trim: true, maxlength: 1000 },
      at: Date,
      refundEligible: Boolean,
    },
    cancellationHistory: {
      type: [{ actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, role: String, reason: String, at: Date }],
      default: [],
    },
    bookingIdempotencyKey: { type: String, trim: true },
    doctorSnapshot: {
      name: { type: String, trim: true },
      specialty: { type: String, trim: true },
      clinicName: { type: String, trim: true },
      clinicAddress: { type: String, trim: true },
      clinicCity: { type: String, trim: true },
      clinicTimeZone: { type: String, trim: true },
    },
    reason: String,
    paymentStatus: {
      type: String,
      enum: ['pending', 'processing', 'paid', 'failed', 'cancelled', 'refund_pending', 'partially_refunded', 'refunded'],
      default: 'pending',
    },
    holdExpiresAt: Date,
  },
  {
    timestamps: true,
  }
);

appointmentSchema.index({ doctor: 1, appointmentDate: 1, startTime: 1 });
appointmentSchema.index({ patient: 1 });
appointmentSchema.index({ bookingIdempotencyKey: 1 }, { unique: true, sparse: true });

const Appointment = mongoose.model('Appointment', appointmentSchema);

export default Appointment;
