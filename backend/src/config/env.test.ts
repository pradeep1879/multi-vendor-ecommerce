import { describe, expect, test } from 'bun:test';
import { loadEnvironment } from './env';

describe('loadEnvironment', () => {
  test('uses safe local defaults', () => expect(loadEnvironment({}).port).toBe(3000));
  test('rejects invalid ports clearly', () =>
    expect(() => loadEnvironment({ PORT: 'bad' })).toThrow('Invalid PORT'));
  test('normalizes CORS origins and rejects malformed entries', () => {
    expect(loadEnvironment({ CORS_ORIGINS: 'https://shop.example' }).corsOrigins).toEqual([
      'https://shop.example',
      'http://localhost:5173',
    ]);
    expect(() => loadEnvironment({ CORS_ORIGINS: 'javascript:alert(1)' })).toThrow(
      'Invalid CORS_ORIGINS',
    );
  });
  test('rejects malformed request body limits', () => {
    expect(() => loadEnvironment({ JSON_BODY_LIMIT: 'unlimited' })).toThrow(
      'Invalid backend environment',
    );
  });
  test('keeps payment processing disabled unless explicitly configured', () => {
    expect(loadEnvironment({}).paymentProvider).toBe('disabled');
    expect(() => loadEnvironment({ PAYMENT_PROVIDER: 'test' })).toThrow('PAYMENT_TEST_SECRET');
    expect(() =>
      loadEnvironment({
        NODE_ENV: 'production',
        PAYMENT_PROVIDER: 'test',
        PAYMENT_TEST_SECRET: 'a-local-test-secret-longer-than-32-characters',
      }),
    ).toThrow('cannot be enabled in production');
    expect(() =>
      loadEnvironment({
        PAYMENT_PROVIDER: 'razorpay',
        PAYMENT_KEY_ID: 'rzp_live_key',
        PAYMENT_KEY_SECRET: 'test-secret-with-more-than-32-characters',
        PAYMENT_WEBHOOK_SECRET: 'test-webhook-secret-with-more-than-32-characters',
      }),
    ).toThrow('Only Razorpay test-mode');
  });
});
