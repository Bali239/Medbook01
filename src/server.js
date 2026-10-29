import app from './app.js';
import { env } from './config/env.js';
import connectDB from './database/connection.js';

const PORT = env.PORT;

connectDB();

app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});
