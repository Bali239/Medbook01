import SlotHold from '../models/SlotHold.js';

export const cleanupExpiredHolds = async () => {
  try {
    const result = await SlotHold.deleteMany({
      expiresAt: { $lt: new Date() },
    });
    console.log(`Cleaned up ${result.deletedCount} expired slot holds`);
  } catch (error) {
    console.error('Error cleaning up expired holds:', error);
  }
};
