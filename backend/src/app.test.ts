import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Server } from 'node:http';
import { Router } from 'express';
import { z } from 'zod';
import { createApp } from './app.js';
import { loadEnvironment } from './config/env.js';
import { sendData } from './common/middleware/response.js';
import { validateRequest } from './common/validation/validate-request.js';

const router = Router();
router.post(
  '/echo',
  validateRequest({ body: z.object({ value: z.string().min(1) }).strict() }),
  (_request, response) => sendData(response, response.locals.validated),
);
router.get('/unexpected', (_request, _response, next) =>
  next(new Error('private database detail')),
);

let databaseAvailable = true;
const testApp = createApp(
  router,
  loadEnvironment({ NODE_ENV: 'test', RATE_LIMIT_MAX: '50' }),
  async () => {
    if (!databaseAvailable) throw new Error('private connection details');
  },
);
let server: Server;
let baseUrl = '';

beforeAll(async () => {
  server = testApp.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Test server failed to bind a TCP port.');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (server?.listening)
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
});

describe('Express API foundation', () => {
  test('can be imported and exposes health and versioned success envelopes', async () => {
    const health = await fetch(`${baseUrl}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok', service: 'marketplace-api' });
    expect(health.headers.get('x-content-type-options')).toBe('nosniff');
    expect(health.headers.get('x-powered-by')).toBeNull();

    const version = await fetch(`${baseUrl}/api/v1`);
    expect(version.status).toBe(200);
    expect(await version.json()).toEqual({
      data: { service: 'marketplace-api', version: 'v1' },
    });
  });

  test('readiness reflects database availability without exposing connection errors', async () => {
    const ready = await fetch(`${baseUrl}/health/ready`);
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({ status: 'ready', dependencies: { database: 'ok' } });

    databaseAvailable = false;
    const unavailable = await fetch(`${baseUrl}/health/ready`);
    const body = await unavailable.text();
    databaseAvailable = true;
    expect(unavailable.status).toBe(503);
    expect(body).toContain('DEPENDENCY_UNAVAILABLE');
    expect(body).not.toContain('private connection details');
  });

  test('returns request IDs and consistent validation errors', async () => {
    const response = await fetch(`${baseUrl}/api/v1/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: '' }),
    });
    const requestId = response.headers.get('x-request-id');
    const payload = (await response.json()) as {
      error: { code: string; requestId: string; details: { field: string }[] };
    };
    expect(response.status).toBe(400);
    expect(requestId).toBe(payload.error.requestId);
    expect(payload.error.code).toBe('VALIDATION_ERROR');
    expect(payload.error.details[0]?.field).toBe('body.value');
  });

  test('uses a consistent 404 and hides unexpected error details', async () => {
    const missing = await fetch(`${baseUrl}/api/v1/missing`);
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { error: { code: string } }).error.code).toBe('NOT_FOUND');

    const failed = await fetch(`${baseUrl}/api/v1/unexpected`);
    const body = await failed.text();
    expect(failed.status).toBe(500);
    expect(body).toContain('INTERNAL_ERROR');
    expect(body).not.toContain('private database detail');
  });

  test('rejects origins outside the CORS allowlist', async () => {
    const response = await fetch(`${baseUrl}/api/v1`, {
      headers: { origin: 'https://attacker.example' },
    });
    expect(response.status).toBe(403);
  });
});
