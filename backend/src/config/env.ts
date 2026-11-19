import { z } from 'zod';
import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';

// Resolve the backend env file from this module so startup works even when the
// process is launched from the repository root or by an IDE task runner.
loadDotenv({ path: fileURLToPath(new URL('../../.env.js', import.meta.url)), quiet: true });

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    CORS_ORIGINS: z.string().default('http://localhost:5173'),
    JSON_BODY_LIMIT: z
      .string()
      .regex(/^\d+(b|kb|mb)$/i)
      .default('100kb'),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
    DATABASE_URL: z.string().url().optional(),
    JWT_ACCESS_SECRET: z.string().min(32).optional(),
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    FRONTEND_URL: z.string().url().default('http://localhost:5173'),
    AUTH_EMAIL_DELIVERY: z.enum(['console']).optional(),
    RESEND_API_KEY: z.string().min(1).optional(),
    AUTH_EMAIL_FROM: z.string().trim().min(3).max(320).optional(),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(60).default(30),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1000).default(10),
    S3_ENDPOINT: z.string().url().optional(),
    S3_BUCKET: z.string().min(3).max(255).optional(),
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    S3_PUBLIC_BASE_URL: z.string().url().optional(),
    S3_PRESIGNED_UPLOAD_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
    S3_MAX_IMAGE_BYTES: z.coerce.number().int().min(1024).max(25_000_000).default(10_485_760),
    ELASTICSEARCH_URL: z.string().url().optional(),
    ELASTICSEARCH_API_KEY: z.string().min(1).optional(),
    REDIS_URL: z.string().url().optional(),
    REDIS_CART_TTL_SECONDS: z.coerce.number().int().min(60).max(2_592_000).default(86_400),
    PAYMENT_PROVIDER: z.enum(['disabled', 'test', 'razorpay']).optional(),
    PAYMENT_TEST_SECRET: z.string().min(32).optional(),
    PAYMENT_KEY_ID: z.string().min(1).optional(),
    PAYMENT_KEY_SECRET: z.string().min(1).optional(),
    PAYMENT_WEBHOOK_SECRET: z.string().min(32).optional(),
    // Support the names used by existing deployments while normalizing to PAYMENT_*.
    RAZORPAY_KEY_ID: z.string().min(1).optional(),
    RAZORPAY_KEY_SECRET: z.string().min(1).optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().min(32).optional(),
  })
  .superRefine((value, context) => {
    const paymentKeyId = value.PAYMENT_KEY_ID ?? value.RAZORPAY_KEY_ID;
    const paymentKeySecret = value.PAYMENT_KEY_SECRET ?? value.RAZORPAY_KEY_SECRET;
    const paymentWebhookSecret = value.PAYMENT_WEBHOOK_SECRET ?? value.RAZORPAY_WEBHOOK_SECRET;
    const paymentProvider =
      value.PAYMENT_PROVIDER ??
      (paymentKeyId || paymentKeySecret || paymentWebhookSecret ? 'razorpay' : 'disabled');
    const s3Values = [
      value.S3_ENDPOINT,
      value.S3_BUCKET,
      value.S3_ACCESS_KEY_ID,
      value.S3_SECRET_ACCESS_KEY,
      value.S3_PUBLIC_BASE_URL,
    ];
    const configuredCount = s3Values.filter(Boolean).length;
    if (configuredCount > 0 && configuredCount !== s3Values.length) {
      context.addIssue({
        code: 'custom',
        path: ['S3_ENDPOINT'],
        message:
          'S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, and S3_PUBLIC_BASE_URL must be configured together.',
      });
    }
    if (paymentProvider === 'test' && value.NODE_ENV === 'production') {
      context.addIssue({
        code: 'custom',
        path: ['PAYMENT_PROVIDER'],
        message: 'The local test payment adapter cannot be enabled in production.',
      });
    }
    if (paymentProvider === 'test' && !value.PAYMENT_TEST_SECRET) {
      context.addIssue({
        code: 'custom',
        path: ['PAYMENT_TEST_SECRET'],
        message: 'PAYMENT_TEST_SECRET is required when PAYMENT_PROVIDER=test.',
      });
    }
    if (
      paymentProvider === 'razorpay' &&
      (!paymentKeyId || !paymentKeySecret || !paymentWebhookSecret)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['PAYMENT_KEY_ID'],
        message:
          'Razorpay requires PAYMENT_KEY_ID, PAYMENT_KEY_SECRET, and PAYMENT_WEBHOOK_SECRET.',
      });
    }
    if (paymentProvider === 'razorpay' && paymentKeyId && !paymentKeyId.startsWith('rzp_test_')) {
      context.addIssue({
        code: 'custom',
        path: ['PAYMENT_KEY_ID'],
        message: 'Only Razorpay test-mode key IDs are accepted by this application.',
      });
    }
  });

export type Environment = {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  corsOrigins: string[];
  jsonBodyLimit: string;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  databaseUrl?: string;
  jwtAccessSecret?: string;
  googleClientId?: string;
  frontendUrl: string;
  authEmailDelivery?: 'console';
  resendApiKey?: string;
  authEmailFrom?: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
  passwordResetTtlMinutes: number;
  authRateLimitMax: number;
  s3?: {
    endpoint: string;
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    publicBaseUrl: string;
    presignedUploadTtlSeconds: number;
    maxImageBytes: number;
  };
  elasticsearch?: { url: string; apiKey?: string };
  redisUrl?: string;
  redisCartTtlSeconds: number;
  paymentProvider: 'disabled' | 'test' | 'razorpay';
  paymentTestSecret?: string;
  paymentKeyId?: string;
  paymentKeySecret?: string;
  paymentWebhookSecret?: string;
};

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  const parsed = environmentSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => {
        const name = issue.path.join('.') || 'environment';
        return name === 'PORT' ? `Invalid PORT: ${issue.message}` : `${name}: ${issue.message}`;
      })
      .join('; ');
    throw new Error(`Invalid backend environment: ${details}`);
  }

  const corsOrigins = parsed.data.CORS_ORIGINS.split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        throw new Error(`Invalid CORS_ORIGINS entry: ${value}`);
      }
      if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value.replace(/\/$/, '')) {
        throw new Error(`Invalid CORS_ORIGINS entry: ${value}; expected an HTTP(S) origin.`);
      }
      return url.origin;
    });
  // FRONTEND_URL is the canonical storefront origin. Include it automatically so
  // CORS and the trusted-origin checks cannot drift apart when only it is set.
  const frontendOrigin = new URL(parsed.data.FRONTEND_URL).origin;
  if (!['http:', 'https:'].includes(new URL(parsed.data.FRONTEND_URL).protocol)) {
    throw new Error('Invalid FRONTEND_URL: expected an HTTP(S) URL.');
  }
  if (!corsOrigins.includes(frontendOrigin)) corsOrigins.push(frontendOrigin);
  const paymentKeyId = parsed.data.PAYMENT_KEY_ID ?? parsed.data.RAZORPAY_KEY_ID;
  const paymentKeySecret = parsed.data.PAYMENT_KEY_SECRET ?? parsed.data.RAZORPAY_KEY_SECRET;
  const paymentWebhookSecret =
    parsed.data.PAYMENT_WEBHOOK_SECRET ?? parsed.data.RAZORPAY_WEBHOOK_SECRET;
  const paymentProvider =
    parsed.data.PAYMENT_PROVIDER ??
    (paymentKeyId || paymentKeySecret || paymentWebhookSecret ? 'razorpay' : 'disabled');

  return {
    nodeEnv: parsed.data.NODE_ENV,
    port: parsed.data.PORT,
    corsOrigins,
    jsonBodyLimit: parsed.data.JSON_BODY_LIMIT,
    rateLimitWindowMs: parsed.data.RATE_LIMIT_WINDOW_MS,
    rateLimitMax: parsed.data.RATE_LIMIT_MAX,
    ...(parsed.data.DATABASE_URL ? { databaseUrl: parsed.data.DATABASE_URL } : {}),
    ...(parsed.data.JWT_ACCESS_SECRET ? { jwtAccessSecret: parsed.data.JWT_ACCESS_SECRET } : {}),
    ...(parsed.data.GOOGLE_CLIENT_ID ? { googleClientId: parsed.data.GOOGLE_CLIENT_ID } : {}),
    frontendUrl: parsed.data.FRONTEND_URL,
    ...(parsed.data.AUTH_EMAIL_DELIVERY
      ? { authEmailDelivery: parsed.data.AUTH_EMAIL_DELIVERY }
      : {}),
    ...(parsed.data.RESEND_API_KEY ? { resendApiKey: parsed.data.RESEND_API_KEY } : {}),
    ...(parsed.data.AUTH_EMAIL_FROM ? { authEmailFrom: parsed.data.AUTH_EMAIL_FROM } : {}),
    accessTokenTtlSeconds: parsed.data.ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlDays: parsed.data.REFRESH_TOKEN_TTL_DAYS,
    passwordResetTtlMinutes: parsed.data.PASSWORD_RESET_TTL_MINUTES,
    authRateLimitMax: parsed.data.AUTH_RATE_LIMIT_MAX,
    ...(parsed.data.S3_ENDPOINT &&
    parsed.data.S3_BUCKET &&
    parsed.data.S3_ACCESS_KEY_ID &&
    parsed.data.S3_SECRET_ACCESS_KEY &&
    parsed.data.S3_PUBLIC_BASE_URL
      ? {
          s3: {
            endpoint: parsed.data.S3_ENDPOINT,
            bucket: parsed.data.S3_BUCKET,
            region: parsed.data.S3_REGION,
            accessKeyId: parsed.data.S3_ACCESS_KEY_ID,
            secretAccessKey: parsed.data.S3_SECRET_ACCESS_KEY,
            publicBaseUrl: parsed.data.S3_PUBLIC_BASE_URL,
            presignedUploadTtlSeconds: parsed.data.S3_PRESIGNED_UPLOAD_TTL_SECONDS,
            maxImageBytes: parsed.data.S3_MAX_IMAGE_BYTES,
          },
        }
      : {}),
    ...(parsed.data.ELASTICSEARCH_URL
      ? {
          elasticsearch: {
            url: parsed.data.ELASTICSEARCH_URL,
            ...(parsed.data.ELASTICSEARCH_API_KEY
              ? { apiKey: parsed.data.ELASTICSEARCH_API_KEY }
              : {}),
          },
        }
      : {}),
    ...(parsed.data.REDIS_URL ? { redisUrl: parsed.data.REDIS_URL } : {}),
    redisCartTtlSeconds: parsed.data.REDIS_CART_TTL_SECONDS,
    paymentProvider,
    ...(parsed.data.PAYMENT_TEST_SECRET
      ? { paymentTestSecret: parsed.data.PAYMENT_TEST_SECRET }
      : {}),
    ...(paymentKeyId ? { paymentKeyId } : {}),
    ...(paymentKeySecret ? { paymentKeySecret } : {}),
    ...(paymentWebhookSecret ? { paymentWebhookSecret } : {}),
  };
}
