import express, { type Router } from 'express';
import { z } from 'zod';
import {
  authentication,
  getAuthContext,
  requireRole,
} from '../../common/middleware/authentication';
import { sendData } from '../../common/middleware/response';
import { getValidatedRequest, validateRequest } from '../../common/validation/validate-request';
import type { Environment } from '../../config/env';
import { AuthService } from '../auth/auth.service';
import { WishlistService } from './wishlist.service';

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
