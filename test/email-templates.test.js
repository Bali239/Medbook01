import test from 'node:test';
import assert from 'node:assert/strict';
import { composeMimeEmail } from '../src/modules/auth/email.service.js';
import {
  appointmentCancelledEmail,
  appointmentReminderEmail,
  brandedEmail,
  doctorApplicationEmail,
  passwordResetEmail,
  refundRequestEmail,
  refundUpdatedEmail,
  verificationEmail,
} from '../src/modules/notifications/email-templates.js';

test('branded email renders matching plain text and escapes dynamic HTML', () => {
  const email = brandedEmail({
    subject: 'Appointment confirmed',
    title: 'Your appointment is confirmed',
    intro: 'Hello <Patient>',
    details: [{ label: 'Doctor', value: 'Dr. A & B' }],
    actionLabel: 'View appointment',
    actionUrl: 'https://medbook.example/patient/appointments?id=1&source=email',
  });

  assert.match(email.html, /Hello &lt;Patient&gt;/);
  assert.match(email.html, /Dr\. A &amp; B/);
  assert.match(email.html, /id=1&amp;source=email/);
  assert.match(email.text, /Doctor: Dr\. A & B/);
  assert.match(email.text, /View appointment: https:\/\/medbook\.example/);
});

test('branded email omits unsafe action URLs from both formats', () => {
  const email = brandedEmail({
    subject: 'Account update',
    title: 'Account update',
    intro: 'Your account needs attention.',
    actionLabel: 'Continue',
    actionUrl: 'javascript:alert(1)',
  });

  assert.doesNotMatch(email.html, /javascript:/);
  assert.doesNotMatch(email.text, /Continue/);
});

test('account emails explain the action and link expiry', () => {
  const verification = verificationEmail({ name: 'Riya', url: 'https://medbook.example/verify-email?token=abc' });
  const reset = passwordResetEmail({ name: 'Riya', url: 'https://medbook.example/reset-password?token=abc' });

  assert.match(verification.text, /finish setting up/);
  assert.match(verification.text, /24 hours/);
  assert.match(reset.text, /1 hour/);
  assert.match(reset.text, /current password will remain unchanged/);
  assert.match(reset.html, /Choose a new password/);
});

test('cancellation and refund emails distinguish policy and provider-confirmed states', () => {
  const cancellation = appointmentCancelledEmail({
    recipientRole: 'patient',
    appointmentDate: 'Wednesday, November 4 at 9:00 AM',
    reference: 'appointment-1',
    refundEligible: false,
  });
  const pending = refundUpdatedEmail({ status: 'pending', amount: '$45.00', reference: 'appointment-1' });
  const completed = refundUpdatedEmail({ status: 'succeeded', amount: '$45.00', reference: 'appointment-1' });

  assert.match(cancellation.text, /No automatic refund was started/);
  assert.match(pending.text, /not complete yet/);
  assert.match(completed.text, /provider confirmed/);
  assert.match(completed.text, /\$45\.00/);
});

test('application, request, and reminder emails explain outcomes and next steps', () => {
  const application = doctorApplicationEmail({ status: 'requires_changes', reason: 'Upload a clearer certificate.' });
  const request = refundRequestEmail({
    recipientRole: 'patient',
    status: 'approved',
    action: 'reschedule',
    appointmentDate: 'November 5 at 9:00 AM',
    requestedDate: 'November 8 at 11:00 AM',
  });
  const reminder = appointmentReminderEmail({
    patientName: 'Amina',
    doctorName: 'Dr. Example',
    appointmentDate: 'November 5 at 9:00 AM',
  });

  assert.match(application.text, /Upload a clearer certificate/);
  assert.match(application.text, /update your application/);
  assert.match(request.text, /complete its payment/);
  assert.match(request.text, /November 8 at 11:00 AM/);
  assert.match(reminder.text, /about 24 hours/);
});

test('Gmail MIME includes both alternatives and encodes untrusted headers', () => {
  const mime = composeMimeEmail({
    from: 'MedBook <mail@example.test>',
    to: 'patient@example.test',
    subject: 'Appointment confirmed\r\nBcc: attacker@example.test',
    text: 'Appointment confirmed',
    html: '<h1>Appointment confirmed</h1>',
  });

  assert.match(mime, /Content-Type: multipart\/alternative/);
  assert.match(mime, /Content-Type: text\/plain; charset=UTF-8/);
  assert.match(mime, /Content-Type: text\/html; charset=UTF-8/);
  assert.doesNotMatch(mime, /\r\nBcc:/);
});