import mongoose from 'mongoose';

const doctorProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
    },
    specialty: {
      type: String,
      required: [true, 'Specialty is required'],
    },
    licenseNumber: {
      type: String,
      required: [true, 'License number is required'],
    },
    qualifications: [String],
    experience: {
      type: Number,
      default: 0,
    },
    clinicName: String,
    clinicAddress: String,
    consultationFee: {
      type: Number,
      required: [true, 'Consultation fee is required'],
    },
    bio: String,
    profilePicture: String,
    status: {
      type: String,
      enum: ['incomplete', 'pending', 'approved', 'rejected'],
      default: 'incomplete',
    },
    rejectionReason: String,
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedAt: Date,
  },
  {
    timestamps: true,
  }
);

doctorProfileSchema.index({ status: 1 });

const DoctorProfile = mongoose.model('DoctorProfile', doctorProfileSchema);

export default DoctorProfile;
