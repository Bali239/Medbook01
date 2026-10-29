import { ReviewService } from './review.service.js';
import { catchAsync } from '../../utils/catchAsync.js';
import { ApiResponse } from '../../utils/apiResponse.js';

const reviewService = new ReviewService();

export class ReviewController {
  create = catchAsync(async (req, res) => {
    const review = await reviewService.createReview(req.user.id, req.body);
    ApiResponse.success(res, review, 'Review submitted successfully', 201);
  });
  
  getDoctorReviews = catchAsync(async (req, res) => {
    const reviews = await reviewService.getDoctorReviews(req.params.doctorId);
    ApiResponse.success(res, reviews, 'Reviews retrieved successfully');
  });
}
