import { PaymentInitializationService } from './payment-initialization.service.js';
import { catchAsync } from '../../utils/catchAsync.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { PaymentQueryService } from './payment-query.service.js';
import { RefundService } from './refund.service.js';
import Payment from '../../models/Payment.js';
import { NotFoundError } from '../../errors/AppError.js';

const paymentService = new PaymentInitializationService();
const paymentQueryService = new PaymentQueryService();
const refundService = new RefundService();

export class PaymentController {
  initialize = catchAsync(async (req, res) => {
    const result = await paymentService.initialize(req.user.id, req.body);
    ApiResponse.success(res, result, 'Payment initialized', 201);
  });

  retry = catchAsync(async (req, res) => {
    const result = await paymentService.retry(req.user.id, req.params.paymentId);
    ApiResponse.success(res, result, 'Payment retry initialized');
  });

  getMine = catchAsync(async (req, res) => {
    const result = await paymentQueryService.list(req.user, req.query);
    ApiResponse.success(res, result, 'Payments retrieved');
  });

  getById = catchAsync(async (req, res) => {
    const result = await paymentQueryService.getById(req.params.paymentId, req.user);
    ApiResponse.success(res, result, 'Payment retrieved');
  });

  getByAppointment = catchAsync(async (req, res) => {
    const result = await paymentQueryService.getByAppointment(req.params.appointmentId, req.user);
    ApiResponse.success(res, result, 'Appointment payment retrieved');
  });

  cancel = catchAsync(async (req, res) => {
    const result = await paymentQueryService.cancel(req.params.paymentId, req.user);
    ApiResponse.success(res, result, 'Payment cancellation requested');
  });

  getRefunds = catchAsync(async (req, res) => {
    const result = await paymentQueryService.getRefunds(req.params.paymentId, req.user);
    ApiResponse.success(res, result, 'Refunds retrieved');
  });

  createRefund = catchAsync(async (req, res) => {
    const payment = await Payment.findOne({ _id: req.params.paymentId });
    if (!payment) throw new NotFoundError('Payment not found.');
    const result = await refundService.createRefund({
      payment,
      amountMinor: req.body.amountMinor,
      reason: 'admin_override',
      adminReason: req.body.reason,
      initiatedBy: req.user.id,
      idempotencyKey: req.body.idempotencyKey,
    });
    ApiResponse.success(res, result, 'Refund requested', 202);
  });
}
