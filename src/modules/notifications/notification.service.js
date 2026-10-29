import Notification from '../../models/Notification.js';

export class NotificationService {
  async createNotification(data) {
    const notification = await Notification.create(data);
    return notification;
  }
  
  async getUserNotifications(userId, { page = 1, limit = 10 } = {}) {
    const notifications = await Notification.find({ recipient: userId })
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit);
    
    const total = await Notification.countDocuments({ recipient: userId });
    const unreadCount = await Notification.countDocuments({ recipient: userId, isRead: false });
    
    return { notifications, total, unreadCount };
  }
  
  async markAsRead(notificationId, userId) {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, recipient: userId },
      { isRead: true },
      { new: true }
    );
    return notification;
  }
  
  async markAllAsRead(userId) {
    await Notification.updateMany({ recipient: userId, isRead: false }, { isRead: true });
    return { message: 'All notifications marked as read' };
  }
}
