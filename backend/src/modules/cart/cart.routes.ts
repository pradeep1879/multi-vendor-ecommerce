import express, { type Router } from 'express';
import { z } from 'zod';
import {
  getAuthContext,
  authentication,
  requireRole,
} from '../../common/middleware/authentication.js';
import { sendData } from '../../common/middleware/response.js';
import { getValidatedRequest, validateRequest } from '../../common/validation/validate-request.js';
import type { Environment } from '../../config/env.js';
import { AuthService } from '../auth/auth.service.js';
import { CartService } from './cart.service.js';
import { CheckoutPreviewService } from './checkout-preview.service.js';

const itemParams = z.object({ itemId: z.uuid() }).strict();
const quantity = z.object({ quantity: z.number().int().min(1).max(100) }).strict();
const setItem = z
  .object({
    productId: z.uuid(),
    variantId: z.uuid().optional(),
    quantity: z.number().int().min(1).max(100),
  })
  .strict();

export function createCartRouter(environment: Environment): Router {
  const router = express.Router();
  const service = new CartService(undefined, environment);
  const auth = authentication(new AuthService(environment));
  const previewService = new CheckoutPreviewService();
  router.get('/cart', auth, requireRole('CUSTOMER'), async (_req, res) =>
    sendData(res, { cart: await service.get(getAuthContext(res).userId) }),
  );
  router.put(
    '/cart/items',
    auth,
    requireRole('CUSTOMER'),
    validateRequest({ body: setItem }),
    async (_req, res) => {
      const body = getValidatedRequest<{
        body: { productId: string; variantId?: string; quantity: number };
      }>(res).body;
      sendData(res, {
        cart: await service.setQuantity(
          getAuthContext(res).userId,
          body.productId,
          body.quantity,
          body.variantId,
        ),
      });
    },
  );
  router.patch(
    '/cart/items/:itemId',
    auth,
    requireRole('CUSTOMER'),
    validateRequest({ params: itemParams, body: quantity }),
    async (_req, res) => {
      const { itemId } = getValidatedRequest<{ params: { itemId: string } }>(res).params;
      const { quantity: count } = getValidatedRequest<{ body: { quantity: number } }>(res).body;
      sendData(res, {
        cart: await service.updateQuantity(getAuthContext(res).userId, itemId, count),
      });
    },
  );
  router.delete(
    '/cart/items/:itemId',
    auth,
    requireRole('CUSTOMER'),
    validateRequest({ params: itemParams }),
    async (_req, res) => {
      const { itemId } = getValidatedRequest<{ params: { itemId: string } }>(res).params;
      await service.remove(getAuthContext(res).userId, itemId);
      res.status(204).end();
    },
  );
  router.delete('/cart', auth, requireRole('CUSTOMER'), async (_req, res) => {
    await service.clear(getAuthContext(res).userId);
    res.status(204).end();
  });
  router.post(
    '/checkout/preview',
    auth,
    requireRole('CUSTOMER'),
    validateRequest({
      body: z
        .object({
          addressId: z.uuid(),
          couponCodes: z.array(z.string().trim().min(3).max(64)).max(1).default([]),
        })
        .strict(),
    }),
    async (_req, res) => {
      const { addressId, couponCodes } = getValidatedRequest<{
        body: { addressId: string; couponCodes: string[] };
      }>(res).body;
      sendData(res, {
        preview: await previewService.preview(getAuthContext(res).userId, addressId, couponCodes),
      });
    },
  );
  router.get('/health/redis', async (_req, res) => {
    const ok = await service.redisAvailable();
    res.status(ok ? 200 : 503).json({
      status: ok ? 'ok' : 'unavailable',
      configured: Boolean(environment.redisUrl),
      fallback: 'postgresql',
    });
  });
  return router;
}
