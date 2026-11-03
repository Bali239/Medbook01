import { Router } from 'express';
import { z } from 'zod';
import { protect, restrictTo } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { InvoiceController } from './invoice.controller.js';
import { paginationSchema } from './payment.schema.js';

const router = Router();
const invoiceController = new InvoiceController();
const invoiceIdParams = { params: z.object({ invoiceId: z.string().regex(/^[a-f\d]{24}$/i) }) };

router.use(protect, restrictTo('patient', 'admin'));
router.get('/', validate(paginationSchema), invoiceController.list);
router.get('/:invoiceId/download', validate(invoiceIdParams), invoiceController.download);
router.get('/:invoiceId', validate(invoiceIdParams), invoiceController.getById);

export default router;