import { catchAsync } from '../../utils/catchAsync.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { AppointmentLifecycleService } from './appointment-lifecycle.service.js';
import { AppointmentQueryService } from './appointment-query.service.js';
import { RefundRequestService } from '../payments/refund-request.service.js';

const appointmentLifecycleService = new AppointmentLifecycleService();
const appointmentQueryService = new AppointmentQueryService();
const refundRequestService = new RefundRequestService();

export class AppointmentController {
  listForDoctor = catchAsync(async (req, res) => {
    const result = await appointmentQueryService.listForDoctor(req.user, req.query);
    ApiResponse.success(res, result, 'Doctor appointments loaded');
  });

  updateStatus = catchAsync(async (req, res) => {
    const result = await appointmentLifecycleService.updateStatus(req.params.appointmentId, req.user, req.body);
    ApiResponse.success(res, result, 'Appointment status updated');
  });

  cancel = catchAsync(async (req, res) => {
    const result = await appointmentLifecycleService.cancel(req.params.appointmentId, req.user, req.body);
    ApiResponse.success(res, result, 'Appointment cancellation processed');
  });

  createRefundRequest = catchAsync(async (req, res) => {
    const result = await refundRequestService.createForPatient(req.params.appointmentId, req.user.id, req.body);
    ApiResponse.success(res, result, 'Request submitted for doctor and admin approval', 201);
  });

  listDoctorRefundRequests = catchAsync(async (req, res) => {
    const result = await refundRequestService.listForDoctor(req.user.id, req.query);
    ApiResponse.success(res, result, 'Refund requests loaded');
  });

  doctorRefundDecision = catchAsync(async (req, res) => {
    const result = await refundRequestService.doctorDecision(req.params.requestId, req.user.id, req.body);
    ApiResponse.success(res, result, 'Refund request reviewed');
  });
}
