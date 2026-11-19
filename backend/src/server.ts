import type { Server } from 'node:http';
import { app } from './app.js';
import { loadEnvironment } from './config/env.js';
import { disconnectDatabase } from './infrastructure/database/client.js';
import { closeCartCaches } from './modules/cart/cart.cache.js';

let server: Server | undefined;

try {
  const environment = loadEnvironment();
  if (!environment.databaseUrl) {
    throw new Error(
      'DATABASE_URL is required to start the backend server. Copy backend/.env.example to backend/.env.',
    );
  }
  if (!environment.jwtAccessSecret) {
    throw new Error(
      'JWT_ACCESS_SECRET must be set to at least 32 characters before starting the API server.',
    );
  }
  server = app.listen(environment.port, () => {
    console.log(JSON.stringify({ level: 'info', event: 'server_started', port: environment.port }));
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 31_000;

  const shutdown = (signal: NodeJS.Signals): void => {
    console.log(JSON.stringify({ level: 'info', event: 'server_shutdown_started', signal }));
    server?.close(async (error?: Error) => {
      await closeCartCaches();
      await disconnectDatabase();
      if (error) {
        console.error(JSON.stringify({ level: 'error', event: 'server_shutdown_failed' }));
        process.exitCode = 1;
      }
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  server.on('error', () => {
    console.error(JSON.stringify({ level: 'error', event: 'server_start_failed' }));
    process.exitCode = 1;
  });
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : 'Invalid server configuration.');
  process.exitCode = 1;
}
