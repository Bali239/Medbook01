import { Router } from 'express';
import { ReviewController } from './review.controller.js';
import { protect } from '../../middleware/auth.js';
import { restrictTo } from '../../middleware/auth.js';

const router = Router();
const reviewController = new ReviewController();

router.get('/admin', protect, restrictTo('admin'), reviewController.getAllForAdmin);
router.post('/admin', protect, restrictTo('admin'), reviewController.createForAdmin);
router.patch('/admin/:reviewId', protect, restrictTo('admin'), reviewController.updateForAdmin);
router.delete('/admin/:reviewId', protect, restrictTo('admin'), reviewController.deleteForAdmin);
router.get('/doctor/:doctorId', reviewController.getDoctorReviews);
router.post('/', protect, reviewController.create);

export default router;
