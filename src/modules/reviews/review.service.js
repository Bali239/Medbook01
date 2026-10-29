import Review from '../../models/Review.js';
import Appointment from '../../models/Appointment.js';
import { BadRequestError, NotFoundError } from '../../errors/AppError.js';

export class ReviewService {
  async createReview(patientId, data) {
    const { appointmentId, rating, comment } = data;
    
    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      throw new NotFoundError('Appointment not found');
    }
    if (appointment.patient.toString() !== patientId) {
      throw new BadRequestError('Not authorized');
    }
    if (appointment.status !== 'completed') {
      throw new BadRequestError('Can only review completed appointments');
    }
    
    const existingReview = await Review.findOne({ appointment: appointmentId });
    if (existingReview) {
      throw new BadRequestError('Review already exists for this appointment');
    }
    
    const review = await Review.create({
      patient: patientId,
      doctor: appointment.doctor,
      appointment: appointmentId,
      rating,
      comment,
    });
    
    return review;
  }
  
  async getDoctorReviews(doctorId) {
    const reviews = await Review.find({ doctor: doctorId, isVisible: true })
      .populate('patient', 'name avatar')
      .sort('-createdAt');
    return reviews;
  }
}
