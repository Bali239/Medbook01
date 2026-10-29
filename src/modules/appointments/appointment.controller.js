import { AppointmentService } from './appointment.service.js';
import { catchAsync } from '../../utils/catchAsync.js';
import { ApiResponse } from '../../utils/apiResponse.js';

const appointmentService = new AppointmentService();

export class AppointmentController {
  holdSlot = catchAsync(async (req, res) => {
    const hold = await appointmentService.holdSlot(req.user.id, req.body);
    ApiResponse.success(res, hold, 'Slot held successfully', 201);
  });
}
