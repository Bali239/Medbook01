import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      select: false,
    },
    role: {
      type: String,
      enum: ['patient', 'doctor', 'admin'],
      default: 'patient',
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    googleId: String,
    avatar: String,
    isGoogleRoleSelectionPending: { type: Boolean, default: false },
    googleAuthIntentHash: String,
    googleAuthIntentExpiresAt: Date,
    emailVerificationTokenHash: String,
    emailVerificationExpiresAt: Date,
    passwordResetTokenHash: String,
    passwordResetExpiresAt: Date,
    sessionVersion: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model('User', userSchema);

export default User;
