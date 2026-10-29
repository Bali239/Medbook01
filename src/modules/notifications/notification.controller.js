import { NotificationService } from './notification.service.js';
import { catchAsync } from '../../utils/catchAsync.js';
import { ApiResponse } from '../../utils/apiResponse.js';

const notificationService = new NotificationService();

export class NotificationController {
  getAll = catchAsync(async (req, res) => {
    const result = await notificationService.getUserNotifications(req.user.id, req.query);
    ApiResponse.success(res, result, 'Notifications retrieved successfully');
  });
  
  markAsRead = catchAsync(async (req, res) => {
    const notification = await notificationService.markAsRead(req.params.id, req.user.id);
    ApiResponse.success(res, notification, 'Notification marked as read');
  });
  
  markAllAsRead = catchAsync(async (req, res) => {
    const result = await notificationService.markAllAsRead(req.user.id);
    ApiResponse.success(res, result, 'All notifications marked as read');
  });
}
