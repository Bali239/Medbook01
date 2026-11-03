import DoctorApplication from '../../models/DoctorApplication.js';
import DoctorProfile from '../../models/DoctorProfile.js';
import Specialty from '../../models/Specialty.js';
import User from '../../models/User.js';
import AuditLog from '../../models/AuditLog.js';
import Notification from '../../models/Notification.js';
import { env } from '../../config/env.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../errors/AppError.js';
import { sendEmail } from '../auth/email.service.js';
import {
  fetchPrivateDoctorApplicationAsset,
  removeDoctorApplicationAsset,
  verifyDoctorApplicationUpload,
} from '../../integrations/cloudinary/doctor-application-storage.js';
import { validateApplicationCompleteness } from './doctor-application.completeness.js';
import { canTransitionApplication } from './doctor-application.transitions.js';

const privateDocumentPurposes = {
  cnicFront: 'cnic',
  cnicBack: 'cnic',
  registrationCertificate: 'registration_certificate',
  medicalDegreeCertificate: 'medical_degree',
  recentPhotograph: 'recent_photograph',
};

const asObject = (document) => document?.toObject
  ? document.toObject()
  : document;

const collectAssetReferences = (application) => {
  const references = [];
  if (application?.profilePicture) references.push({ asset: application.profilePicture, purpose: 'profile_picture' });
  application?.qualifications?.forEach((item) => {
    if (item.certificate) references.push({ asset: item.certificate, purpose: 'qualification' });
  });
  application?.locations?.forEach((item) => {
    item.images?.forEach((asset) => references.push({ asset, purpose: 'clinic_image' }));
  });
  for (const [field, purpose] of Object.entries(privateDocumentPurposes)) {
    if (application?.documents?.[field]) references.push({ asset: application.documents[field], purpose });
  }
  application?.documents?.postgraduateCertificates?.forEach((asset) => {
    references.push({ asset, purpose: 'postgraduate_certificate' });
  });
  application?.documents?.additional?.forEach(({ file }) => {
    if (file) references.push({ asset: file, purpose: 'supporting_document' });
  });
  return references;
};

const collectPrivateReferences = (application) => collectAssetReferences(application)
  .filter(({ purpose }) => !['profile_picture', 'clinic_image'].includes(purpose));

const summarizeApplication = (application) => {
  if (!application) return null;
  const data = asObject(application);
  delete data.user;
  delete data.reviewedBy;
  data.statusHistory = (data.statusHistory || []).map(({ from, to, reason, at }) => ({ from, to, reason, at }));
  return data;
};

const summarizeAdminApplication = (application) => {
  const data = summarizeApplication(application);
  if (!data) return null;
  const applicant = application.user && typeof application.user === 'object'
    ? application.user
    : null;
  data.applicant = applicant
    ? { id: applicant._id, name: applicant.name, email: applicant.email }
    : { id: application.user };
  return data;
};

const assertRequiredActor = async (userId) => {
  const user = await User.findById(userId).select('role email name');
  if (!user || user.role !== 'doctor') throw new ForbiddenError('A doctor account is required');
  return user;
};

const currentReferencesByPurpose = (application) => new Map(
  collectAssetReferences(application).map(({ asset, purpose }) => [`${purpose}:${asset.publicId}`, asset]),
);

const verifyNewReference = async (userId, reference, purpose, existingReferences) => {
  if (!reference) return reference;
  const existing = existingReferences.get(`${purpose}:${reference.publicId}`);
  if (existing) return existing;
  return verifyDoctorApplicationUpload(userId, {
    publicId: reference.publicId,
    purpose,
    originalName: reference.originalName,
  });
};

const verifyDraftAssets = async (userId, data, existingApplication) => {
  const existing = currentReferencesByPurpose(existingApplication);
  const normalized = { ...data };

  if (Object.hasOwn(data, 'profilePicture') && data.profilePicture) {
    normalized.profilePicture = await verifyNewReference(userId, data.profilePicture, 'profile_picture', existing);
  }

  if (data.qualifications) {
    normalized.qualifications = await Promise.all(data.qualifications.map(async (qualification) => ({
      ...qualification,
      certificate: await verifyNewReference(userId, qualification.certificate, 'qualification', existing),
    })));
  }

  if (data.locations) {
    normalized.locations = await Promise.all(data.locations.map(async (location) => ({
      ...location,
      images: location.images
        ? await Promise.all(location.images.map((asset) => verifyNewReference(userId, asset, 'clinic_image', existing)))
        : location.images,
    })));
  }

  if (data.documents) {
    const oldDocuments = asObject(existingApplication)?.documents || {};
    const nextDocuments = { ...oldDocuments, ...data.documents };
    for (const [field, purpose] of Object.entries(privateDocumentPurposes)) {
      if (Object.hasOwn(data.documents, field) && data.documents[field]) {
        nextDocuments[field] = await verifyNewReference(userId, data.documents[field], purpose, existing);
      }
    }
    if (data.documents.postgraduateCertificates) {
      nextDocuments.postgraduateCertificates = await Promise.all(
        data.documents.postgraduateCertificates.map((asset) => verifyNewReference(userId, asset, 'postgraduate_certificate', existing)),
      );
    }
    if (data.documents.additional) {
      nextDocuments.additional = await Promise.all(data.documents.additional.map(async (item) => ({
        ...item,
        file: await verifyNewReference(userId, item.file, 'supporting_document', existing),
      })));
    }
    normalized.documents = nextDocuments;
  }

  return normalized;
};

const mergeDraftData = (application, data) => {
  const merged = { ...data };
  if (data.documents) merged.documents = { ...(asObject(application)?.documents || {}), ...data.documents };
  if (data.declarations) merged.declarations = { ...(asObject(application)?.declarations || {}), ...data.declarations };
  return merged;
};

const removeUnreferencedAssets = async (userId, before, after) => {
  const retained = new Set(collectAssetReferences(after).map(({ asset }) => asset.publicId));
  const removed = collectAssetReferences(before).filter(({ asset }) => !retained.has(asset.publicId));

  await Promise.all(removed.map(async ({ asset, purpose }) => {
    try {
      await removeDoctorApplicationAsset({
        publicId: asset.publicId,
        resourceType: asset.resourceType || (asset.format === 'pdf' ? 'raw' : 'image'),
        purpose,
        userId,
      });
    } catch (error) {
      console.error('Unable to remove replaced doctor application upload', error.message);
    }
  }));
};

const notifyApplicant = async (user, status, reason = '') => {
  const titleByStatus = {
    submitted: 'Doctor application submitted',
    under_review: 'Doctor application under review',
    requires_changes: 'Changes requested for your application',
    approved: 'Doctor application approved',
    rejected: 'Doctor application decision',
  };
  const title = titleByStatus[status];
  if (!title) return;
  const message = status === 'requires_changes' || status === 'rejected'
    ? `${title}. ${reason}`
    : title;

  try {
    await Notification.create({
      recipient: user._id,
      type: `doctor_application_${status}`,
      title,
      message,
      data: { status },
    });
  } catch (error) {
    console.error('Unable to persist doctor application notification', error.message);
  }

  if (env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_SENDER && env.GMAIL_REFRESH_TOKEN) {
    try {
      await sendEmail({
        to: user.email,
        subject: title,
        text: message,
        html: `<p>${message.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</p>`,
      });
    } catch (error) {
      console.error('Unable to send doctor application email', error.message);
    }
  }
};

const validateSubmission = async (application) => {
  validateApplicationCompleteness(asObject(application));
  const specialty = await Specialty.findOne({ _id: application.specialty, isActive: true }).select('name');
  if (!specialty) {
    const error = new ValidationError('Choose an active medical specialty');
    error.errors = [{ path: 'specialty', message: 'This specialty is no longer available' }];
    throw error;
  }
};

const publicProfileFields = async (application) => {
  const specialty = await Specialty.findById(application.specialty).select('name');
  const primaryLocation = application.locations.find((location) => location.isPrimary);
  const qualificationDetails = application.qualifications.map((qualification) => ({
    degreeName: qualification.degreeName,
    institution: qualification.institution,
    country: qualification.country,
    graduationYear: qualification.graduationYear,
  }));
  const experiences = application.experiences.map((experience) => ({
    organization: experience.organization,
    designation: experience.designation,
    employmentType: experience.employmentType,
    startDate: experience.startDate,
    endDate: experience.currentlyWorking ? null : experience.endDate,
    currentlyWorking: experience.currentlyWorking,
    description: experience.description,
  }));
  const locations = application.locations.map((location) => ({
    clinicName: location.clinicName,
    address: location.address,
    city: location.city,
    locality: location.locality,
    postalCode: location.postalCode,
    phoneNumber: location.phoneNumber,
    googleMapsUrl: location.googleMapsUrl,
    consultationFeePaisa: location.consultationFeePaisa,
    clinicImages: location.images.map((image) => image.url),
    isPrimary: location.isPrimary,
  }));

  return {
    fullName: `${application.firstName} ${application.lastName}`.trim(),
    specialty: specialty.name,
    specialtyId: application.specialty,
    subSpecialty: application.subSpecialty,
    professionalTitle: application.professionalTitle,
    appointmentDurationMinutes: application.appointmentDurationMinutes,
    clinicTimeZone: application.clinicTimeZone,
    licenseNumber: application.registrationNumber,
    registrationAuthority: application.registrationAuthority,
    qualifications: qualificationDetails.map((qualification) => qualification.degreeName),
    qualificationDetails,
    experience: application.yearsOfExperience,
    experiences,
    languages: application.languages,
    bio: application.biography,
    profilePicture: application.profilePicture.url,
    clinicName: primaryLocation.clinicName,
    clinicAddress: primaryLocation.address,
    clinicCity: primaryLocation.city,
    clinicLocality: primaryLocation.locality,
    clinicPostalCode: primaryLocation.postalCode,
    clinicPhoneNumber: primaryLocation.phoneNumber,
    clinicGoogleMapsUrl: primaryLocation.googleMapsUrl,
    consultationFee: primaryLocation.consultationFeePaisa / 100,
    consultationFeePaisa: primaryLocation.consultationFeePaisa,
    clinicLocations: locations,
  };
};

export class DoctorApplicationService {
  async assertCanUpload(userId) {
    await assertRequiredActor(userId);
    const application = await DoctorApplication.findOne({ user: userId }).select('status');
    if (application && !['draft', 'requires_changes'].includes(application.status)) {
      throw new ForbiddenError('Files cannot be changed after an application is submitted');
    }
  }

  async getMyApplication(userId) {
    const user = await assertRequiredActor(userId);
    const application = await DoctorApplication.findOne({ user: userId }).populate('specialty', 'name slug');
    const result = summarizeApplication(application);
    if (result) result.email = user.email;
    return result;
  }

  async getMyStatus(userId) {
    const user = await assertRequiredActor(userId);
    const application = await DoctorApplication.findOne({ user: userId }).select('status submittedAt reviewedAt feedback statusHistory updatedAt');
    if (!application) return { status: 'draft', application: null, email: user.email };
    return {
      status: application.status,
      submittedAt: application.submittedAt || null,
      reviewedAt: application.reviewedAt || null,
      feedback: application.feedback || '',
      updatedAt: application.updatedAt,
      statusHistory: application.statusHistory.map(({ from, to, reason, at }) => ({ from, to, reason, at })),
      email: user.email,
    };
  }

  async saveDraft(userId, data) {
    await assertRequiredActor(userId);
    let application = await DoctorApplication.findOne({ user: userId });
    if (application && !['draft', 'requires_changes'].includes(application.status)) {
      throw new ForbiddenError('Submitted applications cannot be edited');
    }

    const before = asObject(application);
    const verifiedData = await verifyDraftAssets(userId, data, before);
    const mergedData = mergeDraftData(application, verifiedData);

    if (!application) {
      try {
        application = await DoctorApplication.create({
          user: userId,
          ...mergedData,
          status: 'draft',
          statusHistory: [{ from: null, to: 'draft', actor: userId }],
        });
      } catch (error) {
        if (error?.code === 11000) throw new ConflictError('An application already exists for this account');
        throw error;
      }
    } else {
      for (const [field, value] of Object.entries(mergedData)) application.set(field, value);
      await application.save();
    }

    await removeUnreferencedAssets(userId, before, asObject(application));
    await application.populate('specialty', 'name slug');
    return summarizeApplication(application);
  }

  async submit(userId) {
    const user = await assertRequiredActor(userId);
    const application = await DoctorApplication.findOne({ user: userId });
    if (!application) throw new NotFoundError('Save your application before submitting it');
    if (!canTransitionApplication(application.status, 'submitted')) {
      throw new ForbiddenError('This application cannot be submitted in its current state');
    }
    await validateSubmission(application);

    const previousStatus = application.status;
    const now = new Date();
    const submitted = await DoctorApplication.findOneAndUpdate(
      { _id: application._id, user: userId, status: previousStatus },
      {
        $set: {
          status: 'submitted',
          submittedAt: now,
          reviewedBy: null,
          reviewedAt: null,
          feedback: '',
          'declarations.acceptedAt': now,
        },
        $push: { statusHistory: { from: previousStatus, to: 'submitted', actor: userId, at: now } },
      },
      { new: true, runValidators: true },
    ).populate('specialty', 'name slug');

    if (!submitted) throw new ConflictError('Application status changed; reload and try again');
    await notifyApplicant(user, 'submitted');
    return summarizeApplication(submitted);
  }

  async listForAdmin({ status, page = 1, limit = 20 }) {
    const filter = status ? { status } : { status: { $in: ['submitted', 'under_review', 'requires_changes'] } };
    const [applications, total] = await Promise.all([
      DoctorApplication.find(filter)
        .populate('user', 'name email')
        .populate('specialty', 'name slug')
        .sort({ submittedAt: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      DoctorApplication.countDocuments(filter),
    ]);
    return {
      applications: applications.map(summarizeAdminApplication),
      total,
      page,
      limit,
    };
  }

  async getForAdmin(applicationId) {
    const application = await DoctorApplication.findById(applicationId)
      .populate('user', 'name email')
      .populate('specialty', 'name slug');
    if (!application) throw new NotFoundError('Doctor application not found');
    return summarizeAdminApplication(application);
  }

  async getPrivateAssetForUser(userId, publicId) {
    const application = await DoctorApplication.findOne({ user: userId });
    if (!application) throw new NotFoundError('Doctor application not found');
    const reference = collectPrivateReferences(asObject(application))
      .find(({ asset }) => asset.publicId === publicId)?.asset;
    if (!reference) throw new NotFoundError('Document not found');
    return fetchPrivateDoctorApplicationAsset(reference);
  }

  async getPrivateAssetForAdmin(applicationId, publicId) {
    const application = await DoctorApplication.findById(applicationId);
    if (!application) throw new NotFoundError('Doctor application not found');
    const reference = collectPrivateReferences(asObject(application))
      .find(({ asset }) => asset.publicId === publicId)?.asset;
    if (!reference) throw new NotFoundError('Document not found');
    return fetchPrivateDoctorApplicationAsset(reference);
  }

  async review(applicationId, adminId, { status, reason = '' }) {
    let application = await DoctorApplication.findById(applicationId);
    if (!application) throw new NotFoundError('Doctor application not found');

    if (application.status === 'approved' && status === 'approved') {
      await this.publishApprovedProfile(application, adminId);
      return this.getForAdmin(applicationId);
    }
    if (!canTransitionApplication(application.status, status)) {
      throw new ConflictError(`Cannot move an application from ${application.status} to ${status}`);
    }
    if (status === 'approved') await validateSubmission(application);

    const user = await User.findById(application.user).select('email name');
    if (!user) throw new NotFoundError('Applicant account not found');

    const previousStatus = application.status;
    const now = new Date();
    application = await DoctorApplication.findOneAndUpdate(
      { _id: applicationId, status: previousStatus },
      {
        $set: {
          status,
          reviewedBy: adminId,
          reviewedAt: now,
          feedback: reason,
        },
        $push: { statusHistory: { from: previousStatus, to: status, actor: adminId, reason, at: now } },
      },
      { new: true, runValidators: true },
    );
    if (!application) throw new ConflictError('Application status changed; reload and try again');

    if (status === 'approved') await this.publishApprovedProfile(application, adminId);
    if (status === 'rejected') {
      await DoctorProfile.findOneAndUpdate(
        { user: application.user },
        { $set: { status: 'rejected', rejectionReason: reason } },
        { runValidators: true },
      );
    }

    try {
      await AuditLog.create({
        user: adminId,
        action: `DOCTOR_APPLICATION_${status.toUpperCase()}`,
        resource: 'DoctorApplication',
        resourceId: String(application._id),
        details: { previousStatus, status, reason },
      });
    } catch (error) {
      console.error('Unable to record doctor application review audit event', error.message);
    }

    await notifyApplicant(user, status, reason);
    return this.getForAdmin(applicationId);
  }

  async publishApprovedProfile(application, adminId) {
    const profileFields = await publicProfileFields(application);
    const profile = await DoctorProfile.findOneAndUpdate(
      { user: application.user },
      {
        $set: {
          ...profileFields,
          status: 'approved',
          approvedBy: adminId,
          approvedAt: application.reviewedAt || new Date(),
          rejectionReason: undefined,
        },
        $setOnInsert: { user: application.user },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
    return profile;
  }
}