import { getPrismaClient } from '../../infrastructure/database/client.js';

export class CatalogRepository {
  private readonly prisma = getPrismaClient;

  listCategories(activeOnly: boolean) {
    return this.prisma().category.findMany({
      where: activeOnly ? { active: true } : undefined,
      orderBy: [{ name: 'asc' }],
    });
  }

  listPublicCategories() {
    return this.prisma().category.findMany({
      where: { active: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  async searchPublicProducts(input: {
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
    const where = {
      status: 'ACTIVE' as const,
      category: { active: true, ...(input.categorySlug ? { slug: input.categorySlug } : {}) },
      vendor: { status: 'APPROVED' as const },
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      ...(input.vendorId ? { vendorId: input.vendorId } : {}),
      ...(input.minPrice !== undefined || input.maxPrice !== undefined
        ? {
            variants: {
              some: {
                active: true,
                pricePaise: {
                  ...(input.minPrice !== undefined ? { gte: input.minPrice } : {}),
                  ...(input.maxPrice !== undefined ? { lte: input.maxPrice } : {}),
                },
              },
            },
          }
        : {}),
      ...(input.inStock !== undefined
        ? input.inStock
          ? { variants: { some: { active: true, inventory: { is: { onHand: { gt: 0 } } } } } }
          : {
              NOT: {
                variants: { some: { active: true, inventory: { is: { onHand: { gt: 0 } } } } },
              },
            }
        : {}),
      ...(input.q
        ? {
            OR: [
              { name: { contains: input.q, mode: 'insensitive' as const } },
              { description: { contains: input.q, mode: 'insensitive' as const } },
              { sku: { contains: input.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const orderBy =
      input.sort === 'price_asc'
        ? [{ pricePaise: 'asc' as const }, { id: 'asc' as const }]
        : input.sort === 'price_desc'
          ? [{ pricePaise: 'desc' as const }, { id: 'asc' as const }]
          : input.sort === 'name'
            ? [{ name: 'asc' as const }, { id: 'asc' as const }]
            : [{ createdAt: 'desc' as const }, { id: 'asc' as const }];
    const [products, total] = await this.prisma().$transaction([
      this.prisma().product.findMany({
        where,
        skip: input.skip,
        take: input.take,
        orderBy,
        include: {
          category: { select: { id: true, name: true, slug: true } },
          vendor: { select: { id: true, name: true, slug: true } },
          inventory: true,
          images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
          variants: {
            where: { active: true },
            include: { inventory: true },
            orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
          },
          brand: true,
        },
      }),
      this.prisma().product.count({ where }),
    ]);
    return { products, total };
  }

  async getPublicProductsByIds(ids: string[]) {
    if (!ids.length) return [];
    const products = await this.prisma().product.findMany({
      where: {
        id: { in: ids },
        status: 'ACTIVE',
        category: { active: true },
        vendor: { status: 'APPROVED' },
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        vendor: { select: { id: true, name: true, slug: true } },
        inventory: true,
        images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
        variants: {
          where: { active: true },
          include: { inventory: true },
          orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
        },
        brand: true,
      },
    });
    const rank = new Map(ids.map((id, index) => [id, index]));
    return products.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  }

  getPublicProduct(productId: string) {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId);
    return this.prisma().product.findFirst({
      where: {
        ...(isUuid ? { id: productId } : { slug: productId }),
        status: 'ACTIVE',
        category: { active: true },
        vendor: { status: 'APPROVED' },
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        vendor: { select: { id: true, name: true, slug: true, description: true } },
        inventory: true,
        images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
        variants: {
          where: { active: true },
          include: { inventory: true },
          orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
        },
        brand: true,
      },
    });
  }

  createCategory(input: {
    name: string;
    slug: string;
    description?: string | null;
    parentId?: string | null;
  }) {
    return this.prisma().category.create({ data: input });
  }

  updateCategory(
    categoryId: string,
    input: {
      name?: string;
      slug?: string;
      description?: string | null;
      active?: boolean;
      parentId?: string | null;
    },
  ) {
    return this.prisma().category.updateMany({ where: { id: categoryId }, data: input });
  }

  getCategory(categoryId: string) {
    return this.prisma().category.findUnique({ where: { id: categoryId } });
  }

  async deleteCategory(categoryId: string): Promise<boolean> {
    const deleted = await this.prisma().category.deleteMany({ where: { id: categoryId } });
    return deleted.count === 1;
  }

  listVendorProducts(ownerId: string, skip: number, take: number) {
    return this.prisma().product.findMany({
      where: { vendor: { ownerId } },
      skip,
      take,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      include: {
        category: { select: { id: true, name: true, slug: true } },
        inventory: true,
        images: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
        variants: {
          include: { inventory: true },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });
  }

  countVendorProducts(ownerId: string) {
    return this.prisma().product.count({ where: { vendor: { ownerId } } });
  }

  async getImageProduct(ownerId: string, productId: string) {
    return this.prisma().product.findFirst({
      where: { id: productId, vendor: { ownerId, status: 'APPROVED' } },
      select: { id: true, vendorId: true, status: true },
    });
  }

  async addProductImage(input: {
    productId: string;
    objectKey: string;
    url: string;
    mimeType: string;
    sizeBytes: number;
    altText?: string;
    sortOrder: number;
  }) {
    return this.prisma().$transaction(async (tx) => {
      const count = await tx.productImage.count({ where: { productId: input.productId } });
      const isPrimary = count === 0;
      if (isPrimary)
        await tx.product.update({
          where: { id: input.productId },
          data: { status: 'DRAFT', approvedAt: null },
        });
      const image = await tx.productImage.create({ data: { ...input, isPrimary } });
      await tx.searchOutboxEvent.create({
        data: { productId: input.productId, eventType: 'UPSERT' },
      });
      return image;
    });
  }

  updateProductImage(
    ownerId: string,
    productId: string,
    imageId: string,
    input: { altText?: string | null; sortOrder?: number; isPrimary?: boolean },
  ) {
    return this.prisma().$transaction(async (tx) => {
      const image = await tx.productImage.findFirst({
        where: { id: imageId, productId, product: { vendor: { ownerId } } },
      });
      if (!image) return undefined;
      if (input.isPrimary)
        await tx.productImage.updateMany({ where: { productId }, data: { isPrimary: false } });
      const updated = await tx.productImage.update({ where: { id: imageId }, data: input });
      await tx.searchOutboxEvent.create({ data: { productId, eventType: 'UPSERT' } });
      return updated;
    });
  }

  deleteProductImage(ownerId: string, productId: string, imageId: string) {
    return this.prisma().$transaction(async (tx) => {
      const image = await tx.productImage.findFirst({
        where: { id: imageId, productId, product: { vendor: { ownerId } } },
      });
      if (!image) return undefined;
      await tx.productImage.delete({ where: { id: imageId } });
      if (image.isPrimary) {
        const next = await tx.productImage.findFirst({
          where: { productId },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        });
        if (next)
          await tx.productImage.update({ where: { id: next.id }, data: { isPrimary: true } });
      }
      await tx.searchOutboxEvent.create({ data: { productId, eventType: 'UPSERT' } });
      return image;
    });
  }

  getVendorProduct(ownerId: string, productId: string) {
    return this.prisma().product.findFirst({
      where: { id: productId, vendor: { ownerId } },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        inventory: true,
        images: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
        variants: {
          include: { inventory: true },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });
  }

  listVendorVariants(ownerId: string, productId: string) {
    return this.prisma().productVariant.findMany({
      where: { productId, product: { vendor: { ownerId } } },
      include: { inventory: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  createVendorVariant(input: {
    ownerId: string;
    actorId: string;
    productId: string;
    sku: string;
    name: string;
    optionValues: Record<string, string>;
    pricePaise: bigint;
    compareAtPricePaise: bigint | null;
    initialStock: number;
  }) {
    return this.prisma().$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: {
          id: input.productId,
          vendor: { ownerId: input.ownerId, status: 'APPROVED' },
          status: { in: ['DRAFT', 'REJECTED'] },
        },
        select: { id: true },
      });
      if (!product) return { kind: 'NOT_FOUND' as const };
      const variant = await tx.productVariant.create({
        data: {
          productId: product.id,
          sku: input.sku,
          name: input.name,
          optionValues: input.optionValues,
          pricePaise: input.pricePaise,
          compareAtPricePaise: input.compareAtPricePaise,
          inventory: { create: { productId: null, onHand: input.initialStock } },
        },
        include: { inventory: true },
      });
      if (input.initialStock > 0 && variant.inventory)
        await tx.inventoryMovement.create({
          data: {
            inventoryId: variant.inventory.id,
            actorId: input.actorId,
            type: 'RECEIPT',
            quantity: input.initialStock,
            reason: 'Initial variant stock',
          },
        });
      await tx.product.update({
        where: { id: product.id },
        data: { status: 'DRAFT', approvedAt: null },
      });
      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          action: 'product.variant.create',
          targetType: 'product_variant',
          targetId: variant.id,
        },
      });
      await tx.searchOutboxEvent.create({ data: { productId: product.id, eventType: 'UPSERT' } });
      return { kind: 'CREATED' as const, variant };
    });
  }

  updateVendorVariant(
    ownerId: string,
    actorId: string,
    productId: string,
    variantId: string,
    input: {
      sku?: string;
      name?: string;
      optionValues?: Record<string, string>;
      pricePaise?: bigint;
      compareAtPricePaise?: bigint | null;
      active?: boolean;
    },
  ) {
    return this.prisma().$transaction(async (tx) => {
      const variant = await tx.productVariant.findFirst({
        where: {
          id: variantId,
          productId,
          product: {
            vendor: { ownerId, status: 'APPROVED' },
            status: { in: ['DRAFT', 'REJECTED'] },
          },
        },
      });
      if (!variant || variant.isDefault) return { kind: 'NOT_FOUND' as const };
      const updated = await tx.productVariant.update({
        where: { id: variant.id },
        data: input,
        include: { inventory: true },
      });
      await tx.product.update({
        where: { id: productId },
        data: { status: 'DRAFT', approvedAt: null },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'product.variant.update',
          targetType: 'product_variant',
          targetId: variant.id,
        },
      });
      await tx.searchOutboxEvent.create({ data: { productId, eventType: 'UPSERT' } });
      return { kind: 'UPDATED' as const, variant: updated };
    });
  }

  adjustVariantInventory(
    ownerId: string,
    actorId: string,
    productId: string,
    variantId: string,
    delta: number,
    reason: string,
  ) {
    return this.prisma().$transaction(async (tx) => {
      const variant = await tx.productVariant.findFirst({
        where: { id: variantId, productId, product: { vendor: { ownerId, status: 'APPROVED' } } },
        include: { inventory: true },
      });
      if (!variant?.inventory) return { kind: 'NOT_FOUND' as const };
      const inventory = variant.inventory;
      if (inventory.onHand + delta < inventory.reserved) return { kind: 'INVALID_STOCK' as const };
      const updated = await tx.inventory.update({
        where: { id: inventory.id },
        data: { onHand: { increment: delta }, version: { increment: 1 } },
      });
      await tx.inventoryMovement.create({
        data: { inventoryId: inventory.id, actorId, type: 'ADJUSTMENT', quantity: delta, reason },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'variant.inventory.adjust',
          targetType: 'product_variant',
          targetId: variantId,
          reason,
        },
      });
      await tx.searchOutboxEvent.create({ data: { productId, eventType: 'UPSERT' } });
      return { kind: 'ADJUSTED' as const, inventory: updated };
    });
  }

  createProduct(input: ProductCreateInput & { ownerId: string; actorId: string }) {
    return this.prisma().$transaction(async (tx) => {
      const vendor = await tx.vendor.findUnique({ where: { ownerId: input.ownerId } });
      if (!vendor || vendor.status !== 'APPROVED') return { kind: 'VENDOR_UNAVAILABLE' as const };
      const category = await tx.category.findUnique({ where: { id: input.categoryId } });
      if (!category || !category.active) return { kind: 'CATEGORY_UNAVAILABLE' as const };
      const { actorId, initialStock } = input;
      const data = { ...input };
      delete (data as Partial<typeof data>).ownerId;
      delete (data as Partial<typeof data>).actorId;
      delete (data as Partial<typeof data>).initialStock;
      const product = await tx.product.create({
        data: {
          ...data,
          vendorId: vendor.id,
          status: 'DRAFT',
          inventory: { create: { onHand: initialStock } },
        },
        include: {
          inventory: true,
          category: { select: { id: true, name: true, slug: true } },
          images: true,
          variants: { include: { inventory: true } },
        },
      });
      const defaultVariant = await tx.productVariant.create({
        data: {
          productId: product.id,
          sku: product.sku,
          name: 'Default',
          pricePaise: product.pricePaise,
          compareAtPricePaise: product.compareAtPricePaise,
          active: true,
          isDefault: true,
        },
      });
      await tx.inventory.update({
        where: { productId: product.id },
        data: { variantId: defaultVariant.id },
      });
      if (initialStock > 0) {
        await tx.inventoryMovement.create({
          data: {
            inventoryId: product.inventory!.id,
            actorId,
            type: 'RECEIPT',
            quantity: initialStock,
            reason: 'Initial product stock',
          },
        });
      }
      await tx.auditLog.create({
        data: { actorId, action: 'product.create', targetType: 'product', targetId: product.id },
      });
      await tx.searchOutboxEvent.create({ data: { productId: product.id, eventType: 'UPSERT' } });
      const createdProduct = await tx.product.findUniqueOrThrow({
        where: { id: product.id },
        include: {
          inventory: true,
          category: { select: { id: true, name: true, slug: true } },
          images: true,
          variants: { include: { inventory: true } },
          brand: true,
        },
      });
      return { kind: 'CREATED' as const, product: createdProduct };
    });
  }

  updateProduct(ownerId: string, productId: string, input: ProductUpdateInput) {
    return this.prisma().$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: productId, vendor: { ownerId } },
        include: { variants: { where: { isDefault: true } } },
      });
      if (!product) return { kind: 'NOT_FOUND' as const };
      if (product.status === 'ARCHIVED' || product.status === 'PENDING_REVIEW')
        return { kind: 'INVALID_STATE' as const };
      const category = await tx.category.findUnique({
        where: { id: input.categoryId ?? product.categoryId },
      });
      if (!category || !category.active) return { kind: 'CATEGORY_UNAVAILABLE' as const };
      const updated = await tx.product.update({
        where: { id: product.id },
        data: {
          ...input,
          ...(product.status === 'ACTIVE' || product.status === 'REJECTED'
            ? { status: 'DRAFT' as const, approvedAt: null, statusReason: null, submittedAt: null }
            : {}),
        },
        include: {
          inventory: true,
          category: { select: { id: true, name: true, slug: true } },
          images: true,
          variants: { include: { inventory: true } },
        },
      });
      const defaultVariant = product.variants[0];
      if (
        defaultVariant &&
        (input.sku || input.pricePaise || input.compareAtPricePaise !== undefined)
      )
        await tx.productVariant.update({
          where: { id: defaultVariant.id },
          data: {
            ...(input.sku ? { sku: input.sku } : {}),
            ...(input.pricePaise ? { pricePaise: BigInt(input.pricePaise) } : {}),
            ...(input.compareAtPricePaise !== undefined
              ? {
                  compareAtPricePaise: input.compareAtPricePaise
                    ? BigInt(input.compareAtPricePaise)
                    : null,
                }
              : {}),
          },
        });
      await tx.auditLog.create({
        data: {
          actorId: ownerId,
          action: 'product.update',
          targetType: 'product',
          targetId: product.id,
        },
      });
      await tx.searchOutboxEvent.create({ data: { productId: product.id, eventType: 'UPSERT' } });
      return { kind: 'UPDATED' as const, product: updated };
    });
  }

  async archiveProduct(ownerId: string, productId: string) {
    return this.prisma().$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: productId, vendor: { ownerId } },
        include: { inventory: true },
      });
      if (!product) return { kind: 'NOT_FOUND' as const };
      if (product.status === 'ARCHIVED' || (product.inventory?.reserved ?? 0) > 0)
        return { kind: 'INVALID_STATE' as const };
      const archived = await tx.product.update({
        where: { id: productId },
        data: { status: 'ARCHIVED', archivedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: ownerId,
          action: 'product.archive',
          targetType: 'product',
          targetId: productId,
        },
      });
      await tx.searchOutboxEvent.create({ data: { productId, eventType: 'UPSERT' } });
      return { kind: 'ARCHIVED' as const, product: archived };
    });
  }

  submitProduct(ownerId: string, productId: string) {
    return this.prisma().$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: productId, vendor: { ownerId, status: 'APPROVED' } },
        include: { category: true },
      });
      if (!product) return { kind: 'NOT_FOUND' as const };
      if (!['DRAFT', 'REJECTED'].includes(product.status) || !product.category.active)
        return { kind: 'INVALID_STATE' as const };
      const submitted = await tx.product.update({
        where: { id: productId },
        data: { status: 'PENDING_REVIEW', submittedAt: new Date(), statusReason: null },
      });
      await tx.auditLog.create({
        data: {
          actorId: ownerId,
          action: 'product.submit',
          targetType: 'product',
          targetId: productId,
        },
      });
      await tx.searchOutboxEvent.create({ data: { productId, eventType: 'UPSERT' } });
      return { kind: 'SUBMITTED' as const, product: submitted };
    });
  }

  listPendingProducts(skip: number, take: number) {
    return this.prisma().product.findMany({
      where: { status: 'PENDING_REVIEW' },
      skip,
      take,
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
      include: {
        vendor: { select: { id: true, name: true, status: true } },
        category: { select: { id: true, name: true } },
        inventory: true,
        images: true,
      },
    });
  }

  reviewProduct(input: {
    productId: string;
    reviewerId: string;
    decision: 'APPROVED' | 'REJECTED';
    reason: string;
  }) {
    return this.prisma().$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: input.productId } });
      if (!product || product.status !== 'PENDING_REVIEW') return undefined;
      const updated = await tx.product.update({
        where: { id: product.id },
        data: {
          status: input.decision === 'APPROVED' ? 'ACTIVE' : 'REJECTED',
          statusReason: input.reason,
          approvedAt: input.decision === 'APPROVED' ? new Date() : null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: input.reviewerId,
          action: `product.${input.decision.toLowerCase()}`,
          targetType: 'product',
          targetId: product.id,
          reason: input.reason,
        },
      });
      await tx.searchOutboxEvent.create({ data: { productId: product.id, eventType: 'UPSERT' } });
      return updated;
    });
  }

  adjustInventory(input: {
    ownerId: string;
    actorId: string;
    productId: string;
    delta: number;
    reason: string;
  }) {
    return this.prisma().$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: input.productId, vendor: { ownerId: input.ownerId, status: 'APPROVED' } },
        include: { inventory: true },
      });
      if (!product?.inventory) return { kind: 'NOT_FOUND' as const };
      const rows = await tx.$queryRaw<Array<{ onHand: number; reserved: number }>>`
        SELECT "onHand", "reserved" FROM "Inventory" WHERE "id" = ${product.inventory.id}::uuid FOR UPDATE
      `;
      const current = rows[0];
      if (!current) return { kind: 'NOT_FOUND' as const };
      const nextOnHand = current.onHand + input.delta;
      if (nextOnHand < current.reserved) return { kind: 'INSUFFICIENT_STOCK' as const };
      const inventory = await tx.inventory.update({
        where: { id: product.inventory.id },
        data: { onHand: nextOnHand, version: { increment: 1 } },
      });
      await tx.inventoryMovement.create({
        data: {
          inventoryId: inventory.id,
          actorId: input.actorId,
          type: 'ADJUSTMENT',
          quantity: input.delta,
          reason: input.reason,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          action: 'inventory.adjust',
          targetType: 'product',
          targetId: product.id,
          reason: input.reason,
        },
      });
      await tx.searchOutboxEvent.create({ data: { productId: product.id, eventType: 'UPSERT' } });
      return { kind: 'ADJUSTED' as const, inventory };
    });
  }
}

export type ProductCreateInput = {
  categoryId: string;
  name: string;
  slug: string;
  sku: string;
  description: string;
  pricePaise: bigint;
  compareAtPricePaise?: bigint | null;
  taxCode: string;
  attributes?: Record<string, string | number | boolean>;
  initialStock: number;
  ownerId: string;
  actorId: string;
};

export type ProductUpdateInput = Partial<
  Omit<ProductCreateInput, 'ownerId' | 'actorId' | 'initialStock' | 'slug'>
> & { categoryId?: string };
