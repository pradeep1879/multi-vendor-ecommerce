import express, { type Router } from 'express';
import { z } from 'zod';
import {
  authentication,
  getAuthContext,
  requireRole,
} from '../../common/middleware/authentication.js';
import { sendData } from '../../common/middleware/response.js';
import { validateRequest, getValidatedRequest } from '../../common/validation/validate-request.js';
import type { Environment } from '../../config/env.js';
import { AuthService } from '../auth/auth.service.js';
import { AccountsService } from '../accounts/accounts.service.js';
import { AnalyticsRepository } from './analytics.repository.js';

const period = z
  .object({ from: z.iso.datetime(), to: z.iso.datetime() })
  .strict()
  .refine(({ from, to }) => new Date(from) < new Date(to));
export function createAnalyticsRouter(environment: Environment): Router {
  const router = express.Router();
  const auth = authentication(new AuthService(environment));
  const analytics = new AnalyticsRepository();
  const accounts = new AccountsService();
  router.get(
    '/admin/analytics/summary',
    auth,
    requireRole('ADMIN'),
    validateRequest({ query: period }),
    async (_req, res) => {
      const { from, to } = getValidatedRequest<{ query: { from: string; to: string } }>(res).query;
      sendData(res, { summary: await analytics.adminSummary(new Date(from), new Date(to)) });
    },
  );
  router.get(
    '/vendor/analytics/summary',
    auth,
    requireRole('VENDOR'),
    validateRequest({ query: period }),
    async (_req, res) => {
      const { from, to } = getValidatedRequest<{ query: { from: string; to: string } }>(res).query;
      const vendor = await accounts.getVendor(getAuthContext(res).userId);
      sendData(res, {
        summary: await analytics.vendorSummary(vendor.id, new Date(from), new Date(to)),
      });
    },
  );
  return router;
}
