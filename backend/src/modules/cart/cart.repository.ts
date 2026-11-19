import { getPrismaClient } from '../../infrastructure/database/client.js';

export class CartRepository {
  private readonly prisma = getPrismaClient;

  async getCart(userId: string) {
    const cart = await this.prisma().cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    const items = await this.prisma().cartItem.findMany({
      where: { cartId: cart.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return { cartId: cart.id, updatedAt: cart.updatedAt, items };
  }

  async getCartMeta(userId: string) {
    return this.prisma().cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: { id: true, updatedAt: true },
    });
  }

  getCartItems(cartId: string) {
    return this.prisma().cartItem.findMany({
      where: { cartId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  getProductSummaries(productIds: string[]) {
    return this.prisma().product.findMany({
      where: { id: { in: productIds } },
      include: {
        category: { select: { id: true, name: true, active: true } },
        vendor: { select: { id: true, name: true, status: true, flatShippingPaise: true } },
        inventory: true,
        images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
        variants: {
          where: { active: true },
          include: { inventory: true },
          orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
        },
      },
    });
  }

  async getCheckoutData(userId: string, addressId: string) {
    const [address, cart] = await Promise.all([
      this.prisma().address.findFirst({ where: { id: addressId, userId } }),
      this.prisma().cart.findUnique({
        where: { userId },
        include: {
          items: {
            include: {
              product: { include: { category: true, vendor: true, inventory: true } },
              variant: { include: { inventory: true } },
            },
          },
        },
      }),
    ]);
    return { address, items: cart?.items ?? [] };
  }

  getTaxRules(taxCodes: string[], jurisdictionCode: string, now: Date) {
    return this.prisma().taxRule.findMany({
      where: {
        taxCode: { in: taxCodes },
        jurisdictionCode,
        active: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  getCommissionRules(vendorIds: string[], categoryIds: string[], now: Date) {
    return this.prisma().commissionRule.findMany({
      where: {
        active: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        AND: [
          { OR: [{ vendorId: null }, { vendorId: { in: vendorIds } }] },
          { OR: [{ categoryId: null }, { categoryId: { in: categoryIds } }] },
        ],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  getCoupon(code: string) {
    return this.prisma().coupon.findUnique({
      where: { code },
      include: { products: true, categories: true },
    });
  }

  setItemQuantity(
    userId: string,
    productId: string,
    quantity: number,
    requestedVariantId?: string,
  ) {
    return this.prisma().$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: {
          id: productId,
          status: 'ACTIVE',
          category: { active: true },
          vendor: { status: 'APPROVED' },
        },
        include: { inventory: true },
      });
      if (!product) return { kind: 'UNAVAILABLE' as const };
      const variant = await tx.productVariant.findFirst({
        where: {
          productId,
          active: true,
          ...(requestedVariantId ? { id: requestedVariantId } : { isDefault: true }),
        },
        include: { inventory: true },
      });
      if (!variant) return { kind: 'UNAVAILABLE' as const };
      const inventoryId = variant.inventory?.id ?? product.inventory?.id;
      if (!inventoryId) return { kind: 'UNAVAILABLE' as const };
      const rows = await tx.$queryRaw<
        Array<{ onHand: number; reserved: number }>
      >`SELECT "onHand", "reserved" FROM "Inventory" WHERE "id" = ${inventoryId}::uuid FOR UPDATE`;
      const stock = rows[0];
      if (!stock || quantity > stock.onHand - stock.reserved)
        return { kind: 'INSUFFICIENT_STOCK' as const };
      const cart = await tx.cart.upsert({ where: { userId }, create: { userId }, update: {} });
      const item = await tx.cartItem.upsert({
        where: { cartId_variantId: { cartId: cart.id, variantId: variant.id } },
        create: { cartId: cart.id, productId, variantId: variant.id, quantity },
        update: { quantity },
      });
      await tx.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } });
      return { kind: 'UPDATED' as const, item };
    });
  }

  updateItemQuantity(userId: string, itemId: string, quantity: number) {
    return this.prisma().$transaction(async (tx) => {
      const item = await tx.cartItem.findFirst({
        where: { id: itemId, cart: { userId } },
        include: { product: { include: { inventory: true } } },
      });
      if (!item) return { kind: 'NOT_FOUND' as const };
      const product = await tx.product.findFirst({
        where: {
          id: item.productId,
          status: 'ACTIVE',
          category: { active: true },
          vendor: { status: 'APPROVED' },
        },
        include: { inventory: true },
      });
      if (!product) return { kind: 'UNAVAILABLE' as const };
      const variant = await tx.productVariant.findFirst({
        where: { id: item.variantId, productId: item.productId, active: true },
        include: { inventory: true },
      });
      if (!variant) return { kind: 'UNAVAILABLE' as const };
      const inventoryId = variant.inventory?.id ?? product.inventory?.id;
      if (!inventoryId) return { kind: 'UNAVAILABLE' as const };
      const rows = await tx.$queryRaw<
        Array<{ onHand: number; reserved: number }>
      >`SELECT "onHand", "reserved" FROM "Inventory" WHERE "id" = ${inventoryId}::uuid FOR UPDATE`;
      const stock = rows[0];
      if (!stock || quantity > stock.onHand - stock.reserved)
        return { kind: 'INSUFFICIENT_STOCK' as const };
      const updated = await tx.cartItem.update({ where: { id: item.id }, data: { quantity } });
      await tx.cart.update({ where: { userId }, data: { updatedAt: new Date() } });
      return { kind: 'UPDATED' as const, item: updated };
    });
  }

  async removeItem(userId: string, itemId: string) {
    const deleted = await this.prisma().cartItem.deleteMany({
      where: { id: itemId, cart: { userId } },
    });
    if (deleted.count)
      await this.prisma().cart.update({ where: { userId }, data: { updatedAt: new Date() } });
  }

  async clear(userId: string) {
    const cart = await this.prisma().cart.findUnique({ where: { userId }, select: { id: true } });
    if (!cart) return;
    await this.prisma().$transaction([
      this.prisma().cartItem.deleteMany({ where: { cartId: cart.id } }),
      this.prisma().cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } }),
    ]);
  }
}
