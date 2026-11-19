import { afterEach, describe, expect, test } from 'bun:test';
import { loadEnvironment } from '../../config/env.js';
import { AuthEmailSender } from './email.adapter.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('auth email delivery', () => {
  test('sends reset links through Resend without exposing delivery credentials', async () => {
    const environment = loadEnvironment({
      NODE_ENV: 'test',
      FRONTEND_URL: 'https://shop.example.test',
      RESEND_API_KEY: 'resend-test-key',
      AUTH_EMAIL_FROM: 'Shop <accounts@example.test>',
    });
    let request: RequestInit | undefined;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      request = init;
      return new Response(null, { status: 202 });
    }) as typeof fetch;

    await new AuthEmailSender(environment).send({
      recipient: 'buyer@example.test',
      purpose: 'PASSWORD_RESET',
      token: 'opaque-reset-token',
    });

    expect(request?.headers).toMatchObject({ Authorization: 'Bearer resend-test-key' });
    expect(JSON.parse(String(request?.body))).toMatchObject({
      to: ['buyer@example.test'],
      subject: 'Reset your password',
      text: 'Use this link to reset your password: https://shop.example.test/reset-password?token=opaque-reset-token',
    });
  });

  test('fails clearly when no delivery provider is configured', async () => {
    const sender = new AuthEmailSender(loadEnvironment({ NODE_ENV: 'production' }));
    await expect(
      sender.send({
        recipient: 'buyer@example.test',
        purpose: 'EMAIL_VERIFICATION',
        token: 'token',
      }),
    ).rejects.toMatchObject({ code: 'EMAIL_UNAVAILABLE', statusCode: 503 });
  });
});
