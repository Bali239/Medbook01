import { PaymentInitializationService } from './payment-initialization.service.js';
import { catchAsync } from '../../utils/catchAsync.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { PaymentQueryService } from './payment-query.service.js';

const paymentService = new PaymentInitializationService();
const paymentQueryService = new PaymentQueryService();

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

}
