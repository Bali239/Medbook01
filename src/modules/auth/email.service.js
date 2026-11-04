import crypto from 'crypto';
import { env } from '../../config/env.js';

const encode = (value) => Buffer.from(value).toString('base64url');
const safeHeader = (value) => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
const base64Lines = (value) => Buffer.from(String(value ?? ''), 'utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n') || '';

export const composeMimeEmail = ({ from, to, subject, text, html }) => {
  const boundary = `medbook_${crypto.randomBytes(18).toString('hex')}`;
  const encodedSubject = Buffer.from(safeHeader(subject), 'utf8').toString('base64');
  return [
    `From: ${safeHeader(from)}`,
    `To: ${safeHeader(to)}`,
    `Subject: =?UTF-8?B?${encodedSubject}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(text),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(html),
    `--${boundary}--`,
  ].join('\r\n');
};

export const sendEmail = async ({ to, subject, text, html }) => {
  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET || !env.GMAIL_SENDER || !env.GMAIL_REFRESH_TOKEN) {
    console.info('[email dev fallback] Email queued without delivery credentials.');
    return { delivered: false };
  }
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GMAIL_CLIENT_ID, client_secret: env.GMAIL_CLIENT_SECRET, refresh_token: env.GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token' }),
  });
  const token = await response.json();
  if (!token.access_token) throw new Error('Unable to obtain Gmail access token');
  const mime = composeMimeEmail({ from: env.GMAIL_SENDER, to, subject, text, html });
  const result = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST', headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw: encode(mime) }),
  });
  if (!result.ok) throw new Error(`Gmail API rejected email: ${await result.text()}`);
  return { delivered: true };
};

export const createToken = () => crypto.randomBytes(32).toString('hex');
export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
