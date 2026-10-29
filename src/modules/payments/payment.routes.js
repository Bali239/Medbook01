import { Router } from 'express';
import { PaymentController } from './payment.controller.js';
import { protect } from '../../middleware/auth.js';

const router = Router();
const paymentController = new PaymentController();

router.post('/create-checkout-session', protect, paymentController.createCheckout);
router.post('/verify', protect, paymentController.verify);
router.post('/webhook', paymentController.webhook);

export default router;
