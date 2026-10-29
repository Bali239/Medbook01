import mongoose from 'mongoose';

const availabilitySchema = new mongoose.Schema(
  {
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    dayOfWeek: {
      type: Number, // 0-6
      required: true,
      min: 0,
      max: 6,
    },
    startTime: {
      type: String, // HH:mm
      required: true,
    },
    endTime: {
      type: String, // HH:mm
      required: true,
    },
    breakStartTime: String,
    breakEndTime: String,
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

availabilitySchema.index({ doctor: 1, dayOfWeek: 1 });

const Availability = mongoose.model('Availability', availabilitySchema);

export default Availability;
