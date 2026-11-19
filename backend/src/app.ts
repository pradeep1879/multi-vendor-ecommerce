import cors from 'cors';
import express, { type Express, type Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import type { Environment } from './config/env.js';
import { loadEnvironment } from './config/env.js';
import { AppError } from './common/errors/app-error.js';
import { errorHandler, notFoundHandler } from './common/middleware/errors.js';
import { requestIdMiddleware } from './common/middleware/request-id.js';
import { requestLogger } from './common/middleware/request-logger.js';
import { sendData } from './common/middleware/response.js';
import { verifyDatabaseConnection } from './infrastructure/database/client.js';
import { createApiRouter } from './routes.js';

export function createApp(
  apiRouter: Router = express.Router(),
  environment: Environment = loadEnvironment(),
  databaseCheck: () => Promise<void> = verifyDatabaseConnection,
): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestIdMiddleware);
  app.use(requestLogger);
  app.use(helmet());
  app.use(
    cors({
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'Idempotency-Key',
        'X-Payment-Signature',
        'X-Payment-Event-Id',
        'X-Razorpay-Signature',
        'X-Razorpay-Event-Id',
      ],
      origin(origin, callback) {
        if (!origin || environment.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new AppError(403, 'CORS_ORIGIN_DENIED', 'Origin is not allowed.'));
      },
    }),
  );
  app.use(
    rateLimit({
      windowMs: environment.rateLimitWindowMs,
      limit: environment.rateLimitMax,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler(_request, response) {
        response.status(429).json({
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many requests. Please try again later.',
            requestId: String(response.locals.requestId ?? 'unknown'),
          },
        });
      },
    }),
  );
  app.use(
    express.json({
      limit: environment.jsonBodyLimit,
      strict: true,
      verify(request, _response, body) {
        if (request.url?.startsWith('/api/v1/payments/webhook'))
          Object.assign(request, { rawBody: Buffer.from(body) });
      },
    }),
  );

  app.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok', service: 'marketplace-api' });
  });
  app.get('/health/ready', async (_request, response) => {
    try {
      await databaseCheck();
      response.status(200).json({ status: 'ready', dependencies: { database: 'ok' } });
    } catch {
      response.status(503).json({
        error: {
          code: 'DEPENDENCY_UNAVAILABLE',
          message: 'A required service is unavailable.',
          requestId: String(response.locals.requestId ?? 'unknown'),
        },
      });
    }
  });
  app.get('/api/v1', (_request, response) => {
    sendData(response, { service: 'marketplace-api', version: 'v1' });
  });
  app.use('/api/v1', apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const environment = loadEnvironment();
export const app = createApp(createApiRouter(environment), environment);
export default app;
