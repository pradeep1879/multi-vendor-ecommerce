import { AppError } from '../../common/errors/app-error';
import { loadEnvironment, type Environment } from '../../config/env';
import {
  CatalogRepository,
  type ProductCreateInput,
  type ProductUpdateInput,
} from './catalog.repository';
import { SearchIndex } from './search-index';

export class CatalogService {
  constructor(
    private readonly repository = new CatalogRepository(),
    private readonly environment: Environment = loadEnvironment(),
  ) {}
  listCategories(activeOnly = true) {
    return this.repository.listCategories(activeOnly);
  }
  listPublicCategories() {
    return this.repository.listPublicCategories();
  }
  searchPublicProducts(input: {
    q?: string;
    categoryId?: string;
    categorySlug?: string;
    vendorId?: string;
    minPrice?: bigint;
    maxPrice?: bigint;
    inStock?: boolean;
    sort: 'newest' | 'price_asc' | 'price_desc' | 'name';
    skip: number;
    take: number;
  }) {
    if (this.environment.elasticsearch) {
      const index = new SearchIndex(this.environment.elasticsearch);
      return index
        .search({
          ...(input.q ? { q: input.q } : {}),
          ...(input.categoryId ? { categoryId: input.categoryId } : {}),
          ...(input.vendorId ? { vendorId: input.vendorId } : {}),
          ...(input.minPrice !== undefined ? { minPrice: input.minPrice.toString() } : {}),
          ...(input.maxPrice !== undefined ? { maxPrice: input.maxPrice.toString() } : {}),
          ...(input.inStock !== undefined ? { inStock: input.inStock } : {}),
          page: Math.floor(input.skip / input.take) + 1,
          pageSize: input.take,
          sort: input.sort,
        })
        .then(async (result) => ({
          products: await this.repository.getPublicProductsByIds(result.ids),
          total: result.total,
        }))
        .catch(() => this.repository.searchPublicProducts(input));
    }
    return this.repository.searchPublicProducts(input);
  }
  async getPublicProduct(productId: string) {
    const product = await this.repository.getPublicProduct(productId);
    if (!product) throw new AppError(404, 'NOT_FOUND', 'Product was not found.');
    return product;
  }
  async createCategory(input: {
    name: string;
    slug: string;
    description?: string | null;
    parentId?: string | null;
  }) {
    try {
      return await this.repository.createCategory(input);
    } catch (error: unknown) {
      if (isUnique(error))
        throw new AppError(409, 'CATEGORY_SLUG_EXISTS', 'Category slug already exists.');
      throw error;
    }
  }
  async updateCategory(
    id: string,
    input: {
      name?: string;
      slug?: string;
      description?: string | null;
      active?: boolean;
      parentId?: string | null;
    },
  ) {
    if (!(await this.repository.updateCategory(id, input)).count)
      throw new AppError(404, 'NOT_FOUND', 'Category was not found.');
    return this.repository.getCategory(id);
  }
  async deleteCategory(id: string) {
    try {
      if (!(await this.repository.deleteCategory(id)))
        throw new AppError(404, 'NOT_FOUND', 'Category was not found.');
    } catch (error: unknown) {
      if (isForeignKey(error))
        throw new AppError(409, 'CATEGORY_IN_USE', 'Category has products or child categories.');
      throw error;
    }
  }
  async listProducts(ownerId: string, skip: number, take: number) {
    return Promise.all([
      this.repository.listVendorProducts(ownerId, skip, take),
      this.repository.countVendorProducts(ownerId),
    ]);
  }
  async getProduct(ownerId: string, id: string) {
    const value = await this.repository.getVendorProduct(ownerId, id);
    if (!value) throw new AppError(404, 'NOT_FOUND', 'Product was not found.');
    return value;
  }
  async listVariants(ownerId: string, productId: string) {
    await this.getProduct(ownerId, productId);
    return this.repository.listVendorVariants(ownerId, productId);
  }
  async createVariant(input: Parameters<CatalogRepository['createVendorVariant']>[0]) {
    let result: Awaited<ReturnType<CatalogRepository['createVendorVariant']>>;
    try {
      result = await this.repository.createVendorVariant(input);
    } catch (error: unknown) {
      if (isUnique(error))
        throw new AppError(409, 'VARIANT_SKU_EXISTS', 'This SKU is already used by this product.');
      throw error;
    }
    if (result.kind === 'NOT_FOUND')
      throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Editable product was not found.');
    return result.variant;
  }
  async updateVariant(
    ownerId: string,
    actorId: string,
    productId: string,
    variantId: string,
    input: Parameters<CatalogRepository['updateVendorVariant']>[4],
  ) {
    let result: Awaited<ReturnType<CatalogRepository['updateVendorVariant']>>;
    try {
      result = await this.repository.updateVendorVariant(
        ownerId,
        actorId,
        productId,
        variantId,
        input,
      );
    } catch (error: unknown) {
      if (isUnique(error))
        throw new AppError(409, 'VARIANT_SKU_EXISTS', 'This SKU is already used by this product.');
      throw error;
    }
    if (result.kind === 'NOT_FOUND')
      throw new AppError(404, 'VARIANT_NOT_FOUND', 'Editable product variant was not found.');
    return result.variant;
  }
  async adjustVariantInventory(
    ownerId: string,
    actorId: string,
    productId: string,
    variantId: string,
    delta: number,
    reason: string,
  ) {
    const result = await this.repository.adjustVariantInventory(
      ownerId,
      actorId,
      productId,
      variantId,
      delta,
      reason,
    );
    if (result.kind === 'NOT_FOUND')
      throw new AppError(404, 'VARIANT_NOT_FOUND', 'Product variant was not found.');
    if (result.kind === 'INVALID_STOCK')
      throw new AppError(409, 'INVALID_STOCK', 'Stock cannot be reduced below reserved quantity.');
    return result.inventory;
  }
  async createProduct(input: ProductCreateInput) {
    const result = await this.repository.createProduct(input);
    if (result.kind === 'VENDOR_UNAVAILABLE')
      throw new AppError(403, 'VENDOR_NOT_APPROVED', 'An approved vendor account is required.');
    if (result.kind === 'CATEGORY_UNAVAILABLE')
      throw new AppError(400, 'CATEGORY_UNAVAILABLE', 'Choose an active category.');
    return result.product;
  }
  async updateProduct(ownerId: string, id: string, input: ProductUpdateInput) {
    const result = await this.repository.updateProduct(ownerId, id, input);
    if (result.kind === 'NOT_FOUND') throw new AppError(404, 'NOT_FOUND', 'Product was not found.');
    if (result.kind === 'INVALID_STATE')
      throw new AppError(409, 'PRODUCT_LOCKED', 'Product cannot be edited in its current state.');
    if (result.kind === 'CATEGORY_UNAVAILABLE')
      throw new AppError(400, 'CATEGORY_UNAVAILABLE', 'Choose an active category.');
    return result.product;
  }
  async archiveProduct(ownerId: string, id: string) {
    const result = await this.repository.archiveProduct(ownerId, id);
    if (result.kind === 'NOT_FOUND') throw new AppError(404, 'NOT_FOUND', 'Product was not found.');
    if (result.kind === 'INVALID_STATE')
      throw new AppError(
        409,
        'PRODUCT_CANNOT_ARCHIVE',
        'Product has reserved stock or is already archived.',
      );
    return result.product;
  }
  async submitProduct(ownerId: string, id: string) {
    const result = await this.repository.submitProduct(ownerId, id);
    if (result.kind === 'NOT_FOUND')
      throw new AppError(404, 'NOT_FOUND', 'Approved vendor product was not found.');
    if (result.kind === 'INVALID_STATE')
      throw new AppError(409, 'PRODUCT_CANNOT_SUBMIT', 'Product is not ready for review.');
    return result.product;
  }
  listPendingProducts(skip: number, take: number) {
    return this.repository.listPendingProducts(skip, take);
  }
  async getImageProduct(ownerId: string, productId: string) {
    const product = await this.repository.getImageProduct(ownerId, productId);
    if (!product) throw new AppError(404, 'NOT_FOUND', 'Approved vendor product was not found.');
    return product;
  }
  addProductImage(input: {
    productId: string;
    objectKey: string;
    url: string;
    mimeType: string;
    sizeBytes: number;
    altText?: string;
    sortOrder: number;
  }) {
    return this.repository.addProductImage(input);
  }
  async updateProductImage(
    ownerId: string,
    productId: string,
    imageId: string,
    input: { altText?: string | null; sortOrder?: number; isPrimary?: boolean },
  ) {
    const image = await this.repository.updateProductImage(ownerId, productId, imageId, input);
    if (!image) throw new AppError(404, 'NOT_FOUND', 'Product image was not found.');
    return image;
  }
  async deleteProductImage(ownerId: string, productId: string, imageId: string) {
    const image = await this.repository.deleteProductImage(ownerId, productId, imageId);
    if (!image) throw new AppError(404, 'NOT_FOUND', 'Product image was not found.');
    return image;
  }
  async reviewProduct(input: {
    productId: string;
    reviewerId: string;
    decision: 'APPROVED' | 'REJECTED';
    reason: string;
  }) {
    const value = await this.repository.reviewProduct(input);
    if (!value)
      throw new AppError(409, 'PRODUCT_NOT_PENDING', 'Only pending products can be reviewed.');
    return value;
  }
  async adjustInventory(input: {
    ownerId: string;
    actorId: string;
    productId: string;
    delta: number;
    reason: string;
  }) {
    const result = await this.repository.adjustInventory(input);
    if (result.kind === 'NOT_FOUND')
      throw new AppError(404, 'NOT_FOUND', 'Product inventory was not found.');
    if (result.kind === 'INSUFFICIENT_STOCK')
      throw new AppError(
        409,
        'INSUFFICIENT_STOCK',
        'Stock cannot be reduced below reserved quantity.',
      );
    return result.inventory;
  }
}
function isUnique(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
function isForeignKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2003';
}
