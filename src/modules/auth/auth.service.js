import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../../models/User.js';
import { BadRequestError, UnauthorizedError } from '../../errors/AppError.js';
import { createToken, hashToken, sendEmail } from './email.service.js';
import { env } from '../../config/env.js';

const signToken = (id, sessionVersion = 0) => {
  return jwt.sign({ id, sessionVersion }, process.env.JWT_SECRET || 'dev-secret', {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

export class AuthService {
  async register(data) {
    const { name, email, password, role } = data;
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new BadRequestError('Email already in use');
    }
    
    const hashedPassword = await bcrypt.hash(password, 12);
    
    const verificationToken = createToken();
    const configuredAdmin = env.ADMIN_EMAIL && email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase();
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: configuredAdmin ? 'admin' : role === 'doctor' ? 'doctor' : 'patient',
      emailVerificationTokenHash: hashToken(verificationToken),
      emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    await sendEmail({
      to: user.email,
      subject: 'Verify your MedBook email',
      text: `Verify your email: ${clientUrl}/verify-email?token=${verificationToken}`,
      html: `<p>Welcome to MedBook.</p><p><a href="${clientUrl}/verify-email?token=${verificationToken}">Verify your email address</a></p>`,
    });
    const token = signToken(user._id, user.sessionVersion);
    
    return {
      token,
      user: this.publicUser(user),
    };
  }
  
  async login(data) {
    const { email, password } = data;
    
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedError('Incorrect email or password');
    }
    
    if (!user.isActive) {
      throw new UnauthorizedError('Your account has been deactivated');
    }
    
    const token = signToken(user._id, user.sessionVersion);
    
    return {
      token,
      user: this.publicUser(user),
    };
  }

  async verifyEmail(token) {
    const user = await User.findOne({
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
    const user = await User.findOne({ email });
    if (!user) return;
    const token = createToken();
    user.passwordResetTokenHash = hashToken(token);
    user.passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    await sendEmail({
      to: user.email,
      subject: 'Reset your MedBook password',
      text: `Reset your password: ${clientUrl}/reset-password?token=${token}`,
      html: `<p><a href="${clientUrl}/reset-password?token=${token}">Reset your password</a></p>`,
    });
  }

  async resetPassword(token, password) {
    const user = await User.findOne({
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
    let user = await User.findOne({
      $or: [{ googleId: profile.sub }, { email: profile.email }],
    });
    if (user) {
      if (!user.googleId) user.googleId = profile.sub;
      user.isEmailVerified = true;
      if (profile.picture && !user.avatar) user.avatar = profile.picture;
      await user.save();
    } else {
      user = await User.create({
        name: profile.name,
        email: profile.email,
        googleId: profile.sub,
        avatar: profile.picture,
        isEmailVerified: true,
        role: 'patient',
      });
    }
    return { token: signToken(user._id, user.sessionVersion), user: this.publicUser(user) };
  }

  publicUser(user) {
    const isAdmin = env.ADMIN_EMAIL && user.email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase();
    const role = isAdmin ? 'admin' : user.role;
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
}
