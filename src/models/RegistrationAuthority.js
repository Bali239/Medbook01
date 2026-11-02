import mongoose from 'mongoose';

const registrationAuthoritySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 180 },
    sortOrder: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

registrationAuthoritySchema.index({ slug: 1 }, { unique: true });
registrationAuthoritySchema.index({ isActive: 1, sortOrder: 1, name: 1 });

const RegistrationAuthority = mongoose.model('RegistrationAuthority', registrationAuthoritySchema);

export default RegistrationAuthority;
