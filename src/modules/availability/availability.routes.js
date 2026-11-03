import { Router } from 'express';
import { AvailabilityController } from './availability.controller.js';
import { protect } from '../../middleware/auth.js';
import { restrictTo } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { z } from 'zod';
import { setAvailabilitySchema } from './availability.schema.js';

const router = Router();
const availabilityController = new AvailabilityController();
const slotsRequest = {
	params: z.object({ doctorId: z.string().regex(/^[a-f\d]{24}$/i) }),
	query: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
};

router.get('/:doctorId/slots', validate(slotsRequest), availabilityController.getSlots);
router.get('/:doctorId', availabilityController.getAvailability);
router.post('/', protect, restrictTo('doctor'), validate(setAvailabilitySchema), availabilityController.setAvailability);

export default router;
