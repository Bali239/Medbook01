import { Router } from 'express';
import { AppointmentController } from './appointment.controller.js';
import { protect } from '../../middleware/auth.js';
import { restrictTo } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { cancelAppointmentSchema, listDoctorAppointmentsSchema, updateAppointmentStatusSchema } from './appointment-lifecycle.schema.js';

const router = Router();
const appointmentController = new AppointmentController();

router.patch('/:appointmentId/status', protect, restrictTo('doctor'), validate(updateAppointmentStatusSchema), appointmentController.updateStatus);
router.post('/:appointmentId/cancel', protect, restrictTo('patient', 'doctor', 'admin'), validate(cancelAppointmentSchema), appointmentController.cancel);
router.get('/doctor/me', protect, restrictTo('doctor'), validate(listDoctorAppointmentsSchema), appointmentController.listForDoctor);

export default router;
