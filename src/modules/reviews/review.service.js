import Review from '../../models/Review.js';
import Appointment from '../../models/Appointment.js';
import { BadRequestError, NotFoundError } from '../../errors/AppError.js';
import User from '../../models/User.js';
import mongoose from 'mongoose';

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

  async getAllReviewsForAdmin({ page = 1, limit = 20, visibility = 'all', search } = {}) {
    const safePage = Math.max(Number.parseInt(page, 10) || 1, 1);
    const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100);
    const query = {};
    if (visibility === 'visible') query.isVisible = true;
    if (visibility === 'hidden') query.isVisible = false;
    if (search?.trim()) {
      const matchingUsers = await User.find({
        $or: [
          { name: { $regex: search.trim(), $options: 'i' } },
          { email: { $regex: search.trim(), $options: 'i' } },
        ],
      }).select('_id').lean();
      query.$or = [
        { patient: { $in: matchingUsers.map((user) => user._id) } },
        { doctor: { $in: matchingUsers.map((user) => user._id) } },
      ];
      if (mongoose.isValidObjectId(search.trim())) query.$or.push({ _id: search.trim() });
    }
    const [reviews, total] = await Promise.all([
      Review.find(query)
        .populate('patient', 'name email avatar')
        .populate('doctor', 'name email')
        .populate('appointment', 'appointmentDate appointmentStartAt appointmentEndAt status')
        .sort('-createdAt')
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .lean(),
      Review.countDocuments(query),
    ]);
    return { reviews, total, page: safePage, limit: safeLimit };
  }

  async createReviewAsAdmin({ appointmentId, patientId, doctorId, rating, comment, isVisible = true }) {
    let appointment;
    if (appointmentId) appointment = await Appointment.findById(appointmentId);
    if (appointmentId && !appointment) throw new NotFoundError('Appointment not found');
    const patient = patientId || appointment?.patient;
    const doctor = doctorId || appointment?.doctor;
    if (!appointmentId || !patient || !doctor) throw new BadRequestError('An appointment ID is required to create a review');
    if (appointmentId && await Review.exists({ appointment: appointmentId })) throw new BadRequestError('A review already exists for this appointment');
    return Review.create({ patient, doctor, appointment: appointmentId, rating, comment, isVisible });
  }

  async updateReviewAsAdmin(reviewId, data) {
    const review = await Review.findByIdAndUpdate(
      reviewId,
      { $set: { ...(data.rating !== undefined ? { rating: data.rating } : {}), ...(data.comment !== undefined ? { comment: data.comment } : {}), ...(data.isVisible !== undefined ? { isVisible: data.isVisible } : {}) } },
      { returnDocument: 'after', runValidators: true },
    ).populate('patient', 'name email avatar').populate('doctor', 'name email').populate('appointment', 'appointmentDate appointmentStartAt appointmentEndAt status');
    if (!review) throw new NotFoundError('Review not found');
    return review;
  }

  async deleteReviewAsAdmin(reviewId) {
    const review = await Review.findByIdAndDelete(reviewId);
    if (!review) throw new NotFoundError('Review not found');
  }
}
