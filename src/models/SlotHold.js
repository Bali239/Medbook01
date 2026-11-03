import mongoose from 'mongoose';

const slotHoldSchema = new mongoose.Schema(
  {
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    patient: {
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
    status: {
      type: String,
      enum: ['active', 'consumed', 'released', 'expired'],
      default: 'active',
      index: true,
    },
    idempotencyKey: { type: String, trim: true },
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 },
    },
  },
  {
    timestamps: true,
  }
);

slotHoldSchema.index({ doctor: 1, appointmentDate: 1, startTime: 1 }, { unique: true });
slotHoldSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

const SlotHold = mongoose.model('SlotHold', slotHoldSchema);

export default SlotHold;
