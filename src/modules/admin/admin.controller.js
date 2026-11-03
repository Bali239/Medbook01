import { AdminService } from './admin.service.js';
import { catchAsync } from '../../utils/catchAsync.js';
import { ApiResponse } from '../../utils/apiResponse.js';

const adminService = new AdminService();

export class AdminController {
  getUsers = catchAsync(async (req, res) => {
    const users = await adminService.getAllUsers(req.query);
    ApiResponse.success(res, users, 'Users retrieved successfully');
  });

  getDoctors = catchAsync(async (req, res) => {
    const doctors = await adminService.getAllDoctors(req.query);
    ApiResponse.success(res, doctors, 'Doctors retrieved successfully');
  });
  
  getAppointments = catchAsync(async (req, res) => {
    const appointments = await adminService.getAllAppointments(req.query);
    ApiResponse.success(res, appointments, 'Appointments retrieved successfully');
  });

  getAppointment = catchAsync(async (req, res) => {
    const appointment = await adminService.getAppointment(req.params.appointmentId);
    ApiResponse.success(res, appointment, 'Appointment retrieved successfully');
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
