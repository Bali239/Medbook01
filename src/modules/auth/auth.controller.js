import { AuthService } from './auth.service.js';
import { catchAsync } from '../../utils/catchAsync.js';
import { ApiResponse } from '../../utils/apiResponse.js';

const authService = new AuthService();

export class AuthController {
  register = catchAsync(async (req, res) => {
    const result = await authService.register(req.body);
    ApiResponse.success(res, result, 'Registration successful', 201);
  });
  
  login = catchAsync(async (req, res) => {
    const result = await authService.login(req.body);
    ApiResponse.success(res, result, 'Login successful');
  });
  
  getMe = catchAsync(async (req, res) => {
    ApiResponse.success(res, { user: req.user }, 'User retrieved successfully');
  });
}
