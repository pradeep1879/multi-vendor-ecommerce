import { createHash, randomUUID } from 'node:crypto';
import { AppError } from '../../common/errors/app-error.js';
import { getPrismaClient } from '../../infrastructure/database/client.js';
import { calculateCouponDiscount } from '../coupons/coupon-discount.js';

const roundRate = (value: bigint, rate: number) => (value * BigInt(rate) + 5_000n) / 10_000n;
class StockRace extends Error {}

export class OrdersRepository {
  private readonly prisma = getPrismaClient;

  async findAdminOrders(page: number, pageSize: number, status?: string) {
    const where = status ? { status: status as never } : {};
    const [orders, total] = await this.prisma().$transaction([
      this.prisma().order.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        select: {
          id: true,
          orderNumber: true,
          status: true,
          currency: true,
          payablePaise: true,
          createdAt: true,
          items: { select: { id: true, productNameSnapshot: true, quantity: true } },
          payment: { select: { status: true, provider: true, amountPaise: true } },
          refunds: { select: { id: true, amountPaise: true, status: true } },
          vendorOrders: { select: { id: true, status: true, vendor: { select: { name: true } } } },
        },
      }),
      this.prisma().order.count({ where }),
    ]);
    return { orders, meta: { page, pageSize, total } };
  }

  async create(userId: string, addressId: string, key: string, couponCodes: string[] = []) {
    const normalizedCodes = couponCodes.map((code) => code.trim().toUpperCase());
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ userId, addressId, couponCodes: normalizedCodes }))
      .digest('hex');
    const scope = `checkout:${userId}`;
    const old = await this.prisma().idempotencyRecord.findUnique({
      where: { scope_key: { scope, key } },
    });
    if (old) {
      if (old.requestHash !== requestHash) return { kind: 'KEY_REUSED' as const };
      const response = old.response as { orderId?: string } | null;
      if (response?.orderId) return { kind: 'EXISTING' as const, orderId: response.orderId };
    }
    const now = new Date();
    try {
      const result = await this.prisma().$transaction(
        async (tx) => {
          const address = await tx.address.findFirst({ where: { id: addressId, userId } });
          const cart = await tx.cart.findUnique({
            where: { userId },
            include: {
              items: {
                include: {
                  product: {
                    include: { category: true, vendor: true, inventory: true },
                  },
                  variant: { include: { inventory: true } },
                },
              },
            },
          });
          if (!address) return { kind: 'ADDRESS_NOT_FOUND' as const };
          if (!cart?.items.length) return { kind: 'CART_EMPTY' as const };

          const groups = new Map<
            string,
            {
              vendor: (typeof cart.items)[number]['product']['vendor'];
              items: Array<(typeof cart.items)[number]>;
            }
          >();
          for (const item of cart.items) {
            const product = await tx.product.findUnique({
              where: { id: item.productId },
              include: { category: true, vendor: true, inventory: true },
            });
            if (
              !product ||
              product.status !== 'ACTIVE' ||
              !product.category.active ||
              product.vendor.status !== 'APPROVED'
            )
              return { kind: 'PRODUCT_UNAVAILABLE' as const };
            const variant = await tx.productVariant.findFirst({
              where: { id: item.variantId, productId: product.id, active: true },
              include: { inventory: true },
            });
            if (!variant) return { kind: 'PRODUCT_UNAVAILABLE' as const };
            const current = { ...item, product, variant };
            const group = groups.get(product.vendorId) ?? { vendor: product.vendor, items: [] };
            group.items.push(current);
            groups.set(product.vendorId, group);
          }

          const jurisdiction = address.countryCode === 'IN' ? 'IN-DEFAULT' : address.countryCode;
          if (normalizedCodes.length > 1)
            throw new AppError(
              400,
              'COUPONS_DO_NOT_STACK',
              'Only one coupon can be used per order.',
            );
          let redemptionCouponId: string | undefined;
          const discounts = new Map<string, bigint>();
          let discountPaise = 0n;
          if (normalizedCodes.length === 1) {
            const code = normalizedCodes[0]!;
            await tx.$queryRaw`SELECT "id" FROM "Coupon" WHERE "code" = ${code} FOR UPDATE`;
            const coupon = await tx.coupon.findUnique({
              where: { code },
              include: { products: true, categories: true },
            });
            if (
              !coupon ||
              coupon.status !== 'ACTIVE' ||
              coupon.startsAt > now ||
              coupon.endsAt <= now
            )
              throw new AppError(409, 'COUPON_INVALID', 'Coupon is invalid or inactive.');
            const allUses = await tx.couponRedemption.count({ where: { couponId: coupon.id } });
            const userUses = await tx.couponRedemption.count({
              where: { couponId: coupon.id, userId },
            });
            if (
              (coupon.maximumUses !== null && allUses >= coupon.maximumUses) ||
              (coupon.perUserLimit !== null && userUses >= coupon.perUserLimit)
            )
              throw new AppError(
                409,
                'COUPON_LIMIT_REACHED',
                'Coupon usage limit has been reached.',
              );
            const allocation = calculateCouponDiscount(
              coupon,
              [...groups.values()].flatMap((group) =>
                group.items.map(({ product, variant, quantity }) => ({
                  id: variant.id,
                  vendorId: product.vendorId,
                  categoryId: product.categoryId,
                  subtotalPaise: variant.pricePaise * BigInt(quantity),
                })),
              ),
            );
            if (allocation.total <= 0n)
              throw new AppError(
                409,
                'COUPON_NOT_APPLICABLE',
                'Coupon scope or minimum order amount is not met.',
              );
            discountPaise = allocation.total;
            redemptionCouponId = coupon.id;
            for (const [variantId, amount] of allocation.allocations)
              discounts.set(variantId, amount);
          }
          const taxCodes = [
            ...new Set([...groups.values()].flatMap((g) => g.items.map((i) => i.product.taxCode))),
          ];
          const vendorIds = [...groups.keys()];
          const categoryIds = [
            ...new Set(
              [...groups.values()].flatMap((g) => g.items.map((i) => i.product.categoryId)),
            ),
          ];
          const taxRules = await tx.taxRule.findMany({
            where: {
              taxCode: { in: taxCodes },
              jurisdictionCode: jurisdiction,
              active: true,
              effectiveFrom: { lte: now },
              OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
            },
            orderBy: { effectiveFrom: 'desc' },
          });
          const commissionRules = await tx.commissionRule.findMany({
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
          const pickRate = (code: string) =>
            taxRules.find((r) => r.taxCode === code)?.rateBasisPoints;
          const lines = [...groups.entries()].map(([vendorId, group]) => {
            let subtotal = 0n,
              lineDiscount = 0n,
              tax = 0n,
              commission = 0n;
            const items = group.items.map(({ product, variant, quantity }) => {
              const base = variant.pricePaise * BigInt(quantity);
              const discount = discounts.get(variant.id) ?? 0n;
              const discountedBase = base - discount;
              const taxRate = pickRate(product.taxCode);
              const rule =
                commissionRules.find(
                  (r) => r.vendorId === vendorId && r.categoryId === product.categoryId,
                ) ??
                commissionRules.find((r) => r.vendorId === vendorId && r.categoryId === null) ??
                commissionRules.find(
                  (r) => r.vendorId === null && r.categoryId === product.categoryId,
                ) ??
                commissionRules.find((r) => r.vendorId === null && r.categoryId === null);
              if (taxRate === undefined)
                throw new AppError(
                  503,
                  'TAX_CONFIGURATION_MISSING',
                  `No tax rule is configured for ${product.taxCode} in ${jurisdiction}.`,
                );
              if (!rule)
                throw new AppError(
                  503,
                  'COMMISSION_CONFIGURATION_MISSING',
                  'No commission rule is configured for a checkout item.',
                );
              const lineTax = roundRate(discountedBase, taxRate);
              const lineCommission = roundRate(discountedBase, rule.rateBasisPoints);
              subtotal += base;
              lineDiscount += discount;
              tax += lineTax;
              commission += lineCommission;
              return {
                product,
                variant,
                quantity,
                base,
                discount,
                taxRate,
                lineTax,
                rule,
                lineCommission,
              };
            });
            return {
              vendorId,
              vendor: group.vendor,
              items,
              subtotal,
              discount: lineDiscount,
              tax,
              commission,
              shippingTax: 0n,
              shipping: 0n,
            };
          });
          const itemSubtotalPaise = lines.reduce((sum, line) => sum + line.subtotal, 0n);
          const taxPaise = lines.reduce((sum, line) => sum + line.tax, 0n);
          const shippingPaise = 0n;
          const payablePaise = itemSubtotalPaise - discountPaise + taxPaise;
          await tx.idempotencyRecord.create({
            data: { scope, key, requestHash, expiresAt: new Date(now.getTime() + 86_400_000) },
          });
          for (const line of lines)
            for (const entry of line.items) {
              const inventoryId = entry.variant.inventory?.id ?? entry.product.inventory?.id;
              if (!inventoryId) throw new StockRace();
              const changed =
                await tx.$executeRaw`UPDATE "Inventory" SET "reserved" = "reserved" + ${entry.quantity}, "version" = "version" + 1, "updatedAt" = NOW() WHERE "id" = ${inventoryId}::uuid AND "onHand" - "reserved" >= ${entry.quantity}`;
              if (changed !== 1) throw new StockRace();
            }
          const number = `MKT-${now.toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
          const order = await tx.order.create({
            data: {
              orderNumber: number,
              customerId: userId,
              itemSubtotalPaise,
              discountPaise,
              taxPaise,
              shippingPaise,
              payablePaise,
              idempotencyKey: `${userId}:${createHash('sha256').update(key).digest('hex')}`,
              reservationExpiresAt: new Date(now.getTime() + 15 * 60_000),
              shippingAddress: {
                recipient: address.recipient,
                phone: address.phone,
                line1: address.line1,
                line2: address.line2,
                city: address.city,
                region: address.region,
                postalCode: address.postalCode,
                countryCode: address.countryCode,
              },
              statusHistory: {
                create: { to: 'PENDING_PAYMENT', actorType: 'CUSTOMER', actorId: userId },
              },
            },
          });
          await tx.accountNotification.create({
            data: {
              userId,
              type: 'ORDER',
              title: 'Order placed',
              body: `We received order ${order.orderNumber}. Payment is pending.`,
              href: `/account/orders/${order.id}`,
            },
          });
          for (const line of lines) {
            const vendorOrder = await tx.vendorOrder.create({
              data: {
                orderId: order.id,
                vendorId: line.vendorId,
                itemSubtotalPaise: line.subtotal,
                discountPaise: line.discount,
                taxPaise: line.tax,
                shippingPaise: line.shipping,
                commissionPaise: line.commission,
                vendorPayablePaise: line.subtotal - line.discount + line.tax - line.commission,
                statusHistory: { create: { to: 'PLACED', actorType: 'CUSTOMER', actorId: userId } },
              },
            });
            for (const entry of line.items) {
              await tx.orderItem.create({
                data: {
                  orderId: order.id,
                  vendorOrderId: vendorOrder.id,
                  productId: entry.product.id,
                  variantId: entry.variant.id,
                  variantNameSnapshot: entry.variant.name,
                  productNameSnapshot: entry.product.name,
                  skuSnapshot: entry.variant.sku,
                  vendorNameSnapshot: line.vendor.name,
                  quantity: entry.quantity,
                  unitPricePaise: entry.variant.pricePaise,
                  lineSubtotalPaise: entry.base,
                  discountPaise: entry.discount,
                  taxCodeSnapshot: entry.product.taxCode,
                  taxRateBasisPoints: entry.taxRate,
                  taxPaise: entry.lineTax,
                  commissionRuleId: entry.rule.id,
                  commissionRateBasisPoints: entry.rule.rateBasisPoints,
                  commissionPaise: entry.lineCommission,
                  vendorPayablePaise:
                    entry.base - entry.discount + entry.lineTax - entry.lineCommission,
                },
              });
              await tx.inventoryMovement.create({
                data: {
                  inventoryId: entry.variant.inventory?.id ?? entry.product.inventory!.id,
                  actorId: userId,
                  type: 'RESERVATION',
                  quantity: entry.quantity,
                  reference: order.id,
                  reason: 'Checkout stock reservation',
                },
              });
            }
          }
          if (redemptionCouponId)
            await tx.couponRedemption.create({
              data: { couponId: redemptionCouponId, userId, orderId: order.id, discountPaise },
            });
          await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
          await tx.idempotencyRecord.update({
            where: { scope_key: { scope, key } },
            data: { response: { orderId: order.id }, statusCode: 201 },
          });
          return { kind: 'CREATED' as const, orderId: order.id };
        },
        { timeout: 20_000 },
      );
      return result;
    } catch (error: unknown) {
      if (error instanceof StockRace) return { kind: 'INSUFFICIENT_STOCK' as const };
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        const found = await this.prisma().idempotencyRecord.findUnique({
          where: { scope_key: { scope, key } },
        });
        if (found?.requestHash !== requestHash) return { kind: 'KEY_REUSED' as const };
        const response = found?.response as { orderId?: string } | null;
        if (response?.orderId) return { kind: 'EXISTING' as const, orderId: response.orderId };
      }
      throw error;
    }
  }

  findCustomerOrders(userId: string) {
    return this.prisma().order.findMany({
      where: { customerId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          include: {
            product: {
              select: {
                images: {
                  orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
                  select: { url: true, altText: true },
                },
              },
            },
          },
        },
        vendorOrders: { include: { items: true, shipment: { include: { events: true } } } },
      },
    });
  }
  findCustomerOrder(userId: string, orderId: string) {
    return this.prisma().order.findFirst({
      where: { id: orderId, customerId: userId },
      include: {
        vendorOrders: {
          include: {
            vendor: { select: { name: true } },
            items: true,
            shipment: { include: { events: { orderBy: { occurredAt: 'asc' } } } },
          },
        },
        items: {
          include: {
            product: {
              select: {
                images: {
                  orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
                  select: { url: true, altText: true },
                },
              },
            },
          },
        },
        statusHistory: { orderBy: { createdAt: 'asc' } },
        payment: { select: { status: true, provider: true, amountPaise: true } },
      },
    });
  }
  findInvoiceOrder(orderId: string) {
    return this.prisma().order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        vendorOrders: {
          include: { vendor: { select: { name: true } }, items: { select: { taxPaise: true } } },
        },
      },
    });
  }
  findVendorOrders(vendorId: string) {
    return this.prisma().vendorOrder.findMany({
      where: { vendorId },
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          select: { orderNumber: true, status: true, createdAt: true, shippingAddress: true },
        },
        items: true,
      },
    });
  }
  findVendorOrder(vendorId: string, id: string) {
    return this.prisma().vendorOrder.findFirst({
      where: { id, vendorId },
      include: {
        order: {
          select: { orderNumber: true, status: true, createdAt: true, shippingAddress: true },
        },
        items: true,
        shipment: { include: { events: { orderBy: { occurredAt: 'asc' } } } },
        statusHistory: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  async transitionVendorOrder(
    vendorId: string,
    actorId: string,
    id: string,
    next: 'ACCEPTED' | 'PACKED' | 'SHIPPED' | 'DELIVERED',
    tracking?: { trackingReference?: string; carrier?: string; trackingUrl?: string },
  ) {
    return this.prisma().$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "VendorOrder" WHERE "id" = ${id}::uuid AND "vendorId" = ${vendorId}::uuid FOR UPDATE`;
      const current = await tx.vendorOrder.findFirst({
        where: { id, vendorId },
        include: { order: true },
      });
      if (!current) return { kind: 'NOT_FOUND' as const };
      if (current.order.status !== 'CONFIRMED') return { kind: 'INVALID_TRANSITION' as const };
      const allowed: Record<string, string[]> = {
        PLACED: ['ACCEPTED'],
        ACCEPTED: ['PACKED'],
        PACKED: ['SHIPPED'],
        SHIPPED: ['DELIVERED'],
      };
      if (!allowed[current.status]?.includes(next)) return { kind: 'INVALID_TRANSITION' as const };
      if (next === 'SHIPPED' && !tracking?.trackingReference)
        return { kind: 'INVALID_TRANSITION' as const };
      const now = new Date();
      const updated = await tx.vendorOrder.update({
        where: { id },
        data: {
          status: next,
          ...(next === 'ACCEPTED' ? { acceptedAt: now } : {}),
          ...(next === 'SHIPPED' ? { shippedAt: now } : {}),
          ...(next === 'DELIVERED' ? { deliveredAt: now } : {}),
          ...(tracking?.trackingReference ? { trackingReference: tracking.trackingReference } : {}),
        },
      });
      await tx.vendorOrderStatusHistory.create({
        data: { vendorOrderId: id, from: current.status, to: next, actorType: 'VENDOR', actorId },
      });
      if (next === 'SHIPPED' || next === 'DELIVERED') {
        const shipmentStatus = next === 'DELIVERED' ? 'DELIVERED' : 'IN_TRANSIT';
        const shipment = await tx.shipment.upsert({
          where: { vendorOrderId: id },
          create: {
            vendorOrderId: id,
            carrier: tracking?.carrier,
            trackingReference: tracking?.trackingReference,
            trackingUrl: tracking?.trackingUrl,
            status: shipmentStatus,
            ...(next === 'SHIPPED' ? { shippedAt: now } : { deliveredAt: now }),
          },
          update: {
            ...(tracking?.carrier ? { carrier: tracking.carrier } : {}),
            ...(tracking?.trackingReference
              ? { trackingReference: tracking.trackingReference }
              : {}),
            ...(tracking?.trackingUrl ? { trackingUrl: tracking.trackingUrl } : {}),
            status: shipmentStatus,
            ...(next === 'SHIPPED' ? { shippedAt: now } : { deliveredAt: now }),
          },
        });
        await tx.shipmentEvent.create({
          data: {
            shipmentId: shipment.id,
            status: shipmentStatus,
            description:
              next === 'DELIVERED' ? 'Shipment delivered by vendor' : 'Shipment handed to carrier',
          },
        });
        await tx.accountNotification.create({
          data: {
            userId: current.order.customerId,
            type: 'SHIPPING',
            title: next === 'SHIPPED' ? 'Your order has shipped' : 'Your order was delivered',
            body: `Order ${current.order.orderNumber} ${next === 'SHIPPED' ? 'is on its way' : 'was marked delivered'}.`,
            href: `/account/orders/${current.orderId}`,
          },
        });
      }
      if (next === 'DELIVERED') {
        const undelivered = await tx.vendorOrder.count({
          where: { orderId: current.orderId, status: { not: 'DELIVERED' } },
        });
        if (undelivered === 0)
          await tx.order.update({
            where: { id: current.orderId },
            data: {
              status: 'DELIVERED',
              deliveredAt: now,
              statusHistory: {
                create: {
                  from: current.order.status,
                  to: 'DELIVERED',
                  actorType: 'VENDOR',
                  actorId,
                },
              },
            },
          });
      }
      return { kind: 'UPDATED' as const, order: updated };
    });
  }

  async cancel(userId: string, orderId: string, reason: string) {
    return this.prisma().$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, customerId: userId },
        include: { items: true, vendorOrders: true },
      });
      if (!order) return { kind: 'NOT_FOUND' as const };
      if (!['PENDING_PAYMENT', 'PAYMENT_FAILED'].includes(order.status))
        return { kind: 'INVALID_TRANSITION' as const };
      const changed = await tx.order.updateMany({
        where: {
          id: orderId,
          customerId: userId,
          status: { in: ['PENDING_PAYMENT', 'PAYMENT_FAILED'] },
        },
        data: { status: 'CANCELLED' },
      });
      if (!changed.count) return { kind: 'INVALID_TRANSITION' as const };
      for (const item of order.items)
        if (item.variantId) {
          const released = await tx.inventory.updateMany({
            where: { variantId: item.variantId, reserved: { gte: item.quantity } },
            data: { reserved: { decrement: item.quantity }, version: { increment: 1 } },
          });
          if (!released.count)
            throw new Error(`Reservation invariant failed for order ${orderId}.`);
          const inventory = await tx.inventory.findUniqueOrThrow({
            where: { variantId: item.variantId },
            select: { id: true },
          });
          await tx.inventoryMovement.create({
            data: {
              inventoryId: inventory.id,
              actorId: userId,
              type: 'RELEASE',
              quantity: item.quantity,
              reference: order.id,
              reason,
            },
          });
        }
      await tx.vendorOrder.updateMany({ where: { orderId }, data: { status: 'CANCELLED' } });
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          from: order.status,
          to: 'CANCELLED',
          actorType: 'CUSTOMER',
          actorId: userId,
          reason,
        },
      });
      for (const v of order.vendorOrders)
        await tx.vendorOrderStatusHistory.create({
          data: {
            vendorOrderId: v.id,
            from: v.status,
            to: 'CANCELLED',
            actorType: 'CUSTOMER',
            actorId: userId,
            reason,
          },
        });
      return { kind: 'CANCELLED' as const };
    });
  }

  expireReservations(now = new Date(), limit = 100) {
    return this.prisma().$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Order"
        WHERE "status" = 'PENDING_PAYMENT' AND "reservationExpiresAt" <= ${now}
        ORDER BY "reservationExpiresAt", "id"
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      `;
        let expired = 0;
        for (const { id } of rows) {
          const order = await tx.order.findUnique({
            where: { id },
            include: { items: true, vendorOrders: true },
          });
          if (!order) continue;
          const changed = await tx.order.updateMany({
            where: { id, status: 'PENDING_PAYMENT', reservationExpiresAt: { lte: now } },
            data: { status: 'CANCELLED' },
          });
          if (!changed.count) continue;
          for (const item of order.items)
            if (item.variantId) {
              const inventory = await tx.inventory.findUnique({
                where: { variantId: item.variantId },
                select: { id: true },
              });
              if (!inventory) continue;
              const released = await tx.inventory.updateMany({
                where: { id: inventory.id, reserved: { gte: item.quantity } },
                data: { reserved: { decrement: item.quantity }, version: { increment: 1 } },
              });
              if (!released.count) throw new Error(`Reservation invariant failed for order ${id}.`);
              await tx.inventoryMovement.create({
                data: {
                  inventoryId: inventory.id,
                  type: 'RELEASE',
                  quantity: item.quantity,
                  reference: id,
                  reason: 'Payment reservation expired',
                },
              });
            }
          for (const vendorOrder of order.vendorOrders) {
            const vendorChanged = await tx.vendorOrder.updateMany({
              where: { id: vendorOrder.id, status: { not: 'CANCELLED' } },
              data: { status: 'CANCELLED' },
            });
            if (vendorChanged.count)
              await tx.vendorOrderStatusHistory.create({
                data: {
                  vendorOrderId: vendorOrder.id,
                  from: vendorOrder.status,
                  to: 'CANCELLED',
                  actorType: 'SYSTEM',
                  reason: 'Payment reservation expired',
                },
              });
          }
          await tx.orderStatusHistory.create({
            data: {
              orderId: id,
              from: 'PENDING_PAYMENT',
              to: 'CANCELLED',
              actorType: 'SYSTEM',
              reason: 'Payment reservation expired',
            },
          });
          expired += 1;
        }
        return expired;
      },
      { timeout: 20_000 },
    );
  }
}
