import type { RequestHandler } from 'express';
import { getAuthContext } from '../../common/middleware/authentication';
import { sendData } from '../../common/middleware/response';
import { getValidatedRequest } from '../../common/validation/validate-request';
import type { CatalogService } from './catalog.service';

export function createCatalogController(service: CatalogService) {
  const publicCategories: RequestHandler = async (_req, res) =>
    sendData(res, { categories: await service.listPublicCategories() });
  const publicSearch: RequestHandler = async (_req, res) => {
    const q = getValidatedRequest<{
      query: {
        page: number;
        pageSize: number;
        q?: string;
        categoryId?: string;
        categorySlug?: string;
        vendorId?: string;
        minPricePaise?: string;
        maxPricePaise?: string;
        inStock?: boolean;
        sort: 'newest' | 'price_asc' | 'price_desc' | 'name';
      };
    }>(res).query;
    const result = await service.searchPublicProducts({
      ...(q.q ? { q: q.q } : {}),
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.categorySlug ? { categorySlug: q.categorySlug } : {}),
      ...(q.vendorId ? { vendorId: q.vendorId } : {}),
      ...(q.minPricePaise ? { minPrice: BigInt(q.minPricePaise) } : {}),
      ...(q.maxPricePaise ? { maxPrice: BigInt(q.maxPricePaise) } : {}),
      ...(q.inStock !== undefined ? { inStock: q.inStock } : {}),
      sort: q.sort,
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    });
    sendData(res, { products: result.products }, 200, {
      page: q.page,
      pageSize: q.pageSize,
      total: result.total,
    });
  };
  const publicProduct: RequestHandler = async (_req, res) => {
    const { productId } = getValidatedRequest<{ params: { productId: string } }>(res).params;
    sendData(res, { product: await service.getPublicProduct(productId) });
  };
  const categories: RequestHandler = async (_req, res) =>
    sendData(res, { categories: await service.listCategories(true) });
  const adminCategories: RequestHandler = async (_req, res) =>
    sendData(res, { categories: await service.listCategories(false) });
  const createCategory: RequestHandler = async (_req, res) => {
    const body = getValidatedRequest<{
      body: { name: string; slug: string; description?: string | null; parentId?: string | null };
    }>(res).body;
    sendData(res, { category: await service.createCategory(body) }, 201);
  };
  const updateCategory: RequestHandler = async (_req, res) => {
    const { categoryId } = getValidatedRequest<{ params: { categoryId: string } }>(res).params;
    const body = getValidatedRequest<{
      body: {
        name?: string;
        slug?: string;
        description?: string | null;
        active?: boolean;
        parentId?: string | null;
      };
    }>(res).body;
    sendData(res, { category: await service.updateCategory(categoryId, body) });
  };
  const deleteCategory: RequestHandler = async (_req, res) => {
    const { categoryId } = getValidatedRequest<{ params: { categoryId: string } }>(res).params;
    await service.deleteCategory(categoryId);
    res.status(204).end();
  };
  const listProducts: RequestHandler = async (_req, res) => {
    const { page, pageSize } = getValidatedRequest<{ query: { page: number; pageSize: number } }>(
      res,
    ).query;
    const [products, total] = await service.listProducts(
      getAuthContext(res).userId,
      (page - 1) * pageSize,
      pageSize,
    );
    sendData(res, { products }, 200, { page, pageSize, total });
  };
  const getProduct: RequestHandler = async (_req, res) => {
    const { productId } = getValidatedRequest<{ params: { productId: string } }>(res).params;
    sendData(res, { product: await service.getProduct(getAuthContext(res).userId, productId) });
  };
  const createProduct: RequestHandler = async (_req, res) => {
    const b = getValidatedRequest<{ body: ProductBody }>(res).body;
    const { pricePaise, compareAtPricePaise, ...rest } = b;
    const product = await service.createProduct({
      ...rest,
      pricePaise: BigInt(pricePaise),
      ...(compareAtPricePaise ? { compareAtPricePaise: BigInt(compareAtPricePaise) } : {}),
      ownerId: getAuthContext(res).userId,
      actorId: getAuthContext(res).userId,
    });
    sendData(res, { product }, 201);
  };
  const updateProduct: RequestHandler = async (_req, res) => {
    const { productId } = getValidatedRequest<{ params: { productId: string } }>(res).params;
    const b = getValidatedRequest<{ body: Partial<ProductBody> }>(res).body;
    const { pricePaise, compareAtPricePaise, ...rest } = b;
    delete rest.initialStock;
    const product = await service.updateProduct(getAuthContext(res).userId, productId, {
      ...rest,
      ...(pricePaise ? { pricePaise: BigInt(pricePaise) } : {}),
      ...(compareAtPricePaise !== undefined
        ? { compareAtPricePaise: compareAtPricePaise === null ? null : BigInt(compareAtPricePaise) }
        : {}),
    });
    sendData(res, { product });
  };
  const archiveProduct: RequestHandler = async (_req, res) => {
    const { productId } = getValidatedRequest<{ params: { productId: string } }>(res).params;
    sendData(res, { product: await service.archiveProduct(getAuthContext(res).userId, productId) });
  };
  const submitProduct: RequestHandler = async (_req, res) => {
    const { productId } = getValidatedRequest<{ params: { productId: string } }>(res).params;
    sendData(res, { product: await service.submitProduct(getAuthContext(res).userId, productId) });
  };
  const adjustInventory: RequestHandler = async (_req, res) => {
    const { productId } = getValidatedRequest<{ params: { productId: string } }>(res).params;
    const body = getValidatedRequest<{ body: { delta: number; reason: string } }>(res).body;
    sendData(res, {
      inventory: await service.adjustInventory({
        ...body,
        productId,
        ownerId: getAuthContext(res).userId,
        actorId: getAuthContext(res).userId,
      }),
    });
  };
  const pendingProducts: RequestHandler = async (_req, res) => {
    const { page, pageSize } = getValidatedRequest<{ query: { page: number; pageSize: number } }>(
      res,
    ).query;
    sendData(res, { products: await service.listPendingProducts((page - 1) * pageSize, pageSize) });
  };
  const review =
    (decision: 'APPROVED' | 'REJECTED'): RequestHandler =>
    async (_req, res) => {
      const { productId } = getValidatedRequest<{ params: { productId: string } }>(res).params;
      const { reason } = getValidatedRequest<{ body: { reason: string } }>(res).body;
      sendData(res, {
        product: await service.reviewProduct({
          productId,
          reviewerId: getAuthContext(res).userId,
          decision,
          reason,
        }),
      });
    };
  return {
    publicCategories,
    publicSearch,
    publicProduct,
    categories,
    adminCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    listProducts,
    getProduct,
    createProduct,
    updateProduct,
    archiveProduct,
    submitProduct,
    adjustInventory,
    pendingProducts,
    approveProduct: review('APPROVED'),
    rejectProduct: review('REJECTED'),
  };
}
type ProductBody = {
  categoryId: string;
  name: string;
  slug: string;
  sku: string;
  description: string;
  pricePaise: string;
  compareAtPricePaise?: string | null;
  taxCode: string;
  attributes?: Record<string, string | number | boolean>;
  initialStock: number;
};
