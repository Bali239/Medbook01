const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

const safeActionUrl = (value) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
};

export const brandedEmail = ({
  subject,
  preheader,
  title,
  intro,
  details = [],
  actionLabel,
  actionUrl,
  closing = 'You can always find the latest status in your MedBook account.',
}) => {
  const validActionUrl = safeActionUrl(actionUrl);
  const visibleDetails = details.filter(({ value }) => value !== undefined && value !== null && value !== '');
  const text = [
    title,
    intro,
    ...visibleDetails.map(({ label, value }) => `${label}: ${value}`),
    validActionUrl && actionLabel ? `${actionLabel}: ${validActionUrl}` : null,
    closing,
    'MedBook',
  ].filter(Boolean).join('\n\n');
  const detailRows = visibleDetails.map(({ label, value }) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e6ece9;color:#52615b;font-size:14px;">${escapeHtml(label)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e6ece9;color:#1c2b25;font-size:14px;font-weight:600;text-align:right;">${escapeHtml(value)}</td>
    </tr>`).join('');
  const action = validActionUrl && actionLabel
    ? `<p style="margin:24px 0;"><a href="${escapeHtml(validActionUrl)}" style="display:inline-block;background:#176b55;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:13px 20px;border-radius:4px;">${escapeHtml(actionLabel)}</a></p>`
    : '';

  const html = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(subject)}</title></head>
  <body style="margin:0;background:#f2f6f4;color:#1c2b25;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader || intro)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f6f4;padding:28px 12px;">
      <tr><td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #dfe8e3;border-radius:8px;">
          <tr><td style="padding:22px 30px;border-bottom:1px solid #e6ece9;">
            <span style="color:#176b55;font-size:19px;font-weight:700;letter-spacing:0;">MedBook</span>
            <span style="float:right;color:#718078;font-size:12px;padding-top:5px;">APPOINTMENT CARE</span>
          </td></tr>
          <tr><td style="padding:30px;">
            <h1 style="margin:0 0 14px;color:#1c2b25;font-size:24px;line-height:1.3;">${escapeHtml(title)}</h1>
            <p style="margin:0;color:#46564e;font-size:15px;line-height:1.7;">${escapeHtml(intro)}</p>
            ${detailRows ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:22px;border:1px solid #e6ece9;border-radius:4px;">${detailRows}</table>` : ''}
            ${action}
            <p style="margin:22px 0 0;color:#52615b;font-size:14px;line-height:1.7;">${escapeHtml(closing)}</p>
          </td></tr>
          <tr><td style="padding:18px 30px;background:#f8faf9;border-top:1px solid #e6ece9;color:#718078;font-size:12px;line-height:1.6;">
            This is an automated account update from MedBook. Please sign in to your account for the latest information.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
};

export const verificationEmail = ({ name, url }) => brandedEmail({
  subject: 'Verify your MedBook email address',
  preheader: 'Confirm your email address to secure your MedBook account.',
  title: 'Verify your email address',
  intro: `Hello ${name || 'there'}, confirm your email address to finish setting up your MedBook account.`,
  details: [{ label: 'Link expires', value: '24 hours' }],
  actionLabel: 'Verify email address',
  actionUrl: url,
  closing: 'If you did not create a MedBook account, you can ignore this message.',
});

export const passwordResetEmail = ({ name, url }) => brandedEmail({
  subject: 'Reset your MedBook password',
  preheader: 'A password reset was requested for your MedBook account.',
  title: 'Reset your password',
  intro: `Hello ${name || 'there'}, use the secure link below to choose a new password.`,
  details: [{ label: 'Link expires', value: '1 hour' }],
  actionLabel: 'Choose a new password',
  actionUrl: url,
  closing: 'If you did not request a password reset, no action is needed. Your current password will remain unchanged.',
});

export const appointmentConfirmedEmail = ({ recipientRole, recipientName, doctorName, patientName, appointmentDate, clinic, amount, reference, url }) => {
  const isPatient = recipientRole === 'patient';
  return brandedEmail({
    subject: isPatient ? 'Your MedBook appointment is confirmed' : 'A MedBook appointment is confirmed',
    preheader: `Appointment confirmed for ${appointmentDate}.`,
    title: isPatient ? 'Your appointment is confirmed' : 'A new appointment is confirmed',
    intro: isPatient
      ? `Hello ${recipientName || 'there'}, your payment was verified and your appointment with ${doctorName} is booked.`
      : `Hello ${recipientName || 'there'}, an appointment with ${patientName} has been confirmed after payment was verified.`,
    details: [
      { label: 'Doctor', value: doctorName },
      { label: 'Patient', value: patientName },
      { label: 'Appointment time', value: appointmentDate },
      { label: 'Clinic', value: clinic },
      { label: 'Amount paid', value: isPatient ? amount : undefined },
      { label: 'Booking reference', value: reference },
    ],
    actionLabel: isPatient ? 'View appointment details' : 'Open your appointments',
    actionUrl: url,
    closing: isPatient
      ? 'Please arrive at the clinic on time. Your appointment and payment status are available in your account.'
      : 'Review the appointment details in your doctor workspace. Patient information is available there securely.',
  });
};

export const paymentFailedEmail = ({ appointmentDate, amount, reference, url }) => brandedEmail({
  subject: 'Your MedBook payment was not completed',
  preheader: 'The appointment has not been confirmed because payment was not completed.',
  title: 'Payment was not completed',
  intro: 'Your payment did not complete, so this appointment is not confirmed. No successful payment was recorded for this attempt.',
  details: [
    { label: 'Appointment time', value: appointmentDate },
    { label: 'Amount attempted', value: amount },
    { label: 'Booking reference', value: reference },
    { label: 'Current status', value: 'Not confirmed' },
  ],
  actionLabel: 'Review payment options',
  actionUrl: url,
  closing: 'Check your payment history for the latest attempt status before trying again. Availability can change while a payment is incomplete.',
});

export const appointmentUnavailableEmail = ({ appointmentDate, amount, reference, url }) => brandedEmail({
  subject: 'Your MedBook appointment could not be confirmed',
  preheader: 'Your payment arrived after the appointment time became unavailable.',
  title: 'Appointment time became unavailable',
  intro: 'Your payment was received after this appointment time was no longer available. The appointment was not confirmed, and a full refund has been started.',
  details: [
    { label: 'Requested appointment', value: appointmentDate },
    { label: 'Payment amount', value: amount },
    { label: 'Booking reference', value: reference },
    { label: 'Appointment status', value: 'Not confirmed' },
    { label: 'Refund status', value: 'Processing' },
  ],
  actionLabel: 'Review appointments and payments',
  actionUrl: url,
  closing: 'The refund must be confirmed by the payment provider before it is considered complete. You can choose another available appointment from your account.',
});

export const appointmentCancelledEmail = ({ recipientRole, recipientName, patientName, doctorName, appointmentDate, reference, reason, refundEligible, refundStatus, url }) => {
  const isPatient = recipientRole === 'patient';
  const statusText = refundEligible
    ? ({
      pending: 'Processing',
      succeeded: 'Completed',
      partially_refunded: 'Partially refunded',
      failed: 'Needs attention',
      canceled: 'Canceled',
    }[refundStatus] || 'Eligible; not yet confirmed')
    : 'No automatic refund was started under the current policy';
  return brandedEmail({
    subject: isPatient ? 'Your MedBook appointment was canceled' : 'A MedBook appointment was canceled',
    preheader: `Appointment for ${appointmentDate} canceled.`,
    title: 'Appointment canceled',
    intro: isPatient
      ? `Hello ${recipientName || 'there'}, your appointment with ${doctorName} was canceled${reason ? `: ${reason}` : '.'}`
      : `Hello ${recipientName || 'there'}, the appointment with ${patientName} was canceled${reason ? `: ${reason}` : '.'}`,
    details: [
      { label: 'Appointment time', value: appointmentDate },
      { label: 'Booking reference', value: reference },
      { label: 'Appointment status', value: 'Canceled' },
      ...(isPatient ? [{ label: 'Refund status', value: statusText }] : []),
    ],
    actionLabel: isPatient ? 'View appointment and payment status' : 'Open your appointments',
    actionUrl: url,
    closing: isPatient
      ? 'Your account shows the latest appointment and refund status. A pending refund is not complete until the payment provider confirms it.'
      : 'The patient has been notified. Review the appointment record in your doctor workspace.',
  });
};

export const refundUpdatedEmail = ({ status, amount, reference, url }) => {
  const state = {
    pending: {
      subject: 'Your MedBook refund is processing',
      title: 'Refund processing',
      intro: 'The refund request has been sent to the payment provider. It is not complete yet.',
      label: 'Processing',
    },
    succeeded: {
      subject: 'Your MedBook refund is complete',
      title: 'Refund completed',
      intro: 'The payment provider confirmed that your refund has completed. The time it takes to appear depends on your payment method and bank.',
      label: 'Completed',
    },
    failed: {
      subject: 'Your MedBook refund needs attention',
      title: 'Refund could not be completed',
      intro: 'The payment provider could not complete this refund. The MedBook team has been notified and will review the issue.',
      label: 'Needs attention',
    },
    canceled: {
      subject: 'Your MedBook refund was canceled',
      title: 'Refund canceled',
      intro: 'The payment provider confirmed that this refund was canceled. Sign in to review the latest payment details or contact support if you did not expect this change.',
      label: 'Canceled',
    },
  }[status] || {
    subject: 'Your MedBook refund status changed',
    title: 'Refund status updated',
    intro: 'The status of your appointment refund has changed. Sign in to review the latest details.',
    label: status,
  };
  return brandedEmail({
    ...state,
    preheader: state.intro,
    details: [
      { label: 'Refund amount', value: amount },
      { label: 'Booking reference', value: reference },
      { label: 'Refund status', value: state.label },
    ],
    actionLabel: 'View payment and refund details',
    actionUrl: url,
  });
};

export const doctorApplicationEmail = ({ status, name, reason, url }) => {
  const messages = {
    submitted: ['Application received', 'Your doctor application was submitted and is waiting for review. We will email you when its status changes.'],
    under_review: ['Application under review', 'The MedBook team is reviewing your doctor application. No further action is needed unless we request changes.'],
    requires_changes: ['Changes requested', 'The review team needs updates before your application can proceed. Review the feedback and update your application.'],
    approved: ['Application approved', 'Your doctor application was approved. Your professional profile can now be managed in MedBook.'],
    rejected: ['Application decision', 'The review team could not approve your doctor application. Review the reason below and contact support if you need clarification.'],
  }[status] || ['Application status updated', 'Your doctor application status changed. Sign in to review the latest details.'];
  return brandedEmail({
    subject: `MedBook doctor application: ${messages[0]}`,
    preheader: messages[1],
    title: messages[0],
    intro: `Hello ${name || 'there'}, ${messages[1]}`,
    details: [
      { label: 'Application status', value: status.replaceAll('_', ' ') },
      { label: 'Review feedback', value: reason },
    ],
    actionLabel: 'Review your application',
    actionUrl: url,
  });
};

export const refundRequestEmail = ({ recipientRole, status, action, appointmentDate, requestedDate, reason, reference, url }) => {
  const actionLabel = action === 'reschedule' ? 'date-change request' : 'cancellation and refund request';
  const messages = {
    created: recipientRole === 'doctor'
      ? `A patient submitted a ${actionLabel}. Review the request and record your decision.`
      : `Your ${actionLabel} was submitted and is waiting for the doctor's review. Your current appointment remains confirmed while the request is under review.`,
    doctor_approved: 'The doctor approved your request. It is now waiting for final administrative review; your original appointment remains unchanged for now.',
    doctor_rejected: 'The doctor declined your request. Your original appointment remains unchanged.',
    approved: action === 'reschedule'
      ? 'Your date-change request was approved. A new appointment is being prepared, and you must complete its payment. Your original appointment has been canceled and its refund is processing.'
      : 'Your cancellation request was approved. Your appointment is canceled and the full refund is processing.',
    rejected: 'Your request was declined. Your original appointment remains unchanged.',
  };
  const message = messages[status] || 'Your appointment request status changed. Sign in to review the latest details.';
  const isDoctor = recipientRole === 'doctor';
  return brandedEmail({
    subject: isDoctor ? 'A patient appointment request needs review' : 'Your MedBook appointment request was updated',
    preheader: message,
    title: isDoctor ? 'Appointment request needs review' : 'Appointment request update',
    intro: message,
    details: [
      { label: 'Request type', value: actionLabel },
      { label: 'Current appointment', value: appointmentDate },
      { label: 'Requested appointment', value: requestedDate },
      { label: 'Patient reason', value: isDoctor ? reason : undefined },
      { label: 'Decision reason', value: isDoctor ? undefined : reason },
      { label: 'Booking reference', value: reference },
      { label: 'Request status', value: status.replaceAll('_', ' ') },
    ],
    actionLabel: isDoctor ? 'Review appointment requests' : 'View appointment status',
    actionUrl: url,
  });
};

export const appointmentReminderEmail = ({ patientName, doctorName, appointmentDate, clinic, reference, url }) => brandedEmail({
  subject: 'Reminder: your MedBook appointment is tomorrow',
  preheader: `Your appointment with ${doctorName} is scheduled for ${appointmentDate}.`,
  title: 'Your appointment is tomorrow',
  intro: `Hello ${patientName || 'there'}, this is a reminder that you have an appointment with ${doctorName} in about 24 hours.`,
  details: [
    { label: 'Appointment time', value: appointmentDate },
    { label: 'Clinic', value: clinic },
    { label: 'Booking reference', value: reference },
  ],
  actionLabel: 'Review appointment details',
  actionUrl: url,
  closing: 'Please check the appointment details in your account before traveling to the clinic.',
});