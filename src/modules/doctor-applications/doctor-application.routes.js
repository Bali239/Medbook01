import { Router } from 'express';
import { protect, restrictTo } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { DoctorApplicationController } from './doctor-application.controller.js';
import {
  doctorApplicationDraftSchema,
  doctorApplicationPrivateAssetSchema,
  doctorApplicationSubmitSchema,
  doctorApplicationUploadConfirmSchema,
  doctorApplicationUploadSignatureSchema,
} from './doctor-application.schema.js';

const router = Router();
const controller = new DoctorApplicationController();

router.use(protect, restrictTo('doctor'));
router.get('/me/status', controller.getStatus);
router.get('/me', controller.getMine);
router.put('/me/draft', validate(doctorApplicationDraftSchema), controller.saveDraft);
router.post('/me/submit', validate(doctorApplicationSubmitSchema), controller.submit);
router.post('/me/assets/signature', validate(doctorApplicationUploadSignatureSchema), controller.createUploadSignature);
router.post('/me/assets/confirm', validate(doctorApplicationUploadConfirmSchema), controller.confirmUpload);
router.get('/me/assets/:publicId', validate(doctorApplicationPrivateAssetSchema), controller.getMyPrivateAsset);

export default router;