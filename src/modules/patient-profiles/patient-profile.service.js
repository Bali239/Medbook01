import User from '../../models/User.js';
import PatientProfile from '../../models/PatientProfile.js';
import { ConflictError, NotFoundError } from '../../errors/AppError.js';
import {
  deleteProfileImage,
  validateProfileImage,
} from '../../integrations/cloudinary/cloudinary.js';

const publicProfile = (profile, user) => {
  if (!profile) return null;

  return {
    id: profile._id,
    userId: profile.user,
    email: user.email,
    firstName: profile.firstName,
    lastName: profile.lastName,
    profilePicture: profile.profilePicture || null,
    dateOfBirth: profile.dateOfBirth,
    gender: profile.gender,
    phoneNumber: profile.phoneNumber,
    city: profile.city,
    address: profile.address || '',
    emergencyContact: profile.emergencyContact || {},
    privacyConsentAt: profile.privacyConsentAt || null,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
};

export class PatientProfileService {
  async getProfile(userId) {
    const [profile, user] = await Promise.all([
      PatientProfile.findOne({ user: userId }),
      User.findById(userId).select('email'),
    ]);

    if (!user) throw new NotFoundError('Patient account not found');
    return publicProfile(profile, user);
  }

  async createOrUpdateProfile(userId, data) {
    const user = await User.findById(userId).select('email');
    if (!user) throw new NotFoundError('Patient account not found');

    const previousProfile = await PatientProfile.findOne({ user: userId });
    const nextPicture = data.profilePicture === undefined
      ? previousProfile?.profilePicture
      : data.profilePicture;

    if (
      nextPicture
      && (!previousProfile?.profilePicture
        || nextPicture.publicId !== previousProfile.profilePicture.publicId)
    ) {
      await validateProfileImage(nextPicture, userId);
    }

    const profileData = {
      ...data,
      profilePicture: nextPicture,
      privacyConsentAt: data.consentAccepted
        ? (previousProfile?.privacyConsentAt || new Date())
        : previousProfile?.privacyConsentAt,
    };
    delete profileData.consentAccepted;

    try {
      const profile = await PatientProfile.findOneAndUpdate(
        { user: userId },
        { $set: profileData, $setOnInsert: { user: userId } },
        { returnDocument: 'after', upsert: true, runValidators: true, setDefaultsOnInsert: true },
      );

      const oldPublicId = previousProfile?.profilePicture?.publicId;
      const newPublicId = profile.profilePicture?.publicId;
      if (oldPublicId && oldPublicId !== newPublicId) {
        try {
          await deleteProfileImage(oldPublicId);
        } catch (error) {
          console.error('Unable to remove replaced patient profile image', error.message);
        }
      }

      await User.findByIdAndUpdate(userId, {
        name: `${profile.firstName} ${profile.lastName}`.trim(),
      });

      return publicProfile(profile, user);
    } catch (error) {
      if (error?.code === 11000) {
        throw new ConflictError('A patient profile already exists for this account');
      }
      throw error;
    }
  }

  async removeProfilePicture(userId) {
    const profile = await PatientProfile.findOne({ user: userId });
    if (!profile) throw new NotFoundError('Patient profile not found');

    const publicId = profile.profilePicture?.publicId;
    profile.profilePicture = undefined;
    await profile.save();

    if (publicId) {
      try {
        await deleteProfileImage(publicId);
      } catch (error) {
        console.error('Unable to remove patient profile image', error.message);
      }
    }

    const user = await User.findById(userId).select('email');
    return publicProfile(profile, user);
  }
}
