import test from 'node:test';
import assert from 'node:assert/strict';
import { canTransitionApplication } from '../src/modules/doctor-applications/doctor-application.transitions.js';
import { validateApplicationCompleteness } from '../src/modules/doctor-applications/doctor-application.completeness.js';

const asset = { publicId: 'doctor-verification-file', originalName: 'credential.pdf' };

const completeApplication = {
  firstName: 'Amina',
  lastName: 'Doctor',
  profilePicture: { publicId: 'doctor-profile-picture' },
  gender: 'female',
  dateOfBirth: new Date('1985-01-01'),
  phoneNumber: '+92 300 1234567',
  introduction: 'Experienced doctor providing patient-focused care.',
  specialty: 'specialty-id',
  professionalTitle: 'specialist',
  yearsOfExperience: 10,
  registrationNumber: 'REG-123',
  registrationAuthority: 'Medical Council',
  languages: ['English', 'Urdu'],
  biography: 'A professional biography with enough detail about care.',
  qualifications: [{
    degreeName: 'MBBS',
    institution: 'Medical University',
    country: 'Pakistan',
    graduationYear: 2010,
    certificate: asset,
  }],
  experiences: [],
  locations: [{
    clinicName: 'Care Clinic',
    address: '1 Main Road',
    city: 'Lahore',
    locality: 'Gulberg',
    phoneNumber: '+92 300 1234567',
    consultationFeePaisa: 500000,
    isPrimary: true,
  }],
  documents: {
    cnicFront: asset,
    cnicBack: asset,
    registrationCertificate: asset,
    medicalDegreeCertificate: asset,
    recentPhotograph: asset,
  },
  declarations: {
    informationAccurate: true,
    verificationAuthorized: true,
    termsAccepted: true,
    publicAfterApprovalAcknowledged: true,
  },
};

test('doctor application status transitions permit correction resubmission but make rejection terminal', () => {
  assert.equal(canTransitionApplication('draft', 'submitted'), true);
  assert.equal(canTransitionApplication('submitted', 'under_review'), true);
  assert.equal(canTransitionApplication('under_review', 'requires_changes'), true);
  assert.equal(canTransitionApplication('requires_changes', 'submitted'), true);
  assert.equal(canTransitionApplication('under_review', 'rejected'), true);
  assert.equal(canTransitionApplication('rejected', 'submitted'), false);
  assert.equal(canTransitionApplication('rejected', 'requires_changes'), false);
  assert.equal(canTransitionApplication('approved', 'submitted'), false);
});

test('a complete application passes submission validation', () => {
  assert.doesNotThrow(() => validateApplicationCompleteness(completeApplication));
});

test('submission validation reports missing private credentials and declarations', () => {
  assert.throws(
    () => validateApplicationCompleteness({
      ...completeApplication,
      documents: { ...completeApplication.documents, cnicFront: null },
      declarations: { ...completeApplication.declarations, termsAccepted: false },
    }),
    (error) => {
      assert.equal(error.statusCode, 422);
      assert.ok(error.errors.some((issue) => issue.path === 'documents.cnicFront'));
      assert.ok(error.errors.some((issue) => issue.path === 'declarations.termsAccepted'));
      return true;
    },
  );
});
