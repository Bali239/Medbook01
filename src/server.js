import app from './app.js';
import { env } from './config/env.js';
import connectDB from './database/connection.js';
import { StripeWebhookWorker } from './modules/payments/stripe-webhook.worker.js';
import { cleanupExpiredHolds } from './jobs/cleanupHolds.js';
import { startAppointmentReminderJob } from './jobs/appointmentReminders.js';

const PORT = env.PORT;

const startServer = async () => {
  await connectDB();
  new StripeWebhookWorker().start();
  void cleanupExpiredHolds();
  startAppointmentReminderJob();
  const holdCleanupTimer = setInterval(() => void cleanupExpiredHolds(), 60_000);
  holdCleanupTimer.unref?.();

  app.listen(PORT, () => {
    console.log(`API server running on port ${PORT}`);
  });
};

startServer().catch((error) => {
  console.error('Unable to start API server', error);
  process.exit(1);
});
