import User from '../../models/User.js';
import Appointment from '../../models/Appointment.js';
import AuditLog from '../../models/AuditLog.js';
import mongoose from 'mongoose';
import { BadRequestError, NotFoundError } from '../../errors/AppError.js';
import DoctorProfile from '../../models/DoctorProfile.js';
import DoctorApplication from '../../models/DoctorApplication.js';
import PlatformSetting from '../../models/PlatformSetting.js';
import Policy from '../../models/Policy.js';

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

const normalizePolicyInput = (values = {}, partial = false) => {
  const data = {};
  if (!partial || values.title !== undefined) data.title = String(values.title || '').trim();
  if (!partial || values.slug !== undefined) data.slug = String(values.slug || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!partial || values.type !== undefined) data.type = values.type || 'custom';
  if (!partial || values.summary !== undefined) data.summary = String(values.summary || '').trim();
  if (!partial || values.content !== undefined) data.content = String(values.content || '').trim();
  if (!partial || values.isPublished !== undefined) data.isPublished = Boolean(values.isPublished);
  if (!data.title || (!partial && !data.slug) || !data.content) throw new BadRequestError('Policy title, slug, and content are required');
  if (data.type && !['booking', 'cancellation_refund', 'privacy', 'terms', 'notifications', 'custom'].includes(data.type)) throw new BadRequestError('Invalid policy type');
  return data;
};

export class AdminService {
  async getPolicies({ page = 1, limit = 20, search, type, published } = {}) {
    const safePage = Math.max(Number.parseInt(page, 10) || 1, 1);
    const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100);
    const query = {};
    if (type) query.type = type;
    if (published === 'true') query.isPublished = true;
    if (published === 'false') query.isPublished = false;
    if (search?.trim()) query.$or = [
      { title: { $regex: search.trim(), $options: 'i' } },
      { slug: { $regex: search.trim(), $options: 'i' } },
      { summary: { $regex: search.trim(), $options: 'i' } },
    ];
    const [policies, total] = await Promise.all([
      Policy.find(query).populate('updatedBy', 'name email').sort('-updatedAt').skip((safePage - 1) * safeLimit).limit(safeLimit).lean(),
      Policy.countDocuments(query),
    ]);
    return { policies, total, page: safePage, limit: safeLimit };
  }

  async createPolicy(values, adminId) {
    const data = normalizePolicyInput(values);
    return Policy.create({ ...data, updatedBy: adminId });
  }

  async updatePolicy(policyId, values, adminId) {
    const data = normalizePolicyInput(values, true);
    const policy = await Policy.findByIdAndUpdate(
      policyId,
      { $set: { ...data, updatedBy: adminId }, $inc: { version: 1 } },
      { returnDocument: 'after', runValidators: true },
    );
    if (!policy) throw new NotFoundError('Policy not found');
    return policy;
  }

  async deletePolicy(policyId) {
    const policy = await Policy.findByIdAndDelete(policyId);
    if (!policy) throw new NotFoundError('Policy not found');
  }

  async getPlatformSettings() {
    const settings = await PlatformSetting.findOneAndUpdate(
      { key: 'platform' },
      { $setOnInsert: { key: 'platform' } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, lean: true },
    );
    return settings;
  }

  async updatePlatformSettings(values = {}) {
    const allowed = {
      defaultAppointmentDurationMinutes: values.defaultAppointmentDurationMinutes,
      cancellationRefundHours: values.cancellationRefundHours,
      notificationsEnabled: values.notificationsEnabled,
      maintenanceMode: values.maintenanceMode,
      supportEmail: values.supportEmail,
    };
    if (![15, 30, 60].includes(Number(allowed.defaultAppointmentDurationMinutes))) {
      throw new BadRequestError('Default appointment duration must be 15, 30, or 60 minutes');
    }
    if (!Number.isInteger(Number(allowed.cancellationRefundHours)) || Number(allowed.cancellationRefundHours) < 0 || Number(allowed.cancellationRefundHours) > 720) {
      throw new BadRequestError('Cancellation refund hours must be between 0 and 720');
    }
    if (allowed.supportEmail && !/^\S+@\S+\.\S+$/.test(allowed.supportEmail)) throw new BadRequestError('Support email is invalid');
    const settings = await PlatformSetting.findOneAndUpdate(
      { key: 'platform' },
      { $set: { ...allowed, defaultAppointmentDurationMinutes: Number(allowed.defaultAppointmentDurationMinutes), cancellationRefundHours: Number(allowed.cancellationRefundHours) } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, runValidators: true, lean: true },
    );
    return settings;
  }

  async getAllUsers(filters = {}) {
    const page = Math.max(Number.parseInt(filters.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(filters.limit, 10) || 20, 1), 100);
    const query = {};
    if (filters.role) query.role = filters.role;
    if (filters.search) {
      query.$or = [
        { name: { $regex: filters.search, $options: 'i' } },
        { email: { $regex: filters.search, $options: 'i' } },
      ];
    }
    const [users, total] = await Promise.all([
      User.find(query).select('-password').sort('-createdAt').skip((page - 1) * limit).limit(limit).lean(),
      User.countDocuments(query),
    ]);
    return { users, total, page, limit };
  }

  async getAllDoctors(filters = {}) {
    const page = Math.max(Number.parseInt(filters.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(filters.limit, 10) || 20, 1), 100);
    const userQuery = { role: 'doctor' };
    if (filters.search?.trim()) {
      const search = filters.search.trim();
      const matchingProfiles = await DoctorProfile.find({
        $or: [
          { fullName: { $regex: search, $options: 'i' } },
          { specialty: { $regex: search, $options: 'i' } },
        ],
      }).select('user').lean();
      userQuery.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { _id: { $in: matchingProfiles.map((profile) => profile.user) } },
      ];
    }
    const [users, total] = await Promise.all([
      User.find(userQuery).select('-password').sort('-createdAt').skip((page - 1) * limit).limit(limit).lean(),
      User.countDocuments(userQuery),
    ]);
    const userIds = users.map((user) => user._id);
    const [profiles, applications] = await Promise.all([
      DoctorProfile.find({ user: { $in: userIds } }).populate('specialtyId', 'name slug').lean(),
      DoctorApplication.find({ user: { $in: userIds } }).select('user status submittedAt reviewedAt feedback').lean(),
    ]);
    const profilesByUser = new Map(profiles.map((profile) => [String(profile.user), profile]));
    const applicationsByUser = new Map(applications.map((application) => [String(application.user), application]));
    return {
      doctors: users.map((user) => {
        const profile = profilesByUser.get(String(user._id));
        const application = applicationsByUser.get(String(user._id));
        return {
          id: String(user._id),
          name: user.name,
          email: user.email,
          phoneNumber: user.phoneNumber,
          isActive: user.isActive,
          isEmailVerified: user.isEmailVerified,
          createdAt: user.createdAt,
          profile: profile ? {
            id: String(profile._id),
            fullName: profile.fullName,
            specialty: profile.specialtyId ? { id: String(profile.specialtyId._id), name: profile.specialtyId.name, slug: profile.specialtyId.slug } : { name: profile.specialty },
            professionalTitle: profile.professionalTitle,
            licenseNumber: profile.licenseNumber,
            clinicName: profile.clinicName,
            clinicCity: profile.clinicCity,
            status: profile.status,
            approvedAt: profile.approvedAt,
          } : null,
          application: application ? {
            id: String(application._id),
            status: application.status,
            submittedAt: application.submittedAt,
            reviewedAt: application.reviewedAt,
            feedback: application.feedback,
          } : null,
        };
      }),
      total,
      page,
      limit,
    };
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
