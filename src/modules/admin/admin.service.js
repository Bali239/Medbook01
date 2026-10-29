import DoctorProfile from '../../models/DoctorProfile.js';
import User from '../../models/User.js';
import Appointment from '../../models/Appointment.js';
import AuditLog from '../../models/AuditLog.js';
import { NotFoundError } from '../../errors/AppError.js';

export class AdminService {
  async approveDoctor(profileId, adminId) {
    const profile = await DoctorProfile.findById(profileId);
    if (!profile) {
      throw new NotFoundError('Doctor profile not found');
    }
    
    profile.status = 'approved';
    profile.approvedBy = adminId;
    profile.approvedAt = new Date();
    profile.rejectionReason = undefined;
    await profile.save();
    
    await AuditLog.create({
      user: adminId,
      action: 'APPROVE_DOCTOR',
      resource: 'DoctorProfile',
      resourceId: profileId,
    });
    
    return profile;
  }
  
  async rejectDoctor(profileId, adminId, reason) {
    const profile = await DoctorProfile.findById(profileId);
    if (!profile) {
      throw new NotFoundError('Doctor profile not found');
    }
    
    profile.status = 'rejected';
    profile.rejectionReason = reason;
    await profile.save();
    
    await AuditLog.create({
      user: adminId,
      action: 'REJECT_DOCTOR',
      resource: 'DoctorProfile',
      resourceId: profileId,
      details: { reason },
    });
    
    return profile;
  }
  
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
    const query = {};
    if (filters.status) query.status = filters.status;
    const appointments = await Appointment.find(query)
      .populate('patient', 'name email')
      .populate('doctor', 'name email')
      .sort('-createdAt');
    return appointments;
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
