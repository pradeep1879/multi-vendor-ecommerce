import express, { type Router } from 'express';
import { z } from 'zod';
import { authentication, requireRole } from '../../common/middleware/authentication';
import { validateRequest } from '../../common/validation/validate-request';
import type { Environment } from '../../config/env';
import { AuthService } from '../auth/auth.service';
import { AccountsService } from './accounts.service';
import { createAccountsController } from './accounts.controller';

const idParams = (name: string) => z.object({ [name]: z.uuid() }).strict();
const profileSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    phone: z.string().trim().max(32).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);
const addressSchema = z
  .object({
    type: z.enum(['SHIPPING', 'BILLING', 'BOTH']).default('SHIPPING'),
    recipient: z.string().trim().min(1).max(160),
    phone: z.string().trim().max(32).nullable().optional(),
    line1: z.string().trim().min(1).max(255),
    line2: z.string().trim().max(255).nullable().optional(),
    locality: z.string().trim().max(160).nullable().optional(),
    city: z.string().trim().min(1).max(120),
    region: z.string().trim().min(1).max(120),
    postalCode: z.string().trim().min(1).max(20),
    countryCode: z.string().trim().length(2).default('IN'),
    isDefault: z.boolean().default(false),
  })
  .strict();
const addressUpdateSchema = addressSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0);
const applicationSchema = z
  .object({
    businessName: z.string().trim().min(2).max(200),
    legalName: z.string().trim().min(2).max(200),
    contactEmail: z.string().trim().email().max(320),
    contactPhone: z.string().trim().min(7).max(32),
  })
  .strict();
const reasonSchema = z.object({ reason: z.string().trim().min(3).max(1000) }).strict();
const vendorProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(200).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);
const applicationListQuery = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  })
  .strict();
const customerListQuery = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export function createAccountsRouter(
  environment: Environment,
  service = new AccountsService(),
): Router {
  const router = express.Router();
  const controller = createAccountsController(service);
  const requireUser = authentication(new AuthService(environment));

  router.get(
    '/admin/customers',
    requireUser,
    requireRole('ADMIN'),
    validateRequest({ query: customerListQuery }),
    controller.listCustomers,
  );
  router.post(
    '/admin/customers/:userId/disable',
    requireUser,
    requireRole('ADMIN'),
    validateRequest({ params: idParams('userId') }),
    controller.disableCustomer,
  );
  router.post(
    '/admin/customers/:userId/enable',
    requireUser,
    requireRole('ADMIN'),
    validateRequest({ params: idParams('userId') }),
    controller.enableCustomer,
  );

  router.get('/me', requireUser, controller.me);
  router.patch('/me', requireUser, validateRequest({ body: profileSchema }), controller.updateMe);
  router.get(
    '/me/addresses',
    requireUser,
    validateRequest({ query: z.object({}).strict() }),
    controller.listAddresses,
  );
  router.post(
    '/me/addresses',
    requireUser,
    validateRequest({ body: addressSchema }),
    controller.createAddress,
  );
  router.patch(
    '/me/addresses/:addressId',
    requireUser,
    validateRequest({ params: idParams('addressId'), body: addressUpdateSchema }),
    controller.updateAddress,
  );
  router.delete(
    '/me/addresses/:addressId',
    requireUser,
    validateRequest({ params: idParams('addressId') }),
    controller.deleteAddress,
  );

  router.post(
    '/vendor-applications',
    requireUser,
    validateRequest({ body: applicationSchema }),
    controller.applyVendor,
  );
  router.get('/vendor-applications/me', requireUser, controller.myApplication);
  router.get(
    '/admin/vendor-applications',
    requireUser,
    requireRole('ADMIN'),
    validateRequest({ query: applicationListQuery }),
    controller.listApplications,
  );
  router.get(
    '/admin/vendor-applications/:applicationId',
    requireUser,
    requireRole('ADMIN'),
    validateRequest({ params: idParams('applicationId') }),
    controller.applicationDetail,
  );
  router.post(
    '/admin/vendor-applications/:applicationId/approve',
    requireUser,
    requireRole('ADMIN'),
    validateRequest({ params: idParams('applicationId'), body: reasonSchema }),
    controller.approve,
  );
  router.post(
    '/admin/vendor-applications/:applicationId/reject',
    requireUser,
    requireRole('ADMIN'),
    validateRequest({ params: idParams('applicationId'), body: reasonSchema }),
    controller.reject,
  );
  router.post(
    '/admin/vendors/:vendorId/suspend',
    requireUser,
    requireRole('ADMIN'),
    validateRequest({ params: idParams('vendorId'), body: reasonSchema }),
    controller.suspendVendor,
  );
  router.get('/vendor', requireUser, requireRole('VENDOR'), controller.getVendor);
  router.patch(
    '/vendor',
    requireUser,
    requireRole('VENDOR'),
    validateRequest({ body: vendorProfileSchema }),
    controller.updateVendor,
  );
  return router;
}
