import mongoose from 'mongoose';

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true, trim: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true, index: true },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true, unique: true },
    patientName: { type: String, required: true, trim: true },
    patientEmail: { type: String, required: true, lowercase: true, trim: true },
    doctorName: { type: String, required: true, trim: true },
    doctorSpecialty: { type: String, trim: true },
    appointmentStartAt: { type: Date, required: true },
    appointmentTimeZone: { type: String, required: true },
    description: { type: String, required: true, trim: true },
    consultationFeePaisa: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    fxRateScaled: { type: String, required: true, match: /^\d+$/ },
    fxRateScale: { type: Number, required: true, min: 1 },
    fxProvider: { type: String, required: true },
    amountMinor: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    currency: { type: String, required: true, lowercase: true, enum: ['usd'] },
    taxMinor: { type: Number, required: true, min: 0, default: 0, validate: Number.isSafeInteger },
    totalMinor: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    paymentStatus: { type: String, enum: ['paid', 'refunded', 'partially_refunded'], default: 'paid' },
    paymentIntentReference: { type: String, required: true, trim: true },
    paidAt: { type: Date, required: true },
    issuedAt: { type: Date, default: Date.now, required: true },
    documentLocation: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

invoiceSchema.index({ patient: 1, issuedAt: -1 });

const Invoice = mongoose.model('Invoice', invoiceSchema);

export default Invoice;