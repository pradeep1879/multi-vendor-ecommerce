import { AppError } from '../../common/errors/app-error';
import { getPrismaClient } from '../../infrastructure/database/client';

export type ReturnTransition = 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'IN_TRANSIT' | 'RECEIVED';

export class ReturnsRepository {
  private readonly prisma = getPrismaClient;

  listCustomer(customerId: string, orderId: string) {
    return this.prisma().returnRequest.findMany({
      where: { customerId, orderId },
      include: { orderItem: true, refund: true },
      orderBy: { requestedAt: 'desc' },
    });
  }

  create(customerId: string, orderId: string, itemId: string, quantity: number, reason: string) {
    return this.prisma().$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "OrderItem" WHERE "id" = ${itemId}::uuid FOR UPDATE`;
      const order = await tx.order.findFirst({
        where: { id: orderId, customerId, status: 'DELIVERED' },
        select: { id: true, deliveredAt: true },
      });
      if (!order?.deliveredAt) return { kind: 'NOT_RETURNABLE' as const };
      if (Date.now() - order.deliveredAt.getTime() > 7 * 24 * 60 * 60_000)
        return { kind: 'RETURN_WINDOW_CLOSED' as const };
      const item = await tx.orderItem.findFirst({ where: { id: itemId, orderId } });
      if (!item) return { kind: 'ITEM_NOT_FOUND' as const };
      const prior = await tx.returnRequest.aggregate({
        where: { orderItemId: itemId, status: { not: 'REJECTED' } },
        _sum: { quantity: true },
      });
      if ((prior._sum.quantity ?? 0) + quantity > item.quantity)
        return { kind: 'QUANTITY_EXCEEDED' as const };
      const request = await tx.returnRequest.create({
        data: { orderId, orderItemId: itemId, customerId, quantity, reason },
        include: { orderItem: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: customerId,
          action: 'return.request',
          targetType: 'return_request',
          targetId: request.id,
          reason,
        },
      });
      return { kind: 'CREATED' as const, request };
    });
  }

  listAdmin(page: number, pageSize: number, status?: string) {
    const where = status ? { status: status as never } : {};
    return this.prisma()
      .$transaction([
        this.prisma().returnRequest.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
          include: {
            customer: { select: { id: true, name: true, email: true } },
            order: { select: { id: true, orderNumber: true, status: true } },
            orderItem: true,
            refund: true,
          },
        }),
        this.prisma().returnRequest.count({ where }),
      ])
      .then(([items, total]) => ({ items, meta: { page, pageSize, total } }));
  }

  listVendor(vendorId: string, page: number, pageSize: number, status?: string) {
    const where = {
      orderItem: { vendorOrder: { vendorId } },
      ...(status ? { status: status as never } : {}),
    };
    return this.prisma()
      .$transaction([
        this.prisma().returnRequest.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
          include: {
            order: { select: { id: true, orderNumber: true, status: true } },
            orderItem: { include: { vendorOrder: { select: { vendorId: true } } } },
            refund: true,
          },
        }),
        this.prisma().returnRequest.count({ where }),
      ])
      .then(([items, total]) => ({ items, meta: { page, pageSize, total } }));
  }

  findForRefund(returnId: string) {
    return this.prisma().returnRequest.findUnique({
      where: { id: returnId },
      include: { orderItem: true, order: { include: { payment: true } }, refund: true },
    });
  }

  transitionAdmin(actorId: string, returnId: string, next: ReturnTransition, reason: string) {
    return this.prisma().$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "ReturnRequest" WHERE "id" = ${returnId}::uuid FOR UPDATE`;
      const request = await tx.returnRequest.findUnique({
        where: { id: returnId },
        include: { orderItem: true },
      });
      if (!request) return { kind: 'NOT_FOUND' as const };
      const allowed: Record<string, ReturnTransition[]> = {
        REQUESTED: ['UNDER_REVIEW', 'APPROVED', 'REJECTED'],
        UNDER_REVIEW: ['APPROVED', 'REJECTED'],
        APPROVED: ['IN_TRANSIT', 'RECEIVED'],
        IN_TRANSIT: ['RECEIVED'],
      };
      if (!allowed[request.status]?.includes(next)) return { kind: 'INVALID_TRANSITION' as const };
      const now = new Date();
      const updated = await tx.returnRequest.update({
        where: { id: request.id },
        data: {
          status: next,
          ...(next === 'APPROVED' || next === 'REJECTED'
            ? { decidedAt: now, decisionReason: reason }
            : {}),
          ...(next === 'RECEIVED' ? { receivedAt: now } : {}),
        },
        include: {
          orderItem: true,
          order: true,
          customer: { select: { id: true, name: true, email: true } },
        },
      });
      await tx.accountNotification.create({
        data: {
          userId: request.customerId,
          type: next === 'RECEIVED' ? 'REFUND' : 'RETURN',
          title: 'Return request updated',
          body: `Your return request is now ${next.toLowerCase().replaceAll('_', ' ')}.`,
          href: '/account/returns',
        },
      });
      if (next === 'RECEIVED' && request.orderItem.variantId) {
        const inventory = await tx.inventory.findUnique({
          where: { variantId: request.orderItem.variantId },
        });
        if (inventory) {
          await tx.inventory.update({
            where: { id: inventory.id },
            data: { onHand: { increment: request.quantity }, version: { increment: 1 } },
          });
          await tx.inventoryMovement.create({
            data: {
              inventoryId: inventory.id,
              actorId,
              type: 'RETURN',
              quantity: request.quantity,
              reference: request.id,
              reason: 'Returned stock received',
            },
          });
        }
      }
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'return.transition',
          targetType: 'return_request',
          targetId: request.id,
          reason,
          metadata: { from: request.status, to: next },
        },
      });
      return { kind: 'UPDATED' as const, request: updated };
    });
  }

  async linkRefund(returnId: string, refundId: string) {
    return this.prisma().returnRequest.update({ where: { id: returnId }, data: { refundId } });
  }

  async markRefunded(returnId: string) {
    const updated = await this.prisma().returnRequest.updateMany({
      where: { id: returnId, status: 'RECEIVED' },
      data: { status: 'REFUNDED', closedAt: new Date() },
    });
    if (!updated.count)
      throw new AppError(
        409,
        'RETURN_NOT_READY_FOR_REFUND',
        'A return must be received before it can be refunded.',
      );
  }
}
