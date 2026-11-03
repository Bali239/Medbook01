import PDFDocument from 'pdfkit';
import { ForbiddenError, NotFoundError } from '../../errors/AppError.js';
import Appointment from '../../models/Appointment.js';
import Invoice from '../../models/Invoice.js';
import PatientProfile from '../../models/PatientProfile.js';
import Payment from '../../models/Payment.js';
import User from '../../models/User.js';

const invoiceNumberFor = (payment, issuedAt) => (
  `MB-${issuedAt.getUTCFullYear()}-${String(payment._id).slice(-12).toUpperCase()}`
);

const money = (minor, currency) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: currency.toUpperCase(),
}).formatToParts(0).find((part) => part.type === 'currency')?.value
  + `${BigInt(minor) / 100n}.${String(BigInt(minor) % 100n).padStart(2, '0')}`;

const streamPdf = (invoice) => new Promise((resolve, reject) => {
  const document = new PDFDocument({ size: 'A4', margin: 52, info: { Title: `Receipt ${invoice.invoiceNumber}` } });
  const chunks = [];
  document.on('data', (chunk) => chunks.push(chunk));
  document.on('end', () => resolve(Buffer.concat(chunks)));
  document.on('error', reject);

  document.fontSize(22).font('Helvetica-Bold').text('MedBook payment receipt');
  document.moveDown(0.5).fontSize(11).font('Helvetica');
  document.text(`Receipt number: ${invoice.invoiceNumber}`);
  document.text(`Issued: ${invoice.issuedAt.toISOString().slice(0, 10)}`);
  document.text(`Payment date: ${invoice.paidAt.toISOString().slice(0, 10)}`);
  document.moveDown();
  document.font('Helvetica-Bold').text('Patient');
  document.font('Helvetica').text(invoice.patientName).text(invoice.patientEmail);
  document.moveDown();
  document.font('Helvetica-Bold').text('Consultation');
  document.font('Helvetica').text(invoice.description);
  document.text(`Doctor: ${invoice.doctorName}${invoice.doctorSpecialty ? `, ${invoice.doctorSpecialty}` : ''}`);
  document.text(`Appointment: ${new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: invoice.appointmentTimeZone,
  }).format(invoice.appointmentStartAt)} (${invoice.appointmentTimeZone})`);
  document.moveDown();
  document.text(`Consultation fee: ${money(invoice.consultationFeePaisa, 'pkr')}`);
  document.text(`Amount paid: ${money(invoice.totalMinor, invoice.currency)}`);
  document.text(`Tax: ${money(invoice.taxMinor, invoice.currency)}`);
  document.text(`Payment reference: ${invoice.paymentIntentReference}`);
  document.text(`Payment status: ${invoice.paymentStatus}`);
  document.moveDown(2).fontSize(9).fillColor('#52627A')
    .text('This receipt records a payment for an appointment. It is not a tax invoice. No tax was calculated.');
  document.end();
});

export class InvoiceService {
  constructor({ invoiceModel = Invoice, paymentModel = Payment, appointmentModel = Appointment, userModel = User, patientProfileModel = PatientProfile } = {}) {
    this.invoiceModel = invoiceModel;
    this.paymentModel = paymentModel;
    this.appointmentModel = appointmentModel;
    this.userModel = userModel;
    this.patientProfileModel = patientProfileModel;
  }

  async createForSuccessfulPayment(paymentId) {
    const payment = await this.paymentModel.findOne({ _id: paymentId, status: { $in: ['succeeded', 'partially_refunded', 'refunded'] } });
    if (!payment || !payment.stripePaymentIntentId || !payment.pricingSnapshot) {
      throw new NotFoundError('Paid payment details are not ready for a receipt.');
    }
    const [appointment, patient, patientProfile] = await Promise.all([
      this.appointmentModel.findById(payment.appointment),
      this.userModel.findById(payment.patient).select('name email'),
      this.patientProfileModel.findOne({ user: payment.patient }),
    ]);
    if (!appointment || !patient) throw new NotFoundError('Receipt details were not found.');

    const issuedAt = new Date();
    const snapshot = payment.pricingSnapshot;
    const invoiceNumber = invoiceNumberFor(payment, issuedAt);
    const invoice = await this.invoiceModel.findOneAndUpdate(
      { payment: payment._id },
      {
        $setOnInsert: {
          invoiceNumber,
          patient: payment.patient,
          doctor: payment.doctor,
          appointment: appointment._id,
          payment: payment._id,
          patientName: `${patientProfile?.firstName || ''} ${patientProfile?.lastName || ''}`.trim() || patient.name,
          patientEmail: patient.email,
          doctorName: appointment.doctorSnapshot?.name || 'Doctor',
          doctorSpecialty: appointment.doctorSnapshot?.specialty || '',
          appointmentStartAt: appointment.appointmentStartAt,
          appointmentTimeZone: appointment.doctorSnapshot?.clinicTimeZone || 'UTC',
          description: 'In-person medical consultation appointment',
          consultationFeePaisa: snapshot.doctorFeePaisa,
          fxRateScaled: snapshot.fxRateScaled,
          fxRateScale: snapshot.fxRateScale,
          fxProvider: snapshot.fxProvider,
          amountMinor: snapshot.amountMinor,
          currency: snapshot.currency,
          taxMinor: snapshot.taxMinor,
          totalMinor: snapshot.amountMinor + snapshot.taxMinor + snapshot.additionalChargesMinor - snapshot.discountMinor,
          paymentStatus: 'paid',
          paymentIntentReference: payment.stripePaymentIntentId,
          paidAt: payment.updatedAt || new Date(),
          issuedAt,
          documentLocation: `/api/invoices/${invoiceNumber}/download`,
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );
    const documentLocation = `/api/invoices/${invoice._id}/download`;
    if (invoice.documentLocation !== documentLocation) {
      invoice.documentLocation = documentLocation;
      await invoice.save();
    }
    return invoice;
  }

  async getById(invoiceId, actor) {
    const query = { _id: invoiceId };
    if (actor.role !== 'admin') query.patient = actor.id;
    const invoice = await this.invoiceModel.findOne(query);
    if (!invoice) throw new NotFoundError('Receipt not found.');
    return invoice;
  }

  async list(actor, { page = 1, limit = 20 } = {}) {
    const filter = actor.role === 'admin' ? {} : { patient: actor.id };
    const [invoices, total] = await Promise.all([
      this.invoiceModel.find(filter).sort({ issuedAt: -1 }).skip((page - 1) * limit).limit(limit),
      this.invoiceModel.countDocuments(filter),
    ]);
    return { invoices, total, page, limit };
  }

  async download(invoiceId, actor) {
    const invoice = await this.getById(invoiceId, actor);
    if (actor.role !== 'admin' && String(invoice.patient) !== String(actor.id)) {
      throw new ForbiddenError('You cannot access this receipt.');
    }
    return { invoice, pdf: await streamPdf(invoice) };
  }
}
