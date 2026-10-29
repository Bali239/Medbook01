import DoctorProfile from '../../models/DoctorProfile.js';
import { NotFoundError, BadRequestError } from '../../errors/AppError.js';

export class DoctorProfileService {
  async createOrUpdateProfile(userId, data) {
    let profile = await DoctorProfile.findOne({ user: userId });
    
    if (profile && profile.status === 'approved') {
      throw new BadRequestError('Approved profile cannot be modified without reapproval');
    }
    
    if (profile) {
      Object.assign(profile, data);
      if (profile.fullName && profile.specialty && profile.licenseNumber && profile.consultationFee) {
        profile.status = 'pending';
      }
      await profile.save();
    } else {
      profile = await DoctorProfile.create({
        user: userId,
        ...data,
        status: data.fullName && data.specialty && data.licenseNumber && data.consultationFee ? 'pending' : 'incomplete',
      });
    }
    
    return profile;
  }
  
  async getProfile(userId) {
    const profile = await DoctorProfile.findOne({ user: userId });
    if (!profile) {
      throw new NotFoundError('Profile not found');
    }
    return profile;
  }
  
  async getAllProfiles(filters = {}) {
    const query = {};
    if (filters.status) {
      query.status = filters.status;
    } else {
      query.status = 'approved'; // Public can only see approved doctors
    }
    if (filters.specialty) query.specialty = filters.specialty;
    if (filters.search) {
      query.fullName = { $regex: filters.search, $options: 'i' };
    }
    
    const profiles = await DoctorProfile.find(query)
      .populate('user', 'name email avatar')
      .sort('-createdAt');
    return profiles;
  }
  
  async getPublicProfile(id) {
    const profile = await DoctorProfile.findById(id)
      .populate('user', 'name email avatar');
    if (!profile || profile.status !== 'approved') {
      throw new NotFoundError('Doctor not found');
    }
    return profile;
  }
}
