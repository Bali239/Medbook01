import Availability from '../../models/Availability.js';
import { catchAsync } from '../../utils/catchAsync.js';

export class AvailabilityService {
  async setAvailability(doctorId, schedules) {
    // Remove existing and create new
    await Availability.deleteMany({ doctor: doctorId });
    const availabilities = await Availability.insertMany(
      schedules.map(s => ({ ...s, doctor: doctorId }))
    );
    return availabilities;
  }
  
  async getAvailability(doctorId) {
    const availability = await Availability.find({ doctor: doctorId, isActive: true });
    return availability;
  }
}
