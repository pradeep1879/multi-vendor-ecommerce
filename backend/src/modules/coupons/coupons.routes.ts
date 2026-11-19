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
import { CouponsService } from './coupons.service';

const couponBody = z
  .object({
    code: z
      .string()
      .trim()
      .min(3)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/),
    scope: z.enum(['PLATFORM', 'VENDOR']),
    vendorId: z.uuid().optional(),
    discountType: z.enum(['FIXED', 'PERCENTAGE']),
    value: z.number().int().min(1).max(2_147_483_647),
    maxDiscountPaise: z.number().int().positive().max(2_147_483_647).optional(),
    minOrderPaise: z.number().int().nonnegative().max(2_147_483_647).default(0),
    maximumUses: z.number().int().positive().optional(),
    perUserLimit: z.number().int().positive().optional(),
    startsAt: z.iso.datetime().transform((value) => new Date(value)),
    endsAt: z.iso.datetime().transform((value) => new Date(value)),
    status: z.enum(['DRAFT', 'ACTIVE', 'DISABLED']).default('DRAFT'),
    productIds: z.array(z.uuid()).max(500).default([]),
    categoryIds: z.array(z.uuid()).max(500).default([]),
  })
  .strict();
const params = z.object({ couponId: z.uuid() }).strict();
const update = z
  .object({
    status: z.enum(['DRAFT', 'ACTIVE', 'DISABLED']).optional(),
    startsAt: z.iso
      .datetime()
      .transform((value) => new Date(value))
      .optional(),
    endsAt: z.iso
      .datetime()
      .transform((value) => new Date(value))
      .optional(),
    maximumUses: z.number().int().positive().nullable().optional(),
    perUserLimit: z.number().int().positive().nullable().optional(),
  })
  .strict();

export function createCouponsRouter(environment: Environment): Router {
  const router = express.Router();
  const auth = authentication(new AuthService(environment));
  const service = new CouponsService();
  router.get(
    '/admin/coupons',
    auth,
    requireRole('ADMIN'),
    validateRequest({
      query: z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(20),
        })
        .strict(),
    }),
    async (_req, res) => {
      const query = getValidatedRequest<{ query: { page: number; pageSize: number } }>(res).query;
      sendData(res, await service.list(query.page, query.pageSize));
    },
  );
  router.post(
    '/admin/coupons',
    auth,
    requireRole('ADMIN'),
    validateRequest({ body: couponBody }),
    async (_req, res) => {
      const input = getValidatedRequest<{ body: z.infer<typeof couponBody> }>(res).body;
      const { maxDiscountPaise, ...rest } = input;
      sendData(
        res,
        {
          coupon: await service.create({
            ...rest,
            minOrderPaise: BigInt(input.minOrderPaise),
            ...(maxDiscountPaise === undefined
              ? {}
              : { maxDiscountPaise: BigInt(maxDiscountPaise) }),
          }),
        },
        201,
      );
    },
  );
  router.patch(
    '/admin/coupons/:couponId',
    auth,
    requireRole('ADMIN'),
    validateRequest({ params, body: update }),
    async (_req, res) => {
      const data = getValidatedRequest<{
        params: { couponId: string };
        body: z.infer<typeof update>;
      }>(res);
      sendData(res, { coupon: await service.update(data.params.couponId, data.body) });
    },
  );
  router.delete(
    '/admin/coupons/:couponId',
    auth,
    requireRole('ADMIN'),
    validateRequest({ params }),
    async (_req, res) => {
      const { couponId } = getValidatedRequest<{ params: { couponId: string } }>(res).params;
      await service.update(couponId, { status: 'DISABLED' });
      res.status(204).end();
    },
  );
  router.post(
    '/coupons/validate',
    auth,
    requireRole('CUSTOMER'),
    validateRequest({
      body: z.object({ codes: z.array(z.string().trim().min(3).max(64)).max(1) }).strict(),
    }),
    async (_req, res) => {
      const { codes } = getValidatedRequest<{ body: { codes: string[] } }>(res).body;
      sendData(res, await service.validate(getAuthContext(res).userId, codes));
    },
  );
  return router;
}
