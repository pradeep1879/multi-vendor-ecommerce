import express, { type Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { authentication, getAuthContext } from '../../common/middleware/authentication.js';
import { sendData } from '../../common/middleware/response.js';
import { requireTrustedOrigin } from '../../common/middleware/trusted-origin.js';
import { getValidatedRequest, validateRequest } from '../../common/validation/validate-request.js';
import type { Environment } from '../../config/env.js';
import { AuthService } from './auth.service.js';
import { createAuthController } from './auth.controller.js';

const emailSchema = z.string().trim().email().max(320);
const passwordSchema = z.string().min(12).max(128);
const registerSchema = z
  .object({ email: emailSchema, password: passwordSchema, name: z.string().trim().min(1).max(160) })
  .strict();
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) }).strict();
const googleSchema = z.object({ idToken: z.string().min(100).max(8192) }).strict();
const resetRequestSchema = z.object({ email: emailSchema }).strict();
const resetConfirmSchema = z
  .object({ token: z.string().min(32).max(256), newPassword: passwordSchema })
  .strict();
const verificationSchema = z.object({ token: z.string().min(32).max(256) }).strict();

export function createAuthRouter(
  environment: Environment,
  service = new AuthService(environment),
): Router {
  const router = express.Router();
  const controller = createAuthController(service, environment);
  const strictLimit = rateLimit({
    windowMs: 15 * 60_000,
    limit: environment.authRateLimitMax,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler(_request, response) {
      response.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many authentication attempts. Please try again later.',
          requestId: String(response.locals.requestId ?? 'unknown'),
        },
      });
    },
  });
  const requireOrigin = requireTrustedOrigin(environment.corsOrigins);
  const requireUser = authentication(service);

  router.post(
    '/auth/register',
    strictLimit,
    validateRequest({ body: registerSchema }),
    controller.register,
  );
  router.post('/auth/login', strictLimit, validateRequest({ body: loginSchema }), controller.login);
  router.post(
    '/auth/google',
    strictLimit,
    validateRequest({ body: googleSchema }),
    controller.googleLogin,
  );
  router.post('/auth/refresh', requireOrigin, controller.refresh);
  router.post('/auth/logout', requireOrigin, controller.logout);
  router.post('/auth/logout-all', requireUser, controller.logoutAll);
  router.post(
    '/auth/password/change',
    requireUser,
    validateRequest({
      body: z
        .object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema })
        .strict(),
    }),
    async (_request, response) => {
      const body = getValidatedRequest<{ body: { currentPassword: string; newPassword: string } }>(
        response,
      ).body;
      await service.changePassword(
        getAuthContext(response).userId,
        body.currentPassword,
        body.newPassword,
      );
      sendData(response, { changed: true });
    },
  );
  router.post(
    '/auth/password-reset',
    strictLimit,
    validateRequest({ body: resetRequestSchema }),
    controller.requestPasswordReset,
  );
  router.post(
    '/auth/password-reset/confirm',
    strictLimit,
    validateRequest({ body: resetConfirmSchema }),
    controller.confirmPasswordReset,
  );
  router.post('/auth/email-verification', requireUser, controller.requestEmailVerification);
  router.post(
    '/auth/email-verification/confirm',
    validateRequest({ body: verificationSchema }),
    controller.confirmEmailVerification,
  );
  return router;
}
