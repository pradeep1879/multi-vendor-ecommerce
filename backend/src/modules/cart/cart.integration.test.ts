import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createHmac } from 'node:crypto';
import type { Server } from 'node:http';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../prisma-client/client.js';
import { createApp } from '../../app.js';
import { loadEnvironment } from '../../config/env.js';
import { disconnectDatabase } from '../../infrastructure/database/client.js';
import { createApiRouter } from '../../routes.js';
import { OrdersRepository } from '../orders/orders.repository.js';

const url = process.env.TEST_DATABASE_URL;
if (url && !new URL(url).pathname.split('/').at(-1)?.endsWith('_test'))
  throw new Error('TEST_DATABASE_URL must target a database whose name ends with _test.');
const cartTest = url ? describe : describe.skip;
const env = loadEnvironment({
  NODE_ENV: 'test',
  DATABASE_URL: url,
  JWT_ACCESS_SECRET: crypto.randomUUID() + crypto.randomUUID(),
  CORS_ORIGINS: 'http://localhost:5173',
  PAYMENT_PROVIDER: 'test',
  PAYMENT_TEST_SECRET: 'integration-test-payment-secret-32chars',
  ...(process.env.TEST_REDIS_URL ? { REDIS_URL: process.env.TEST_REDIS_URL } : {}),
});
let prisma: PrismaClient;
let server: Server;
let base = '';

cartTest('Persistent isolated carts and checkout preview', () => {
  beforeAll(async () => {
    if (!url) return;
    process.env.DATABASE_URL = url;
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
    server = createApp(createApiRouter(env), env).listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Cart test server failed to start.');
    base = `http://127.0.0.1:${address.port}/api/v1`;
  });
  afterAll(async () => {
    if (server?.listening)
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    await prisma?.$disconnect();
    await disconnectDatabase();
  });
  async function account(label: string) {
    const response = await fetch(`${base}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: `cart-${label}-${crypto.randomUUID()}@example.test`,
        password: 'cart-integration-password-2026',
        name: 'Cart Test',
      }),
    });
    expect(response.status).toBe(201);
    return ((await response.json()) as { data: { accessToken: string; user: { id: string } } })
      .data;
  }
  const auth = (token: string) => ({
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  });

  test('cart writes are idempotent, user-scoped, stock-checked and priced from PostgreSQL', async () => {
    const customer = await account('customer');
    const other = await account('other');
    const admin = await account('admin');
    await prisma.userRole.create({ data: { userId: admin.user.id, role: 'ADMIN' } });
    const taxCode = `CT${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`;
    const category = await prisma.category.create({
      data: { name: 'Cart test', slug: `cart-test-${crypto.randomUUID().slice(0, 8)}` },
    });
    const seller = await account('seller');
    await prisma.userRole.create({ data: { userId: seller.user.id, role: 'VENDOR' } });
    const vendor = await prisma.vendor.create({
      data: {
        ownerId: seller.user.id,
        name: 'Cart Store',
        slug: `cart-store-${crypto.randomUUID().slice(0, 8)}`,
        status: 'APPROVED',
        approvedAt: new Date(),
        flatShippingPaise: 500n,
        shippingTaxCode: taxCode,
      },
    });
    const product = await prisma.product.create({
      data: {
        vendorId: vendor.id,
        categoryId: category.id,
        name: 'Cart item',
        slug: `cart-item-${crypto.randomUUID().slice(0, 8)}`,
        sku: `CART-${crypto.randomUUID()}`,
        description: 'Preview item',
        pricePaise: 10000n,
        taxCode,
        status: 'ACTIVE',
        approvedAt: new Date(),
        inventory: { create: { onHand: 6 } },
      },
    });
    const productVariant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: `CART-V-${crypto.randomUUID()}`,
        name: 'Default',
        pricePaise: 10000n,
        isDefault: true,
      },
    });
    await prisma.inventory.update({
      where: { productId: product.id },
      data: { variantId: productVariant.id },
    });
    const seller2 = await account('seller-two');
    await prisma.userRole.create({ data: { userId: seller2.user.id, role: 'VENDOR' } });
    const vendor2 = await prisma.vendor.create({
      data: {
        ownerId: seller2.user.id,
        name: 'Second Cart Store',
        slug: `cart-store-two-${crypto.randomUUID().slice(0, 8)}`,
        status: 'APPROVED',
        approvedAt: new Date(),
        flatShippingPaise: 250n,
        shippingTaxCode: taxCode,
      },
    });
    const product2 = await prisma.product.create({
      data: {
        vendorId: vendor2.id,
        categoryId: category.id,
        name: 'Second cart item',
        slug: `cart-item-two-${crypto.randomUUID().slice(0, 8)}`,
        sku: `CART2-${crypto.randomUUID()}`,
        description: 'Second vendor item',
        pricePaise: 2000n,
        taxCode,
        status: 'ACTIVE',
        approvedAt: new Date(),
        inventory: { create: { onHand: 6 } },
      },
    });
    const product2Variant = await prisma.productVariant.create({
      data: {
        productId: product2.id,
        sku: `CART2-V-${crypto.randomUUID()}`,
        name: 'Default',
        pricePaise: 2000n,
        isDefault: true,
      },
    });
    await prisma.inventory.update({
      where: { productId: product2.id },
      data: { variantId: product2Variant.id },
    });
    await prisma.taxRule.create({
      data: {
        taxCode,
        jurisdictionCode: 'IN-DEFAULT',
        rateBasisPoints: 0,
        effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
      },
    });
    await prisma.commissionRule.create({
      data: {
        name: 'Cart test default',
        rateBasisPoints: 1000,
        effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
      },
    });
    const address = await prisma.address.create({
      data: {
        userId: customer.user.id,
        recipient: 'Cart Customer',
        line1: '1 Test Road',
        city: 'Pune',
        region: 'Maharashtra',
        postalCode: '411001',
        countryCode: 'IN',
      },
    });
    const set = async (token: string, quantity: number) =>
      fetch(`${base}/cart/items`, {
        method: 'PUT',
        headers: auth(token),
        body: JSON.stringify({ productId: product.id, quantity }),
      });
    const setSecondProduct = (token: string, quantity: number) =>
      fetch(`${base}/cart/items`, {
        method: 'PUT',
        headers: auth(token),
        body: JSON.stringify({ productId: product2.id, quantity }),
      });
    expect((await set(customer.accessToken, 2)).status).toBe(200);
    expect((await set(customer.accessToken, 2)).status).toBe(200);
    expect((await setSecondProduct(customer.accessToken, 1)).status).toBe(200);
    const couponCode = `SAVE${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    const createdCoupon = await fetch(`${base}/admin/coupons`, {
      method: 'POST',
      headers: auth(admin.accessToken),
      body: JSON.stringify({
        code: couponCode,
        scope: 'PLATFORM',
        discountType: 'PERCENTAGE',
        value: 1000,
        maxDiscountPaise: 500,
        minOrderPaise: 1000,
        maximumUses: 1,
        perUserLimit: 1,
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        endsAt: new Date(Date.now() + 86_400_000).toISOString(),
        status: 'ACTIVE',
        productIds: [],
        categoryIds: [],
      }),
    });
    expect(createdCoupon.status).toBe(201);
    const couponValidation = await fetch(`${base}/coupons/validate`, {
      method: 'POST',
      headers: auth(customer.accessToken),
      body: JSON.stringify({ codes: [couponCode] }),
    });
    expect(await couponValidation.json()).toMatchObject({
      data: { eligible: [{ code: couponCode, discountPaise: '500' }], rejected: [] },
    });
    const cart = await fetch(`${base}/cart`, { headers: auth(customer.accessToken) });
    const parsed = (await cart.json()) as {
      data: {
        cart: {
          items: Array<{
            id: string;
            quantity: number;
            product: { pricePaise: string };
            isAvailable: boolean;
          }>;
        };
      };
    };
    expect(parsed.data.cart.items).toHaveLength(2);
    expect(parsed.data.cart.items[0]).toMatchObject({
      quantity: 2,
      isAvailable: true,
      product: { pricePaise: '10000' },
    });
    const crossUser = await fetch(`${base}/cart/items/${parsed.data.cart.items[0]!.id}`, {
      method: 'PATCH',
      headers: auth(other.accessToken),
      body: JSON.stringify({ quantity: 1 }),
    });
    expect(crossUser.status).toBe(404);
    expect((await set(customer.accessToken, 7)).status).toBe(409);
    const preview = await fetch(`${base}/checkout/preview`, {
      method: 'POST',
      headers: auth(customer.accessToken),
      body: JSON.stringify({ addressId: address.id, couponCodes: [couponCode] }),
    });
    expect(preview.status).toBe(200);
    expect(await preview.json()).toMatchObject({
      data: {
        preview: {
          totals: {
            itemSubtotalPaise: '22000',
            discountPaise: '500',
            shippingPaise: '750',
            commissionPaise: '2150',
            payablePaise: '22250',
          },
        },
      },
    });
    const idempotencyKey = crypto.randomUUID();
    const placeOrder = () =>
      fetch(`${base}/orders`, {
        method: 'POST',
        headers: { ...auth(customer.accessToken), 'idempotency-key': idempotencyKey },
        body: JSON.stringify({ addressId: address.id, couponCodes: [couponCode] }),
      });
    const placed = await placeOrder();
    expect(placed.status).toBe(201);
    const orderBody = (await placed.json()) as {
      data: {
        order: {
          id: string;
          orderNumber: string;
          items: Array<{ id: string; productId: string | null; productNameSnapshot: string }>;
          vendorOrders: Array<{
            id: string;
            vendorId: string;
            items: Array<{ productId: string | null }>;
          }>;
          discountPaise: string;
          payablePaise: string;
        };
        replayed: boolean;
      };
    };
    expect(orderBody.data.order.items.map((item) => item.productNameSnapshot).sort()).toEqual([
      'Cart item',
      'Second cart item',
    ]);
    expect(orderBody.data.order.vendorOrders).toHaveLength(2);
    expect(orderBody.data.order.discountPaise).toBe('500');
    expect(orderBody.data.order.payablePaise).toBe('22250');
    expect(orderBody.data.replayed).toBe(false);
    const adminOrders = await fetch(
      `${base}/admin/orders?page=1&pageSize=10&status=PENDING_PAYMENT`,
      {
        headers: auth(admin.accessToken),
      },
    );
    expect(adminOrders.status).toBe(200);
    expect(await adminOrders.json()).toMatchObject({
      data: {
        orders: [{ id: orderBody.data.order.id, orderNumber: orderBody.data.order.orderNumber }],
      },
      meta: { page: 1, pageSize: 10 },
    });
    expect(
      (await fetch(`${base}/admin/orders`, { headers: auth(customer.accessToken) })).status,
    ).toBe(403);
    const replay = await placeOrder();
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({
      data: { replayed: true, order: { id: orderBody.data.order.id } },
    });
    expect(
      (await prisma.inventory.findUniqueOrThrow({ where: { productId: product.id } })).reserved,
    ).toBe(2);
    expect(
      (await prisma.inventory.findUniqueOrThrow({ where: { productId: product2.id } })).reserved,
    ).toBe(1);
    const vendorOrders = await fetch(`${base}/vendor/orders`, {
      headers: auth(seller.accessToken),
    });
    expect(vendorOrders.status).toBe(200);
    const vendorRows = (await vendorOrders.json()) as {
      data: { orders: Array<{ id: string; items: Array<{ productId: string | null }> }> };
    };
    expect(vendorRows.data.orders).toHaveLength(1);
    expect(vendorRows.data.orders[0]!.items.map((item) => item.productId)).toEqual([product.id]);
    const vendor2RowsResponse = await fetch(`${base}/vendor/orders`, {
      headers: auth(seller2.accessToken),
    });
    const vendor2Rows = (await vendor2RowsResponse.json()) as {
      data: { orders: Array<{ id: string; items: Array<{ productId: string | null }> }> };
    };
    expect(vendor2Rows.data.orders).toHaveLength(1);
    expect(vendor2Rows.data.orders[0]!.items.map((item) => item.productId)).toEqual([product2.id]);
    const crossVendorOrder = await fetch(`${base}/vendor/orders/${vendorRows.data.orders[0]!.id}`, {
      headers: auth(seller2.accessToken),
    });
    expect(crossVendorOrder.status).toBe(404);
    const cancelled = await fetch(`${base}/orders/${orderBody.data.order.id}/cancel`, {
      method: 'POST',
      headers: auth(customer.accessToken),
      body: JSON.stringify({ reason: 'Customer changed mind' }),
    });
    expect(cancelled.status).toBe(204);
    expect(
      (await prisma.inventory.findUniqueOrThrow({ where: { productId: product.id } })).reserved,
    ).toBe(0);
    expect((await set(customer.accessToken, 1)).status).toBe(200);
    const payableOrderResponse = await fetch(`${base}/orders`, {
      method: 'POST',
      headers: { ...auth(customer.accessToken), 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ addressId: address.id }),
    });
    const payableOrder = (await payableOrderResponse.json()) as {
      data: { order: { id: string; payablePaise: string } };
    };
    const paymentInit = await fetch(`${base}/orders/${payableOrder.data.order.id}/payment`, {
      method: 'POST',
      headers: { ...auth(customer.accessToken), 'idempotency-key': crypto.randomUUID() },
    });
    expect(paymentInit.status).toBe(201);
    const paymentInitBody = (await paymentInit.json()) as {
      data: { payment: { paymentId: string; providerOrderId: string; amountPaise: string } };
    };
    expect(paymentInitBody.data.payment.amountPaise).toBe(payableOrder.data.order.payablePaise);
    const testSecret = 'integration-test-payment-secret-32chars';
    const providerPaymentId = `test_payment_${crypto.randomUUID()}`;
    const checkoutSignature = createHmac('sha256', testSecret)
      .update(`${paymentInitBody.data.payment.providerOrderId}|${providerPaymentId}`)
      .digest('hex');
    const forgedPayment = await fetch(`${base}/payments/verify`, {
      method: 'POST',
      headers: auth(customer.accessToken),
      body: JSON.stringify({
        providerOrderId: paymentInitBody.data.payment.providerOrderId,
        providerPaymentId,
        signature: '0'.repeat(64),
      }),
    });
    expect(forgedPayment.status).toBe(400);
    const verifiedPayment = await fetch(`${base}/payments/verify`, {
      method: 'POST',
      headers: auth(customer.accessToken),
      body: JSON.stringify({
        providerOrderId: paymentInitBody.data.payment.providerOrderId,
        providerPaymentId,
        signature: checkoutSignature,
      }),
    });
    expect(verifiedPayment.status).toBe(200);
    expect(await verifiedPayment.json()).toMatchObject({
      data: { payment: { status: 'SUCCEEDED' } },
    });
    const capturedOrder = await prisma.order.findUniqueOrThrow({
      where: { id: payableOrder.data.order.id },
    });
    expect(capturedOrder.status).toBe('CONFIRMED');
    const vendorTokens = new Map([
      [vendor.id, seller.accessToken],
      [vendor2.id, seller2.accessToken],
    ]);
    const capturedFulfillments = await prisma.vendorOrder.findMany({
      where: { orderId: capturedOrder.id },
    });
    expect(capturedFulfillments.length).toBeGreaterThan(0);
    for (const fulfillment of capturedFulfillments) {
      const vendorToken = vendorTokens.get(fulfillment.vendorId);
      expect(vendorToken).toBeDefined();
      if (!vendorToken) throw new Error('Missing vendor token for captured fulfillment');
      for (const status of ['ACCEPTED', 'PACKED'] as const) {
        expect(
          (
            await fetch(`${base}/vendor/orders/${fulfillment.id}/status`, {
              method: 'PATCH',
              headers: auth(vendorToken),
              body: JSON.stringify({ status }),
            })
          ).status,
        ).toBe(200);
      }
      expect(
        (
          await fetch(`${base}/vendor/orders/${fulfillment.id}/status`, {
            method: 'PATCH',
            headers: auth(vendorToken),
            body: JSON.stringify({
              status: 'SHIPPED',
              carrier: 'Test Courier',
              trackingReference: `TRACK-${fulfillment.id.slice(0, 8)}`,
              trackingUrl: 'https://tracking.example.test/package',
            }),
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await fetch(`${base}/vendor/orders/${fulfillment.id}/status`, {
            method: 'PATCH',
            headers: auth(vendorToken),
            body: JSON.stringify({ status: 'DELIVERED' }),
          })
        ).status,
      ).toBe(200);
      const shipment = await prisma.shipment.findUniqueOrThrow({
        where: { vendorOrderId: fulfillment.id },
        include: { events: true },
      });
      expect(shipment).toMatchObject({
        status: 'DELIVERED',
        trackingReference: `TRACK-${fulfillment.id.slice(0, 8)}`,
      });
      expect(shipment.events).toHaveLength(2);
    }
    expect((await prisma.order.findUniqueOrThrow({ where: { id: capturedOrder.id } })).status).toBe(
      'DELIVERED',
    );
    const captureLedger = await prisma.ledgerTransaction.findUniqueOrThrow({
      where: { reference: `payment-capture:${paymentInitBody.data.payment.paymentId}` },
      include: { entries: true },
    });
    expect(
      captureLedger.entries
        .filter((entry) => entry.side === 'DEBIT')
        .reduce((sum, entry) => sum + entry.amountPaise, 0n),
    ).toBe(
      captureLedger.entries
        .filter((entry) => entry.side === 'CREDIT')
        .reduce((sum, entry) => sum + entry.amountPaise, 0n),
    );
    const refundKey = crypto.randomUUID();
    const requestRefund = () =>
      fetch(`${base}/admin/orders/${payableOrder.data.order.id}/refunds`, {
        method: 'POST',
        headers: { ...auth(admin.accessToken), 'idempotency-key': refundKey },
        body: JSON.stringify({ amountPaise: 100, reason: 'Partial refund integration check' }),
      });
    const refundResponse = await requestRefund();
    expect(refundResponse.status).toBe(201);
    const refundBody = (await refundResponse.json()) as {
      data: { refund: { id: string; status: string }; replayed: boolean };
    };
    expect(refundBody.data.refund.status).toBe('SUCCEEDED');
    expect((await requestRefund()).status).toBe(200);
    const refundLedger = await prisma.ledgerTransaction.findUniqueOrThrow({
      where: { reference: `refund:${refundBody.data.refund.id}` },
      include: { entries: true },
    });
    expect(
      refundLedger.entries
        .filter((entry) => entry.side === 'DEBIT')
        .reduce((sum, entry) => sum + entry.amountPaise, 0n),
    ).toBe(
      refundLedger.entries
        .filter((entry) => entry.side === 'CREDIT')
        .reduce((sum, entry) => sum + entry.amountPaise, 0n),
    );
    expect((await set(customer.accessToken, 1)).status).toBe(200);
    const webhookOrderResponse = await fetch(`${base}/orders`, {
      method: 'POST',
      headers: { ...auth(customer.accessToken), 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ addressId: address.id }),
    });
    const webhookOrder = (await webhookOrderResponse.json()) as {
      data: { order: { id: string; payablePaise: string } };
    };
    const webhookPaymentResponse = await fetch(
      `${base}/orders/${webhookOrder.data.order.id}/payment`,
      {
        method: 'POST',
        headers: { ...auth(customer.accessToken), 'idempotency-key': crypto.randomUUID() },
      },
    );
    const webhookPayment = (await webhookPaymentResponse.json()) as {
      data: { payment: { paymentId: string; providerOrderId: string; amountPaise: string } };
    };
    const webhookEventId = `event_${crypto.randomUUID()}`;
    const webhookBytes = Buffer.from(
      JSON.stringify({
        event_type: 'payment.captured',
        payment: {
          order_id: webhookPayment.data.payment.providerOrderId,
          id: `test_payment_${crypto.randomUUID()}`,
          amount: Number(webhookPayment.data.payment.amountPaise),
          currency: 'INR',
        },
      }),
    );
    const webhookSignature = createHmac('sha256', testSecret).update(webhookBytes).digest('hex');
    const sendWebhook = () =>
      fetch(`${base}/payments/webhook`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-payment-event-id': webhookEventId,
          'x-payment-signature': webhookSignature,
        },
        body: webhookBytes,
      });
    expect((await sendWebhook()).status).toBe(200);
    expect(await (await sendWebhook()).json()).toMatchObject({ data: { replayed: true } });
    expect(
      await prisma.ledgerTransaction.count({
        where: { reference: `payment-capture:${webhookPayment.data.payment.paymentId}` },
      }),
    ).toBe(1);
    const deliveredAt = new Date(Date.now() - 8 * 86_400_000);
    await prisma.vendorOrder.updateMany({
      where: { orderId: webhookOrder.data.order.id },
      data: { status: 'DELIVERED', deliveredAt },
    });
    const settlementBatchResponse = await fetch(`${base}/admin/settlements/batch`, {
      method: 'POST',
      headers: auth(admin.accessToken),
    });
    expect(settlementBatchResponse.status).toBe(201);
    const settlementBatch = (await settlementBatchResponse.json()) as {
      data: { created: number; settlementIds: string[] };
    };
    expect(settlementBatch.data.created).toBeGreaterThan(0);
    const settlementId = settlementBatch.data.settlementIds[0]!;
    const vendorSettlements = await fetch(`${base}/vendor/settlements`, {
      headers: auth(seller.accessToken),
    });
    expect(vendorSettlements.status).toBe(200);
    const startTransfer = await fetch(`${base}/admin/settlements/${settlementId}/transfer`, {
      method: 'POST',
      headers: auth(admin.accessToken),
    });
    expect(startTransfer.status).toBe(200);
    const transferResponse = (await startTransfer.json()) as {
      data: {
        settlement: { providerTransferId: string; status: string; settledAt: string | null };
      };
    };
    expect(transferResponse.data.settlement).toMatchObject({
      status: 'PROCESSING',
      settledAt: null,
    });
    const transferEventId = `event_${crypto.randomUUID()}`;
    const transferBytes = Buffer.from(
      JSON.stringify({
        event_type: 'transfer.settled',
        transfer: { id: transferResponse.data.settlement.providerTransferId, status: 'settled' },
      }),
    );
    const transferSignature = createHmac('sha256', testSecret).update(transferBytes).digest('hex');
    const sendTransferWebhook = () =>
      fetch(`${base}/payments/webhook`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-payment-event-id': transferEventId,
          'x-payment-signature': transferSignature,
        },
        body: transferBytes,
      });
    expect((await sendTransferWebhook()).status).toBe(200);
    expect(await (await sendTransferWebhook()).json()).toMatchObject({ data: { replayed: true } });
    expect(
      (await prisma.vendorSettlement.findUniqueOrThrow({ where: { id: settlementId } })).status,
    ).toBe('SETTLED');
    expect(
      await prisma.ledgerTransaction.count({ where: { reference: `settlement:${settlementId}` } }),
    ).toBe(1);
    expect((await set(customer.accessToken, 1)).status).toBe(200);
    const failedOrderResponse = await fetch(`${base}/orders`, {
      method: 'POST',
      headers: { ...auth(customer.accessToken), 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ addressId: address.id }),
    });
    const failedOrder = (await failedOrderResponse.json()) as {
      data: { order: { id: string; payablePaise: string } };
    };
    const failedPaymentResponse = await fetch(
      `${base}/orders/${failedOrder.data.order.id}/payment`,
      {
        method: 'POST',
        headers: { ...auth(customer.accessToken), 'idempotency-key': crypto.randomUUID() },
      },
    );
    const failedPayment = (await failedPaymentResponse.json()) as {
      data: { payment: { providerOrderId: string; amountPaise: string } };
    };
    const failedEventBytes = Buffer.from(
      JSON.stringify({
        event_type: 'payment.failed',
        payment: {
          order_id: failedPayment.data.payment.providerOrderId,
          id: `test_payment_${crypto.randomUUID()}`,
          amount: Number(failedPayment.data.payment.amountPaise),
          currency: 'INR',
        },
      }),
    );
    const failedEventResponse = await fetch(`${base}/payments/webhook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-payment-event-id': `event_${crypto.randomUUID()}`,
        'x-payment-signature': createHmac('sha256', testSecret)
          .update(failedEventBytes)
          .digest('hex'),
      },
      body: failedEventBytes,
    });
    expect(failedEventResponse.status).toBe(200);
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: failedOrder.data.order.id } })).status,
    ).toBe('PAYMENT_FAILED');
    expect(
      (await prisma.inventory.findUniqueOrThrow({ where: { productId: product2.id } })).reserved,
    ).toBe(0);
    const doubleCancel = await fetch(`${base}/orders/${orderBody.data.order.id}/cancel`, {
      method: 'POST',
      headers: auth(customer.accessToken),
      body: JSON.stringify({ reason: 'Duplicate request' }),
    });
    expect(doubleCancel.status).toBe(409);
    await prisma.order.update({
      where: { id: orderBody.data.order.id },
      data: { status: 'DELIVERED', deliveredAt: new Date() },
    });
    await prisma.vendorOrder.updateMany({
      where: { orderId: orderBody.data.order.id },
      data: { status: 'DELIVERED', deliveredAt: new Date() },
    });
    const reviewItemId = orderBody.data.order.items[0]!.id;
    const reviewItemProductId = orderBody.data.order.items[0]!.productId!;
    const reviewRequest = () =>
      fetch(`${base}/orders/${orderBody.data.order.id}/items/${reviewItemId}/review`, {
        method: 'POST',
        headers: auth(customer.accessToken),
        body: JSON.stringify({ rating: 5, title: 'Good', body: 'Arrived safely' }),
      });
    const reviewResponse = await reviewRequest();
    expect(reviewResponse.status).toBe(201);
    const reviewBody = (await reviewResponse.json()) as {
      data: { review: { id: string; status: string } };
    };
    expect(reviewBody.data.review.status).toBe('PENDING');
    expect((await reviewRequest()).status).toBe(409);
    const moderationQueue = await fetch(`${base}/admin/reviews?page=1&pageSize=20&status=PENDING`, {
      headers: auth(admin.accessToken),
    });
    expect(moderationQueue.status).toBe(200);
    expect(await moderationQueue.json()).toMatchObject({
      data: { reviews: [{ id: reviewBody.data.review.id, product: { id: reviewItemProductId } }] },
    });
    const publishReview = await fetch(
      `${base}/admin/reviews/${reviewBody.data.review.id}/moderation`,
      {
        method: 'PATCH',
        headers: auth(admin.accessToken),
        body: JSON.stringify({ status: 'PUBLISHED', reason: 'Content is appropriate' }),
      },
    );
    expect(publishReview.status).toBe(200);
    const visibleReviews = await fetch(`${base}/products/${reviewItemProductId}/reviews`);
    expect(await visibleReviews.json()).toMatchObject({ data: { reviews: [{ rating: 5 }] } });
    const editedReview = await fetch(`${base}/reviews/${reviewBody.data.review.id}`, {
      method: 'PATCH',
      headers: auth(customer.accessToken),
      body: JSON.stringify({ rating: 4 }),
    });
    expect(editedReview.status).toBe(200);
    expect(await editedReview.json()).toMatchObject({ data: { review: { status: 'PENDING' } } });
    const deletedReview = await fetch(`${base}/reviews/${reviewBody.data.review.id}`, {
      method: 'DELETE',
      headers: auth(customer.accessToken),
    });
    expect(deletedReview.status).toBe(204);
    const invoice = await fetch(`${base}/orders/${orderBody.data.order.id}/invoice`, {
      headers: auth(customer.accessToken),
    });
    expect(invoice.status).toBe(200);
    expect(invoice.headers.get('content-type')).toContain('application/pdf');
    expect(new TextDecoder().decode(await invoice.arrayBuffer()).startsWith('%PDF')).toBe(true);
    const unauthorizedInvoice = await fetch(`${base}/orders/${orderBody.data.order.id}/invoice`, {
      headers: auth(other.accessToken),
    });
    expect(unauthorizedInvoice.status).toBe(404);

    const otherAddress = await prisma.address.create({
      data: {
        userId: other.user.id,
        recipient: 'Other Customer',
        line1: '2 Test Road',
        city: 'Pune',
        region: 'Maharashtra',
        postalCode: '411001',
        countryCode: 'IN',
      },
    });
    const raceCouponCode = `RACE${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    const raceCoupon = await fetch(`${base}/admin/coupons`, {
      method: 'POST',
      headers: auth(admin.accessToken),
      body: JSON.stringify({
        code: raceCouponCode,
        scope: 'PLATFORM',
        discountType: 'FIXED',
        value: 100,
        maximumUses: 1,
        perUserLimit: 1,
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        endsAt: new Date(Date.now() + 86_400_000).toISOString(),
        status: 'ACTIVE',
      }),
    });
    expect(raceCoupon.status).toBe(201);
    expect((await set(customer.accessToken, 1)).status).toBe(200);
    expect((await set(other.accessToken, 1)).status).toBe(200);
    const couponRace = await Promise.all([
      fetch(`${base}/orders`, {
        method: 'POST',
        headers: { ...auth(customer.accessToken), 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ addressId: address.id, couponCodes: [raceCouponCode] }),
      }),
      fetch(`${base}/orders`, {
        method: 'POST',
        headers: { ...auth(other.accessToken), 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ addressId: otherAddress.id, couponCodes: [raceCouponCode] }),
      }),
    ]);
    expect(couponRace.map((response) => response.status).sort()).toEqual([201, 409]);
    const raceWinnerIndex = couponRace.findIndex((response) => response.status === 201);
    const raceWinner = (await couponRace[raceWinnerIndex]!.json()) as {
      data: { order: { id: string } };
    };
    expect(
      await prisma.couponRedemption.count({ where: { coupon: { code: raceCouponCode } } }),
    ).toBe(1);
    await fetch(`${base}/orders/${raceWinner.data.order.id}/cancel`, {
      method: 'POST',
      headers: auth(raceWinnerIndex === 0 ? customer.accessToken : other.accessToken),
      body: JSON.stringify({ reason: 'Integration test cleanup' }),
    });
    await Promise.all(
      [customer.accessToken, other.accessToken].map((token) =>
        fetch(`${base}/cart`, { method: 'DELETE', headers: auth(token) }),
      ),
    );
    expect((await set(customer.accessToken, 4)).status).toBe(200);
    expect((await set(other.accessToken, 4)).status).toBe(200);
    const competing = await Promise.all([
      fetch(`${base}/orders`, {
        method: 'POST',
        headers: { ...auth(customer.accessToken), 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ addressId: address.id }),
      }),
      fetch(`${base}/orders`, {
        method: 'POST',
        headers: { ...auth(other.accessToken), 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ addressId: otherAddress.id }),
      }),
    ]);
    expect(competing.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(
      (await prisma.inventory.findUniqueOrThrow({ where: { productId: product.id } })).reserved,
    ).toBe(4);
    const winnerIndex = competing.findIndex((response) => response.status === 201);
    const winnerBody = (await competing[winnerIndex]!.json()) as {
      data: { order: { id: string } };
    };
    await fetch(`${base}/orders/${winnerBody.data.order.id}/cancel`, {
      method: 'POST',
      headers: auth(winnerIndex === 0 ? customer.accessToken : other.accessToken),
      body: JSON.stringify({ reason: 'Integration test cleanup' }),
    });
    expect(
      (await prisma.inventory.findUniqueOrThrow({ where: { productId: product.id } })).reserved,
    ).toBe(0);
    expect((await set(customer.accessToken, 1)).status).toBe(200);
    const expiring = await fetch(`${base}/orders`, {
      method: 'POST',
      headers: { ...auth(customer.accessToken), 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ addressId: address.id }),
    });
    const expiringBody = (await expiring.json()) as { data: { order: { id: string } } };
    await prisma.order.update({
      where: { id: expiringBody.data.order.id },
      data: { reservationExpiresAt: new Date(Date.now() - 1_000) },
    });
    const expiryJob = new OrdersRepository();
    expect(await expiryJob.expireReservations()).toBe(1);
    expect(await expiryJob.expireReservations()).toBe(0);
    expect(
      (await prisma.inventory.findUniqueOrThrow({ where: { productId: product.id } })).reserved,
    ).toBe(0);
    const redis = await fetch(`${base}/health/redis`);
    const redisBody = await redis.json();
    if (process.env.TEST_REDIS_URL) {
      expect(redis.status).toBe(200);
      expect(redisBody).toMatchObject({ fallback: 'postgresql', configured: true });
    } else {
      expect(redis.status).toBe(503);
      expect(redisBody).toMatchObject({ fallback: 'postgresql', configured: false });
    }
  });
});
