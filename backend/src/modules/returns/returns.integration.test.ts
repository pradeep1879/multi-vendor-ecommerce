import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';
import { ReturnsRepository } from './returns.repository';

const url = process.env.TEST_DATABASE_URL;
if (url && !new URL(url).pathname.split('/').at(-1)?.endsWith('_test'))
  throw new Error('TEST_DATABASE_URL must target a database whose name ends with _test.');
const integration = url ? describe : describe.skip;

integration('Return workflow persistence', () => {
  let prisma: PrismaClient;
  let ids = {} as {
    customer: string;
    admin: string;
    vendor: string;
    category: string;
    product: string;
    variant: string;
    order: string;
    vendorOrder: string;
    orderItem: string;
  };

  beforeAll(async () => {
    if (!url) return;
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
    const suffix = crypto.randomUUID();
    const customer = await prisma.user.create({
      data: {
        email: `return-${suffix}@example.test`,
        normalizedEmail: `return-${suffix}@example.test`,
        name: 'Return Customer',
        passwordHash: 'test',
      },
    });
    const admin = await prisma.user.create({
      data: {
        email: `return-admin-${suffix}@example.test`,
        normalizedEmail: `return-admin-${suffix}@example.test`,
        name: 'Return Admin',
        passwordHash: 'test',
      },
    });
    const vendor = await prisma.vendor.create({
      data: {
        ownerId: admin.id,
        name: `Return Store ${suffix}`,
        slug: `return-store-${suffix}`,
        status: 'APPROVED',
        approvedAt: new Date(),
      },
    });
    const category = await prisma.category.create({
      data: { name: `Return Category ${suffix}`, slug: `return-category-${suffix}` },
    });
    const product = await prisma.product.create({
      data: {
        vendorId: vendor.id,
        categoryId: category.id,
        name: 'Return Product',
        slug: `return-product-${suffix}`,
        sku: `RETURN-${suffix}`,
        description: 'Return workflow fixture',
        pricePaise: 10000n,
        taxCode: 'RETURN',
        status: 'ACTIVE',
        approvedAt: new Date(),
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: `RETURN-V-${suffix}`,
        name: 'Default',
        pricePaise: 10000n,
        isDefault: true,
      },
    });
    await prisma.inventory.create({
      data: { productId: product.id, variantId: variant.id, onHand: 3 },
    });
    const order = await prisma.order.create({
      data: {
        orderNumber: `RET-${suffix}`,
        customerId: customer.id,
        status: 'DELIVERED',
        itemSubtotalPaise: 10000n,
        payablePaise: 10000n,
        shippingAddress: {
          recipient: 'Customer',
          line1: '1 Test Road',
          city: 'Pune',
          region: 'MH',
          postalCode: '411001',
        },
        idempotencyKey: `return-test:${suffix}`,
        reservationExpiresAt: new Date(),
        confirmedAt: new Date(),
        deliveredAt: new Date(),
      },
    });
    const vendorOrder = await prisma.vendorOrder.create({
      data: {
        orderId: order.id,
        vendorId: vendor.id,
        status: 'DELIVERED',
        itemSubtotalPaise: 10000n,
        vendorPayablePaise: 10000n,
        deliveredAt: new Date(),
      },
    });
    const orderItem = await prisma.orderItem.create({
      data: {
        orderId: order.id,
        vendorOrderId: vendorOrder.id,
        productId: product.id,
        variantId: variant.id,
        variantNameSnapshot: 'Default',
        productNameSnapshot: 'Return Product',
        skuSnapshot: variant.sku,
        vendorNameSnapshot: vendor.name,
        quantity: 2,
        unitPricePaise: 5000n,
        lineSubtotalPaise: 10000n,
        taxCodeSnapshot: 'RETURN',
        vendorPayablePaise: 10000n,
      },
    });
    ids = {
      customer: customer.id,
      admin: admin.id,
      vendor: vendor.id,
      category: category.id,
      product: product.id,
      variant: variant.id,
      order: order.id,
      vendorOrder: vendorOrder.id,
      orderItem: orderItem.id,
    };
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.returnRequest.deleteMany({ where: { orderId: ids.order } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: [ids.customer, ids.admin] } } });
    await prisma.inventoryMovement.deleteMany({ where: { inventory: { variantId: ids.variant } } });
    await prisma.orderItem.deleteMany({ where: { orderId: ids.order } });
    await prisma.vendorOrder.deleteMany({ where: { id: ids.vendorOrder } });
    await prisma.order.deleteMany({ where: { id: ids.order } });
    await prisma.inventory.deleteMany({ where: { variantId: ids.variant } });
    await prisma.product.deleteMany({ where: { id: ids.product } });
    await prisma.vendor.deleteMany({ where: { id: ids.vendor } });
    await prisma.category.deleteMany({ where: { id: ids.category } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.customer, ids.admin] } } });
    await prisma.$disconnect();
  });

  test('requests are quantity-capped and received returns restock only once', async () => {
    const repository = new ReturnsRepository();
    const created = await repository.create(
      ids.customer,
      ids.order,
      ids.orderItem,
      2,
      'Wrong size',
    );
    expect(created.kind).toBe('CREATED');
    const overflow = await repository.create(
      ids.customer,
      ids.order,
      ids.orderItem,
      1,
      'More items',
    );
    expect(overflow.kind).toBe('QUANTITY_EXCEEDED');
    if (created.kind !== 'CREATED') throw new Error('Return fixture was not created.');
    expect(
      (await repository.transitionAdmin(ids.admin, created.request.id, 'APPROVED', 'Approved'))
        .kind,
    ).toBe('UPDATED');
    expect(
      (await repository.transitionAdmin(ids.admin, created.request.id, 'RECEIVED', 'Inspected'))
        .kind,
    ).toBe('UPDATED');
    expect(
      (await prisma.inventory.findUniqueOrThrow({ where: { variantId: ids.variant } })).onHand,
    ).toBe(5);
    expect(
      (await repository.transitionAdmin(ids.admin, created.request.id, 'RECEIVED', 'Duplicate'))
        .kind,
    ).toBe('INVALID_TRANSITION');
    expect(
      (await prisma.inventory.findUniqueOrThrow({ where: { variantId: ids.variant } })).onHand,
    ).toBe(5);
  });
});
