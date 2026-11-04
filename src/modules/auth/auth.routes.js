import { Router } from 'express';
import { AuthController } from './auth.controller.js';
import { validate } from '../../middleware/validate.js';
import { registerSchema, loginSchema, completeGoogleLoginSchema } from './auth.schema.js';
import { protect } from '../../middleware/auth.js';

const router = Router();
const authController = new AuthController();

router.get('/google', authController.googleStart);
router.get('/google/callback', authController.googleCallback);
router.get('/gmail/authorize', authController.gmailAuthorize);
router.get('/gmail/callback', authController.gmailCallback);

router.post('/register', validate(registerSchema), authController.register);
router.post('/login', validate(loginSchema), authController.login);
router.post('/google/complete', validate(completeGoogleLoginSchema), authController.completeGoogleLogin);
router.post('/verify-email', authController.verifyEmail);
router.post('/request-password-reset', authController.requestPasswordReset);
router.post('/reset-password', authController.resetPassword);
router.get('/me', protect, authController.getMe);
router.post('/logout', protect, authController.logout);

export default router;
