import { DoctorProfileService } from './doctor-profile.service.js';
import { catchAsync } from '../../utils/catchAsync.js';
import { ApiResponse } from '../../utils/apiResponse.js';

const doctorProfileService = new DoctorProfileService();

export class DoctorProfileController {
  createOrUpdate = catchAsync(async (req, res) => {
    const profile = await doctorProfileService.createOrUpdateProfile(req.user.id, req.body);
    ApiResponse.success(res, profile, 'Profile updated successfully');
  });
  
  getMyProfile = catchAsync(async (req, res) => {
    const profile = await doctorProfileService.getProfile(req.user.id);
    ApiResponse.success(res, profile, 'Profile retrieved successfully');
  });
  
  getAll = catchAsync(async (req, res) => {
    const profiles = await doctorProfileService.getAllProfiles(req.query);
    ApiResponse.success(res, profiles, 'Profiles retrieved successfully');
  });
  
  getPublicProfile = catchAsync(async (req, res) => {
    const profile = await doctorProfileService.getPublicProfile(req.params.id);
    ApiResponse.success(res, profile, 'Profile retrieved successfully');
  });
}
