import { Router } from 'express';
import { DoctorProfileController } from './doctor-profile.controller.js';
import { protect } from '../../middleware/auth.js';
import { restrictTo } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { bookingSettingsSchema } from './doctor-booking-settings.schema.js';

const router = Router();
const doctorProfileController = new DoctorProfileController();

router.get('/', doctorProfileController.getAll);
router.get('/me/profile', protect, restrictTo('doctor'), doctorProfileController.getMyProfile);
router.put('/me/booking-settings', protect, restrictTo('doctor'), validate(bookingSettingsSchema), doctorProfileController.updateBookingSettings);
router.get('/:id', doctorProfileController.getPublicProfile);

export default router;
