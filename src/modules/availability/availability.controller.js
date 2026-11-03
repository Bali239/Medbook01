import { AvailabilityService } from './availability.service.js';
import { catchAsync } from '../../utils/catchAsync.js';
import { ApiResponse } from '../../utils/apiResponse.js';

const availabilityService = new AvailabilityService();

export class AvailabilityController {
  setAvailability = catchAsync(async (req, res) => {
    const availabilities = await availabilityService.setAvailability(req.user.id, req.body.schedules);
    ApiResponse.success(res, availabilities, 'Availability updated successfully');
  });
  
  getAvailability = catchAsync(async (req, res) => {
    const availability = await availabilityService.getAvailability(req.params.doctorId);
    ApiResponse.success(res, availability, 'Availability retrieved successfully');
  });

  getSlots = catchAsync(async (req, res) => {
    const result = await availabilityService.getSlots(req.params.doctorId, req.query.date);
    ApiResponse.success(res, result, 'Available slots retrieved');
  });
}
