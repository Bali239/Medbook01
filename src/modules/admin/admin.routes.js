import { Router } from 'express';
import { AdminController } from './admin.controller.js';
import { protect } from '../../middleware/auth.js';
import { restrictTo } from '../../middleware/auth.js';

const router = Router();
const adminController = new AdminController();

router.use(protect, restrictTo('admin'));

router.get('/stats', adminController.getStats);
router.get('/users', adminController.getUsers);
router.get('/doctors', adminController.getDoctors);
router.get('/appointments', adminController.getAppointments);
router.get('/appointments/:appointmentId', adminController.getAppointment);
router.get('/audit-logs', adminController.getAuditLogs);

export default router;
