import { Router } from 'express';
import { AdminController } from './admin.controller.js';
import { protect } from '../../middleware/auth.js';
import { restrictTo } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { refundRequestDecisionSchema } from '../appointments/appointment-lifecycle.schema.js';

const router = Router();
const adminController = new AdminController();

router.use(protect, restrictTo('admin'));

router.get('/stats', adminController.getStats);
router.get('/settings', adminController.getSettings);
router.put('/settings', adminController.updateSettings);
router.get('/policies', adminController.getPolicies);
router.post('/policies', adminController.createPolicy);
router.patch('/policies/:policyId', adminController.updatePolicy);
router.delete('/policies/:policyId', adminController.deletePolicy);
router.get('/users', adminController.getUsers);
router.get('/doctors', adminController.getDoctors);
router.get('/appointments', adminController.getAppointments);
router.get('/appointments/:appointmentId', adminController.getAppointment);
router.get('/audit-logs', adminController.getAuditLogs);
router.get('/refund-requests', adminController.getRefundRequests);
router.post('/refund-requests/:requestId/decision', validate(refundRequestDecisionSchema), adminController.adminRefundDecision);

export default router;
