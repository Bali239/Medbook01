import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../errors/AppError.js';
import { env } from '../../config/env.js';
import Appointment from '../../models/Appointment.js';
import Availability from '../../models/Availability.js';
import DoctorProfile from '../../models/DoctorProfile.js';
import SlotHold from '../../models/SlotHold.js';
import User from '../../models/User.js';
import { getSlotClaimIntervals, getZonedAppointmentSlot, timeRangesOverlap, timeStringToMinutes } from './appointment-time.js';

const queryWithSession = (query, session) => (session ? query.session(session) : query);

export class AppointmentBookingService {
  constructor({
    appointmentModel = Appointment,
    availabilityModel = Availability,
    doctorProfileModel = DoctorProfile,
    slotHoldModel = SlotHold,
    userModel = User,
    now = Date.now,
  } = {}) {
    this.appointmentModel = appointmentModel;
    this.availabilityModel = availabilityModel;
    this.doctorProfileModel = doctorProfileModel;
    this.slotHoldModel = slotHoldModel;
    this.userModel = userModel;
    this.now = now;
  }

  async validateSlot({ doctorId, startAt, session, excludeAppointmentId, excludeHoldId, excludeHoldAppointmentId }) {
    const [doctor, profile] = await Promise.all([
      queryWithSession(this.userModel.findById(doctorId).select('name role isActive'), session),
      queryWithSession(this.doctorProfileModel.findOne({ user: doctorId, status: 'approved' }), session),
    ]);

    if (!doctor || doctor.role !== 'doctor' || !doctor.isActive || !profile) {
      throw new NotFoundError('This doctor is not currently accepting appointments.');
    }
    if (!Number.isSafeInteger(profile.consultationFeePaisa) || profile.consultationFeePaisa <= 0) {
      throw new BadRequestError('The doctor consultation fee is not configured.');
    }
    if (!profile.appointmentDurationMinutes || !profile.clinicTimeZone) {
      throw new BadRequestError('This doctor has not completed appointment scheduling setup.');
    }

    const slot = getZonedAppointmentSlot(
      startAt,
      profile.appointmentDurationMinutes,
      profile.clinicTimeZone,
      this.now(),
    );
    const schedulesQuery = this.availabilityModel.find({
      doctor: doctorId,
      dayOfWeek: slot.dayOfWeek,
      isActive: true,
    });
    const schedules = await queryWithSession(schedulesQuery, session);
    const matchingSchedule = schedules.find((schedule) => {
      const scheduleStart = timeStringToMinutes(schedule.startTime);
      const scheduleEnd = timeStringToMinutes(schedule.endTime);
      if (
        slot.startMinute < scheduleStart
        || slot.endMinute > scheduleEnd
        || (slot.startMinute - scheduleStart) % profile.appointmentDurationMinutes !== 0
        || slot.startMinute % 5 !== 0
      ) return false;

      if (schedule.breakStartTime && schedule.breakEndTime) {
        if (timeRangesOverlap(
          slot.startMinute,
          slot.endMinute,
          schedule.breakStartTime,
          schedule.breakEndTime,
        )) return false;
      }
      return true;
    });

    if (!matchingSchedule) throw new ConflictError('That time is outside the doctor’s available schedule.');

    const appointmentsQuery = this.appointmentModel.find({
      doctor: doctorId,
      appointmentDate: slot.appointmentDate,
      status: { $in: ['pending', 'pending_payment', 'confirmed'] },
      ...(excludeAppointmentId ? { _id: { $ne: excludeAppointmentId } } : {}),
    }).select('startTime endTime');
    const holdsQuery = this.slotHoldModel.find({
      doctor: doctorId,
      appointmentDate: slot.appointmentDate,
      expiresAt: { $gt: new Date(this.now()) },
      $or: [{ status: 'active' }, { status: { $exists: false } }],
      ...(excludeHoldAppointmentId
        ? { appointment: { $ne: excludeHoldAppointmentId } }
        : excludeHoldId ? { _id: { $ne: excludeHoldId } } : {}),
    }).select('startTime endTime');
    const [appointments, holds] = await Promise.all([
      queryWithSession(appointmentsQuery, session),
      queryWithSession(holdsQuery, session),
    ]);

    const hasAppointmentConflict = appointments.some((appointment) => timeRangesOverlap(
      slot.startMinute,
      slot.endMinute,
      appointment.startTime,
      appointment.endTime,
    ));
    const hasHoldConflict = holds.some((hold) => timeRangesOverlap(
      slot.startMinute,
      slot.endMinute,
      hold.startTime,
      hold.endTime,
    ));
    if (hasAppointmentConflict || hasHoldConflict) {
      throw new ConflictError('That appointment time is no longer available.');
    }

    return { doctor, profile, slot };
  }

  async reservePaymentBooking({ patientId, doctorId, startAt, idempotencyKey, pricingSnapshot, session }) {
    const patient = await queryWithSession(this.userModel.findById(patientId).select('role isActive'), session);
    if (!patient || patient.role !== 'patient' || !patient.isActive) {
      throw new ForbiddenError('An active patient account is required.');
    }

    const { doctor, profile, slot } = await this.validateSlot({ doctorId, startAt, session });
    if (profile.consultationFeePaisa !== pricingSnapshot.doctorFeePaisa) {
      throw new ConflictError('The consultation fee changed. Please restart checkout.');
    }

    const claimIntervals = getSlotClaimIntervals(slot.startMinute, slot.endMinute);
    const claimStarts = claimIntervals.map(({ startTime }) => startTime);
    const expiresAt = new Date(this.now() + (env.PAYMENT_HOLD_DURATION_MINUTES * 60 * 1000));
    await this.slotHoldModel.deleteMany({
      doctor: doctorId,
      appointmentDate: slot.appointmentDate,
      startTime: { $in: claimStarts },
      expiresAt: { $lte: new Date(this.now()) },
    }, { session });
    const holds = await this.slotHoldModel.insertMany(claimIntervals.map((interval, index) => ({
      doctor: doctorId,
      patient: patientId,
      appointmentDate: slot.appointmentDate,
      ...interval,
      expiresAt,
      status: 'active',
      idempotencyKey: `${idempotencyKey}:${index}`,
    })), { session });
    const hold = holds[0];

    const appointment = new this.appointmentModel({
      doctor: doctorId,
      patient: patientId,
      appointmentDate: slot.appointmentDate,
      startTime: slot.startTime,
      endTime: slot.endTime,
      appointmentStartAt: slot.startAt,
      appointmentEndAt: slot.endAt,
      holdExpiresAt: hold.expiresAt,
      appointmentDurationMinutes: profile.appointmentDurationMinutes,
      status: 'pending_payment',
      paymentStatus: 'pending',
      feePaisa: profile.consultationFeePaisa,
      currency: pricingSnapshot.currency,
      pricingSnapshot,
      slotHold: hold._id,
      bookingIdempotencyKey: idempotencyKey,
      doctorSnapshot: {
        name: profile.fullName,
        specialty: profile.specialty,
        clinicName: profile.clinicName,
        clinicAddress: profile.clinicAddress,
        clinicCity: profile.clinicCity,
        clinicTimeZone: profile.clinicTimeZone,
      },
    });
    await appointment.save({ session });
    await this.slotHoldModel.updateMany(
      { _id: { $in: holds.map((item) => item._id) } },
      { $set: { appointment: appointment._id } },
      { session },
    );

    return { appointment, hold, doctor, profile, slot };
  }
}