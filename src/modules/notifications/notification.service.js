import Notification from '../../models/Notification.js';

export class NotificationService {
  constructor({ notificationModel = Notification } = {}) {
    this.notificationModel = notificationModel;
  }

  async createNotification(data) {
    if (data.dedupeKey) {
      try {
        return await this.notificationModel.findOneAndUpdate(
          { dedupeKey: data.dedupeKey },
          { $setOnInsert: data },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );
      } catch (error) {
        if (error.code !== 11000) throw error;
        return this.notificationModel.findOne({ dedupeKey: data.dedupeKey });
      }
    }
    const notification = await this.notificationModel.create(data);
    return notification;
  }
  
  async getUserNotifications(userId, { page = 1, limit = 10 } = {}) {
    const notifications = await this.notificationModel.find({ recipient: userId })
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit);
    
    const total = await this.notificationModel.countDocuments({ recipient: userId });
    const unreadCount = await this.notificationModel.countDocuments({ recipient: userId, isRead: false });
    
    return { notifications, total, unreadCount };
  }
  
  async markAsRead(notificationId, userId) {
    const notification = await this.notificationModel.findOneAndUpdate(
      { _id: notificationId, recipient: userId },
      { isRead: true },
      { new: true }
    );
    return notification;
  }
  
  async markAllAsRead(userId) {
    await this.notificationModel.updateMany({ recipient: userId, isRead: false }, { isRead: true });
    return { message: 'All notifications marked as read' };
  }
}
