import { catchAsync } from '../../utils/catchAsync.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { AppointmentLifecycleService } from './appointment-lifecycle.service.js';
import { AppointmentQueryService } from './appointment-query.service.js';

const appointmentLifecycleService = new AppointmentLifecycleService();
const appointmentQueryService = new AppointmentQueryService();

export class AppointmentController {
  listForDoctor = catchAsync(async (req, res) => {
    const result = await appointmentQueryService.listForDoctor(req.user, req.query);
    ApiResponse.success(res, result, 'Doctor appointments loaded');
  });

  cancel = catchAsync(async (req, res) => {
    const result = await appointmentLifecycleService.cancel(req.params.appointmentId, req.user, req.body);
    ApiResponse.success(res, result, 'Appointment cancellation processed');
  });
}
