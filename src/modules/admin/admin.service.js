import User from '../../models/User.js';
import Appointment from '../../models/Appointment.js';
import AuditLog from '../../models/AuditLog.js';
import mongoose from 'mongoose';
import { NotFoundError } from '../../errors/AppError.js';

const formatAppointment = (appointment) => ({
  ...appointment,
  id: String(appointment._id),
  _id: String(appointment._id),
  startAt: appointment.appointmentStartAt || null,
  endAt: appointment.appointmentEndAt || null,
  doctor: appointment.doctor ? {
    id: String(appointment.doctor._id),
    name: appointment.doctorSnapshot?.name || appointment.doctor.name,
    email: appointment.doctor.email,
    phoneNumber: appointment.doctor.phoneNumber,
    specialty: appointment.doctorSnapshot?.specialty,
    clinicName: appointment.doctorSnapshot?.clinicName,
    clinicAddress: appointment.doctorSnapshot?.clinicAddress,
  } : null,
  patient: appointment.patient ? {
    id: String(appointment.patient._id),
    name: appointment.patient.name,
    email: appointment.patient.email,
    phoneNumber: appointment.patient.phoneNumber,
  } : null,
});

export class AdminService {
  async getAllUsers(filters = {}) {
    const query = {};
    if (filters.role) query.role = filters.role;
    if (filters.search) {
      query.$or = [
        { name: { $regex: filters.search, $options: 'i' } },
        { email: { $regex: filters.search, $options: 'i' } },
      ];
    }
    const users = await User.find(query).select('-password').sort('-createdAt');
    return users;
  }
  
  async getAllAppointments(filters = {}) {
    const page = Math.max(Number.parseInt(filters.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(filters.limit, 10) || 20, 1), 100);
    const query = {};
    if (filters.status) query.status = filters.status;

    if (filters.timeline === 'future') query.appointmentStartAt = { $gt: new Date() };
    if (filters.timeline === 'present') query.$and = [
      { appointmentStartAt: { $lte: new Date() } },
      { appointmentEndAt: { $gte: new Date() } },
    ];
    if (filters.timeline === 'past') query.appointmentEndAt = { $lt: new Date() };

    if (filters.search?.trim()) {
      const search = filters.search.trim();
      const matchingUsers = await User.find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
        ],
      }).select('_id').lean();
      const matchingUserIds = matchingUsers.map((user) => user._id);
      query.$or = [
        { patient: { $in: matchingUserIds } },
        { doctor: { $in: matchingUserIds } },
      ];
      if (mongoose.isValidObjectId(search)) query.$or.push({ _id: search });
    }

    const [appointments, total] = await Promise.all([
      Appointment.find(query)
        .populate('patient', 'name email phoneNumber')
        .populate('doctor', 'name email phoneNumber')
        .sort({ appointmentStartAt: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Appointment.countDocuments(query),
    ]);
    return { appointments: appointments.map(formatAppointment), total, page, limit };
  }

  async getAppointment(appointmentId) {
    if (!mongoose.isValidObjectId(appointmentId)) {
      throw new NotFoundError('Appointment not found.');
    }
    const appointment = await Appointment.findById(appointmentId)
      .populate('patient', 'name email phoneNumber')
      .populate('doctor', 'name email phoneNumber')
      .lean();
    if (!appointment) {
      throw new NotFoundError('Appointment not found.');
    }
    return formatAppointment(appointment);
  }
  
  async getAuditLogs({ page = 1, limit = 20 } = {}) {
    const logs = await AuditLog.find()
      .populate('user', 'name email')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit);
    const total = await AuditLog.countDocuments();
    return { logs, total };
  }
  
  async getStats() {
    const [userCount, doctorCount, patientCount, appointmentCount] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'doctor' }),
      User.countDocuments({ role: 'patient' }),
      Appointment.countDocuments(),
    ]);
    
    return {
      users: userCount,
      doctors: doctorCount,
      patients: patientCount,
      appointments: appointmentCount,
    };
  }
}
