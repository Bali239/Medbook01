import jwt from 'jsonwebtoken';
import { catchAsync } from '../utils/catchAsync.js';
import { UnauthorizedError } from '../errors/AppError.js';
import User from '../models/User.js';
import { env } from '../config/env.js';

export const isConfiguredAdmin = (email) => Boolean(
  env.ADMIN_EMAIL && email?.toLowerCase() === env.ADMIN_EMAIL.toLowerCase(),
);

export const protect = catchAsync(async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies?.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    throw new UnauthorizedError('You are not logged in. Please log in to get access.');
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
  const currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    throw new UnauthorizedError('The user belonging to this token does no longer exist.');
  }
  if (decoded.sessionVersion !== currentUser.sessionVersion) {
    throw new UnauthorizedError('Your session has expired. Please sign in again.');
  }
  const configuredAdmin = isConfiguredAdmin(currentUser.email);
  if (!currentUser.isEmailVerified && !configuredAdmin) {
    throw new UnauthorizedError('Please verify your email before using this feature.');
  }
  if (configuredAdmin) {
    // Keep the configured administrator a single-role account in the database
    // as well as in the current request context. This repairs old test accounts
    // that were previously assigned patient/doctor roles.
    if (currentUser.role !== 'admin') {
      await User.updateOne({ _id: currentUser._id }, { $set: { role: 'admin' } });
    }
    currentUser.role = 'admin';
  }

  req.user = currentUser;
  next();
});

export const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      throw new UnauthorizedError('You do not have permission to perform this action');
    }
    next();
  };
};
