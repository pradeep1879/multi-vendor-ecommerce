import { getPrismaClient } from '../../infrastructure/database/client.js';
import { calculateCouponDiscount, type CouponDefinition } from './coupon-discount.js';

export class CouponsRepository {
  private readonly prisma = getPrismaClient;
  list(skip: number, take: number) {
    return this.prisma().coupon.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: { products: true, categories: true },
    });
  }
  count() {
    return this.prisma().coupon.count();
  }
  create(input: {
    code: string;
    scope: 'PLATFORM' | 'VENDOR';
    vendorId?: string;
    discountType: 'FIXED' | 'PERCENTAGE';
    value: number;
    maxDiscountPaise?: bigint;
    minOrderPaise: bigint;
    maximumUses?: number;
    perUserLimit?: number;
    startsAt: Date;
    endsAt: Date;
    status: 'DRAFT' | 'ACTIVE' | 'DISABLED';
    productIds: string[];
    categoryIds: string[];
  }) {
    return this.prisma().coupon.create({
      data: {
        code: input.code.toUpperCase(),
        scope: input.scope,
        vendorId: input.vendorId,
        discountType: input.discountType,
        value: input.value,
        maxDiscountPaise: input.maxDiscountPaise,
        minOrderPaise: input.minOrderPaise,
        maximumUses: input.maximumUses,
        perUserLimit: input.perUserLimit,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        status: input.status,
        products: { create: input.productIds.map((productId) => ({ productId })) },
        categories: { create: input.categoryIds.map((categoryId) => ({ categoryId })) },
      },
      include: { products: true, categories: true },
    });
  }
  update(
    id: string,
    input: {
      status?: 'DRAFT' | 'ACTIVE' | 'DISABLED';
      startsAt?: Date;
      endsAt?: Date;
      maximumUses?: number | null;
      perUserLimit?: number | null;
    },
  ) {
    return this.prisma().coupon.update({
      where: { id },
      data: input,
      include: { products: true, categories: true },
    });
  }
  async validate(userId: string, codes: string[]) {
    const cart = await this.prisma().cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                vendorId: true,
                categoryId: true,
                pricePaise: true,
                status: true,
                category: { select: { active: true } },
                vendor: { select: { status: true } },
              },
            },
            variant: { select: { id: true, pricePaise: true, active: true } },
          },
        },
      },
    });
    if (!cart?.items.length)
      return { eligible: [], rejected: codes.map((code) => ({ code, reason: 'CART_EMPTY' })) };
    const now = new Date();
    const eligible = [] as Array<{ code: string; discountPaise: bigint }>;
    const rejected = [] as Array<{ code: string; reason: string }>;
    for (const rawCode of codes) {
      const code = rawCode.toUpperCase();
      const coupon = await this.prisma().coupon.findUnique({
        where: { code },
        include: { products: true, categories: true },
      });
      if (!coupon || coupon.status !== 'ACTIVE' || coupon.startsAt > now || coupon.endsAt <= now) {
        rejected.push({ code, reason: 'INVALID_OR_INACTIVE' });
        continue;
      }
      const allUses = await this.prisma().couponRedemption.count({
        where: { couponId: coupon.id },
      });
      const userUses = await this.prisma().couponRedemption.count({
        where: { couponId: coupon.id, userId },
      });
      if (coupon.maximumUses !== null && allUses >= coupon.maximumUses) {
        rejected.push({ code, reason: 'USAGE_LIMIT_REACHED' });
        continue;
      }
      if (coupon.perUserLimit !== null && userUses >= coupon.perUserLimit) {
        rejected.push({ code, reason: 'USER_LIMIT_REACHED' });
        continue;
      }
      const definition: CouponDefinition = coupon;
      const result = calculateCouponDiscount(
        definition,
        cart.items.map((item) => ({
          id: item.variant.id,
          vendorId: item.product.vendorId,
          categoryId: item.product.categoryId,
          subtotalPaise: item.variant.pricePaise * BigInt(item.quantity),
        })),
      );
      if (result.total <= 0n) rejected.push({ code, reason: 'SCOPE_OR_MINIMUM_NOT_MET' });
      else eligible.push({ code, discountPaise: result.total });
    }
    return { eligible, rejected };
  }
}
