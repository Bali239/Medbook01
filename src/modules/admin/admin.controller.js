import { AdminService } from './admin.service.js';
import { catchAsync } from '../../utils/catchAsync.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { RefundRequestService } from '../payments/refund-request.service.js';

const adminService = new AdminService();
const refundRequestService = new RefundRequestService();

export class AdminController {
  getUsers = catchAsync(async (req, res) => {
    const users = await adminService.getAllUsers(req.query);
    ApiResponse.success(res, users, 'Users retrieved successfully');
  });

  getDoctors = catchAsync(async (req, res) => {
    const doctors = await adminService.getAllDoctors(req.query);
    ApiResponse.success(res, doctors, 'Doctors retrieved successfully');
  });

  getSettings = catchAsync(async (req, res) => {
    const settings = await adminService.getPlatformSettings();
    ApiResponse.success(res, settings, 'Platform settings retrieved successfully');
  });

  updateSettings = catchAsync(async (req, res) => {
    const settings = await adminService.updatePlatformSettings(req.body);
    ApiResponse.success(res, settings, 'Platform settings updated successfully');
  });

  getPolicies = catchAsync(async (req, res) => {
    const policies = await adminService.getPolicies(req.query);
    ApiResponse.success(res, policies, 'Policies retrieved successfully');
  });

  createPolicy = catchAsync(async (req, res) => {
    const policy = await adminService.createPolicy(req.body, req.user.id);
    ApiResponse.success(res, policy, 'Policy created successfully', 201);
  });

  updatePolicy = catchAsync(async (req, res) => {
    const policy = await adminService.updatePolicy(req.params.policyId, req.body, req.user.id);
    ApiResponse.success(res, policy, 'Policy updated successfully');
  });

  deletePolicy = catchAsync(async (req, res) => {
    await adminService.deletePolicy(req.params.policyId);
    ApiResponse.success(res, null, 'Policy deleted successfully');
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

  getRefundRequests = catchAsync(async (req, res) => {
    const result = await refundRequestService.listForAdmin(req.query);
    ApiResponse.success(res, result, 'Refund requests loaded');
  });

  adminRefundDecision = catchAsync(async (req, res) => {
    const result = await refundRequestService.adminDecision(req.params.requestId, req.user.id, req.body);
    ApiResponse.success(res, result, 'Refund request processed');
  });
}
