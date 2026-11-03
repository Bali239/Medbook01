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

  getAllForAdmin = catchAsync(async (req, res) => {
    const reviews = await reviewService.getAllReviewsForAdmin(req.query);
    ApiResponse.success(res, reviews, 'Reviews retrieved successfully');
  });

  createForAdmin = catchAsync(async (req, res) => {
    const review = await reviewService.createReviewAsAdmin(req.body);
    ApiResponse.success(res, review, 'Review created successfully', 201);
  });

  updateForAdmin = catchAsync(async (req, res) => {
    const review = await reviewService.updateReviewAsAdmin(req.params.reviewId, req.body);
    ApiResponse.success(res, review, 'Review updated successfully');
  });

  deleteForAdmin = catchAsync(async (req, res) => {
    await reviewService.deleteReviewAsAdmin(req.params.reviewId);
    ApiResponse.success(res, null, 'Review deleted successfully');
  });
}
