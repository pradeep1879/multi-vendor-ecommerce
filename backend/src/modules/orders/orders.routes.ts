import express, { type Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../common/errors/app-error';
import {
  authentication,
  getAuthContext,
  requireRole,
} from '../../common/middleware/authentication';
import { sendData } from '../../common/middleware/response';
import { getValidatedRequest, validateRequest } from '../../common/validation/validate-request';
import type { Environment } from '../../config/env';
import { AuthService } from '../auth/auth.service';
import { AccountsService } from '../accounts/accounts.service';
import { OrdersService } from './orders.service';

const params = z.object({ orderId: z.uuid() }).strict();
const create = z
  .object({
    addressId: z.uuid(),
    couponCodes: z.array(z.string().trim().min(3).max(64)).max(1).default([]),
  })
  .strict();
const transition = z
  .object({
    status: z.enum(['ACCEPTED', 'PACKED', 'SHIPPED', 'DELIVERED']),
    trackingReference: z.string().trim().max(200).optional(),
    carrier: z.string().trim().max(120).optional(),
    trackingUrl: z
      .string()
      .url()
      .refine((value) => value.startsWith('https://'))
      .optional(),
  })
  .strict()
  .refine((value) => value.status !== 'SHIPPED' || Boolean(value.trackingReference), {
    path: ['trackingReference'],
    message: 'Tracking reference is required when shipping a fulfillment group.',
  });
const cancel = z.object({ reason: z.string().trim().min(3).max(500) }).strict();

export function createOrdersRouter(environment: Environment): Router {
  const router = express.Router();
  const auth = authentication(new AuthService(environment));
  const service = new OrdersService();
  const accounts = new AccountsService();
  router.post(
    '/orders',
    auth,
    requireRole('CUSTOMER'),
    validateRequest({ body: create }),
    async (req, res) => {
      const { addressId, couponCodes } = getValidatedRequest<{
        body: { addressId: string; couponCodes: string[] };
      }>(res).body;
      const key = req.header('Idempotency-Key');
      if (!key)
        throw new AppError(
          400,
          'IDEMPOTENCY_KEY_REQUIRED',
          'A valid Idempotency-Key header is required.',
        );
      const result = await service.create(getAuthContext(res).userId, addressId, key, couponCodes);
      sendData(res, result, result.replayed ? 200 : 201);
    },
  );
  router.get('/orders', auth, requireRole('CUSTOMER'), async (_req, res) =>
    sendData(res, { orders: await service.listCustomer(getAuthContext(res).userId) }),
  );
  router.get(
    '/admin/orders',
    auth,
    requireRole('ADMIN'),
    validateRequest({
      query: z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(20),
          status: z
            .enum([
              'PENDING_PAYMENT',
              'CONFIRMED',
              'PROCESSING',
              'PARTIALLY_SHIPPED',
              'SHIPPED',
              'DELIVERED',
              'CANCELLED',
              'PARTIALLY_REFUNDED',
              'REFUNDED',
              'PAYMENT_FAILED',
            ])
            .optional(),
        })
        .strict(),
    }),
    async (_req, res) => {
      const query = getValidatedRequest<{
        query: { page: number; pageSize: number; status?: string };
      }>(res).query;
      const result = await service.listAdmin(query.page, query.pageSize, query.status);
      sendData(res, { orders: result.orders }, 200, result.meta);
    },
  );
  router.get(
    '/orders/:orderId',
    auth,
    requireRole('CUSTOMER'),
    validateRequest({ params }),
    async (_req, res) => {
      const { orderId } = getValidatedRequest<{ params: { orderId: string } }>(res).params;
      sendData(res, { order: await service.getCustomer(getAuthContext(res).userId, orderId) });
    },
  );
  router.get(
    '/orders/:orderId/invoice',
    auth,
    requireRole('CUSTOMER', 'ADMIN'),
    validateRequest({ params }),
    async (_req, res) => {
      const { orderId } = getValidatedRequest<{ params: { orderId: string } }>(res).params;
      const context = getAuthContext(res);
      const invoice = await service.invoice(
        context.userId,
        context.roles.includes('ADMIN'),
        orderId,
      );
      res
        .status(200)
        .type('application/pdf')
        .setHeader('Content-Disposition', `attachment; filename="INV-${invoice.orderNumber}.pdf"`)
        .send(Buffer.from(invoice.bytes));
    },
  );
  router.post(
    '/orders/:orderId/cancel',
    auth,
    requireRole('CUSTOMER'),
    validateRequest({ params, body: cancel }),
    async (_req, res) => {
      const validated = getValidatedRequest<{
        params: { orderId: string };
        body: { reason: string };
      }>(res);
      const { orderId } = validated.params;
      await service.cancel(getAuthContext(res).userId, orderId, validated.body.reason);
      res.status(204).end();
    },
  );
  router.get('/vendor/orders', auth, requireRole('VENDOR'), async (_req, res) => {
    const store = await accounts.getVendor(getAuthContext(res).userId);
    sendData(res, { orders: await service.listVendor(store.id) });
  });
  router.get(
    '/vendor/orders/:orderId',
    auth,
    requireRole('VENDOR'),
    validateRequest({ params }),
    async (_req, res) => {
      const { orderId } = getValidatedRequest<{ params: { orderId: string } }>(res).params;
      const store = await accounts.getVendor(getAuthContext(res).userId);
      sendData(res, { order: await service.getVendor(store.id, orderId) });
    },
  );
  router.patch(
    '/vendor/orders/:orderId/status',
    auth,
    requireRole('VENDOR'),
    validateRequest({ params, body: transition }),
    async (_req, res) => {
      const validated = getValidatedRequest<{
        params: { orderId: string };
        body: z.infer<typeof transition>;
      }>(res);
      const { orderId } = validated.params;
      const body = validated.body;
      const store = await accounts.getVendor(getAuthContext(res).userId);
      sendData(res, {
        order: await service.transition(
          store.id,
          getAuthContext(res).userId,
          orderId,
          body.status,
          {
            trackingReference: body.trackingReference,
            carrier: body.carrier,
            trackingUrl: body.trackingUrl,
          },
        ),
      });
    },
  );
  return router;
}
