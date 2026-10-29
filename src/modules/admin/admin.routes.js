import { Router } from 'express';
import { AdminController } from './admin.controller.js';
import { protect } from '../../middleware/auth.js';
import { restrictTo } from '../../middleware/auth.js';

const router = Router();
const adminController = new AdminController();

router.use(protect, restrictTo('admin'));

router.patch('/doctors/:id/approve', adminController.approveDoctor);
router.patch('/doctors/:id/reject', adminController.rejectDoctor);

export default router;
