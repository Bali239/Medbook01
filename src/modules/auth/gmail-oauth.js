import crypto from 'crypto';
import { env } from '../../config/env.js';

const pendingStates = new Map();
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

export const createGmailAuthorizationUrl = () => {
  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET) {
    throw new Error('GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET are required');
  }

  const state = crypto.randomBytes(24).toString('hex');
  pendingStates.set(state, Date.now() + 10 * 60 * 1000);
  const params = new URLSearchParams({
    client_id: env.GMAIL_CLIENT_ID,
    redirect_uri: env.GMAIL_REDIRECT_URI,
    response_type: 'code',
    scope: GMAIL_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
};

export const exchangeGmailCodeForRefreshToken = async (code, state) => {
  const expiresAt = pendingStates.get(state);
  pendingStates.delete(state);
  if (!expiresAt || expiresAt < Date.now()) throw new Error('Invalid or expired Gmail OAuth state');

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GMAIL_CLIENT_ID,
      client_secret: env.GMAIL_CLIENT_SECRET,
      redirect_uri: env.GMAIL_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  const tokens = await response.json();
  if (!response.ok || !tokens.refresh_token) {
    throw new Error(tokens.error_description || 'Google did not return a refresh token. Try consent again.');
  }
  return tokens.refresh_token;
};
