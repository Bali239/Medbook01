import mongoose from 'mongoose';

const qualificationDetailSchema = new mongoose.Schema(
  {
    degreeName: { type: String, trim: true },
    institution: { type: String, trim: true },
    country: { type: String, trim: true },
    graduationYear: Number,
  },
  { _id: false },
);

const experienceSchema = new mongoose.Schema(
  {
    organization: String,
    designation: String,
    employmentType: String,
    startDate: Date,
    endDate: Date,
    currentlyWorking: Boolean,
    description: String,
  },
  { _id: false },
);

const clinicLocationSchema = new mongoose.Schema(
  {
    clinicName: String,
    address: String,
    city: String,
    locality: String,
    postalCode: String,
    phoneNumber: String,
    googleMapsUrl: String,
    consultationFeePaisa: Number,
    clinicImages: [String],
    isPrimary: Boolean,
  },
  { _id: false },
);

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
    specialtyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Specialty',
      index: true,
    },
    subSpecialty: String,
    professionalTitle: {
      type: String,
      enum: ['general_practitioner', 'specialist', 'consultant', 'senior_consultant', 'professor'],
    },
    licenseNumber: {
      type: String,
      required: [true, 'License number is required'],
    },
    registrationAuthority: String,
    qualifications: [String],
    qualificationDetails: [qualificationDetailSchema],
    experiences: [experienceSchema],
    clinicLocations: [clinicLocationSchema],
    languages: [String],
    experience: {
      type: Number,
      default: 0,
    },
    appointmentDurationMinutes: { type: Number, enum: [15, 30, 60] },
    clinicTimeZone: { type: String, trim: true, maxlength: 100 },
    clinicName: String,
    clinicAddress: String,
    clinicCity: String,
    clinicLocality: String,
    clinicPostalCode: String,
    clinicPhoneNumber: String,
    clinicGoogleMapsUrl: String,
    consultationFee: {
      type: Number,
      required: [true, 'Consultation fee is required'],
    },
    consultationFeePaisa: { type: Number, min: 0 },
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
doctorProfileSchema.index({ status: 1, specialtyId: 1 });

const DoctorProfile = mongoose.model('DoctorProfile', doctorProfileSchema);

export default DoctorProfile;
