import Appointment from '../../models/Appointment.js';

export class AppointmentQueryService {
  constructor({ appointmentModel = Appointment } = {}) {
    this.appointmentModel = appointmentModel;
  }

  async listForDoctor(doctor, { page = 1, limit = 20, status } = {}) {
    const filter = { doctor: doctor.id };
    if (status) filter.status = status;
    const [appointments, total] = await Promise.all([
      this.appointmentModel.find(filter)
        .populate('patient', 'name email')
        .sort({ appointmentDate: -1, startTime: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.appointmentModel.countDocuments(filter),
    ]);
    return {
      appointments: appointments.map((appointment) => ({
        ...appointment,
        id: String(appointment._id),
        patient: appointment.patient ? {
          id: String(appointment.patient._id),
          name: appointment.patient.name,
          email: appointment.patient.email,
        } : null,
        startAt: appointment.appointmentStartAt,
        endAt: appointment.appointmentEndAt,
      })),
      total,
      page,
      limit,
    };
  }
}
