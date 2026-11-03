import mongoose from 'mongoose';

const policySchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 120 },
    type: { type: String, enum: ['booking', 'cancellation_refund', 'privacy', 'terms', 'notifications', 'custom'], default: 'custom' },
    summary: { type: String, trim: true, maxlength: 500 },
    content: { type: String, required: true, trim: true, maxlength: 50000 },
    isPublished: { type: Boolean, default: false },
    version: { type: Number, default: 1, min: 1 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

const Policy = mongoose.model('Policy', policySchema);

export default Policy;
