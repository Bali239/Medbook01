import { Router } from 'express';
import { DoctorProfileController } from './doctor-profile.controller.js';
import { protect } from '../../middleware/auth.js';
import { restrictTo } from '../../middleware/auth.js';

const router = Router();
const doctorProfileController = new DoctorProfileController();

router.get('/', doctorProfileController.getAll);
router.post('/', protect, restrictTo('doctor'), doctorProfileController.createOrUpdate);
router.get('/me/profile', protect, restrictTo('doctor'), doctorProfileController.getMyProfile);
router.get('/:id', doctorProfileController.getPublicProfile);

export default router;
