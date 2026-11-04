import mongoose from 'mongoose';

const historySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['doctor_pending', 'admin_pending', 'refund_pending', 'completed', 'rejected', 'refund_failed'],
      required: true,
    },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['patient', 'doctor', 'admin', 'system'] },
    reason: { type: String, trim: true, maxlength: 1000 },
    at: { type: Date, default: Date.now, required: true },
  },
  { _id: false },
);

const refundRequestSchema = new mongoose.Schema(
  {
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true, index: true },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: { type: String, enum: ['cancel', 'reschedule'], required: true },
    reason: { type: String, trim: true, maxlength: 1000 },
    requestedStartAt: Date,
    replacementAppointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
    replacementPayment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
    status: {
      type: String,
      enum: ['doctor_pending', 'admin_pending', 'refund_pending', 'completed', 'rejected', 'refund_failed'],
      default: 'doctor_pending',
      index: true,
    },
    rejectionReason: { type: String, trim: true, maxlength: 1000 },
    refund: { type: mongoose.Schema.Types.ObjectId, ref: 'Refund' },
    idempotencyKey: { type: String, required: true, unique: true, trim: true },
    statusHistory: { type: [historySchema], default: [] },
  },
  { timestamps: true },
);

refundRequestSchema.index({ appointment: 1, status: 1 });
refundRequestSchema.index({ doctor: 1, status: 1, createdAt: -1 });

const RefundRequest = mongoose.model('RefundRequest', refundRequestSchema);

export default RefundRequest;
