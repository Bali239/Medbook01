import { ValidationError } from '../../errors/AppError.js';

const hasText = (value) => typeof value === 'string' && value.trim().length > 0;

export const validateApplicationCompleteness = (application) => {
  const issues = [];
  const requireText = (path, value) => {
    if (!hasText(value)) issues.push({ path, message: 'This field is required' });
  };

  requireText('firstName', application.firstName);
  requireText('lastName', application.lastName);
  if (!application.profilePicture?.publicId) issues.push({ path: 'profilePicture', message: 'A profile picture is required' });
  if (!['female', 'male', 'non_binary', 'prefer_not_to_say'].includes(application.gender)) {
    issues.push({ path: 'gender', message: 'Choose a gender option' });
  }
  if (!(application.dateOfBirth instanceof Date) || Number.isNaN(application.dateOfBirth.valueOf())) {
    issues.push({ path: 'dateOfBirth', message: 'A valid date of birth is required' });
  } else if (application.dateOfBirth > new Date()) {
    issues.push({ path: 'dateOfBirth', message: 'Date of birth cannot be in the future' });
  }
  requireText('phoneNumber', application.phoneNumber);
  if (!/^[+\d][\d\s().-]{5,29}$/.test(application.phoneNumber || '')) {
    issues.push({ path: 'phoneNumber', message: 'Enter a valid phone number' });
  }
  if (!application.specialty) issues.push({ path: 'specialty', message: 'Choose a medical specialty' });
  if (!['general_practitioner', 'specialist', 'consultant', 'senior_consultant', 'professor'].includes(application.professionalTitle)) {
    issues.push({ path: 'professionalTitle', message: 'Choose a professional title' });
  }
  if (!Number.isInteger(application.yearsOfExperience) || application.yearsOfExperience < 0 || application.yearsOfExperience > 80) {
    issues.push({ path: 'yearsOfExperience', message: 'Enter years of experience from 0 to 80' });
  }
  if (![15, 30, 60].includes(application.appointmentDurationMinutes)) {
    issues.push({ path: 'appointmentDurationMinutes', message: 'Choose an appointment duration of 15, 30, or 60 minutes' });
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: application.clinicTimeZone }).format(new Date());
  } catch {
    issues.push({ path: 'clinicTimeZone', message: 'Enter a valid IANA clinic time zone' });
  }
  requireText('registrationNumber', application.registrationNumber);
  requireText('registrationAuthority', application.registrationAuthority);
  if (!application.languages?.length || application.languages.some((language) => !hasText(language))) {
    issues.push({ path: 'languages', message: 'Add at least one language' });
  }
  if (!application.qualifications?.length) {
    issues.push({ path: 'qualifications', message: 'Add at least one qualification' });
  }
  application.qualifications?.forEach((qualification, index) => {
    requireText(`qualifications.${index}.degreeName`, qualification.degreeName);
    requireText(`qualifications.${index}.institution`, qualification.institution);
    requireText(`qualifications.${index}.country`, qualification.country);
    if (!qualification.graduationYear) {
      issues.push({ path: `qualifications.${index}.graduationYear`, message: 'Graduation year is required' });
    }
    if (!qualification.certificate?.publicId) {
      issues.push({ path: `qualifications.${index}.certificate`, message: 'Upload the qualification certificate' });
    }
  });

  application.experiences?.forEach((experience, index) => {
    requireText(`experiences.${index}.organization`, experience.organization);
    requireText(`experiences.${index}.designation`, experience.designation);
    if (!experience.employmentType) {
      issues.push({ path: `experiences.${index}.employmentType`, message: 'Choose an employment type' });
    }
    if (!experience.startDate || Number.isNaN(new Date(experience.startDate).valueOf())) {
      issues.push({ path: `experiences.${index}.startDate`, message: 'Start date is required' });
    }
    if (experience.currentlyWorking && experience.endDate) {
      issues.push({ path: `experiences.${index}.endDate`, message: 'End date must be empty for a current role' });
    }
    if (!experience.currentlyWorking && !experience.endDate) {
      issues.push({ path: `experiences.${index}.endDate`, message: 'End date is required unless you currently work here' });
    }
    if (experience.startDate && experience.endDate && new Date(experience.endDate) < new Date(experience.startDate)) {
      issues.push({ path: `experiences.${index}.endDate`, message: 'End date must be after the start date' });
    }
  });

  if (!application.locations?.length) {
    issues.push({ path: 'locations', message: 'Add a primary clinic location' });
  }
  const primaryLocations = (application.locations || []).filter((location) => location.isPrimary);
  if (primaryLocations.length !== 1) {
    issues.push({ path: 'locations', message: 'Choose exactly one primary clinic location' });
  }
  application.locations?.forEach((location, index) => {
    requireText(`locations.${index}.clinicName`, location.clinicName);
    requireText(`locations.${index}.address`, location.address);
    requireText(`locations.${index}.city`, location.city);
    requireText(`locations.${index}.locality`, location.locality);
    requireText(`locations.${index}.phoneNumber`, location.phoneNumber);
    if (!Number.isInteger(location.consultationFeePaisa) || location.consultationFeePaisa < 0) {
      issues.push({ path: `locations.${index}.consultationFeePaisa`, message: 'Enter a valid PKR consultation fee' });
    }
  });

  const requiredDocuments = [
    ['documents.cnicFront', application.documents?.cnicFront],
    ['documents.cnicBack', application.documents?.cnicBack],
    ['documents.registrationCertificate', application.documents?.registrationCertificate],
    ['documents.medicalDegreeCertificate', application.documents?.medicalDegreeCertificate],
    ['documents.recentPhotograph', application.documents?.recentPhotograph],
  ];
  requiredDocuments.forEach(([path, document]) => {
    if (!document?.publicId) issues.push({ path, message: 'This verification document is required' });
  });

  const declarationFields = [
    ['declarations.informationAccurate', application.declarations?.informationAccurate],
    ['declarations.verificationAuthorized', application.declarations?.verificationAuthorized],
    ['declarations.termsAccepted', application.declarations?.termsAccepted],
    ['declarations.publicAfterApprovalAcknowledged', application.declarations?.publicAfterApprovalAcknowledged],
  ];
  declarationFields.forEach(([path, accepted]) => {
    if (accepted !== true) issues.push({ path, message: 'This declaration must be accepted' });
  });

  if (issues.length) {
    const error = new ValidationError('Complete all required application fields before submitting');
    error.errors = issues;
    throw error;
  }
};
