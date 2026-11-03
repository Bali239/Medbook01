import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier');

const assetReference = z.object({
  publicId: z.string().trim().min(1).max(300),
  format: z.string().trim().toLowerCase().min(1).max(12),
  bytes: z.number().int().positive().max(15 * 1024 * 1024),
  originalName: z.string().trim().min(1).max(200),
  resourceType: z.enum(['image', 'raw']),
  uploadedAt: z.coerce.date().optional(),
}).strict();

const profilePicture = z.object({
  url: z.string().url().max(1000).refine((value) => value.startsWith('https://res.cloudinary.com/')),
  publicId: z.string().trim().min(1).max(300),
  format: z.string().trim().toLowerCase().min(1).max(12),
  bytes: z.number().int().positive().max(5 * 1024 * 1024),
  originalName: z.string().trim().min(1).max(200),
  resourceType: z.literal('image'),
  uploadedAt: z.coerce.date().optional(),
}).strict();

const qualification = z.object({
  degreeName: z.string().trim().max(120).optional(),
  institution: z.string().trim().max(180).optional(),
  country: z.string().trim().max(100).optional(),
  graduationYear: z.number().int().min(1900).max(new Date().getFullYear() + 1).optional(),
  certificate: assetReference.nullable().optional(),
}).strict();

const experience = z.object({
  organization: z.string().trim().max(180).optional(),
  designation: z.string().trim().max(120).optional(),
  employmentType: z.enum(['full_time', 'part_time', 'visiting_consultant', 'self_employed']).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().nullable().optional(),
  currentlyWorking: z.boolean().optional(),
  description: z.string().trim().max(2000).optional(),
}).strict();

const location = z.object({
  clinicName: z.string().trim().max(180).optional(),
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(100).optional(),
  locality: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
  phoneNumber: z.string().trim().max(30).optional(),
  googleMapsUrl: z.string().trim().max(1000).url().or(z.literal('')).optional(),
  consultationFeePaisa: z.number().int().min(0).max(100000000).optional(),
  isPrimary: z.boolean().optional(),
  images: z.array(assetReference).max(10).optional(),
}).strict();

const documents = z.object({
  cnicFront: assetReference.nullable().optional(),
  cnicBack: assetReference.nullable().optional(),
  registrationCertificate: assetReference.nullable().optional(),
  medicalDegreeCertificate: assetReference.nullable().optional(),
  recentPhotograph: assetReference.nullable().optional(),
  postgraduateCertificates: z.array(assetReference).max(20).optional(),
  additional: z.array(z.object({
    label: z.string().trim().max(120),
    file: assetReference,
  }).strict()).max(20).optional(),
}).strict();

const declarations = z.object({
  informationAccurate: z.boolean().optional(),
  verificationAuthorized: z.boolean().optional(),
  termsAccepted: z.boolean().optional(),
  publicAfterApprovalAcknowledged: z.boolean().optional(),
}).strict();

const draftBody = z.object({
  profilePicture: profilePicture.nullable().optional(),
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  gender: z.enum(['female', 'male', 'non_binary', 'prefer_not_to_say']).optional(),
  dateOfBirth: z.coerce.date().nullable().optional(),
  phoneNumber: z.string().trim().max(30).optional(),
  introduction: z.string().trim().max(500).optional(),
  specialty: objectId.nullable().optional(),
  subSpecialty: z.string().trim().max(120).optional(),
  professionalTitle: z.enum([
    'general_practitioner', 'specialist', 'consultant', 'senior_consultant', 'professor',
  ]).optional(),
  yearsOfExperience: z.number().int().min(0).max(80).optional(),
  appointmentDurationMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]).optional(),
  clinicTimeZone: z.string().trim().max(100).optional(),
  registrationNumber: z.string().trim().max(100).optional(),
  registrationAuthority: z.string().trim().max(180).optional(),
  languages: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  biography: z.string().trim().max(5000).optional(),
  qualifications: z.array(qualification).max(20).optional(),
  experiences: z.array(experience).max(20).optional(),
  locations: z.array(location).max(5).optional(),
  documents: documents.optional(),
  declarations: declarations.optional(),
}).strict();

const submitBody = z.object({}).strict();

const adminReviewBody = z.object({
  status: z.enum(['under_review', 'requires_changes', 'approved', 'rejected']),
  reason: z.string().trim().max(2000).optional(),
}).strict().superRefine((value, context) => {
  if (['requires_changes', 'rejected'].includes(value.status) && !value.reason) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['reason'],
      message: 'A reason is required for this decision',
    });
  }
});

const uploadPurpose = z.enum([
  'profile_picture',
  'clinic_image',
  'qualification',
  'cnic',
  'registration_certificate',
  'medical_degree',
  'recent_photograph',
  'postgraduate_certificate',
  'supporting_document',
]);

const privateAssetId = z.string()
  .regex(/^doctor-verification-[a-f\d]{24}-[a-f\d-]{36}(?:\.pdf)?$/i, 'Invalid document identifier');

export const doctorApplicationDraftSchema = { body: draftBody };
export const doctorApplicationSubmitSchema = { body: submitBody };
export const doctorApplicationAdminReviewSchema = {
  params: z.object({ id: objectId }),
  body: adminReviewBody,
};
export const doctorApplicationIdSchema = { params: z.object({ id: objectId }) };
export const doctorApplicationListSchema = {
  query: z.object({
    status: z.preprocess(
      (value) => value === '' ? undefined : value,
      z.enum(['submitted', 'under_review', 'requires_changes', 'approved', 'rejected']).optional(),
    ),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
};
export const doctorApplicationUploadSignatureSchema = {
  body: z.object({
    purpose: uploadPurpose,
    fileName: z.string().trim().min(1).max(200),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
    bytes: z.number().int().positive().max(15 * 1024 * 1024),
  }).strict(),
};
export const doctorApplicationUploadConfirmSchema = {
  body: z.object({
    purpose: uploadPurpose,
    publicId: z.string().trim().min(1).max(300),
    originalName: z.string().trim().min(1).max(200),
  }).strict(),
};
export const doctorApplicationPrivateAssetSchema = {
  params: z.object({ publicId: privateAssetId }),
};
export const doctorApplicationAdminAssetSchema = {
  params: z.object({ id: objectId, publicId: privateAssetId }),
};

export const applicationFieldSchemas = {
  assetReference,
  qualification,
  experience,
  location,
};
