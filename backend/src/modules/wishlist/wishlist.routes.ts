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
import { WishlistService } from './wishlist.service.js';

export function createWishlistRouter(environment: Environment): Router {
  const router = express.Router();
  const auth = authentication(new AuthService(environment));
  const service = new WishlistService();
  const productParams = z.object({ productId: z.uuid() }).strict();

  router.get('/wishlist', auth, requireRole('CUSTOMER'), async (_request, response) => {
    sendData(response, { items: await service.list(getAuthContext(response).userId) });
  });
  router.put(
    '/wishlist/:productId',
    auth,
    requireRole('CUSTOMER'),
    validateRequest({ params: productParams }),
    async (_request, response) => {
      const { productId } = getValidatedRequest<{ params: { productId: string } }>(response).params;
      sendData(
        response,
        { item: await service.add(getAuthContext(response).userId, productId) },
        201,
      );
    },
  );
  router.delete(
    '/wishlist/:productId',
    auth,
    requireRole('CUSTOMER'),
    validateRequest({ params: productParams }),
    async (_request, response) => {
      const { productId } = getValidatedRequest<{ params: { productId: string } }>(response).params;
      await service.remove(getAuthContext(response).userId, productId);
      response.status(204).end();
    },
  );
  return router;
}
