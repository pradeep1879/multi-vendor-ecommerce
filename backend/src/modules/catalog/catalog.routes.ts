import express, { type Router } from 'express';
import { z } from 'zod';
import { authentication, requireRole } from '../../common/middleware/authentication.js';
import { getValidatedRequest, validateRequest } from '../../common/validation/validate-request.js';
import type { Environment } from '../../config/env.js';
import { AuthService } from '../auth/auth.service.js';
import { CatalogService } from './catalog.service.js';
import { createCatalogController } from './catalog.controller.js';
import { ImageStorage, type ImageMime } from './image-storage.js';
import { AppError } from '../../common/errors/app-error.js';
import { getAuthContext } from '../../common/middleware/authentication.js';
import { sendData } from '../../common/middleware/response.js';

const params = (key: string) => z.object({ [key]: z.uuid() }).strict();
const page = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
const catalogQuery = page
  .extend({
    q: z.string().trim().min(1).max(160).optional(),
    categoryId: z.uuid().optional(),
    categorySlug: z.string().trim().min(1).max(160).optional(),
    vendorId: z.uuid().optional(),
    minPricePaise: z
      .string()
      .regex(/^\d{1,12}$/)
      .optional(),
    maxPricePaise: z
      .string()
      .regex(/^\d{1,12}$/)
      .optional(),
    inStock: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    sort: z.enum(['newest', 'price_asc', 'price_desc', 'name']).default('newest'),
  })
  .strict()
  .refine(
    (v) =>
      !v.minPricePaise || !v.maxPricePaise || BigInt(v.minPricePaise) <= BigInt(v.maxPricePaise),
  );
const category = z
  .object({
    name: z.string().trim().min(1).max(120),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(160),
    description: z.string().max(1000).nullable().optional(),
    parentId: z.uuid().nullable().optional(),
  })
  .strict();
const categoryUpdate = category
  .partial()
  .extend({ active: z.boolean().optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0);
const productFields = z
  .object({
    categoryId: z.uuid(),
    name: z.string().trim().min(1).max(240),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(260),
    sku: z.string().trim().min(1).max(100),
    description: z.string().max(20000),
    pricePaise: z.string().regex(/^[1-9]\d{0,11}$/),
    compareAtPricePaise: z
      .string()
      .regex(/^[1-9]\d{0,11}$/)
      .nullable()
      .optional(),
    taxCode: z.string().trim().min(1).max(40),
    attributes: z
      .record(z.string(), z.union([z.string().max(500), z.number().finite(), z.boolean()]))
      .optional(),
    initialStock: z.number().int().min(0).max(1_000_000),
  })
  .strict();
const product = productFields.refine(
  (v) => !v.compareAtPricePaise || BigInt(v.compareAtPricePaise) > BigInt(v.pricePaise),
  {
    path: ['compareAtPricePaise'],
    message: 'Compare-at price must exceed price.',
  },
);
const productUpdate = productFields
  .partial()
  .omit({ initialStock: true })
  .strict()
  .refine((v) => Object.keys(v).length > 0)
  .refine(
    (v) =>
      !v.compareAtPricePaise ||
      !v.pricePaise ||
      BigInt(v.compareAtPricePaise) > BigInt(v.pricePaise),
  );
const variantFields = z
  .object({
    sku: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(160),
    optionValues: z
      .record(z.string().trim().min(1).max(80), z.string().trim().min(1).max(160))
      .default({}),
    pricePaise: z.string().regex(/^[1-9]\d{0,11}$/),
    compareAtPricePaise: z
      .string()
      .regex(/^[1-9]\d{0,11}$/)
      .nullable()
      .optional(),
    initialStock: z.number().int().min(0).max(1_000_000),
  })
  .strict();
const variantCreate = variantFields.refine(
  (v) => !v.compareAtPricePaise || BigInt(v.compareAtPricePaise) > BigInt(v.pricePaise),
);
const variantUpdate = variantFields
  .omit({ initialStock: true })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0);
const reason = z.object({ reason: z.string().trim().min(3).max(1000) }).strict();
const adjustment = z
  .object({
    delta: z
      .number()
      .int()
      .min(-1_000_000)
      .max(1_000_000)
      .refine((v) => v !== 0),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
const uploadRequest = z
  .object({
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    sizeBytes: z.number().int().positive(),
  })
  .strict();
const imageCompletion = uploadRequest
  .extend({
    objectKey: z.string().min(1).max(512),
    altText: z.string().trim().max(300).optional(),
    sortOrder: z.number().int().min(0).max(1000).default(0),
  })
  .strict();
const imageUpdate = z
  .object({
    altText: z.string().trim().max(300).nullable().optional(),
    sortOrder: z.number().int().min(0).max(1000).optional(),
    isPrimary: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0);
export function createCatalogRouter(environment: Environment, service?: CatalogService): Router {
  const router = express.Router();
  const catalogService = service ?? new CatalogService(undefined, environment);
  const c = createCatalogController(catalogService);
  const auth = authentication(new AuthService(environment));
  router.get('/catalog/categories', c.publicCategories);
  router.get('/catalog/products', validateRequest({ query: catalogQuery }), c.publicSearch);
  router.get(
    '/catalog/products/:productId',
    validateRequest({
      params: z.object({ productId: z.string().trim().min(1).max(260) }).strict(),
    }),
    c.publicProduct,
  );
  router.get('/admin/categories', auth, requireRole('ADMIN'), c.adminCategories);
  router.post(
    '/admin/categories',
    auth,
    requireRole('ADMIN'),
    validateRequest({ body: category }),
    c.createCategory,
  );
  router.patch(
    '/admin/categories/:categoryId',
    auth,
    requireRole('ADMIN'),
    validateRequest({ params: params('categoryId'), body: categoryUpdate }),
    c.updateCategory,
  );
  router.delete(
    '/admin/categories/:categoryId',
    auth,
    requireRole('ADMIN'),
    validateRequest({ params: params('categoryId') }),
    c.deleteCategory,
  );
  router.get(
    '/vendor/products',
    auth,
    requireRole('VENDOR'),
    validateRequest({ query: page }),
    c.listProducts,
  );
  router.post(
    '/vendor/products',
    auth,
    requireRole('VENDOR'),
    validateRequest({ body: product }),
    c.createProduct,
  );
  router.get(
    '/vendor/products/:productId',
    auth,
    requireRole('VENDOR'),
    validateRequest({ params: params('productId') }),
    c.getProduct,
  );
  router.get(
    '/vendor/products/:productId/variants',
    auth,
    requireRole('VENDOR'),
    validateRequest({ params: params('productId') }),
    async (_request, response) => {
      const { productId } = getValidatedRequest<{ params: { productId: string } }>(response).params;
      sendData(response, {
        variants: await catalogService.listVariants(getAuthContext(response).userId, productId),
      });
    },
  );
  router.post(
    '/vendor/products/:productId/variants',
    auth,
    requireRole('VENDOR'),
    validateRequest({ params: params('productId'), body: variantCreate }),
    async (_request, response) => {
      const p = getValidatedRequest<{
        params: { productId: string };
        body: z.infer<typeof variantCreate>;
      }>(response);
      const variant = await catalogService.createVariant({
        ownerId: getAuthContext(response).userId,
        actorId: getAuthContext(response).userId,
        productId: p.params.productId,
        sku: p.body.sku,
        name: p.body.name,
        optionValues: p.body.optionValues,
        pricePaise: BigInt(p.body.pricePaise),
        compareAtPricePaise: p.body.compareAtPricePaise ? BigInt(p.body.compareAtPricePaise) : null,
        initialStock: p.body.initialStock,
      });
      sendData(response, { variant }, 201);
    },
  );
  router.patch(
    '/vendor/products/:productId/variants/:variantId',
    auth,
    requireRole('VENDOR'),
    validateRequest({
      params: z.object({ productId: z.uuid(), variantId: z.uuid() }).strict(),
      body: variantUpdate,
    }),
    async (_request, response) => {
      const p = getValidatedRequest<{
        params: { productId: string; variantId: string };
        body: z.infer<typeof variantUpdate>;
      }>(response);
      const input = p.body;
      const { pricePaise, compareAtPricePaise, ...fields } = input;
      const variant = await catalogService.updateVariant(
        getAuthContext(response).userId,
        getAuthContext(response).userId,
        p.params.productId,
        p.params.variantId,
        {
          ...fields,
          ...(pricePaise ? { pricePaise: BigInt(pricePaise) } : {}),
          ...(compareAtPricePaise !== undefined
            ? {
                compareAtPricePaise: compareAtPricePaise ? BigInt(compareAtPricePaise) : null,
              }
            : {}),
        },
      );
      sendData(response, { variant });
    },
  );
  router.post(
    '/vendor/products/:productId/variants/:variantId/inventory-adjustments',
    auth,
    requireRole('VENDOR'),
    validateRequest({
      params: z.object({ productId: z.uuid(), variantId: z.uuid() }).strict(),
      body: adjustment,
    }),
    async (_request, response) => {
      const data = getValidatedRequest<{
        params: { productId: string; variantId: string };
        body: { delta: number; reason: string };
      }>(response);
      const actorId = getAuthContext(response).userId;
      sendData(response, {
        inventory: await catalogService.adjustVariantInventory(
          actorId,
          actorId,
          data.params.productId,
          data.params.variantId,
          data.body.delta,
          data.body.reason,
        ),
      });
    },
  );
  router.patch(
    '/vendor/products/:productId',
    auth,
    requireRole('VENDOR'),
    validateRequest({ params: params('productId'), body: productUpdate }),
    c.updateProduct,
  );
  router.post(
    '/vendor/products/:productId/archive',
    auth,
    requireRole('VENDOR'),
    validateRequest({ params: params('productId') }),
    c.archiveProduct,
  );
  router.post(
    '/vendor/products/:productId/submit',
    auth,
    requireRole('VENDOR'),
    validateRequest({ params: params('productId') }),
    c.submitProduct,
  );
  router.post(
    '/vendor/products/:productId/inventory-adjustments',
    auth,
    requireRole('VENDOR'),
    validateRequest({ params: params('productId'), body: adjustment }),
    c.adjustInventory,
  );
  router.post(
    '/vendor/products/:productId/images/upload-url',
    auth,
    requireRole('VENDOR'),
    validateRequest({ params: params('productId'), body: uploadRequest }),
    async (_req, res) => {
      const { productId } = getValidatedRequest<{ params: { productId: string } }>(res).params;
      const body = getValidatedRequest<{ body: { mimeType: ImageMime; sizeBytes: number } }>(
        res,
      ).body;
      const product = await catalogService.getImageProduct(getAuthContext(res).userId, productId);
      sendData(
        res,
        await new ImageStorage(environment).presign(
          product.vendorId,
          productId,
          body.mimeType,
          body.sizeBytes,
        ),
        201,
      );
    },
  );
  router.post(
    '/vendor/products/:productId/images',
    auth,
    requireRole('VENDOR'),
    validateRequest({ params: params('productId'), body: imageCompletion }),
    async (_req, res) => {
      const { productId } = getValidatedRequest<{ params: { productId: string } }>(res).params;
      const body = getValidatedRequest<{
        body: {
          objectKey: string;
          mimeType: ImageMime;
          sizeBytes: number;
          altText?: string;
          sortOrder: number;
        };
      }>(res).body;
      const product = await catalogService.getImageProduct(getAuthContext(res).userId, productId);
      const prefix = `products/${product.vendorId}/${productId}/`;
      if (!body.objectKey.startsWith(prefix) || body.objectKey.slice(prefix.length).includes('/'))
        throw new AppError(400, 'IMAGE_KEY_INVALID', 'Image key was not issued for this product.');
      const storage = new ImageStorage(environment);
      const url = await storage.validateUploaded(body.objectKey, body.mimeType, body.sizeBytes);
      let image: Awaited<ReturnType<typeof catalogService.addProductImage>>;
      try {
        image = await catalogService.addProductImage({
          productId,
          objectKey: body.objectKey,
          url,
          mimeType: body.mimeType,
          sizeBytes: body.sizeBytes,
          altText: body.altText,
          sortOrder: body.sortOrder,
        });
      } catch (error: unknown) {
        await storage.delete(body.objectKey).catch(() => undefined);
        throw error;
      }
      sendData(res, { image }, 201);
    },
  );
  router.patch(
    '/vendor/products/:productId/images/:imageId',
    auth,
    requireRole('VENDOR'),
    validateRequest({
      params: z.object({ productId: z.uuid(), imageId: z.uuid() }).strict(),
      body: imageUpdate,
    }),
    async (_req, res) => {
      const p = getValidatedRequest<{ params: { productId: string; imageId: string } }>(res).params;
      const body = getValidatedRequest<{
        body: { altText?: string | null; sortOrder?: number; isPrimary?: boolean };
      }>(res).body;
      sendData(res, {
        image: await catalogService.updateProductImage(
          getAuthContext(res).userId,
          p.productId,
          p.imageId,
          body,
        ),
      });
    },
  );
  router.delete(
    '/vendor/products/:productId/images/:imageId',
    auth,
    requireRole('VENDOR'),
    validateRequest({ params: z.object({ productId: z.uuid(), imageId: z.uuid() }).strict() }),
    async (_req, res) => {
      const p = getValidatedRequest<{ params: { productId: string; imageId: string } }>(res).params;
      const image = await catalogService.deleteProductImage(
        getAuthContext(res).userId,
        p.productId,
        p.imageId,
      );
      if (!image.objectKey.startsWith('external:'))
        await new ImageStorage(environment).delete(image.objectKey);
      res.status(204).end();
    },
  );
  router.get(
    '/admin/products/pending',
    auth,
    requireRole('ADMIN'),
    validateRequest({ query: page }),
    c.pendingProducts,
  );
  router.post(
    '/admin/products/:productId/approve',
    auth,
    requireRole('ADMIN'),
    validateRequest({ params: params('productId'), body: reason }),
    c.approveProduct,
  );
  router.post(
    '/admin/products/:productId/reject',
    auth,
    requireRole('ADMIN'),
    validateRequest({ params: params('productId'), body: reason }),
    c.rejectProduct,
  );
  return router;
}
