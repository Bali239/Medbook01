import app from './app.js';
import { env } from './config/env.js';
import connectDB from './database/connection.js';
import { seedSpecialties } from './database/seedSpecialties.js';
import { seedRegistrationAuthorities } from './database/seedRegistrationAuthorities.js';
import { seedLanguages } from './database/seedLanguages.js';
import { StripeWebhookWorker } from './modules/payments/stripe-webhook.worker.js';
import { cleanupExpiredHolds } from './jobs/cleanupHolds.js';

const PORT = env.PORT;

connectDB().then(async () => {
  await seedSpecialties();
  await seedRegistrationAuthorities();
  await seedLanguages();
  new StripeWebhookWorker().start();
  void cleanupExpiredHolds();
  const holdCleanupTimer = setInterval(() => void cleanupExpiredHolds(), 60_000);
  holdCleanupTimer.unref?.();
});

app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});
