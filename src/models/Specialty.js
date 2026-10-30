import mongoose from 'mongoose';

const specialtySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 500 },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0, min: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

specialtySchema.index({ slug: 1 }, { unique: true });
specialtySchema.index({ isActive: 1, sortOrder: 1, name: 1 });

const Specialty = mongoose.model('Specialty', specialtySchema);

export default Specialty;