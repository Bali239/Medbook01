import mongoose from 'mongoose';

const platformSettingSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: 'platform' },
    defaultAppointmentDurationMinutes: { type: Number, enum: [15, 30, 60], default: 30 },
    cancellationRefundHours: { type: Number, min: 0, max: 720, default: 24 },
    notificationsEnabled: { type: Boolean, default: true },
    maintenanceMode: { type: Boolean, default: false },
    supportEmail: { type: String, trim: true, lowercase: true, maxlength: 254 },
  },
  { timestamps: true },
);

const PlatformSetting = mongoose.model('PlatformSetting', platformSettingSchema);

export default PlatformSetting;
