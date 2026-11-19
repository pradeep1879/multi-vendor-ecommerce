import { createHash } from 'node:crypto';
import { AppError } from '../../common/errors/app-error.js';
import { getPrismaClient } from '../../infrastructure/database/client.js';
import type {
  PaymentGateway,
  GatewayPayment,
  GatewayPaymentWebhook,
  GatewayRefundWebhook,
} from './payment-gateway.js';

function refundCapacities(
  vendorOrders: Array<{
    shippingPaise: bigint;
    taxPaise: bigint;
    items: Array<{
      id: string;
      lineSubtotalPaise: bigint;
      discountPaise: bigint;
      taxPaise: bigint;
    }>;
  }>,
) {
  const capacities = new Map<string, bigint>();
  for (const vendorOrder of vendorOrders) {
    const lineAmounts = vendorOrder.items.map(
      (item) => item.lineSubtotalPaise - item.discountPaise + item.taxPaise,
    );
    const subtotal = lineAmounts.reduce((sum, amount) => sum + amount, 0n);
    const shippingTax =
      vendorOrder.taxPaise - vendorOrder.items.reduce((sum, item) => sum + item.taxPaise, 0n);
    const sharedCosts = vendorOrder.shippingPaise + shippingTax;
    let allocated = 0n;
    vendorOrder.items.forEach((item, index) => {
      const share =
        index === vendorOrder.items.length - 1
          ? sharedCosts - allocated
          : subtotal > 0n
            ? (sharedCosts * lineAmounts[index]!) / subtotal
            : 0n;
      allocated += share;
      capacities.set(item.id, lineAmounts[index]! + share);
    });
  }
  return capacities;
}

export class PaymentsRepository {
  private readonly prisma = getPrismaClient;

  listCustomerRefunds(customerId: string, page = 1, pageSize = 20) {
    const where = { order: { customerId } };
    return this.prisma()
      .$transaction([
        this.prisma().refund.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          include: { order: { select: { id: true, orderNumber: true } } },
        }),
        this.prisma().refund.count({ where }),
      ])
      .then(([items, total]) => ({ items, meta: { page, pageSize, total } }));
  }

  initiate(customerId: string, orderId: string, gateway: PaymentGateway) {
    return this.prisma().$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
        const order = await tx.order.findFirst({
          where: { id: orderId, customerId },
          include: {
            payment: { include: { attempts: { orderBy: { createdAt: 'desc' }, take: 1 } } },
          },
        });
        if (!order) throw new AppError(404, 'NOT_FOUND', 'Order was not found.');
        if (order.status !== 'PENDING_PAYMENT' || order.reservationExpiresAt <= new Date())
          throw new AppError(409, 'ORDER_NOT_PAYABLE', 'This order is no longer awaiting payment.');
        if (order.payablePaise <= 0n)
          throw new AppError(409, 'INVALID_PAYMENT_AMOUNT', 'Order total must be positive.');

        if (order.payment?.status === 'SUCCEEDED')
          throw new AppError(409, 'PAYMENT_ALREADY_COMPLETE', 'This order is already paid.');
        const existingAttempt = order.payment?.attempts[0];
        if (existingAttempt?.providerOrderId)
          return {
            paymentId: order.payment!.id,
            provider: gateway.provider,
            providerOrderId: existingAttempt.providerOrderId,
            amountPaise: order.payablePaise,
            currency: order.currency,
            ...(gateway.publicKey ? { publicKey: gateway.publicKey } : {}),
            status: order.payment!.status,
          };
        if (order.payment && order.payment.status !== 'PENDING')
          throw new AppError(409, 'PAYMENT_NOT_RETRYABLE', 'This payment cannot be retried.');

        const payment =
          order.payment ??
          (await tx.payment.create({
            data: {
              orderId: order.id,
              provider: gateway.provider,
              amountPaise: order.payablePaise,
              currency: order.currency,
            },
            include: { attempts: false },
          }));
        if (payment.provider !== gateway.provider)
          throw new AppError(
            409,
            'PAYMENT_PROVIDER_MISMATCH',
            'Payment provider cannot be changed for an order.',
          );
        const providerOrder = await gateway.createOrder({
          amountPaise: order.payablePaise,
          currency: order.currency,
          receipt: payment.id,
        });
        await tx.paymentAttempt.create({
          data: {
            paymentId: payment.id,
            providerOrderId: providerOrder.providerOrderId,
            amountPaise: order.payablePaise,
          },
        });
        return {
          paymentId: payment.id,
          provider: gateway.provider,
          providerOrderId: providerOrder.providerOrderId,
          amountPaise: order.payablePaise,
          currency: order.currency,
          ...(providerOrder.publicKey ? { publicKey: providerOrder.publicKey } : {}),
          status: payment.status,
        };
      },
      { timeout: 20_000 },
    );
  }

  async findCheckout(customerId: string, providerOrderId: string) {
    const attempt = await this.prisma().paymentAttempt.findFirst({
      where: { providerOrderId, payment: { order: { customerId } } },
      include: {
        payment: { include: { order: { select: { id: true, status: true, payablePaise: true } } } },
      },
    });
    if (!attempt) throw new AppError(404, 'NOT_FOUND', 'Payment was not found.');
    return attempt;
  }

  async status(customerId: string, orderId: string) {
    const payment = await this.prisma().payment.findFirst({
      where: { orderId, order: { customerId } },
      include: { attempts: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!payment) return null;
    const attempt = payment.attempts[0];
    return {
      id: payment.id,
      status: payment.status,
      amountPaise: payment.amountPaise,
      currency: payment.currency,
      provider: payment.provider,
      ...(attempt ? { providerOrderId: attempt.providerOrderId } : {}),
      updatedAt: payment.updatedAt,
    };
  }

  capture(providerOrderId: string, verified: GatewayPayment) {
    return this.prisma().$transaction(
      async (tx) => {
        const attempt = await tx.paymentAttempt.findFirst({
          where: { providerOrderId },
          include: {
            payment: { include: { order: { include: { items: true, vendorOrders: true } } } },
          },
        });
        if (!attempt) throw new AppError(404, 'NOT_FOUND', 'Payment attempt was not found.');
        await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${attempt.paymentId}::uuid FOR UPDATE`;
        const payment = await tx.payment.findUniqueOrThrow({
          where: { id: attempt.paymentId },
          include: { order: { include: { items: true, vendorOrders: true } } },
        });
        if (
          verified.providerOrderId !== providerOrderId ||
          verified.providerPaymentId.trim().length === 0 ||
          verified.amountPaise !== payment.amountPaise ||
          verified.currency !== payment.currency ||
          verified.status !== 'captured'
        )
          throw new AppError(
            409,
            'PAYMENT_DETAILS_MISMATCH',
            'Provider payment details do not match the order.',
          );
        if (payment.status === 'SUCCEEDED') return { status: payment.status, replayed: true };
        if (payment.status !== 'PENDING' || payment.order.status !== 'PENDING_PAYMENT')
          throw new AppError(409, 'ORDER_NOT_PAYABLE', 'This order can no longer be paid.');
        if (payment.order.reservationExpiresAt <= new Date())
          throw new AppError(409, 'RESERVATION_EXPIRED', 'The order reservation has expired.');

        for (const item of payment.order.items) {
          if (!item.variantId) continue;
          const changed = await tx.inventory.updateMany({
            where: {
              variantId: item.variantId,
              reserved: { gte: item.quantity },
              onHand: { gte: item.quantity },
            },
            data: {
              reserved: { decrement: item.quantity },
              onHand: { decrement: item.quantity },
              version: { increment: 1 },
            },
          });
          if (!changed.count)
            throw new AppError(
              409,
              'INVENTORY_RESERVATION_INVALID',
              'Reserved inventory could not be captured.',
            );
          const inventory = await tx.inventory.findUniqueOrThrow({
            where: { variantId: item.variantId },
            select: { id: true },
          });
          await tx.inventoryMovement.create({
            data: {
              inventoryId: inventory.id,
              actorId: payment.order.customerId,
              type: 'SALE',
              quantity: item.quantity,
              reference: payment.order.id,
              reason: 'Provider-confirmed payment',
            },
          });
        }
        const debits = payment.order.vendorOrders.reduce(
          (sum, vendorOrder) => sum + vendorOrder.vendorPayablePaise + vendorOrder.commissionPaise,
          0n,
        );
        if (debits !== payment.amountPaise)
          throw new AppError(
            500,
            'LEDGER_ALLOCATION_MISMATCH',
            'Order allocations do not reconcile to the captured payment.',
          );
        const transaction = await tx.ledgerTransaction.create({
          data: {
            paymentId: payment.id,
            reference: `payment-capture:${payment.id}`,
            description: `Captured payment for order ${payment.order.orderNumber}`,
            currency: payment.currency,
            entries: {
              create: [
                {
                  accountCode: 'GATEWAY_CLEARING',
                  side: 'DEBIT',
                  amountPaise: payment.amountPaise,
                },
                ...payment.order.vendorOrders.map((vendorOrder) => ({
                  accountCode: 'VENDOR_PAYABLE',
                  side: 'CREDIT' as const,
                  amountPaise: vendorOrder.vendorPayablePaise,
                  vendorId: vendorOrder.vendorId,
                })),
                ...payment.order.vendorOrders
                  .filter((vendorOrder) => vendorOrder.commissionPaise > 0n)
                  .map((vendorOrder) => ({
                    accountCode: 'PLATFORM_COMMISSION',
                    side: 'CREDIT' as const,
                    amountPaise: vendorOrder.commissionPaise,
                    vendorId: vendorOrder.vendorId,
                  })),
              ],
            },
          },
          include: { entries: true },
        });
        const debitTotal = transaction.entries
          .filter((entry) => entry.side === 'DEBIT')
          .reduce((sum, entry) => sum + entry.amountPaise, 0n);
        const creditTotal = transaction.entries
          .filter((entry) => entry.side === 'CREDIT')
          .reduce((sum, entry) => sum + entry.amountPaise, 0n);
        if (debitTotal !== creditTotal)
          throw new AppError(
            500,
            'LEDGER_UNBALANCED',
            'Payment ledger transaction is not balanced.',
          );

        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'SUCCEEDED',
            providerPaymentId: verified.providerPaymentId,
            capturedAt: new Date(),
          },
        });
        await tx.paymentAttempt.update({
          where: { id: attempt.id },
          data: { status: 'CAPTURED', providerPaymentId: verified.providerPaymentId },
        });
        const changed = await tx.order.updateMany({
          where: { id: payment.orderId, status: 'PENDING_PAYMENT' },
          data: { status: 'CONFIRMED', confirmedAt: new Date() },
        });
        if (!changed.count)
          throw new AppError(409, 'ORDER_NOT_PAYABLE', 'This order can no longer be paid.');
        await tx.orderStatusHistory.create({
          data: {
            orderId: payment.orderId,
            from: 'PENDING_PAYMENT',
            to: 'CONFIRMED',
            actorType: 'SYSTEM',
            reason: 'Provider-confirmed payment',
          },
        });
        return { status: 'SUCCEEDED' as const, replayed: false };
      },
      { timeout: 20_000 },
    );
  }

  async webhook(input: {
    provider: 'TEST' | 'RAZORPAY';
    eventId: string;
    rawBody: Uint8Array;
    event: GatewayPaymentWebhook;
    payment?: GatewayPayment;
  }) {
    const payloadHash = createHash('sha256').update(input.rawBody).digest('hex');
    return this.prisma().$transaction(async (tx) => {
      const duplicate = await tx.webhookEvent.findUnique({
        where: { provider_eventId: { provider: input.provider, eventId: input.eventId } },
      });
      if (duplicate)
        return {
          replayed: true,
          status: duplicate.status,
          ...(duplicate.status === 'PROCESSING'
            ? { providerOrderId: input.event.providerOrderId }
            : {}),
        };
      const attempt = await tx.paymentAttempt.findFirst({
        where: { providerOrderId: input.event.providerOrderId },
        include: { payment: true },
      });
      const webhook = await tx.webhookEvent.create({
        data: {
          provider: input.provider,
          eventId: input.eventId,
          eventType: input.event.eventType,
          payloadHash,
          paymentId: attempt?.paymentId,
        },
      });
      if (!attempt || input.event.status === 'unknown') {
        await tx.webhookEvent.update({
          where: { id: webhook.id },
          data: { status: 'PROCESSED', processedAt: new Date() },
        });
        return { replayed: false, status: 'PROCESSED' as const };
      }
      if (
        input.event.amountPaise !== attempt.amountPaise ||
        input.event.currency !== attempt.payment.currency
      ) {
        await tx.webhookEvent.update({
          where: { id: webhook.id },
          data: { status: 'FAILED', failureCode: 'PAYMENT_DETAILS_MISMATCH' },
        });
        return { replayed: false, status: 'FAILED' as const };
      }
      if (input.event.status === 'captured' && input.payment?.status === 'captured') {
        // Capture commits separately so its ledger, inventory, and order transition remain atomic.
        await tx.webhookEvent.update({ where: { id: webhook.id }, data: { status: 'PROCESSING' } });
        return {
          replayed: false,
          status: 'PROCESSING' as const,
          providerOrderId: input.event.providerOrderId,
        };
      }
      if (input.event.status === 'authorized') {
        await tx.paymentAttempt.updateMany({
          where: { id: attempt.id, status: 'CREATED' },
          data: { status: 'AUTHORIZED', providerPaymentId: input.event.providerPaymentId },
        });
        await tx.webhookEvent.update({
          where: { id: webhook.id },
          data: { status: 'PROCESSED', processedAt: new Date() },
        });
        return { replayed: false, status: 'PROCESSED' as const };
      }
      if (input.event.status === 'failed') {
        await tx.payment.updateMany({
          where: { id: attempt.paymentId, status: 'PENDING' },
          data: { status: 'FAILED' },
        });
        await tx.paymentAttempt.updateMany({
          where: { id: attempt.id, status: { in: ['CREATED', 'AUTHORIZED'] } },
          data: { status: 'FAILED', failureCode: 'PROVIDER_PAYMENT_FAILED' },
        });
        const order = await tx.order.findUnique({
          where: { id: attempt.payment.orderId },
          include: { items: true, vendorOrders: true },
        });
        if (order?.status === 'PENDING_PAYMENT') {
          const changed = await tx.order.updateMany({
            where: { id: order.id, status: 'PENDING_PAYMENT' },
            data: { status: 'PAYMENT_FAILED' },
          });
          if (changed.count) {
            for (const item of order.items) {
              if (!item.variantId) continue;
              const inventory = await tx.inventory.findUnique({
                where: { variantId: item.variantId },
                select: { id: true },
              });
              if (!inventory) continue;
              const released = await tx.inventory.updateMany({
                where: { id: inventory.id, reserved: { gte: item.quantity } },
                data: { reserved: { decrement: item.quantity }, version: { increment: 1 } },
              });
              if (!released.count)
                throw new AppError(
                  500,
                  'INVENTORY_RESERVATION_INVALID',
                  'Reserved inventory could not be released.',
                );
              await tx.inventoryMovement.create({
                data: {
                  inventoryId: inventory.id,
                  actorId: order.customerId,
                  type: 'RELEASE',
                  quantity: item.quantity,
                  reference: order.id,
                  reason: 'Provider reported payment failure',
                },
              });
            }
            await tx.orderStatusHistory.create({
              data: {
                orderId: order.id,
                from: 'PENDING_PAYMENT',
                to: 'PAYMENT_FAILED',
                actorType: 'SYSTEM',
                reason: 'Provider reported payment failure',
              },
            });
            for (const vendorOrder of order.vendorOrders) {
              const updated = await tx.vendorOrder.updateMany({
                where: { id: vendorOrder.id, status: { not: 'CANCELLED' } },
                data: { status: 'CANCELLED' },
              });
              if (updated.count)
                await tx.vendorOrderStatusHistory.create({
                  data: {
                    vendorOrderId: vendorOrder.id,
                    from: vendorOrder.status,
                    to: 'CANCELLED',
                    actorType: 'SYSTEM',
                    reason: 'Provider reported payment failure',
                  },
                });
            }
          }
        }
      }
      await tx.webhookEvent.update({
        where: { id: webhook.id },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
      return { replayed: false, status: 'PROCESSED' as const };
    });
  }

  async prepareRefund(input: {
    orderId: string;
    actorId: string;
    amountPaise: bigint;
    reason: string;
    idempotencyKey: string;
    itemAllocations?: Array<{ orderItemId: string; amountPaise: bigint }>;
  }) {
    const storedKey = createHash('sha256')
      .update(`${input.orderId}:${input.idempotencyKey}`)
      .digest('hex');
    const existing = await this.prisma().refund.findUnique({
      where: { idempotencyKey: storedKey },
      include: { payment: true },
    });
    if (existing) {
      if (
        existing.orderId !== input.orderId ||
        existing.amountPaise !== input.amountPaise ||
        existing.reason !== input.reason
      )
        throw new AppError(
          409,
          'IDEMPOTENCY_KEY_REUSED',
          'This refund key was used for a different request.',
        );
      return {
        refund: existing,
        providerPaymentId: existing.payment.providerPaymentId,
        replayed: true,
      };
    }
    if (input.amountPaise <= 0n)
      throw new AppError(400, 'INVALID_REFUND_AMOUNT', 'Refund amount must be positive.');
    const providerResult = await this.prisma().$transaction(
      async (tx) => {
        const order = await tx.order.findUnique({
          where: { id: input.orderId },
          include: {
            payment: true,
            vendorOrders: {
              include: {
                items: { include: { settlementItem: { include: { settlement: true } } } },
              },
            },
          },
        });
        if (!order || !order.payment)
          throw new AppError(404, 'NOT_FOUND', 'Paid order was not found.');
        await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${order.payment.id}::uuid FOR UPDATE`;
        const payment = await tx.payment.findUniqueOrThrow({ where: { id: order.payment.id } });
        const repeated = await tx.refund.findUnique({
          where: { idempotencyKey: storedKey },
          include: { payment: true },
        });
        if (repeated) {
          if (
            repeated.orderId !== input.orderId ||
            repeated.amountPaise !== input.amountPaise ||
            repeated.reason !== input.reason
          )
            throw new AppError(
              409,
              'IDEMPOTENCY_KEY_REUSED',
              'This refund key was used for a different request.',
            );
          return {
            refund: repeated,
            providerPaymentId: repeated.payment.providerPaymentId,
            replayed: true as const,
          };
        }
        if (
          !['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(payment.status) ||
          !payment.providerPaymentId
        )
          throw new AppError(
            409,
            'PAYMENT_NOT_REFUNDABLE',
            'A captured payment is required for a refund.',
          );
        if (
          order.vendorOrders.some((vendorOrder) =>
            vendorOrder.items.some((item) => item.settlementItem?.settlement.status === 'SETTLED'),
          )
        )
          throw new AppError(
            409,
            'SETTLED_VENDOR_REFUND_BLOCKED',
            'Refunds need a provider-confirmed vendor reversal after settlement.',
          );
        const inProgress = ['REQUESTED', 'APPROVED', 'PROCESSING', 'SUCCEEDED'] as const;
        const priorRefunds = await tx.refund.findMany({
          where: { paymentId: payment.id, status: { in: [...inProgress] } },
          select: { amountPaise: true },
        });
        const already = priorRefunds.reduce((sum, refund) => sum + refund.amountPaise, 0n);
        if (already + input.amountPaise > payment.amountPaise)
          throw new AppError(
            409,
            'REFUND_EXCEEDS_CAPTURED_AMOUNT',
            'Refund amount exceeds the remaining captured balance.',
          );
        const capacities = refundCapacities(order.vendorOrders);
        const itemIds = [...capacities.keys()];
        const priorAllocations = await tx.refundAllocation.findMany({
          where: { orderItemId: { in: itemIds }, refund: { status: { in: [...inProgress] } } },
          select: { orderItemId: true, amountPaise: true },
        });
        const allocatedByItem = new Map<string, bigint>();
        for (const allocation of priorAllocations)
          allocatedByItem.set(
            allocation.orderItemId,
            (allocatedByItem.get(allocation.orderItemId) ?? 0n) + allocation.amountPaise,
          );
        const remaining = itemIds
          .map((id) => [id, (capacities.get(id) ?? 0n) - (allocatedByItem.get(id) ?? 0n)] as const)
          .filter(([, amount]) => amount > 0n);
        const remainingTotal = remaining.reduce((sum, [, amount]) => sum + amount, 0n);
        if (input.amountPaise > remainingTotal)
          throw new AppError(
            409,
            'REFUND_EXCEEDS_REFUNDABLE_LINES',
            'Refund exceeds unrefunded order lines.',
          );
        let allocations: Array<{ orderItemId: string; amountPaise: bigint }>;
        if (input.itemAllocations) {
          const total = input.itemAllocations.reduce(
            (sum, allocation) => sum + allocation.amountPaise,
            0n,
          );
          if (
            total !== input.amountPaise ||
            input.itemAllocations.some((allocation) => allocation.amountPaise <= 0n)
          )
            throw new AppError(
              400,
              'INVALID_REFUND_ALLOCATION',
              'Refund item allocations must add up to the refund amount.',
            );
          for (const allocation of input.itemAllocations) {
            const remainingAmount =
              remaining.find(([id]) => id === allocation.orderItemId)?.[1] ?? 0n;
            if (allocation.amountPaise > remainingAmount)
              throw new AppError(
                409,
                'REFUND_EXCEEDS_REFUNDABLE_LINES',
                'Refund exceeds remaining value for the selected item.',
              );
          }
          allocations = input.itemAllocations;
        } else {
          let assigned = 0n;
          allocations = remaining.flatMap(([orderItemId, amount], index) => {
            const share =
              index === remaining.length - 1
                ? input.amountPaise - assigned
                : (input.amountPaise * amount) / remainingTotal;
            assigned += share;
            return share > 0n ? [{ orderItemId, amountPaise: share }] : [];
          });
        }
        const refund = await tx.refund.create({
          data: {
            paymentId: payment.id,
            orderId: order.id,
            amountPaise: input.amountPaise,
            reason: input.reason,
            requestedById: input.actorId,
            idempotencyKey: storedKey,
            status: 'REQUESTED',
            allocations: { create: allocations },
          },
        });
        return { refund, providerPaymentId: payment.providerPaymentId };
      },
      { timeout: 20_000 },
    );
    return 'replayed' in providerResult
      ? providerResult
      : { ...providerResult, replayed: false as const };
  }

  async finishRefund(
    refundId: string,
    providerRefundId: string,
    status: 'pending' | 'succeeded' | 'failed',
  ) {
    return this.prisma().$transaction(
      async (tx) => {
        const refund = await tx.refund.findUnique({
          where: { id: refundId },
          include: {
            payment: true,
            order: { include: { vendorOrders: { include: { items: true } } } },
            allocations: { include: { orderItem: { include: { vendorOrder: true } } } },
          },
        });
        if (!refund) throw new AppError(404, 'NOT_FOUND', 'Refund was not found.');
        if (refund.status === 'SUCCEEDED') return refund;
        if (status !== 'succeeded')
          return tx.refund.update({
            where: { id: refund.id },
            data: {
              providerRefundId,
              status: status === 'pending' ? 'PROCESSING' : 'FAILED',
              ...(status === 'failed' ? { processedAt: new Date() } : {}),
            },
          });
        await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${refund.paymentId}::uuid FOR UPDATE`;
        const capacities = refundCapacities(refund.order.vendorOrders);
        const vendorDebits = new Map<string, bigint>();
        let commissionReversal = 0n;
        for (const allocation of refund.allocations) {
          const item = allocation.orderItem;
          const gross = capacities.get(item.id) ?? 0n;
          const reversal =
            gross > 0n ? (item.commissionPaise * allocation.amountPaise + gross / 2n) / gross : 0n;
          const commission = reversal > item.commissionPaise ? item.commissionPaise : reversal;
          commissionReversal += commission;
          vendorDebits.set(
            item.vendorOrder.vendorId,
            (vendorDebits.get(item.vendorOrder.vendorId) ?? 0n) +
              allocation.amountPaise -
              commission,
          );
        }
        const totalDebit =
          [...vendorDebits.values()].reduce((sum, amount) => sum + amount, 0n) + commissionReversal;
        if (totalDebit !== refund.amountPaise)
          throw new AppError(
            500,
            'REFUND_LEDGER_MISMATCH',
            'Refund allocations do not reconcile to the provider refund.',
          );
        const entries = [
          ...[...vendorDebits.entries()]
            .filter(([, amount]) => amount > 0n)
            .map(([vendorId, amountPaise]) => ({
              accountCode: 'VENDOR_PAYABLE',
              side: 'DEBIT' as const,
              amountPaise,
              vendorId,
            })),
          ...(commissionReversal > 0n
            ? [
                {
                  accountCode: 'PLATFORM_COMMISSION',
                  side: 'DEBIT' as const,
                  amountPaise: commissionReversal,
                },
              ]
            : []),
          {
            accountCode: 'GATEWAY_CLEARING',
            side: 'CREDIT' as const,
            amountPaise: refund.amountPaise,
          },
        ];
        await tx.ledgerTransaction.create({
          data: {
            refundId: refund.id,
            reference: `refund:${refund.id}`,
            description: `Provider-confirmed refund for order ${refund.order.orderNumber}`,
            currency: refund.currency,
            entries: { create: entries },
          },
        });
        const processed = await tx.refund.update({
          where: { id: refund.id },
          data: { providerRefundId, status: 'SUCCEEDED', processedAt: new Date() },
        });
        const successful = await tx.refund.aggregate({
          where: { paymentId: refund.paymentId, status: 'SUCCEEDED' },
          _sum: { amountPaise: true },
        });
        const fullyRefunded = (successful._sum.amountPaise ?? 0n) >= refund.payment.amountPaise;
        await tx.payment.update({
          where: { id: refund.paymentId },
          data: { status: fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
        });
        await tx.order.update({
          where: { id: refund.orderId },
          data: { status: fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
        });
        await tx.auditLog.create({
          data: {
            actorId: refund.requestedById,
            action: 'payment.refund_processed',
            targetType: 'refund',
            targetId: refund.id,
            reason: refund.reason,
          },
        });
        await tx.returnRequest.updateMany({
          where: { refundId: refund.id, status: 'RECEIVED' },
          data: { status: 'REFUNDED', closedAt: new Date() },
        });
        return processed;
      },
      { timeout: 20_000 },
    );
  }

  finishWebhook(provider: 'TEST' | 'RAZORPAY', eventId: string, succeeded: boolean) {
    return this.prisma().webhookEvent.update({
      where: { provider_eventId: { provider, eventId } },
      data: {
        status: succeeded ? 'PROCESSED' : 'FAILED',
        processedAt: new Date(),
        ...(succeeded ? {} : { failureCode: 'PAYMENT_PROCESSING_FAILED' }),
      },
    });
  }

  async recordRefundWebhook(input: {
    provider: 'TEST' | 'RAZORPAY';
    eventId: string;
    rawBody: Uint8Array;
    event: GatewayRefundWebhook;
  }) {
    const payloadHash = createHash('sha256').update(input.rawBody).digest('hex');
    return this.prisma().$transaction(async (tx) => {
      const duplicate = await tx.webhookEvent.findUnique({
        where: { provider_eventId: { provider: input.provider, eventId: input.eventId } },
      });
      const refund = await tx.refund.findUnique({
        where: { providerRefundId: input.event.providerRefundId },
      });
      if (duplicate) return { replayed: true, refundId: refund?.id };
      const event = await tx.webhookEvent.create({
        data: {
          provider: input.provider,
          eventId: input.eventId,
          eventType: input.event.eventType,
          payloadHash,
          paymentId: refund?.paymentId,
        },
      });
      if (
        !refund ||
        refund.amountPaise !== input.event.amountPaise ||
        input.event.status === 'unknown'
      ) {
        await tx.webhookEvent.update({
          where: { id: event.id },
          data: {
            status:
              refund && refund.amountPaise !== input.event.amountPaise ? 'FAILED' : 'PROCESSED',
            processedAt: new Date(),
            ...(refund && refund.amountPaise !== input.event.amountPaise
              ? { failureCode: 'REFUND_AMOUNT_MISMATCH' }
              : {}),
          },
        });
        return { replayed: false, refundId: undefined };
      }
      if (input.event.status === 'failed') {
        await tx.refund.updateMany({
          where: { id: refund.id, status: { in: ['REQUESTED', 'APPROVED', 'PROCESSING'] } },
          data: { status: 'FAILED', processedAt: new Date() },
        });
        await tx.webhookEvent.update({
          where: { id: event.id },
          data: { status: 'PROCESSED', processedAt: new Date() },
        });
        return { replayed: false, refundId: undefined };
      }
      await tx.webhookEvent.update({ where: { id: event.id }, data: { status: 'PROCESSING' } });
      return { replayed: false, refundId: refund.id };
    });
  }

  findRefundByProviderId(providerRefundId: string) {
    return this.prisma().refund.findUnique({ where: { providerRefundId } });
  }

  settlementWebhook(input: {
    provider: 'TEST' | 'RAZORPAY';
    eventId: string;
    eventType: string;
    transferId: string;
    status: 'settled' | 'failed' | 'unknown';
    rawBody: Uint8Array;
  }) {
    const payloadHash = createHash('sha256').update(input.rawBody).digest('hex');
    return this.prisma().$transaction(async (tx) => {
      const duplicate = await tx.webhookEvent.findUnique({
        where: { provider_eventId: { provider: input.provider, eventId: input.eventId } },
      });
      if (duplicate) return { accepted: true, replayed: true };
      const settlement = await tx.vendorSettlement.findUnique({
        where: { providerTransferId: input.transferId },
      });
      const event = await tx.webhookEvent.create({
        data: {
          provider: input.provider,
          eventId: input.eventId,
          eventType: input.eventType,
          payloadHash,
          status: 'RECEIVED',
        },
      });
      if (!settlement || input.status === 'unknown') {
        await tx.webhookEvent.update({
          where: { id: event.id },
          data: { status: 'PROCESSED', processedAt: new Date() },
        });
        return { accepted: true, replayed: false };
      }
      if (input.status === 'failed') {
        await tx.vendorSettlement.updateMany({
          where: { id: settlement.id, status: 'PROCESSING' },
          data: { status: 'FAILED' },
        });
      } else if (settlement.status === 'PROCESSING') {
        const changed = await tx.vendorSettlement.updateMany({
          where: { id: settlement.id, status: 'PROCESSING' },
          data: { status: 'SETTLED', settledAt: new Date() },
        });
        if (changed.count)
          await tx.ledgerTransaction.create({
            data: {
              settlementId: settlement.id,
              reference: `settlement:${settlement.id}`,
              description: `Confirmed vendor settlement ${settlement.id}`,
              currency: settlement.currency,
              entries: {
                create: [
                  {
                    accountCode: 'VENDOR_PAYABLE',
                    side: 'DEBIT',
                    amountPaise: settlement.amountPaise,
                    vendorId: settlement.vendorId,
                  },
                  {
                    accountCode: 'GATEWAY_CLEARING',
                    side: 'CREDIT',
                    amountPaise: settlement.amountPaise,
                    vendorId: settlement.vendorId,
                  },
                ],
              },
            },
          });
      }
      await tx.webhookEvent.update({
        where: { id: event.id },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
      return { accepted: true, replayed: false };
    });
  }

  async createSettlementBatch(provider: 'TEST' | 'RAZORPAY', now = new Date()) {
    const eligible = await this.prisma().vendorOrder.findMany({
      where: {
        status: 'DELIVERED',
        deliveredAt: { lte: new Date(now.getTime() - 7 * 86_400_000) },
        order: {
          payment: { status: 'SUCCEEDED' },
          refunds: {
            none: { status: { in: ['REQUESTED', 'APPROVED', 'PROCESSING', 'SUCCEEDED'] } },
          },
        },
        items: { some: { settlementItem: null } },
      },
      orderBy: [{ vendorId: 'asc' }, { deliveredAt: 'asc' }, { id: 'asc' }],
      include: { items: { where: { settlementItem: null }, orderBy: { id: 'asc' } } },
    });
    const byVendor = new Map<string, typeof eligible>();
    for (const row of eligible)
      byVendor.set(row.vendorId, [...(byVendor.get(row.vendorId) ?? []), row]);
    const week = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    week.setUTCDate(week.getUTCDate() - ((week.getUTCDay() + 6) % 7));
    const periodEnd = week;
    const periodStart = new Date(week.getTime() - 7 * 86_400_000);
    const weekKey = periodEnd.toISOString().slice(0, 10);
    const created: string[] = [];
    for (const [vendorId, vendorOrders] of byVendor) {
      const idempotencyKey = `weekly:${vendorId}:${weekKey}`;
      const total = vendorOrders.reduce((sum, row) => sum + row.vendorPayablePaise, 0n);
      if (total <= 0n) continue;
      const items = vendorOrders.flatMap((vendorOrder) => {
        if (!vendorOrder.items.length) return [];
        const amount = vendorOrder.vendorPayablePaise;
        const weights = vendorOrder.items.map((item) => item.vendorPayablePaise);
        const weightTotal = weights.reduce((sum, weight) => sum + weight, 0n);
        let allocated = 0n;
        return vendorOrder.items.map((item, index) => {
          const amountPaise =
            index === vendorOrder.items.length - 1
              ? amount - allocated
              : weightTotal > 0n
                ? (amount * weights[index]!) / weightTotal
                : 0n;
          allocated += amountPaise;
          return { orderItemId: item.id, vendorOrderId: vendorOrder.id, amountPaise };
        });
      });
      try {
        const settlement = await this.prisma().vendorSettlement.create({
          data: {
            vendorId,
            provider,
            amountPaise: total,
            periodStart,
            periodEnd,
            idempotencyKey,
            items: { create: items },
          },
        });
        created.push(settlement.id);
      } catch (error) {
        if (!(
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'P2002'
        ))
          throw error;
      }
    }
    return { created: created.length, settlementIds: created };
  }

  listVendorSettlements(vendorId: string, page = 1, pageSize = 50) {
    return this.prisma().vendorSettlement.findMany({
      where: { vendorId },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    });
  }

  listAdminSettlements(page = 1, pageSize = 50) {
    return this.prisma().vendorSettlement.findMany({
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: { vendor: { select: { id: true, name: true } }, items: true },
    });
  }

  async reconciliationReport(since = new Date(Date.now() - 30 * 86_400_000)) {
    const [payments, settlements, failedWebhooks, unresolvedRefunds, ledgerGroups] =
      await Promise.all([
        this.prisma().payment.groupBy({
          by: ['status'],
          where: { createdAt: { gte: since } },
          _count: { _all: true },
          _sum: { amountPaise: true },
        }),
        this.prisma().vendorSettlement.groupBy({
          by: ['status'],
          where: { createdAt: { gte: since } },
          _count: { _all: true },
          _sum: { amountPaise: true },
        }),
        this.prisma().webhookEvent.count({
          where: { receivedAt: { gte: since }, status: 'FAILED' },
        }),
        this.prisma().refund.count({
          where: {
            createdAt: { gte: since },
            status: { in: ['REQUESTED', 'APPROVED', 'PROCESSING'] },
          },
        }),
        this.prisma().ledgerEntry.groupBy({
          by: ['transactionId', 'side'],
          where: { createdAt: { gte: since } },
          _sum: { amountPaise: true },
        }),
      ]);
    const transactionTotals = new Map<string, { debit: bigint; credit: bigint }>();
    for (const group of ledgerGroups) {
      const totals = transactionTotals.get(group.transactionId) ?? { debit: 0n, credit: 0n };
      totals[group.side === 'DEBIT' ? 'debit' : 'credit'] = group._sum.amountPaise ?? 0n;
      transactionTotals.set(group.transactionId, totals);
    }
    const unbalancedTransactions = [...transactionTotals.entries()]
      .filter(([, totals]) => totals.debit !== totals.credit)
      .map(([transactionId]) => transactionId);
    return {
      since,
      payments: payments.map((row) => ({
        status: row.status,
        count: row._count._all,
        amountPaise: row._sum.amountPaise ?? 0n,
      })),
      settlements: settlements.map((row) => ({
        status: row.status,
        count: row._count._all,
        amountPaise: row._sum.amountPaise ?? 0n,
      })),
      failedWebhooks,
      unresolvedRefunds,
      unbalancedTransactions,
    };
  }

  findSettlement(id: string) {
    return this.prisma().vendorSettlement.findUnique({ where: { id } });
  }

  async beginSettlementTransfer(id: string, gateway: PaymentGateway) {
    const settlement = await this.prisma().vendorSettlement.findUnique({ where: { id } });
    if (!settlement) throw new AppError(404, 'NOT_FOUND', 'Settlement was not found.');
    if (!['PENDING', 'FAILED'].includes(settlement.status))
      throw new AppError(
        409,
        'SETTLEMENT_NOT_TRANSFERABLE',
        'Settlement is not available for transfer.',
      );
    const attempt =
      settlement.status === 'FAILED'
        ? `${settlement.idempotencyKey}:retry:${Date.now()}`
        : settlement.idempotencyKey;
    const transfer = await gateway.createTransfer({
      vendorId: settlement.vendorId,
      amountPaise: settlement.amountPaise,
      idempotencyKey: attempt,
    });
    return this.prisma().vendorSettlement.update({
      where: { id },
      data: {
        status: 'PROCESSING',
        provider: gateway.provider,
        providerTransferId: transfer.providerTransferId,
        transferredAt: null,
      },
    });
  }
}
