import { loadEnvironment } from '../../config/env';
import { getPrismaClient } from '../../infrastructure/database/client';
import { SearchIndex, type ProductDocument } from './search-index';

export function createProductDocument(product: {
  id: string;
  name: string;
  description: string;
  sku: string;
  pricePaise: bigint;
  createdAt: Date;
  category: { id: string; name: string; active: boolean };
  vendor: { id: string; name: string; status: string };
  inventory: { onHand: number; reserved: number } | null;
  variants?: Array<{
    pricePaise: bigint;
    active: boolean;
    inventory: { onHand: number; reserved: number } | null;
  }>;
  images: Array<{ url: string; isPrimary: boolean; sortOrder: number }>;
}): ProductDocument {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    sku: product.sku,
    categoryId: product.category.id,
    categoryName: product.category.name,
    vendorId: product.vendor.id,
    vendorName: product.vendor.name,
    pricePaise: (
      product.variants
        ?.filter((variant) => variant.active)
        .reduce(
          (minimum, variant) => (variant.pricePaise < minimum ? variant.pricePaise : minimum),
          product.variants.find((variant) => variant.active)?.pricePaise ?? product.pricePaise,
        ) ?? product.pricePaise
    ).toString(),
    inStock: product.variants?.length
      ? product.variants.some(
          (variant) =>
            variant.active && (variant.inventory?.onHand ?? 0) > (variant.inventory?.reserved ?? 0),
        )
      : (product.inventory?.onHand ?? 0) > (product.inventory?.reserved ?? 0),
    imageUrl:
      [...product.images].sort(
        (a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder,
      )[0]?.url ?? null,
    createdAt: product.createdAt.toISOString(),
  };
}

export async function processSearchOutboxBatch(batchSize = 25): Promise<number> {
  const environment = loadEnvironment();
  if (!environment.elasticsearch)
    throw new Error('ELASTICSEARCH_URL is required to process the search outbox.');
  const prisma = getPrismaClient();
  const index = new SearchIndex(environment.elasticsearch);
  await index.ensureIndex();
  const claimed = await prisma.$transaction(
    async (tx) => tx.$queryRaw<Array<{ id: string }>>`
    WITH pending AS (
      SELECT "id" FROM "SearchOutboxEvent"
      WHERE "processedAt" IS NULL AND "availableAt" <= NOW()
        AND ("lockedAt" IS NULL OR "lockedAt" < NOW() - INTERVAL '5 minutes')
      ORDER BY "createdAt", "id" LIMIT ${batchSize} FOR UPDATE SKIP LOCKED
    )
    UPDATE "SearchOutboxEvent" AS event SET "lockedAt" = NOW()
    FROM pending WHERE event."id" = pending."id" RETURNING event."id"
  `,
  );
  for (const item of claimed) {
    const event = await prisma.searchOutboxEvent.findUnique({
      where: { id: item.id },
      include: {
        product: {
          include: {
            category: true,
            vendor: true,
            inventory: true,
            images: true,
            variants: { include: { inventory: true } },
          },
        },
      },
    });
    try {
      if (!event) continue;
      const product = event.product;
      if (
        product &&
        product.status === 'ACTIVE' &&
        product.category.active &&
        product.vendor.status === 'APPROVED'
      )
        await index.indexProduct(createProductDocument(product));
      else if (event.productId) await index.deleteProduct(event.productId);
      await prisma.searchOutboxEvent.update({
        where: { id: item.id },
        data: { processedAt: new Date(), lockedAt: null, lastError: null },
      });
    } catch (error: unknown) {
      const attempts = (event?.attemptCount ?? 0) + 1;
      const backoffSeconds = Math.min(3600, 2 ** Math.min(attempts, 10));
      await prisma.searchOutboxEvent.update({
        where: { id: item.id },
        data: {
          attemptCount: attempts,
          availableAt: new Date(Date.now() + backoffSeconds * 1000),
          lockedAt: null,
          lastError:
            error instanceof Error ? error.message.slice(0, 2000) : 'Search indexing failed.',
        },
      });
    }
  }
  return claimed.length;
}

export async function reindexProducts(): Promise<number> {
  const environment = loadEnvironment();
  if (!environment.elasticsearch)
    throw new Error('ELASTICSEARCH_URL is required to reindex products.');
  const prisma = getPrismaClient();
  const index = new SearchIndex(environment.elasticsearch);
  await index.ensureIndex();
  await index.clearIndex();
  const products = await prisma.product.findMany({
    where: { status: 'ACTIVE', category: { active: true }, vendor: { status: 'APPROVED' } },
    include: {
      category: true,
      vendor: true,
      inventory: true,
      images: true,
      variants: { include: { inventory: true } },
    },
    orderBy: { id: 'asc' },
  });
  for (const product of products) await index.indexProduct(createProductDocument(product));
  return products.length;
}
