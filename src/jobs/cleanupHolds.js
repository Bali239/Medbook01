import mongoose from 'mongoose';
import Appointment from '../models/Appointment.js';
import SlotHold from '../models/SlotHold.js';

export const cleanupExpiredHolds = async () => {
  const now = new Date();
  const session = await mongoose.startSession();
  try {
    let expiredCount = 0;
    await session.withTransaction(async () => {
      const expiredHolds = await SlotHold.find({ expiresAt: { $lte: now } })
        .select('_id appointment')
        .session(session);
      const holdIds = expiredHolds.map((hold) => hold._id);
      const appointmentIds = expiredHolds.map((hold) => hold.appointment).filter(Boolean);

      if (appointmentIds.length) {
        await Appointment.updateMany(
          { _id: { $in: appointmentIds }, status: 'pending_payment', holdExpiresAt: { $lte: now } },
          { $set: { status: 'expired' } },
          { session },
        );
      }
      const result = await SlotHold.deleteMany({ _id: { $in: holdIds }, expiresAt: { $lte: now } }, { session });
      expiredCount = result.deletedCount;
    });
    return expiredCount;
  } catch (error) {
    console.error('Expired booking cleanup failed', { code: error.code || 'cleanup_failed' });
    throw error;
  } finally {
    await session.endSession();
  }
};
