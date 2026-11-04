import mongoose from 'mongoose';
import connectDB from './connection.js';
import { seedSpecialties } from './seedSpecialties.js';
import { seedRegistrationAuthorities } from './seedRegistrationAuthorities.js';
import { seedLanguages } from './seedLanguages.js';

try {
  await connectDB();

  if (mongoose.connection.readyState !== 1) {
    throw new Error('Database seeding requires a successful MongoDB connection.');
  }

  await seedSpecialties();
  await seedRegistrationAuthorities();
  await seedLanguages();

  console.log('Database seed completed.');
} catch (error) {
  console.error(`Database seed failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
