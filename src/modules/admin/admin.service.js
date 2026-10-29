import DoctorProfile from '../../models/DoctorProfile.js';
import { NotFoundError } from '../../errors/AppError.js';

export class AdminService {
  async approveDoctor(profileId, adminId) {
    const profile = await DoctorProfile.findById(profileId);
    if (!profile) {
      throw new NotFoundError('Doctor profile not found');
    }
    
    profile.status = 'approved';
    profile.approvedBy = adminId;
    profile.approvedAt = new Date();
    profile.rejectionReason = undefined;
    await profile.save();
    
    return profile;
  }
  
  async rejectDoctor(profileId, reason) {
    const profile = await DoctorProfile.findById(profileId);
    if (!profile) {
      throw new NotFoundError('Doctor profile not found');
    }
    
    profile.status = 'rejected';
    profile.rejectionReason = reason;
    await profile.save();
    
    return profile;
  }
}
