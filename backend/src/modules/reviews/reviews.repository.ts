import { getPrismaClient } from '../../infrastructure/database/client';

export class ReviewsRepository {
  private readonly prisma = getPrismaClient;

  async listCustomer(userId: string, skip: number, take: number) {
    const where = { userId };
    const [reviews, total] = await Promise.all([
      this.prisma().review.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip,
        take,
        include: {
          product: {
            select: {
              id: true,
              name: true,
              brand: true,
              images: {
                orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
                take: 1,
                select: { url: true },
              },
            },
          },
        },
      }),
      this.prisma().review.count({ where }),
    ]);
    return { reviews, meta: { total } };
  }

  async listEligible(userId: string) {
    return this.prisma().orderItem.findMany({
      where: {
        productId: { not: null },
        review: null,
        order: { customerId: userId },
        vendorOrder: { status: 'DELIVERED' },
      },
      orderBy: [{ order: { deliveredAt: 'desc' } }, { id: 'asc' }],
      select: {
        id: true,
        orderId: true,
        productId: true,
        productNameSnapshot: true,
        order: { select: { orderNumber: true } },
        product: {
          select: {
            id: true,
            name: true,
            brand: true,
            images: {
              orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
              take: 1,
              select: { url: true },
            },
          },
        },
      },
    });
  }

  async listForModeration(
    status: 'PENDING' | 'PUBLISHED' | 'HIDDEN' | 'REJECTED',
    skip: number,
    take: number,
  ) {
    const where = { status };
    const [reviews, total] = await Promise.all([
      this.prisma().review.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip,
        take,
        include: {
          user: { select: { id: true, name: true } },
          product: {
            select: { id: true, name: true, vendor: { select: { id: true, name: true } } },
          },
        },
      }),
      this.prisma().review.count({ where }),
    ]);
    return { reviews, meta: { total } };
  }

  create(
    userId: string,
    orderId: string,
    itemId: string,
    input: { rating: number; title?: string; body?: string },
  ) {
    return this.prisma().$transaction(async (tx) => {
      const item = await tx.orderItem.findFirst({
        where: {
          id: itemId,
          orderId,
          productId: { not: null },
          order: { customerId: userId },
          vendorOrder: { status: 'DELIVERED' },
        },
      });
      if (!item) return { kind: 'NOT_ELIGIBLE' as const };
      if (!item.productId) return { kind: 'NOT_ELIGIBLE' as const };
      const review = await tx.review.create({
        data: { productId: item.productId, orderItemId: item.id, userId, ...input },
      });
      return { kind: 'CREATED' as const, review };
    });
  }

  async list(productId: string, skip: number, take: number) {
    const where = { productId, status: 'PUBLISHED' as const };
    const [reviews, total] = await Promise.all([
      this.prisma().review.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip,
        take,
        select: {
          id: true,
          rating: true,
          title: true,
          body: true,
          createdAt: true,
          user: { select: { name: true } },
        },
      }),
      this.prisma().review.count({ where }),
    ]);
    return { reviews, meta: { total } };
  }

  async update(
    userId: string,
    reviewId: string,
    input: { rating?: number; title?: string | null; body?: string | null },
  ) {
    const review = await this.prisma().review.findFirst({ where: { id: reviewId, userId } });
    if (!review) return { kind: 'NOT_FOUND' as const };
    if (Date.now() - review.createdAt.getTime() > 30 * 86_400_000)
      return { kind: 'EXPIRED' as const };
    const updated = await this.prisma().review.update({
      where: { id: reviewId },
      data: { ...input, status: 'PENDING', moderationReason: null },
    });
    return { kind: 'UPDATED' as const, review: updated };
  }

  async remove(userId: string, reviewId: string) {
    const review = await this.prisma().review.findFirst({ where: { id: reviewId, userId } });
    if (!review) return { kind: 'NOT_FOUND' as const };
    if (Date.now() - review.createdAt.getTime() > 30 * 86_400_000)
      return { kind: 'EXPIRED' as const };
    await this.prisma().review.delete({ where: { id: reviewId } });
    return { kind: 'DELETED' as const };
  }

  moderate(
    actorId: string,
    reviewId: string,
    status: 'PUBLISHED' | 'HIDDEN' | 'REJECTED',
    reason: string,
  ) {
    return this.prisma().$transaction(async (tx) => {
      const review = await tx.review.findUnique({ where: { id: reviewId } });
      if (!review) return undefined;
      const updated = await tx.review.update({
        where: { id: reviewId },
        data: { status, moderationReason: reason },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'review.moderated',
          targetType: 'review',
          targetId: reviewId,
          reason,
        },
      });
      return updated;
    });
  }
}
