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
    const profile = await adminService.rejectDoctor(req.params.id, req.user.id, req.body.reason);
    ApiResponse.success(res, profile, 'Doctor rejected');
  });
  
  getUsers = catchAsync(async (req, res) => {
    const users = await adminService.getAllUsers(req.query);
    ApiResponse.success(res, users, 'Users retrieved successfully');
  });
  
  getAppointments = catchAsync(async (req, res) => {
    const appointments = await adminService.getAllAppointments(req.query);
    ApiResponse.success(res, appointments, 'Appointments retrieved successfully');
  });
  
  getAuditLogs = catchAsync(async (req, res) => {
    const result = await adminService.getAuditLogs(req.query);
    ApiResponse.success(res, result, 'Audit logs retrieved successfully');
  });
  
  getStats = catchAsync(async (req, res) => {
    const stats = await adminService.getStats();
    ApiResponse.success(res, stats, 'Stats retrieved successfully');
  });
}
