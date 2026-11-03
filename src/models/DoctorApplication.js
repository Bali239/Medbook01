import mongoose from 'mongoose';

const assetReferenceSchema = new mongoose.Schema(
  {
    publicId: { type: String, required: true, trim: true, maxlength: 300 },
    format: { type: String, required: true, trim: true, lowercase: true, maxlength: 12 },
    bytes: { type: Number, required: true, min: 1 },
    originalName: { type: String, required: true, trim: true, maxlength: 200 },
    resourceType: { type: String, required: true, enum: ['image', 'raw'] },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const profilePictureSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true, maxlength: 1000 },
    publicId: { type: String, required: true, trim: true, maxlength: 300 },
    format: { type: String, required: true, trim: true, lowercase: true, maxlength: 12 },
    bytes: { type: Number, required: true, min: 1 },
    originalName: { type: String, required: true, trim: true, maxlength: 200 },
    resourceType: { type: String, required: true, enum: ['image'] },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const qualificationSchema = new mongoose.Schema(
  {
    degreeName: { type: String, trim: true, maxlength: 120 },
    institution: { type: String, trim: true, maxlength: 180 },
    country: { type: String, trim: true, maxlength: 100 },
    graduationYear: { type: Number, min: 1900, max: 2100 },
    certificate: assetReferenceSchema,
  },
  { _id: true },
);

const experienceSchema = new mongoose.Schema(
  {
    organization: { type: String, trim: true, maxlength: 180 },
    designation: { type: String, trim: true, maxlength: 120 },
    employmentType: {
      type: String,
      enum: ['full_time', 'part_time', 'visiting_consultant', 'self_employed'],
    },
    startDate: Date,
    endDate: Date,
    currentlyWorking: { type: Boolean, default: false },
    description: { type: String, trim: true, maxlength: 2000 },
  },
  { _id: true },
);

const clinicLocationSchema = new mongoose.Schema(
  {
    clinicName: { type: String, trim: true, maxlength: 180 },
    address: { type: String, trim: true, maxlength: 300 },
    city: { type: String, trim: true, maxlength: 100 },
    locality: { type: String, trim: true, maxlength: 100 },
    postalCode: { type: String, trim: true, maxlength: 20 },
    phoneNumber: { type: String, trim: true, maxlength: 30 },
    googleMapsUrl: { type: String, trim: true, maxlength: 1000 },
    consultationFeePaisa: { type: Number, min: 0, max: 100000000 },
    isPrimary: { type: Boolean, default: false },
    images: { type: [assetReferenceSchema], default: [] },
  },
  { _id: true },
);

const historyEntrySchema = new mongoose.Schema(
  {
    from: {
      type: String,
      enum: ['draft', 'submitted', 'under_review', 'requires_changes', 'approved', 'rejected', null],
      default: null,
    },
    to: {
      type: String,
      enum: ['draft', 'submitted', 'under_review', 'requires_changes', 'approved', 'rejected'],
      required: true,
    },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, trim: true, maxlength: 2000 },
    at: { type: Date, default: Date.now, required: true },
  },
  { _id: false },
);

const declarationSchema = new mongoose.Schema(
  {
    informationAccurate: { type: Boolean, default: false },
    verificationAuthorized: { type: Boolean, default: false },
    termsAccepted: { type: Boolean, default: false },
    publicAfterApprovalAcknowledged: { type: Boolean, default: false },
    acceptedAt: Date,
  },
  { _id: false },
);

const doctorApplicationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    profilePicture: profilePictureSchema,
    firstName: { type: String, trim: true, maxlength: 80 },
    lastName: { type: String, trim: true, maxlength: 80 },
    gender: { type: String, enum: ['female', 'male', 'non_binary', 'prefer_not_to_say'] },
    dateOfBirth: Date,
    phoneNumber: { type: String, trim: true, maxlength: 30 },
    introduction: { type: String, trim: true, maxlength: 500 },
    specialty: { type: mongoose.Schema.Types.ObjectId, ref: 'Specialty' },
    subSpecialty: { type: String, trim: true, maxlength: 120 },
    professionalTitle: {
      type: String,
      enum: ['general_practitioner', 'specialist', 'consultant', 'senior_consultant', 'professor'],
    },
    yearsOfExperience: { type: Number, min: 0, max: 80 },
    appointmentDurationMinutes: { type: Number, enum: [15, 30, 60] },
    clinicTimeZone: { type: String, trim: true, maxlength: 100 },
    registrationNumber: { type: String, trim: true, maxlength: 100 },
    registrationAuthority: { type: String, trim: true, maxlength: 180 },
    languages: { type: [String], default: [] },
    biography: { type: String, trim: true, maxlength: 5000 },
    qualifications: { type: [qualificationSchema], default: [] },
    experiences: { type: [experienceSchema], default: [] },
    locations: { type: [clinicLocationSchema], default: [] },
    documents: {
      cnicFront: assetReferenceSchema,
      cnicBack: assetReferenceSchema,
      registrationCertificate: assetReferenceSchema,
      medicalDegreeCertificate: assetReferenceSchema,
      recentPhotograph: assetReferenceSchema,
      postgraduateCertificates: { type: [assetReferenceSchema], default: [] },
      additional: {
        type: [{ label: { type: String, trim: true, maxlength: 120 }, file: assetReferenceSchema }],
        default: [],
      },
    },
    declarations: { type: declarationSchema, default: () => ({}) },
    status: {
      type: String,
      enum: ['draft', 'submitted', 'under_review', 'requires_changes', 'approved', 'rejected'],
      default: 'draft',
      index: true,
    },
    submittedAt: Date,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    feedback: { type: String, trim: true, maxlength: 2000 },
    statusHistory: { type: [historyEntrySchema], default: [] },
  },
  { timestamps: true, minimize: false },
);

doctorApplicationSchema.index({ status: 1, submittedAt: -1 });

const DoctorApplication = mongoose.model('DoctorApplication', doctorApplicationSchema);

export default DoctorApplication;