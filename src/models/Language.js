import mongoose from 'mongoose';

const languageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 100 },
    sortOrder: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

languageSchema.index({ slug: 1 }, { unique: true });
languageSchema.index({ isActive: 1, sortOrder: 1, name: 1 });

const Language = mongoose.model('Language', languageSchema);

export default Language;
