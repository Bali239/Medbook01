import { ApiResponse } from '../../utils/apiResponse.js';
import { catchAsync } from '../../utils/catchAsync.js';
import { createProfileImageSignature } from '../../integrations/cloudinary/cloudinary.js';
import { PatientProfileService } from './patient-profile.service.js';

const patientProfileService = new PatientProfileService();

export class PatientProfileController {
  getMyProfile = catchAsync(async (req, res) => {
    const profile = await patientProfileService.getProfile(req.user.id);
    ApiResponse.success(res, profile, 'Patient profile retrieved successfully');
  });

  createOrUpdate = catchAsync(async (req, res) => {
    const profile = await patientProfileService.createOrUpdateProfile(
      req.user.id,
      req.body,
    );
    ApiResponse.success(res, profile, 'Patient profile saved successfully');
  });

  getImageUploadSignature = catchAsync(async (req, res) => {
    const signature = createProfileImageSignature(req.user.id);
    ApiResponse.success(res, signature, 'Profile image upload authorized');
  });

  removeProfilePicture = catchAsync(async (req, res) => {
    const profile = await patientProfileService.removeProfilePicture(req.user.id);
    ApiResponse.success(res, profile, 'Profile picture removed successfully');
  });
}
