import { Router } from 'express';
import { AppointmentController } from './appointment.controller.js';
import { protect } from '../../middleware/auth.js';

const router = Router();
const appointmentController = new AppointmentController();

router.post('/hold', protect, appointmentController.holdSlot);

export default router;
