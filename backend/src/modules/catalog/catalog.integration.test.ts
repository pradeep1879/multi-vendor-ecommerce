import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Server } from 'node:http';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client.js';
import { createApp } from '../../app.js';
import { loadEnvironment } from '../../config/env.js';
import { disconnectDatabase } from '../../infrastructure/database/client.js';
import { createApiRouter } from '../../routes.js';

const url = process.env.TEST_DATABASE_URL;
if (url && !new URL(url).pathname.split('/').at(-1)?.endsWith('_test'))
  throw new Error('TEST_DATABASE_URL must target a database whose name ends with _test.');
const catalogTest = url ? describe : describe.skip;
const env = loadEnvironment({
  NODE_ENV: 'test',
  DATABASE_URL: url,
  JWT_ACCESS_SECRET: crypto.randomUUID() + crypto.randomUUID(),
  CORS_ORIGINS: 'http://localhost:5173',
  AUTH_RATE_LIMIT_MAX: '100',
});
let prisma: PrismaClient;
let server: Server;
let base = '';
catalogTest('Vendor catalog ownership and moderation', () => {
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
      throw new Error('Catalog test server failed to start.');
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
        email: `catalog-${label}-${crypto.randomUUID()}@example.test`,
        password: 'catalog-test-password-2026',
        name: 'Catalog Test',
      }),
    });
    expect(response.status).toBe(201);
    return ((await response.json()) as { data: { accessToken: string; user: { id: string } } })
      .data;
  }
  async function approveVendor(userId: string, label: string) {
    await prisma.userRole.create({ data: { userId, role: 'VENDOR' } });
    await prisma.vendor.create({
      data: {
        ownerId: userId,
        name: `Store ${label}`,
        slug: `store-${label}-${crypto.randomUUID().slice(0, 8)}`,
        status: 'APPROVED',
        approvedAt: new Date(),
      },
    });
  }
  function headers(token: string) {
    return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  }
  test('approved vendor CRUD is owner-scoped; pending vendor cannot create products and invalid data is rejected', async () => {
    const seller = await account('seller');
    const outsider = await account('outsider');
    const pending = await account('pending');
    await approveVendor(seller.user.id, 'seller');
    await approveVendor(outsider.user.id, 'outsider');
    const category = await prisma.category.create({
      data: {
        name: 'Catalog Test Category',
        slug: `catalog-test-${crypto.randomUUID().slice(0, 8)}`,
      },
    });
    const payload = {
      categoryId: category.id,
      name: 'Test item',
      slug: `test-item-${crypto.randomUUID().slice(0, 8)}`,
      sku: `SKU-${crypto.randomUUID()}`,
      description: 'Catalog integration item',
      pricePaise: '129900',
      compareAtPricePaise: '149900',
      taxCode: 'GST18',
      initialStock: 5,
    };
    const denied = await fetch(`${base}/vendor/products`, {
      method: 'POST',
      headers: headers(pending.accessToken),
      body: JSON.stringify(payload),
    });
    expect(denied.status).toBe(403);
    const invalid = await fetch(`${base}/vendor/products`, {
      method: 'POST',
      headers: headers(seller.accessToken),
      body: JSON.stringify({ ...payload, pricePaise: '0', initialStock: -1 }),
    });
    expect(invalid.status).toBe(400);
    const created = await fetch(`${base}/vendor/products`, {
      method: 'POST',
      headers: headers(seller.accessToken),
      body: JSON.stringify(payload),
    });
    expect(created.status).toBe(201);
    const product = (
      (await created.json()) as {
        data: {
          product: { id: string; slug: string; status: string; inventory: { onHand: number } };
        };
      }
    ).data.product;
    expect(product).toMatchObject({ status: 'DRAFT', inventory: { onHand: 5 } });
    const variant = await fetch(`${base}/vendor/products/${product.id}/variants`, {
      method: 'POST',
      headers: headers(seller.accessToken),
      body: JSON.stringify({
        sku: `${payload.sku}-SMALL`,
        name: 'Small',
        optionValues: { size: 'Small' },
        pricePaise: '129900',
        compareAtPricePaise: '149900',
        initialStock: 2,
      }),
    });
    expect(variant.status).toBe(201);
    const createdVariant = (await variant.json()) as {
      data: {
        variant: { id: string; sku: string; pricePaise: string; inventory: { onHand: number } };
      };
    };
    expect(createdVariant.data.variant).toMatchObject({
      sku: `${payload.sku}-SMALL`,
      pricePaise: '129900',
      inventory: { onHand: 2 },
    });
    expect(
      await fetch(`${base}/vendor/products/${product.id}/variants`, {
        headers: headers(outsider.accessToken),
      }),
    ).toMatchObject({ status: 404 });
    const variantUpdate = await fetch(
      `${base}/vendor/products/${product.id}/variants/${createdVariant.data.variant.id}`,
      {
        method: 'PATCH',
        headers: headers(seller.accessToken),
        body: JSON.stringify({ name: 'Small size', pricePaise: '124900' }),
      },
    );
    expect(variantUpdate.status).toBe(200);
    const variantStock = await fetch(
      `${base}/vendor/products/${product.id}/variants/${createdVariant.data.variant.id}/inventory-adjustments`,
      {
        method: 'POST',
        headers: headers(seller.accessToken),
        body: JSON.stringify({ delta: 3, reason: 'Variant replenishment' }),
      },
    );
    expect(variantStock.status).toBe(200);
    expect(
      ((await variantStock.json()) as { data: { inventory: { onHand: number } } }).data.inventory
        .onHand,
    ).toBe(5);
    expect(
      await prisma.searchOutboxEvent.count({ where: { productId: product.id } }),
    ).toBeGreaterThan(0);
    const hidden = await fetch(`${base}/vendor/products/${product.id}`, {
      headers: headers(outsider.accessToken),
    });
    expect(hidden.status).toBe(404);
    const updated = await fetch(`${base}/vendor/products/${product.id}`, {
      method: 'PATCH',
      headers: headers(seller.accessToken),
      body: JSON.stringify({ pricePaise: '139900' }),
    });
    expect(updated.status).toBe(200);
    const adjustment = await fetch(`${base}/vendor/products/${product.id}/inventory-adjustments`, {
      method: 'POST',
      headers: headers(seller.accessToken),
      body: JSON.stringify({ delta: -6, reason: 'Inventory count correction' }),
    });
    expect(adjustment.status).toBe(409);
    const adjusted = await fetch(`${base}/vendor/products/${product.id}/inventory-adjustments`, {
      method: 'POST',
      headers: headers(seller.accessToken),
      body: JSON.stringify({ delta: 3, reason: 'Received replenishment' }),
    });
    expect(adjusted.status).toBe(200);
    expect(
      ((await adjusted.json()) as { data: { inventory: { onHand: number } } }).data.inventory
        .onHand,
    ).toBe(8);
    const submitted = await fetch(`${base}/vendor/products/${product.id}/submit`, {
      method: 'POST',
      headers: headers(seller.accessToken),
    });
    expect(submitted.status).toBe(200);
    expect(
      ((await submitted.json()) as { data: { product: { status: string } } }).data.product.status,
    ).toBe('PENDING_REVIEW');
    const hiddenFromCatalog = await fetch(
      `${base}/catalog/products?q=${encodeURIComponent(payload.sku)}`,
    );
    expect(
      (
        (await hiddenFromCatalog.json()) as { data: { products: Array<{ id: string }> } }
      ).data.products.some((item) => item.id === product.id),
    ).toBe(false);
    const admin = await account('admin');
    await prisma.userRole.create({ data: { userId: admin.user.id, role: 'ADMIN' } });
    const review = await fetch(`${base}/admin/products/${product.id}/approve`, {
      method: 'POST',
      headers: headers(admin.accessToken),
      body: JSON.stringify({ reason: 'Product verified for listing' }),
    });
    expect(review.status).toBe(200);
    expect(
      ((await review.json()) as { data: { product: { status: string } } }).data.product.status,
    ).toBe('ACTIVE');
    const visibleInCatalog = await fetch(
      `${base}/catalog/products?q=${encodeURIComponent(payload.name)}&sort=price_asc`,
    );
    const catalogResults = (
      (await visibleInCatalog.json()) as { data: { products: Array<{ id: string }> } }
    ).data.products;
    expect(catalogResults.some((item) => item.id === product.id)).toBe(true);
    const inStock = await fetch(
      `${base}/catalog/products?q=${encodeURIComponent(payload.name)}&inStock=true`,
    );
    expect(
      ((await inStock.json()) as { data: { products: Array<{ id: string }> } }).data.products.some(
        (item) => item.id === product.id,
      ),
    ).toBe(true);
    await prisma.inventory.update({ where: { productId: product.id }, data: { onHand: 0 } });
    await prisma.inventory.updateMany({
      where: { variant: { productId: product.id } },
      data: { onHand: 0 },
    });
    const outOfStock = await fetch(
      `${base}/catalog/products?q=${encodeURIComponent(payload.name)}&inStock=false`,
    );
    expect(
      (
        (await outOfStock.json()) as { data: { products: Array<{ id: string }> } }
      ).data.products.some((item) => item.id === product.id),
    ).toBe(true);
    const detail = await fetch(`${base}/catalog/products/${product.id}`);
    expect(detail.status).toBe(200);
    const slugDetail = await fetch(`${base}/catalog/products/${product.slug}`);
    expect(slugDetail.status).toBe(200);
    expect(await slugDetail.json()).toMatchObject({ data: { product: { id: product.id } } });
    const archived = await fetch(`${base}/vendor/products/${product.id}/archive`, {
      method: 'POST',
      headers: headers(seller.accessToken),
    });
    expect(archived.status).toBe(200);
  });
});
