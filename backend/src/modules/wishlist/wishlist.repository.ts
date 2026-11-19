import { getPrismaClient } from '../../infrastructure/database/client';

export class WishlistRepository {
  private readonly prisma = getPrismaClient;

  list(userId: string) {
    return this.prisma().wishlistItem.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        product: {
          include: {
            category: { select: { id: true, name: true, active: true } },
            vendor: { select: { id: true, name: true, slug: true, status: true } },
            inventory: true,
            images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
            variants: {
              where: { active: true },
              include: { inventory: true },
              orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
            },
          },
        },
      },
    });
  }

  async add(userId: string, productId: string) {
    const product = await this.prisma().product.findFirst({
      where: {
        id: productId,
        status: 'ACTIVE',
        category: { active: true },
        vendor: { status: 'APPROVED' },
      },
      select: { id: true },
    });
    if (!product) return null;
    return this.prisma().wishlistItem.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId },
      update: {},
    });
  }

  remove(userId: string, productId: string) {
    return this.prisma().wishlistItem.deleteMany({ where: { userId, productId } });
  }
}
