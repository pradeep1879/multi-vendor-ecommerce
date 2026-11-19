import { getPrismaClient } from '../../infrastructure/database/client';

export class AnalyticsRepository {
  async adminSummary(from: Date, to: Date) {
    const prisma = getPrismaClient();
    const where = { createdAt: { gte: from, lt: to } };
    const [orders, refunds, vendorOrders, activeVendors, activeProducts, orderStatusCounts] =
      await Promise.all([
        prisma.order.aggregate({
          where: {
            ...where,
            payment: { status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'] } },
          },
          _count: { _all: true },
          _sum: { itemSubtotalPaise: true, discountPaise: true },
        }),
        prisma.refund.aggregate({
          where: { createdAt: { gte: from, lt: to }, status: 'SUCCEEDED' },
          _sum: { amountPaise: true },
        }),
        prisma.vendorOrder.aggregate({
          where: {
            ...where,
            order: { payment: { status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'] } } },
          },
          _sum: { commissionPaise: true, vendorPayablePaise: true },
        }),
        prisma.vendor.count({ where: { status: 'APPROVED' } }),
        prisma.product.count({ where: { status: 'ACTIVE' } }),
        prisma.order.groupBy({ by: ['status'], where, _count: { _all: true } }),
      ]);
    return {
      period: { from: from.toISOString(), to: to.toISOString(), timezone: 'UTC' },
      grossMerchandisePaise: String(
        (orders._sum.itemSubtotalPaise ?? 0n) - (orders._sum.discountPaise ?? 0n),
      ),
      paidOrders: orders._count._all,
      averageOrderValuePaise: String(
        orders._count._all === 0
          ? 0n
          : ((orders._sum.itemSubtotalPaise ?? 0n) - (orders._sum.discountPaise ?? 0n)) /
              BigInt(orders._count._all),
      ),
      refundsPaise: String(refunds._sum.amountPaise ?? 0n),
      platformCommissionPaise: String(vendorOrders._sum.commissionPaise ?? 0n),
      vendorPayablePaise: String(vendorOrders._sum.vendorPayablePaise ?? 0n),
      activeVendors,
      activeProducts,
      orderStatusCounts: Object.fromEntries(
        orderStatusCounts.map((item) => [item.status, item._count._all]),
      ),
    };
  }

  async vendorSummary(vendorId: string, from: Date, to: Date) {
    const result = await getPrismaClient().vendorOrder.aggregate({
      where: {
        vendorId,
        createdAt: { gte: from, lt: to },
        order: { payment: { status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'] } } },
      },
      _count: { _all: true },
      _sum: { vendorPayablePaise: true, commissionPaise: true },
    });
    return {
      period: { from: from.toISOString(), to: to.toISOString(), timezone: 'UTC' },
      orders: result._count._all,
      vendorPayablePaise: String(result._sum.vendorPayablePaise ?? 0n),
      commissionPaise: String(result._sum.commissionPaise ?? 0n),
    };
  }
}
