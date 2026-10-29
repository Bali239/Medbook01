import { Router } from 'express';
import { NotificationController } from './notification.controller.js';
import { protect } from '../../middleware/auth.js';

const router = Router();
const notificationController = new NotificationController();

router.use(protect);

router.get('/', notificationController.getAll);
router.patch('/read-all', notificationController.markAllAsRead);
router.patch('/:id/read', notificationController.markAsRead);

export default router;
