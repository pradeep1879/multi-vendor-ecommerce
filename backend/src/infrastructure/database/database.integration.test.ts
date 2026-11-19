import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const databaseName = testDatabaseUrl
  ? new URL(testDatabaseUrl).pathname.split('/').at(-1)
  : undefined;
if (testDatabaseUrl && !databaseName?.endsWith('_test')) {
  throw new Error('TEST_DATABASE_URL must target a database whose name ends with _test.');
}

const dbTest = testDatabaseUrl ? describe : describe.skip;
const ids = {
  customer: crypto.randomUUID(),
  ownerOne: crypto.randomUUID(),
  ownerTwo: crypto.randomUUID(),
  category: crypto.randomUUID(),
  vendorOne: crypto.randomUUID(),
  vendorTwo: crypto.randomUUID(),
  product: crypto.randomUUID(),
  order: crypto.randomUUID(),
};

let prisma: PrismaClient;

dbTest('PostgreSQL constraints and relationships', () => {
  beforeAll(async () => {
    if (!testDatabaseUrl) return;
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl }) });
    const suffix = crypto.randomUUID();
    const users = [
      { id: ids.customer, email: `db-customer-${suffix}@example.test`, name: 'DB Customer' },
      { id: ids.ownerOne, email: `db-owner-one-${suffix}@example.test`, name: 'DB Owner One' },
      { id: ids.ownerTwo, email: `db-owner-two-${suffix}@example.test`, name: 'DB Owner Two' },
    ];
    for (const user of users) {
      await prisma.user.create({
        data: {
          ...user,
          normalizedEmail: user.email,
          passwordHash: 'test-only-not-a-credential',
        },
      });
    }
    await prisma.category.create({
      data: { id: ids.category, name: 'DB Category', slug: `db-${suffix}` },
    });
    await prisma.vendor.createMany({
      data: [
        {
          id: ids.vendorOne,
          ownerId: ids.ownerOne,
          name: 'DB Vendor One',
          slug: `db-one-${suffix}`,
        },
        {
          id: ids.vendorTwo,
          ownerId: ids.ownerTwo,
          name: 'DB Vendor Two',
          slug: `db-two-${suffix}`,
        },
      ],
    });
    await prisma.product.create({
      data: {
        id: ids.product,
        vendorId: ids.vendorOne,
        categoryId: ids.category,
        name: 'DB Product',
        slug: `db-product-${suffix}`,
        sku: `DB-SKU-${suffix}`,
        description: 'Database constraint fixture.',
        pricePaise: 10_000n,
        taxCode: 'DEV_ZERO',
      },
    });
    await prisma.inventory.create({ data: { productId: ids.product, onHand: 2, reserved: 0 } });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.vendorOrder.deleteMany({ where: { orderId: ids.order } });
    await prisma.order.deleteMany({ where: { id: ids.order } });
    await prisma.inventory.deleteMany({ where: { productId: ids.product } });
    await prisma.product.deleteMany({ where: { id: ids.product } });
    await prisma.vendor.deleteMany({ where: { id: { in: [ids.vendorOne, ids.vendorTwo] } } });
    await prisma.category.deleteMany({ where: { id: ids.category } });
    await prisma.user.deleteMany({
      where: { id: { in: [ids.customer, ids.ownerOne, ids.ownerTwo] } },
    });
    await prisma.$disconnect();
  });

  test('unique constraints reject duplicate role grants', async () => {
    await prisma.userRole.create({ data: { userId: ids.customer, role: 'CUSTOMER' } });
    await expect(
      Promise.resolve(prisma.userRole.create({ data: { userId: ids.customer, role: 'CUSTOMER' } })),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  test('foreign keys reject roles for nonexistent users', async () => {
    await expect(
      Promise.resolve(
        prisma.userRole.create({ data: { userId: crypto.randomUUID(), role: 'VENDOR' } }),
      ),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  test('database check constraints prevent invalid inventory quantities', async () => {
    await expect(
      Promise.resolve(
        prisma.inventory.update({
          where: { productId: ids.product },
          data: { onHand: 1, reserved: 2 },
        }),
      ),
    ).rejects.toThrow('Inventory_quantities_nonnegative_check');
    expect(await prisma.inventory.findUnique({ where: { productId: ids.product } })).toMatchObject({
      onHand: 2,
      reserved: 0,
    });
  });

  test('one parent order can relate fulfillment groups from two vendors', async () => {
    const now = new Date();
    await prisma.order.create({
      data: {
        id: ids.order,
        orderNumber: `DB-${ids.order}`,
        customerId: ids.customer,
        itemSubtotalPaise: 20_000n,
        payablePaise: 20_000n,
        shippingAddress: { recipient: 'DB Customer', line1: 'Test' },
        idempotencyKey: `db-order-${ids.order}`,
        reservationExpiresAt: now,
        vendorOrders: {
          create: [
            {
              vendorId: ids.vendorOne,
              itemSubtotalPaise: 10_000n,
              vendorPayablePaise: 10_000n,
            },
            {
              vendorId: ids.vendorTwo,
              itemSubtotalPaise: 10_000n,
              vendorPayablePaise: 10_000n,
            },
          ],
        },
      },
    });
    const saved = await prisma.order.findUnique({
      where: { id: ids.order },
      include: { vendorOrders: { include: { vendor: true } } },
    });
    expect(saved?.vendorOrders).toHaveLength(2);
    expect(typeof saved?.payablePaise).toBe('bigint');
    expect(new Set(saved?.vendorOrders.map((group) => group.vendorId)).size).toBe(2);
    expect(saved?.vendorOrders.map((group) => group.vendor.name).sort()).toEqual([
      'DB Vendor One',
      'DB Vendor Two',
    ]);
    await expect(
      Promise.resolve(
        prisma.order.update({ where: { id: ids.order }, data: { payablePaise: 1n } }),
      ),
    ).rejects.toThrow('Order_totals_consistent_check');
  });
});
