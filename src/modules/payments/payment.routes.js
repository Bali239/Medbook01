import { Router } from 'express';
import { PaymentController } from './payment.controller.js';
import { protect, restrictTo } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import rateLimit from 'express-rate-limit';
import {
	appointmentPaymentParamsSchema,
	initializePaymentSchema,
	paginationSchema,
	paymentIdParamsSchema,
	refundCreateSchema,
} from './payment.schema.js';

const router = Router();
const paymentController = new PaymentController();
const initializeLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 10,
	standardHeaders: true,
	legacyHeaders: false,
	keyGenerator: (req) => req.user.id,
});
const retryLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 6,
	standardHeaders: true,
	legacyHeaders: false,
	keyGenerator: (req) => req.user.id,
});

router.post(
	'/initialize',
	protect,
	restrictTo('patient'),
	initializeLimiter,
	validate(initializePaymentSchema),
	paymentController.initialize,
);
router.get('/me', protect, restrictTo('patient', 'admin'), validate(paginationSchema), paymentController.getMine);
router.get('/appointment/:appointmentId', protect, restrictTo('patient', 'admin'), validate(appointmentPaymentParamsSchema), paymentController.getByAppointment);
router.post('/:paymentId/retry', protect, restrictTo('patient'), retryLimiter, validate(paymentIdParamsSchema), paymentController.retry);
router.get('/:paymentId/refunds', protect, restrictTo('patient', 'admin'), validate(paymentIdParamsSchema), paymentController.getRefunds);
router.post('/:paymentId/refunds', protect, restrictTo('admin'), validate(refundCreateSchema), paymentController.createRefund);
router.get('/:paymentId', protect, restrictTo('patient', 'admin'), validate(paymentIdParamsSchema), paymentController.getById);
router.post('/:paymentId/cancel', protect, restrictTo('patient'), validate(paymentIdParamsSchema), paymentController.cancel);

export default router;
