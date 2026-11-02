import app from './app.js';
import { env } from './config/env.js';
import connectDB from './database/connection.js';
import { seedSpecialties } from './database/seedSpecialties.js';
import { seedRegistrationAuthorities } from './database/seedRegistrationAuthorities.js';
import { seedLanguages } from './database/seedLanguages.js';

const PORT = env.PORT;

connectDB().then(async () => {
  await seedSpecialties();
  await seedRegistrationAuthorities();
  await seedLanguages();
});

app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});
