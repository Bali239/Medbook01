import { Router } from 'express';
import { StripeWebhookController } from './stripe-webhook.controller.js';

const router = Router();
const webhookController = new StripeWebhookController();

router.post('/', webhookController.receive);

export default router;