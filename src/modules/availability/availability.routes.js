import { Router } from 'express';
import { protect } from '../../middleware/auth.js';
import { restrictTo } from '../../middleware/auth.js';

const router = Router();

router.get('/:doctorId/slots', (req, res) => {
  res.json({ success: true, data: [], message: 'Slots endpoint ready' });
});

router.post('/', protect, restrictTo('doctor'), (req, res) => {
  res.json({ success: true, message: 'Availability endpoint ready' });
});

export default router;
