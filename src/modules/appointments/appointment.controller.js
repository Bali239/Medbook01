import { catchAsync } from '../../utils/catchAsync.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { AppointmentLifecycleService } from './appointment-lifecycle.service.js';

const appointmentLifecycleService = new AppointmentLifecycleService();

export class AppointmentController {
  cancel = catchAsync(async (req, res) => {
    const result = await appointmentLifecycleService.cancel(req.params.appointmentId, req.user, req.body);
    ApiResponse.success(res, result, 'Appointment cancellation processed');
  });
}
