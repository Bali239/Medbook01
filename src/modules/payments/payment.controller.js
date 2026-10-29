import { PaymentService } from './payment.service.js';
import { catchAsync } from '../../utils/catchAsync.js';
import { ApiResponse } from '../../utils/apiResponse.js';

const paymentService = new PaymentService();

export class PaymentController {
  createCheckout = catchAsync(async (req, res) => {
    const result = await paymentService.createCheckoutSession(req.user.id, req.body);
    ApiResponse.success(res, result, 'Checkout session created');
  });
  
  verify = catchAsync(async (req, res) => {
    const result = await paymentService.verifyPayment(req.body.sessionId);
    ApiResponse.success(res, result, 'Payment verification completed');
  });
  
  webhook = catchAsync(async (req, res) => {
    // Webhook handling with signature verification placeholder
    res.json({ received: true });
  });
}
