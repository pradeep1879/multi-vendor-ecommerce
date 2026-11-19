import express, { type Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../common/errors/app-error.js';
import {
  authentication,
  getAuthContext,
  requireRole,
} from '../../common/middleware/authentication.js';
import { sendData } from '../../common/middleware/response.js';
import { getValidatedRequest, validateRequest } from '../../common/validation/validate-request.js';
import type { Environment } from '../../config/env.js';
import { getPrismaClient } from '../../infrastructure/database/client.js';
import { AuthService } from '../auth/auth.service.js';

export function createCustomerSettingsRouter(environment: Environment): Router {
  const router = express.Router();
  const auth = authentication(new AuthService(environment));
  const pageQuery = z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
    })
    .strict();
  const notificationParams = z.object({ notificationId: z.uuid() }).strict();
  const preferencesSchema = z
    .object({
      orderUpdatesEmail: z.boolean().optional(),
      promotionalEmail: z.boolean().optional(),
      recommendationsEmail: z.boolean().optional(),
    })
    .strict()
    .refine((value) => Object.keys(value).length > 0);

  router.get(
    '/account/notifications',
    auth,
    requireRole('CUSTOMER'),
    validateRequest({ query: pageQuery }),
    async (_req, res) => {
      const { page, pageSize } = getValidatedRequest<{ query: { page: number; pageSize: number } }>(
        res,
      ).query;
      const userId = getAuthContext(res).userId;
      const prisma = getPrismaClient();
      const where = { userId };
      const [items, total, unread] = await Promise.all([
        prisma.accountNotification.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.accountNotification.count({ where }),
        prisma.accountNotification.count({ where: { userId, readAt: null } }),
      ]);
      sendData(
        res,
        {
          items,
          unread,
          pagination: { page, limit: pageSize, total, pages: Math.ceil(total / pageSize) },
        },
        200,
        { total },
      );
    },
  );
  router.patch(
    '/account/notifications/:notificationId/read',
    auth,
    requireRole('CUSTOMER'),
    validateRequest({ params: notificationParams }),
    async (_req, res) => {
      const { notificationId } = getValidatedRequest<{ params: { notificationId: string } }>(
        res,
      ).params;
      const changed = await getPrismaClient().accountNotification.updateMany({
        where: { id: notificationId, userId: getAuthContext(res).userId, readAt: null },
        data: { readAt: new Date() },
      });
      if (!changed.count) {
        const exists = await getPrismaClient().accountNotification.count({
          where: { id: notificationId, userId: getAuthContext(res).userId },
        });
        if (!exists) throw new AppError(404, 'NOT_FOUND', 'Notification was not found.');
      }
      sendData(res, { read: true });
    },
  );
  router.post(
    '/account/notifications/read-all',
    auth,
    requireRole('CUSTOMER'),
    async (_req, res) => {
      const result = await getPrismaClient().accountNotification.updateMany({
        where: { userId: getAuthContext(res).userId, readAt: null },
        data: { readAt: new Date() },
      });
      sendData(res, { updated: result.count });
    },
  );
  router.get('/account/preferences', auth, requireRole('CUSTOMER'), async (_req, res) => {
    const userId = getAuthContext(res).userId;
    const preferences = await getPrismaClient().notificationPreference.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    sendData(res, {
      orderUpdatesEmail: preferences.orderUpdatesEmail,
      promotionalEmail: preferences.promotionalEmail,
      recommendationsEmail: preferences.recommendationsEmail,
    });
  });
  router.patch(
    '/account/preferences',
    auth,
    requireRole('CUSTOMER'),
    validateRequest({ body: preferencesSchema }),
    async (_req, res) => {
      const userId = getAuthContext(res).userId;
      const body = getValidatedRequest<{ body: z.infer<typeof preferencesSchema> }>(res).body;
      const preferences = await getPrismaClient().notificationPreference.upsert({
        where: { userId },
        create: { userId, ...body },
        update: body,
      });
      sendData(res, {
        orderUpdatesEmail: preferences.orderUpdatesEmail,
        promotionalEmail: preferences.promotionalEmail,
        recommendationsEmail: preferences.recommendationsEmail,
      });
    },
  );
  return router;
}
