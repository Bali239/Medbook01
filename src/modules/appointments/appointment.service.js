import Appointment from '../../models/Appointment.js';
import SlotHold from '../../models/SlotHold.js';
import { BadRequestError, ConflictError } from '../../errors/AppError.js';

export class AppointmentService {
  async holdSlot(patientId, data) {
    const { doctorId, appointmentDate, startTime, endTime } = data;
    
    // Check for existing hold
    const existingHold = await SlotHold.findOne({
      doctor: doctorId,
      appointmentDate: new Date(appointmentDate),
      startTime,
    });
    
    if (existingHold && existingHold.expiresAt > new Date()) {
      throw new ConflictError('Slot is currently held by another user');
    }
    
    // Check for confirmed appointment
    const existingAppointment = await Appointment.findOne({
      doctor: doctorId,
      appointmentDate: new Date(appointmentDate),
      startTime,
      status: { $in: ['pending', 'confirmed'] },
    });
    
    if (existingAppointment) {
      throw new ConflictError('Slot is already booked');
    }
    
    // Create hold (10 minutes)
    const hold = await SlotHold.create({
      doctor: doctorId,
      patient: patientId,
      appointmentDate: new Date(appointmentDate),
      startTime,
      endTime,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    });
    
    return hold;
  }
}
