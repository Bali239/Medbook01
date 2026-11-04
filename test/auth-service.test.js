import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { loginSchema } from '../src/modules/auth/auth.schema.js';
import { hashToken } from '../src/modules/auth/email.service.js';

const makeService = async (overrides = {}) => {
  const user = {
    _id: 'user-1',
    name: 'Test User',
    email: 'user@example.com',
    password: await bcrypt.hash('correct-password', 4),
    role: 'patient',
    isEmailVerified: true,
    isActive: true,
    sessionVersion: 0,
  };
  Object.assign(user, overrides);
  const userModel = {
    findOne: () => ({ select: async () => user }),
  };
  return { service: new AuthService({ userModel, emailDeliveryService: {}, adminEmail: 'admin@example.com' }), user };
};

const makeGoogleService = ({ existingUser } = {}) => {
  const users = existingUser ? [existingUser] : [];
  const userModel = {
    findOne: async (filter) => {
      if (filter.googleAuthIntentHash) {
        const user = users.find((candidate) => candidate.googleAuthIntentHash === filter.googleAuthIntentHash);
        return user && user.googleAuthIntentExpiresAt > new Date() ? user : null;
      }
      return users.find((candidate) => filter.$or.some((condition) =>
        Object.entries(condition).some(([key, value]) => candidate[key] === value))) || null;
    },
    create: async (data) => {
      const user = { ...data, _id: 'google-user-1', sessionVersion: 0, isActive: true, async save() {} };
      users.push(user);
      return user;
    },
  };
  return {
    service: new AuthService({ userModel, emailDeliveryService: {}, adminEmail: 'admin@example.com' }),
    users,
  };
};

test('login schema requires the role the user is attempting to access', () => {
  assert.equal(loginSchema.safeParse({ body: {
    email: 'user@example.com',
    password: 'correct-password',
  } }).success, false);
});

test('registration creates the selected account and queues verification without a session', async () => {
  let createdUser;
  let queuedEmail;
  const service = new AuthService({
    userModel: {
      findOne: async () => null,
      create: async (data) => {
        createdUser = { ...data, _id: 'registered-user', sessionVersion: 0 };
        return createdUser;
      },
    },
    emailDeliveryService: { enqueue: async (email) => { queuedEmail = email; } },
    adminEmail: 'admin@example.com',
  });

  const result = await service.register({
    name: 'New Doctor',
    email: 'doctor@example.com',
    password: 'strong-password',
    role: 'doctor',
  });

  assert.equal(result.token, undefined);
  assert.equal(result.user.role, 'doctor');
  assert.equal(createdUser.isEmailVerified, undefined);
  assert.equal(typeof createdUser.emailVerificationTokenHash, 'string');
  assert.equal(queuedEmail.to, 'doctor@example.com');
});

test('verified users can sign in to their registered role', async () => {
  const { service, user } = await makeService();

  const result = await service.login({
    email: user.email,
    password: 'correct-password',
    role: 'patient',
  });

  assert.equal(result.user.role, 'patient');
  assert.equal(typeof result.token, 'string');
});

test('unverified users cannot obtain a password session', async () => {
  const { service, user } = await makeService({ isEmailVerified: false });

  await assert.rejects(
    service.login({ email: user.email, password: 'correct-password', role: 'patient' }),
    (error) => error.statusCode === 401 && /verify your email/.test(error.message),
  );
});

test('a valid password with the wrong role returns the actual role', async () => {
  const { service, user } = await makeService();

  await assert.rejects(
    service.login({ email: user.email, password: 'correct-password', role: 'doctor' }),
    (error) => error.statusCode === 409 && error.code === 'ROLE_MISMATCH' && error.role === 'patient',
  );
});

test('an incorrect password does not disclose the registered role', async () => {
  const { service, user } = await makeService();

  await assert.rejects(
    service.login({ email: user.email, password: 'wrong-password', role: 'doctor' }),
    (error) => error.statusCode === 401 && error.code === undefined && error.role === undefined,
  );
});

test('configured admin email is enforced as the admin role', async () => {
  const { service, user } = await makeService({ email: 'admin@example.com', role: 'patient' });

  await assert.rejects(
    service.login({ email: user.email, password: 'correct-password', role: 'patient' }),
    (error) => error.statusCode === 409 && error.role === 'admin',
  );
});

test('new Google users choose and persist a role before receiving a session', async () => {
  const { service, users } = makeGoogleService();
  const intent = await service.googleLogin({
    sub: 'google-subject-1',
    name: 'Google User',
    email: 'google@example.com',
    picture: 'https://example.com/avatar.png',
    email_verified: true,
  });

  assert.equal(typeof intent.googleAuthToken, 'string');
  assert.equal(intent.token, undefined);
  assert.equal(users[0].isGoogleRoleSelectionPending, true);

  const result = await service.completeGoogleLogin(intent.googleAuthToken, 'doctor');

  assert.equal(result.user.role, 'doctor');
  assert.equal(users[0].isGoogleRoleSelectionPending, false);
  assert.equal(users[0].googleAuthIntentHash, undefined);
});

test('existing Google accounts cannot switch roles and the handoff is one-time', async () => {
  const existingUser = {
    _id: 'existing-user',
    name: 'Existing User',
    email: 'existing@example.com',
    role: 'patient',
    isEmailVerified: true,
    isActive: true,
    sessionVersion: 0,
    async save() {},
  };
  const { service } = makeGoogleService({ existingUser });
  const intent = await service.googleLogin({
    sub: 'google-subject-2',
    name: 'Existing User',
    email: 'existing@example.com',
    email_verified: true,
  });

  await assert.rejects(
    service.completeGoogleLogin(intent.googleAuthToken, 'doctor'),
    (error) => error.code === 'ROLE_MISMATCH' && error.role === 'patient',
  );

  const result = await service.completeGoogleLogin(intent.googleAuthToken, 'patient');
  assert.equal(result.user.role, 'patient');
  await assert.rejects(service.completeGoogleLogin(intent.googleAuthToken, 'patient'), /invalid or expired/);
});

test('configured Google admin receives a direct admin session', async () => {
  const { service } = makeGoogleService();
  const result = await service.googleLogin({
    sub: 'google-admin-subject',
    name: 'Admin User',
    email: 'admin@example.com',
    email_verified: true,
  });

  assert.equal(result.user.role, 'admin');
  assert.equal(typeof result.token, 'string');
  assert.equal(result.googleAuthToken, undefined);
});

test('Google accounts with unverified emails cannot start sign-in', async () => {
  const { service, users } = makeGoogleService();

  await assert.rejects(
    service.googleLogin({
      sub: 'unverified-subject',
      name: 'Unverified User',
      email: 'unverified@example.com',
      email_verified: false,
    }),
    (error) => error.statusCode === 401 && /verify your email/.test(error.message),
  );
  assert.equal(users.length, 0);
});

test('expired Google role-selection handoffs cannot be completed', async () => {
  const existingUser = {
    _id: 'expired-user',
    email: 'expired@example.com',
    role: 'patient',
    googleAuthIntentHash: 'expired-hash',
    googleAuthIntentExpiresAt: new Date(Date.now() - 1000),
    async save() {},
  };
  const { service } = makeGoogleService({ existingUser });

  await assert.rejects(service.completeGoogleLogin('expired-token', 'patient'), /invalid or expired/);
});

test('deactivated accounts cannot complete Google sign-in', async () => {
  const existingUser = {
    _id: 'inactive-user',
    email: 'inactive@example.com',
    role: 'patient',
    isActive: false,
    googleAuthIntentHash: hashToken('inactive-token'),
    googleAuthIntentExpiresAt: new Date(Date.now() + 60_000),
    async save() {},
  };
  const { service } = makeGoogleService({ existingUser });

  await assert.rejects(
    service.completeGoogleLogin('inactive-token', 'patient'),
    (error) => error.statusCode === 401 && /deactivated/.test(error.message),
  );
});