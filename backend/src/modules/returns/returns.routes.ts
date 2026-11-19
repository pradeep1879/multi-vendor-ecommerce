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
import { PaymentsService } from '../payments/payments.service';
import { AccountsService } from '../accounts/accounts.service';
import { ReturnsService } from './returns.service';

const orderParams = z.object({ orderId: z.uuid() }).strict();
const returnParams = z.object({ returnId: z.uuid() }).strict();

export function createReturnsRouter(environment: Environment): Router {
  const router = express.Router();
  const auth = authentication(new AuthService(environment));
  const returns = new ReturnsService();
  const payments = new PaymentsService(environment);
  const accounts = new AccountsService();

  router.get(
    '/orders/:orderId/returns',
    auth,
    requireRole('CUSTOMER'),
    validateRequest({ params: orderParams }),
    async (_request, response) => {
      const { orderId } = getValidatedRequest<{ params: { orderId: string } }>(response).params;
      sendData(response, {
        items: await returns.listCustomer(getAuthContext(response).userId, orderId),
      });
    },
  );
  router.post(
    '/orders/:orderId/returns',
    auth,
    requireRole('CUSTOMER'),
    validateRequest({
      params: orderParams,
      body: z
        .object({
          orderItemId: z.uuid(),
          quantity: z.number().int().min(1).max(100),
          reason: z.string().trim().min(3).max(1000),
        })
        .strict(),
    }),
    async (_request, response) => {
      const data = getValidatedRequest<{
        params: { orderId: string };
        body: { orderItemId: string; quantity: number; reason: string };
      }>(response);
      sendData(
        response,
        {
          request: await returns.create(
            getAuthContext(response).userId,
            data.params.orderId,
            data.body.orderItemId,
            data.body.quantity,
            data.body.reason,
          ),
        },
        201,
      );
    },
  );
  router.get(
    '/vendor/returns',
    auth,
    requireRole('VENDOR'),
    validateRequest({
      query: z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(20),
          status: z
            .enum([
              'REQUESTED',
              'UNDER_REVIEW',
              'APPROVED',
              'REJECTED',
              'IN_TRANSIT',
              'RECEIVED',
              'REFUNDED',
              'CLOSED',
            ])
            .optional(),
        })
        .strict(),
    }),
    async (_request, response) => {
      const query = getValidatedRequest<{
        query: { page: number; pageSize: number; status?: string };
      }>(response).query;
      const vendor = await accounts.getVendor(getAuthContext(response).userId);
      const result = await returns.listVendor(vendor.id, query.page, query.pageSize, query.status);
      sendData(response, result, 200, result.meta);
    },
  );
  router.get(
    '/admin/returns',
    auth,
    requireRole('ADMIN'),
    validateRequest({
      query: z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(20),
          status: z
            .enum([
              'REQUESTED',
              'UNDER_REVIEW',
              'APPROVED',
              'REJECTED',
              'IN_TRANSIT',
              'RECEIVED',
              'REFUNDED',
              'CLOSED',
            ])
            .optional(),
        })
        .strict(),
    }),
    async (_request, response) => {
      const query = getValidatedRequest<{
        query: { page: number; pageSize: number; status?: string };
      }>(response).query;
      const result = await returns.listAdmin(query.page, query.pageSize, query.status);
      sendData(response, result, 200, result.meta);
    },
  );
  router.patch(
    '/admin/returns/:returnId',
    auth,
    requireRole('ADMIN'),
    validateRequest({
      params: returnParams,
      body: z
        .object({
          status: z.enum(['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'IN_TRANSIT', 'RECEIVED']),
          reason: z.string().trim().min(3).max(1000),
        })
        .strict(),
    }),
    async (_request, response) => {
      const data = getValidatedRequest<{
        params: { returnId: string };
        body: {
          status: 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'IN_TRANSIT' | 'RECEIVED';
          reason: string;
        };
      }>(response);
      sendData(response, {
        request: await returns.transition(
          getAuthContext(response).userId,
          data.params.returnId,
          data.body.status,
          data.body.reason,
        ),
      });
    },
  );
  router.post(
    '/admin/returns/:returnId/refund',
    auth,
    requireRole('ADMIN'),
    validateRequest({ params: returnParams }),
    async (request, response) => {
      const { returnId } = getValidatedRequest<{ params: { returnId: string } }>(response).params;
      const item = await returns.getForRefund(returnId);
      if (item.status !== 'RECEIVED')
        throw new AppError(
          409,
          'RETURN_NOT_READY_FOR_REFUND',
          'The returned item must be received before issuing its refund.',
        );
      const payment = item.order.payment;
      if (!payment)
        throw new AppError(
          409,
          'PAYMENT_NOT_REFUNDABLE',
          'A captured payment is required to refund this return.',
        );
      const quantity = BigInt(item.quantity);
      const fullQuantity = BigInt(item.orderItem.quantity);
      const discount = (item.orderItem.discountPaise * quantity) / fullQuantity;
      const tax = (item.orderItem.taxPaise * quantity) / fullQuantity;
      const amountPaise = item.orderItem.unitPricePaise * quantity - discount + tax;
      const key = request.header('Idempotency-Key') ?? `return:${returnId}`;
      const result = await payments.requestRefund({
        orderId: item.orderId,
        actorId: getAuthContext(response).userId,
        amountPaise,
        reason: `Return ${returnId}: ${item.reason}`,
        idempotencyKey: key,
        itemAllocations: [{ orderItemId: item.orderItemId, amountPaise }],
      });
      await returns.linkRefund(returnId, result.refund.id);
      if (result.refund.status === 'SUCCEEDED') await returns.markRefunded(returnId);
      sendData(response, result, result.replayed ? 200 : 201);
    },
  );
  return router;
}
