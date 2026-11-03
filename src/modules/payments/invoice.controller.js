import { catchAsync } from '../../utils/catchAsync.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { InvoiceService } from './invoice.service.js';

const invoiceService = new InvoiceService();

export class InvoiceController {
  list = catchAsync(async (req, res) => {
    const result = await invoiceService.list(req.user, req.query);
    ApiResponse.success(res, result, 'Receipts retrieved');
  });

  getById = catchAsync(async (req, res) => {
    const result = await invoiceService.getById(req.params.invoiceId, req.user);
    ApiResponse.success(res, result, 'Receipt retrieved');
  });

  download = catchAsync(async (req, res) => {
    const { invoice, pdf } = await invoiceService.download(req.params.invoiceId, req.user);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${invoice.invoiceNumber}.pdf"`,
      'Content-Length': String(pdf.length),
      'Cache-Control': 'private, no-store',
    });
    res.send(pdf);
  });
}