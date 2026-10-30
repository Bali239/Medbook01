import { Router } from 'express';
import { protect, restrictTo } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { DoctorApplicationController } from './doctor-application.controller.js';
import {
  doctorApplicationAdminAssetSchema,
  doctorApplicationAdminReviewSchema,
  doctorApplicationIdSchema,
  doctorApplicationListSchema,
} from './doctor-application.schema.js';

const router = Router();
const controller = new DoctorApplicationController();

router.use(protect, restrictTo('admin'));
router.get('/', validate(doctorApplicationListSchema), controller.listForAdmin);
router.get('/:id/assets/:publicId', validate(doctorApplicationAdminAssetSchema), controller.getAdminPrivateAsset);
router.get('/:id', validate(doctorApplicationIdSchema), controller.getForAdmin);
router.patch('/:id/review', validate(doctorApplicationAdminReviewSchema), controller.review);

export default router;