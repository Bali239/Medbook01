import { Router } from 'express';
import { protect, restrictTo } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { PatientProfileController } from './patient-profile.controller.js';
import { patientProfileSchema } from './patient-profile.schema.js';

const router = Router();
const controller = new PatientProfileController();

router.use(protect, restrictTo('patient'));
router.get('/me/profile', controller.getMyProfile);
router.post('/me/profile/image-signature', controller.getImageUploadSignature);
router.delete('/me/profile/image', controller.removeProfilePicture);
router.put('/me/profile', validate(patientProfileSchema), controller.createOrUpdate);

export default router;
