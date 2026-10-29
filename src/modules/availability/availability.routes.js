import { Router } from 'express';
import { AvailabilityController } from './availability.controller.js';
import { protect } from '../../middleware/auth.js';
import { restrictTo } from '../../middleware/auth.js';

const router = Router();
const availabilityController = new AvailabilityController();

router.get('/:doctorId', availabilityController.getAvailability);
router.post('/', protect, restrictTo('doctor'), availabilityController.setAvailability);

export default router;
