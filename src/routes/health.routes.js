import { Router } from 'express';
import mongoose from 'mongoose';

const router = Router();

router.get('/', (req, res) => {
  const databaseReady = mongoose.connection.readyState === 1;
  res.status(databaseReady ? 200 : 503).json({
    success: databaseReady,
    status: databaseReady ? 'ok' : 'starting',
    service: 'api',
    timestamp: new Date().toISOString(),
  });
});

export default router;
