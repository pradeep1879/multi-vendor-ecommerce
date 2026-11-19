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
import { PaymentsService } from './payments.service';

const orderParams = z.object({ orderId: z.uuid() }).strict();
const verifyBody = z
  .object({
    providerOrderId: z.string().min(1).max(160),
    providerPaymentId: z.string().min(1).max(160),
    signature: z.string().regex(/^[a-f0-9]{64}$/i),
  })
  .strict();
const refundBody = z
  .object({
    amountPaise: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    reason: z.string().trim().min(3).max(1000),
  })
  .strict();
const pagination = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export function createPaymentsRouter(environment: Environment): Router {
  const router = express.Router();
  const auth = authentication(new AuthService(environment));
  const service = new PaymentsService(environment);
  const accounts = new AccountsService();
  router.post(
    '/orders/:orderId/payment',
    auth,
    requireRole('CUSTOMER'),
    validateRequest({ params: orderParams }),
    async (_request, response) => {
      const { orderId } = getValidatedRequest<{ params: { orderId: string } }>(response).params;
      const payment = await service.initiate(
        getAuthContext(response).userId,
        orderId,
        _request.header('Idempotency-Key') ?? '',
      );
      sendData(response, { payment }, 201);
    },
  );
  router.get(
    '/refunds',
    auth,
    requireRole('CUSTOMER'),
    validateRequest({ query: pagination }),
    async (_request, response) => {
      const query = getValidatedRequest<{ query: { page: number; pageSize: number } }>(
        response,
      ).query;
      const result = await service.listCustomerRefunds(
        getAuthContext(response).userId,
        query.page,
        query.pageSize,
      );
      sendData(response, result, 200, result.meta);
    },
  );
  router.get(
    '/orders/:orderId/payment',
    auth,
    requireRole('CUSTOMER'),
    validateRequest({ params: orderParams }),
    async (_request, response) => {
      const { orderId } = getValidatedRequest<{ params: { orderId: string } }>(response).params;
      const payment = await service.status(getAuthContext(response).userId, orderId);
      if (!payment) throw new AppError(404, 'NOT_FOUND', 'Payment was not found.');
      sendData(response, { payment });
    },
  );
  router.post(
    '/admin/orders/:orderId/refunds',
    auth,
    requireRole('ADMIN'),
    validateRequest({
      params: orderParams,
      body: refundBody,
    }),
    async (request, response) => {
      const data = getValidatedRequest<{
        params: { orderId: string };
        body: z.infer<typeof refundBody>;
      }>(response);
      const refund = await service.requestRefund({
        orderId: data.params.orderId,
        actorId: getAuthContext(response).userId,
        amountPaise: BigInt(data.body.amountPaise),
        reason: data.body.reason,
        idempotencyKey: request.header('Idempotency-Key') ?? '',
      });
      sendData(response, refund, refund.replayed ? 200 : 201);
    },
  );
  router.post(
    '/payments/verify',
    auth,
    requireRole('CUSTOMER'),
    validateRequest({ body: verifyBody }),
    async (_request, response) => {
      const body = getValidatedRequest<{ body: z.infer<typeof verifyBody> }>(response).body;
      sendData(response, {
        payment: await service.verifyCheckout(getAuthContext(response).userId, body),
      });
    },
  );
  router.post('/payments/webhook', async (request, response) => {
    const rawBody = (request as typeof request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) throw new AppError(400, 'WEBHOOK_BODY_REQUIRED', 'Raw webhook body is required.');
    const signature =
      request.header(
        environment.paymentProvider === 'razorpay' ? 'X-Razorpay-Signature' : 'X-Payment-Signature',
      ) ?? '';
    const eventId =
      request.header(
        environment.paymentProvider === 'razorpay' ? 'X-Razorpay-Event-Id' : 'X-Payment-Event-Id',
      ) ?? '';
    sendData(response, await service.webhook(eventId, signature, rawBody));
  });
  router.get(
    '/admin/settlements',
    auth,
    requireRole('ADMIN'),
    validateRequest({ query: pagination }),
    async (_request, response) => {
      const { page, pageSize } = getValidatedRequest<{ query: z.infer<typeof pagination> }>(
        response,
      ).query;
      sendData(response, { settlements: await service.listAdminSettlements(page, pageSize) });
    },
  );
  router.get(
    '/admin/payments/reconciliation',
    auth,
    requireRole('ADMIN'),
    async (_request, response) => {
      sendData(response, { report: await service.reconciliationReport() });
    },
  );
  router.post(
    '/admin/settlements/batch',
    auth,
    requireRole('ADMIN'),
    async (_request, response) => {
      sendData(response, await service.createSettlementBatch(), 201);
    },
  );
  router.post(
    '/admin/settlements/:settlementId/transfer',
    auth,
    requireRole('ADMIN'),
    validateRequest({
      params: z.object({ settlementId: z.uuid() }).strict(),
    }),
    async (_request, response) => {
      const { settlementId } = getValidatedRequest<{ params: { settlementId: string } }>(
        response,
      ).params;
      const settlement = await service.getSettlement(settlementId);
      if (!settlement) throw new AppError(404, 'NOT_FOUND', 'Settlement was not found.');
      sendData(response, { settlement: await service.startSettlementTransfer(settlementId) });
    },
  );
  router.get(
    '/vendor/settlements',
    auth,
    requireRole('VENDOR'),
    validateRequest({ query: pagination }),
    async (_request, response) => {
      const { page, pageSize } = getValidatedRequest<{ query: z.infer<typeof pagination> }>(
        response,
      ).query;
      const vendor = await accounts.getVendor(getAuthContext(response).userId);
      sendData(response, {
        settlements: await service.listVendorSettlements(vendor.id, page, pageSize),
      });
    },
  );
  return router;
}
