import { AdminService } from './admin.service.js';
import { catchAsync } from '../../utils/catchAsync.js';
import { ApiResponse } from '../../utils/apiResponse.js';

const adminService = new AdminService();

export class AdminController {
  approveDoctor = catchAsync(async (req, res) => {
    const profile = await adminService.approveDoctor(req.params.id, req.user.id);
    ApiResponse.success(res, profile, 'Doctor approved successfully');
  });
  
  rejectDoctor = catchAsync(async (req, res) => {
    const profile = await adminService.rejectDoctor(req.params.id, req.body.reason);
    ApiResponse.success(res, profile, 'Doctor rejected');
  });
}
