import mongoose from 'mongoose';

const emergencyContactSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: 100 },
    relationship: {
      type: String,
      enum: ['parent', 'spouse', 'sibling', 'child', 'friend', 'other'],
    },
    phoneNumber: { type: String, trim: true, maxlength: 30 },
  },
  { _id: false },
);

const profilePictureSchema = new mongoose.Schema(
  {
    url: { type: String, trim: true },
    publicId: { type: String, trim: true },
  },
  { _id: false },
);

const patientProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: 80,
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      maxlength: 80,
    },
    profilePicture: profilePictureSchema,
    dateOfBirth: {
      type: Date,
      required: [true, 'Date of birth is required'],
    },
    gender: {
      type: String,
      enum: ['female', 'male', 'non_binary', 'prefer_not_to_say'],
      required: [true, 'Gender is required'],
    },
    phoneNumber: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      maxlength: 30,
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
      maxlength: 100,
    },
    address: {
      type: String,
      trim: true,
      maxlength: 250,
    },
    emergencyContact: emergencyContactSchema,
    privacyConsentAt: Date,
    stripeCustomerId: { type: String, select: false, trim: true },
    stripeCustomerGeneration: { type: Number, select: false, default: 0, min: 0 },
  },
  { timestamps: true },
);

const PatientProfile = mongoose.model('PatientProfile', patientProfileSchema);

export default PatientProfile;
