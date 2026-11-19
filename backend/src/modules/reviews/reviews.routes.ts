import express, { type Router } from 'express';
import { z } from 'zod';
import {
  authentication,
  getAuthContext,
  requireRole,
} from '../../common/middleware/authentication.js';
import { sendData } from '../../common/middleware/response.js';
import { getValidatedRequest, validateRequest } from '../../common/validation/validate-request.js';
import type { Environment } from '../../config/env.js';
import { AuthService } from '../auth/auth.service.js';
import { ReviewsService } from './reviews.service.js';

const orderParams = z.object({ orderId: z.uuid(), itemId: z.uuid() }).strict();
const reviewParams = z.object({ reviewId: z.uuid() }).strict();
const productParams = z.object({ productId: z.uuid() }).strict();
const input = z
  .object({
    rating: z.number().int().min(1).max(5),
    title: z.string().trim().max(160).optional(),
    body: z.string().trim().max(4000).optional(),
  })
  .strict();
const patch = z
  .object({
    rating: z.number().int().min(1).max(5).optional(),
    title: z.string().trim().max(160).nullable().optional(),
    body: z.string().trim().max(4000).nullable().optional(),
  })
  .strict();

export function createReviewsRouter(environment: Environment): Router {
  const router = express.Router();
  const auth = authentication(new AuthService(environment));
  const service = new ReviewsService();
  const pagination = z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
    })
    .strict();
  router.get(
    '/me/reviews',
    auth,
    requireRole('CUSTOMER'),
    validateRequest({ query: pagination }),
    async (_req, res) => {
      const query = getValidatedRequest<{ query: { page: number; pageSize: number } }>(res).query;
      const result = await service.listCustomer(
        getAuthContext(res).userId,
        query.page,
        query.pageSize,
      );
      sendData(res, { reviews: result.reviews, meta: result.meta }, 200, result.meta);
    },
  );
  router.get('/me/reviews/eligible', auth, requireRole('CUSTOMER'), async (_req, res) => {
    sendData(res, { items: await service.listEligible(getAuthContext(res).userId) });
  });
  router.get(
    '/admin/reviews',
    auth,
    requireRole('ADMIN'),
    validateRequest({
      query: z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(20),
          status: z.enum(['PENDING', 'PUBLISHED', 'HIDDEN', 'REJECTED']).default('PENDING'),
        })
        .strict(),
    }),
    async (_req, res) => {
      const { page, pageSize, status } = getValidatedRequest<{
        query: {
          page: number;
          pageSize: number;
          status: 'PENDING' | 'PUBLISHED' | 'HIDDEN' | 'REJECTED';
        };
      }>(res).query;
      sendData(res, await service.listForModeration(status, page, pageSize));
    },
  );
  router.get(
    '/products/:productId/reviews',
    validateRequest({
      params: productParams,
      query: z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(20),
        })
        .strict(),
    }),
    async (_req, res) => {
      const data = getValidatedRequest<{
        params: { productId: string };
        query: { page: number; pageSize: number };
      }>(res);
      sendData(
        res,
        await service.list(data.params.productId, data.query.page, data.query.pageSize),
      );
    },
  );
  router.post(
    '/orders/:orderId/items/:itemId/review',
    auth,
    requireRole('CUSTOMER'),
    validateRequest({ params: orderParams, body: input }),
    async (_req, res) => {
      const data = getValidatedRequest<{
        params: { orderId: string; itemId: string };
        body: z.infer<typeof input>;
      }>(res);
      sendData(
        res,
        {
          review: await service.create(
            getAuthContext(res).userId,
            data.params.orderId,
            data.params.itemId,
            data.body,
          ),
        },
        201,
      );
    },
  );
  router.patch(
    '/reviews/:reviewId',
    auth,
    requireRole('CUSTOMER'),
    validateRequest({ params: reviewParams, body: patch }),
    async (_req, res) => {
      const data = getValidatedRequest<{
        params: { reviewId: string };
        body: z.infer<typeof patch>;
      }>(res);
      sendData(res, {
        review: await service.update(getAuthContext(res).userId, data.params.reviewId, data.body),
      });
    },
  );
  router.delete(
    '/reviews/:reviewId',
    auth,
    requireRole('CUSTOMER'),
    validateRequest({ params: reviewParams }),
    async (_req, res) => {
      const { reviewId } = getValidatedRequest<{ params: { reviewId: string } }>(res).params;
      await service.remove(getAuthContext(res).userId, reviewId);
      res.status(204).end();
    },
  );
  router.patch(
    '/admin/reviews/:reviewId/moderation',
    auth,
    requireRole('ADMIN'),
    validateRequest({
      params: reviewParams,
      body: z
        .object({
          status: z.enum(['PUBLISHED', 'HIDDEN', 'REJECTED']),
          reason: z.string().trim().min(3).max(1000),
        })
        .strict(),
    }),
    async (_req, res) => {
      const data = getValidatedRequest<{
        params: { reviewId: string };
        body: { status: 'PUBLISHED' | 'HIDDEN' | 'REJECTED'; reason: string };
      }>(res);
      sendData(res, {
        review: await service.moderate(
          getAuthContext(res).userId,
          data.params.reviewId,
          data.body.status,
          data.body.reason,
        ),
      });
    },
  );
  return router;
}
