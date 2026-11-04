import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../../models/User.js';
import { BadRequestError, RoleMismatchError, UnauthorizedError } from '../../errors/AppError.js';
import { createToken, hashToken } from './email.service.js';
import { env } from '../../config/env.js';
import { EmailDeliveryService } from '../notifications/email-delivery.service.js';
import { passwordResetEmail, verificationEmail } from '../notifications/email-templates.js';

const signToken = (id, sessionVersion = 0) => {
  return jwt.sign({ id, sessionVersion }, process.env.JWT_SECRET || 'dev-secret', {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

export class AuthService {
  constructor({ emailDeliveryService = new EmailDeliveryService(), userModel = User, adminEmail = env.ADMIN_EMAIL } = {}) {
    this.emailDeliveryService = emailDeliveryService;
    this.userModel = userModel;
    this.adminEmail = adminEmail;
  }

  async register(data) {
    const { name, email, password, role } = data;
    
    const existingUser = await this.userModel.findOne({ email });
    if (existingUser) {
      throw new BadRequestError('Email already in use');
    }
    
    const hashedPassword = await bcrypt.hash(password, 12);
    
    const verificationToken = createToken();
    const configuredAdmin = this.isConfiguredAdmin(email);
    const user = await this.userModel.create({
      name,
      email,
      password: hashedPassword,
      role: configuredAdmin ? 'admin' : role === 'doctor' ? 'doctor' : 'patient',
      emailVerificationTokenHash: hashToken(verificationToken),
      emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    const verificationMessage = verificationEmail({ name: user.name, url: `${clientUrl}/verify-email?token=${verificationToken}` });
    await this.emailDeliveryService.enqueue({
      to: user.email,
      ...verificationMessage,
      dedupeKey: `auth:verification:${user._id}:${hashToken(verificationToken)}`,
    });
    return {
      user: this.publicUser(user),
    };
  }
  
  async login(data) {
    const { email, password, role } = data;
    
    const user = await this.userModel.findOne({ email }).select('+password');
    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedError('Incorrect email or password');
    }
    
    if (!user.isActive) {
      throw new UnauthorizedError('Your account has been deactivated');
    }

    if (!user.isEmailVerified) {
      throw new UnauthorizedError('Check your inbox and verify your email before signing in.');
    }

    const actualRole = this.isConfiguredAdmin(user.email) ? 'admin' : user.role;
    if (role !== actualRole) {
      throw new RoleMismatchError(actualRole);
    }
    
    const token = signToken(user._id, user.sessionVersion);
    
    return {
      token,
      user: this.publicUser(user),
    };
  }

  async verifyEmail(token) {
    const user = await this.userModel.findOne({
      emailVerificationTokenHash: hashToken(token),
      emailVerificationExpiresAt: { $gt: new Date() },
    });
    if (!user) {
      throw new BadRequestError('This verification link is invalid or expired');
    }
    user.isEmailVerified = true;
    user.emailVerificationTokenHash = undefined;
    user.emailVerificationExpiresAt = undefined;
    await user.save();
    return { user: this.publicUser(user), token: signToken(user._id, user.sessionVersion) };
  }

  async requestPasswordReset(email) {
    const user = await this.userModel.findOne({ email });
    if (!user) return;
    const token = createToken();
    user.passwordResetTokenHash = hashToken(token);
    user.passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    const emailMessage = passwordResetEmail({ name: user.name, url: `${clientUrl}/reset-password?token=${token}` });
    await this.emailDeliveryService.enqueue({
      to: user.email,
      ...emailMessage,
      dedupeKey: `auth:password-reset:${user._id}:${hashToken(token)}`,
    });
  }

  async resetPassword(token, password) {
    const user = await this.userModel.findOne({
      passwordResetTokenHash: hashToken(token),
      passwordResetExpiresAt: { $gt: new Date() },
    });
    if (!user) {
      throw new BadRequestError('This password reset link is invalid or expired');
    }
    user.password = await bcrypt.hash(password, 12);
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpiresAt = undefined;
    user.sessionVersion += 1;
    await user.save();
    return { token: signToken(user._id, user.sessionVersion), user: this.publicUser(user) };
  }

  async googleLogin(profile) {
    if (profile.email_verified !== true) {
      throw new UnauthorizedError('Google must verify your email before sign-in.');
    }

    let user = await this.userModel.findOne({
      $or: [{ googleId: profile.sub }, { email: profile.email }],
    });
    if (user) {
      if (!user.googleId) user.googleId = profile.sub;
      user.isEmailVerified = true;
      if (profile.picture && !user.avatar) user.avatar = profile.picture;
      await user.save();
    } else {
      const configuredAdmin = this.isConfiguredAdmin(profile.email);
      user = await this.userModel.create({
        name: profile.name,
        email: profile.email,
        googleId: profile.sub,
        avatar: profile.picture,
        isEmailVerified: true,
        role: configuredAdmin ? 'admin' : 'patient',
        isGoogleRoleSelectionPending: !configuredAdmin,
      });
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Your account has been deactivated');
    }

    if (this.isConfiguredAdmin(user.email)) {
      user.role = 'admin';
      user.isGoogleRoleSelectionPending = false;
      user.googleAuthIntentHash = undefined;
      user.googleAuthIntentExpiresAt = undefined;
      await user.save();
      return { token: signToken(user._id, user.sessionVersion), user: this.publicUser(user) };
    }

    const googleAuthToken = createToken();
    user.googleAuthIntentHash = hashToken(googleAuthToken);
    user.googleAuthIntentExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();
    return { googleAuthToken };
  }

  async completeGoogleLogin(token, role) {
    const user = await this.userModel.findOne({
      googleAuthIntentHash: hashToken(token),
      googleAuthIntentExpiresAt: { $gt: new Date() },
    });
    if (!user) {
      throw new BadRequestError('This Google sign-in session is invalid or expired. Please try again.');
    }
    if (!user.isActive) {
      throw new UnauthorizedError('Your account has been deactivated');
    }

    const actualRole = this.isConfiguredAdmin(user.email) ? 'admin' : user.role;
    if (user.isGoogleRoleSelectionPending) {
      user.role = role;
      user.isGoogleRoleSelectionPending = false;
    } else if (role !== actualRole) {
      throw new RoleMismatchError(actualRole);
    }

    user.googleAuthIntentHash = undefined;
    user.googleAuthIntentExpiresAt = undefined;
    await user.save();
    return { token: signToken(user._id, user.sessionVersion), user: this.publicUser(user) };
  }

  publicUser(user) {
    const role = this.isConfiguredAdmin(user.email) ? 'admin' : user.role;
    return {
      id: user._id,
      name: user.name,
      email: user.email,
      role,
      roles: [role],
      isEmailVerified: user.isEmailVerified,
      avatar: user.avatar,
    };
  }
  isConfiguredAdmin(email) {
    return Boolean(this.adminEmail && email.toLowerCase() === this.adminEmail.toLowerCase());
  }
}
