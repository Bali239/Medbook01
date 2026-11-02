import { Router } from 'express';
import Language from '../../models/Language.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const languages = await Language.find({ isActive: true })
      .select('name slug')
      .sort({ sortOrder: 1, name: 1 })
      .lean();
    res.json({ success: true, data: languages, message: 'Languages retrieved successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
