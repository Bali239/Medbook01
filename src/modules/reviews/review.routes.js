import { Router } from 'express';
import { ReviewController } from './review.controller.js';
import { protect } from '../../middleware/auth.js';

const router = Router();
const reviewController = new ReviewController();

router.get('/doctor/:doctorId', reviewController.getDoctorReviews);
router.post('/', protect, reviewController.create);

export default router;
