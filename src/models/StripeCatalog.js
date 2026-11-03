import mongoose from 'mongoose';

const stripeCatalogSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, enum: ['consultation'], unique: true },
    stripeProductId: { type: String, required: true, trim: true },
    generation: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
  },
  { timestamps: true },
);

const StripeCatalog = mongoose.model('StripeCatalog', stripeCatalogSchema);

export default StripeCatalog;