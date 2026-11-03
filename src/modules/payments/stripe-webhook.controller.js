import { catchAsync } from '../../utils/catchAsync.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { StripeWebhookService } from './stripe-webhook.service.js';

const webhookService = new StripeWebhookService();

export class StripeWebhookController {
  receive = catchAsync(async (req, res) => {
    const result = await webhookService.accept(req.body, req.headers['stripe-signature']);
    return ApiResponse.success(res, result, 'Webhook accepted', result.duplicate ? 200 : 202);
  });
}