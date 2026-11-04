import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import healthRoutes from '../src/routes/health.routes.js';

test('health endpoint stays unavailable until MongoDB is connected', async () => {
  const app = express();
  app.use('/health', healthRoutes);
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.equal(body.success, false);
    assert.equal(body.status, 'starting');
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});
