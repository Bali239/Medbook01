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

const SlotHold = mongoose.model('SlotHold', slotHoldSchema);

export default SlotHold;
