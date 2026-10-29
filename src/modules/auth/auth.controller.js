import { AuthService } from './auth.service.js';
import { catchAsync } from '../../utils/catchAsync.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { env } from '../../config/env.js';
import { createGmailAuthorizationUrl, exchangeGmailCodeForRefreshToken } from './gmail-oauth.js';

const authService = new AuthService();

export class AuthController {
  register = catchAsync(async (req, res) => {
    const result = await authService.register(req.body);
    ApiResponse.success(res, result, 'Registration successful', 201);
  });
  
  login = catchAsync(async (req, res) => {
    const result = await authService.login(req.body);
    ApiResponse.success(res, result, 'Login successful');
  });
  
  getMe = catchAsync(async (req, res) => {
    ApiResponse.success(res, { user: req.user }, 'User retrieved successfully');
  });

  verifyEmail = catchAsync(async (req, res) => ApiResponse.success(res, await authService.verifyEmail(req.body.token), 'Email verified successfully'));
  requestPasswordReset = catchAsync(async (req, res) => { await authService.requestPasswordReset(req.body.email); ApiResponse.success(res, null, 'If the account exists, a reset email has been sent'); });
  resetPassword = catchAsync(async (req, res) => ApiResponse.success(res, await authService.resetPassword(req.body.token, req.body.password), 'Password reset successfully'));
  logout = catchAsync(async (req, res) => { req.user.sessionVersion += 1; await req.user.save(); ApiResponse.success(res, null, 'Logged out successfully'); });

  googleStart = (req, res) => {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_REDIRECT_URI) return res.status(503).json({ success: false, message: 'Google sign-in is not configured' });
    const params = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: env.GOOGLE_REDIRECT_URI, response_type: 'code', scope: 'openid email profile', access_type: 'offline', prompt: 'select_account' });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  };

  googleCallback = catchAsync(async (req, res) => {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: req.query.code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: env.GOOGLE_REDIRECT_URI, grant_type: 'authorization_code' }) });
    const tokens = await tokenResponse.json();
    if (!tokens.access_token) return res.redirect(`${env.CLIENT_URL}/sign-in?error=google`);
    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    const result = await authService.googleLogin(await profileResponse.json());
    res.redirect(`${env.CLIENT_URL}/callback?token=${encodeURIComponent(result.token)}`);
  });

  gmailAuthorize = (req, res) => {
    if (env.NODE_ENV !== 'development') return res.status(404).send('Not found');
    try { res.redirect(createGmailAuthorizationUrl()); } catch (error) { res.status(503).json({ success: false, message: error.message }); }
  };

  gmailCallback = catchAsync(async (req, res) => {
    if (env.NODE_ENV !== 'development') return res.status(404).send('Not found');
    const refreshToken = await exchangeGmailCodeForRefreshToken(req.query.code, req.query.state);
    console.log(`\nGMAIL_REFRESH_TOKEN=${refreshToken}\n`);
    res.type('html').send(`<h1>Gmail connected</h1><p>Copy the refresh token from the server terminal into <code>server/.env</code> as <code>GMAIL_REFRESH_TOKEN</code>.</p><p>You may close this tab.</p>`);
  });
}
