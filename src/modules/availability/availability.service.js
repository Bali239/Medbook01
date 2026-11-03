import Availability from '../../models/Availability.js';
import Appointment from '../../models/Appointment.js';
import DoctorProfile from '../../models/DoctorProfile.js';
import SlotHold from '../../models/SlotHold.js';
import User from '../../models/User.js';
import { getZonedAppointmentSlot, localDateTimeToUtc, timeRangesOverlap, timeStringToMinutes } from '../appointments/appointment-time.js';
import { BadRequestError, NotFoundError } from '../../errors/AppError.js';
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

  async getSlots(doctorId, dateValue) {
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue || '');
    if (!dateMatch) throw new BadRequestError('Choose a valid appointment date.');
    const date = new Date(Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3])));
    if (date.toISOString().slice(0, 10) !== dateValue) throw new BadRequestError('Choose a valid appointment date.');
    const [doctor, profile] = await Promise.all([
      User.findOne({ _id: doctorId, role: 'doctor', isActive: true }).select('_id'),
      DoctorProfile.findOne({ user: doctorId, status: 'approved' }),
    ]);
    if (!doctor || !profile) throw new NotFoundError('Doctor is not currently bookable.');
    if (!profile.appointmentDurationMinutes || !profile.clinicTimeZone) {
      throw new BadRequestError('This doctor has not completed appointment scheduling setup.');
    }

    const schedules = await Availability.find({
      doctor: doctorId,
      dayOfWeek: date.getUTCDay(),
      isActive: true,
    });
    const [appointments, holds] = await Promise.all([
      Appointment.find({
        doctor: doctorId,
        appointmentDate: date,
        status: { $in: ['pending', 'pending_payment', 'confirmed'] },
      }).select('startTime endTime'),
      SlotHold.find({
        doctor: doctorId,
        appointmentDate: date,
        expiresAt: { $gt: new Date() },
        $or: [{ status: 'active' }, { status: { $exists: false } }],
      }).select('startTime endTime'),
    ]);

    const now = Date.now();
    const slots = [];
    for (const schedule of schedules) {
      const scheduleStart = timeStringToMinutes(schedule.startTime);
      const scheduleEnd = timeStringToMinutes(schedule.endTime);
      for (
        let startMinute = scheduleStart;
        startMinute + profile.appointmentDurationMinutes <= scheduleEnd;
        startMinute += profile.appointmentDurationMinutes
      ) {
        const endMinute = startMinute + profile.appointmentDurationMinutes;
        const startTime = `${String(Math.floor(startMinute / 60)).padStart(2, '0')}:${String(startMinute % 60).padStart(2, '0')}`;
        const endTime = `${String(Math.floor(endMinute / 60)).padStart(2, '0')}:${String(endMinute % 60).padStart(2, '0')}`;
        if (schedule.breakStartTime && schedule.breakEndTime && timeRangesOverlap(
          startMinute,
          endMinute,
          schedule.breakStartTime,
          schedule.breakEndTime,
        )) continue;

        if (startMinute % 5 !== 0) continue;
        const startAt = localDateTimeToUtc(dateValue, startTime, profile.clinicTimeZone);
        if (!startAt || startAt.valueOf() <= now) continue;
        const slot = getZonedAppointmentSlot(
          startAt,
          profile.appointmentDurationMinutes,
          profile.clinicTimeZone,
          now,
        );
        if (
          appointments.some((appointment) => timeRangesOverlap(
            slot.startMinute,
            slot.endMinute,
            appointment.startTime,
            appointment.endTime,
          ))
          || holds.some((hold) => timeRangesOverlap(
            slot.startMinute,
            slot.endMinute,
            hold.startTime,
            hold.endTime,
          ))
        ) continue;

        slots.push({ startAt: startAt.toISOString(), startTime, endTime, timeZone: profile.clinicTimeZone });
      }
    }

    return {
      date: dateValue,
      timeZone: profile.clinicTimeZone,
      durationMinutes: profile.appointmentDurationMinutes,
      slots: slots.sort((left, right) => left.startAt.localeCompare(right.startAt)),
    };
  }
}
