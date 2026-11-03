import { Router } from 'express';
import { AppointmentController } from './appointment.controller.js';
import { protect } from '../../middleware/auth.js';
import { restrictTo } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { cancelAppointmentSchema } from './appointment-lifecycle.schema.js';

const router = Router();
const appointmentController = new AppointmentController();

router.post('/:appointmentId/cancel', protect, restrictTo('patient', 'doctor', 'admin'), validate(cancelAppointmentSchema), appointmentController.cancel);

export default router;
