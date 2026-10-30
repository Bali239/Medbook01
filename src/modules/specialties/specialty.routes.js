import { Router } from 'express';
import { protect, restrictTo } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { SpecialtyController } from './specialty.controller.js';
import { createSpecialtySchema, updateSpecialtySchema } from './specialty.schema.js';

const router = Router();
const controller = new SpecialtyController();

router.get('/', controller.listActive);
router.get('/admin', protect, restrictTo('admin'), controller.listAll);
router.post('/', protect, restrictTo('admin'), validate(createSpecialtySchema), controller.create);
router.patch('/:id', protect, restrictTo('admin'), validate(updateSpecialtySchema), controller.update);

export default router;