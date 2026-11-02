import { Router } from 'express';
import RegistrationAuthority from '../../models/RegistrationAuthority.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const authorities = await RegistrationAuthority.find({ isActive: true })
      .select('name slug')
      .sort({ sortOrder: 1, name: 1 })
      .lean();
    res.json({ success: true, data: authorities, message: 'Registration authorities retrieved successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
