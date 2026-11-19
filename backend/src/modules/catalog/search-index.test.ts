import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { SearchIndex } from './search-index';

let server: ReturnType<typeof Bun.serve>;
let index: SearchIndex;
const requests: Array<{ method: string; path: string; body: unknown }> = [];

describe('Elasticsearch product index adapter', () => {
  beforeAll(() => {
    server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      async fetch(request) {
        const bodyText =
          request.method === 'GET' || request.method === 'DELETE' ? '' : await request.text();
        requests.push({
          method: request.method,
          path: new URL(request.url).pathname,
          body: bodyText ? (JSON.parse(bodyText) as unknown) : null,
        });
        if (new URL(request.url).pathname.endsWith('/_search'))
          return Response.json({ hits: { total: { value: 1 }, hits: [{ _id: 'product-id' }] } });
        return Response.json({ acknowledged: true });
      },
    });
    index = new SearchIndex({ url: `http://127.0.0.1:${server.port}` });
  });
  afterAll(() => server?.stop(true));

  test('creates the mapping, indexes products, applies relevance filters, and deletes stale documents', async () => {
    await index.ensureIndex();
    await index.indexProduct({
      id: 'product-id',
      name: 'Wool coat',
      description: 'Warm',
      sku: 'COAT-1',
      categoryId: 'category-id',
      categoryName: 'Clothing',
      vendorId: 'vendor-id',
      vendorName: 'Store',
      pricePaise: '450000',
      inStock: true,
      imageUrl: null,
      createdAt: new Date().toISOString(),
    });
    const result = await index.search({
      q: 'coat',
      categoryId: 'category-id',
      minPrice: '100000',
      maxPrice: '500000',
      inStock: false,
      page: 2,
      pageSize: 10,
      sort: 'price_asc',
    });
    await index.deleteProduct('product-id');
    expect(result).toEqual({ ids: ['product-id'], total: 1 });
    expect(requests[0]?.path).toBe('/marketplace-products-v1');
    expect(
      (requests[0]?.body as { mappings: { properties: Record<string, { type: string }> } }).mappings
        .properties.pricePaise?.type,
    ).toBe('long');
    expect(
      (requests[2]?.body as { from: number; query: { bool: { filter: Array<unknown> } } }).from,
    ).toBe(10);
    expect(
      (requests[2]?.body as { query: { bool: { filter: Array<unknown> } } }).query.bool.filter,
    ).toHaveLength(3);
    expect(
      (
        requests[2]?.body as {
          query: { bool: { filter: Array<{ term?: { inStock?: boolean } }> } };
        }
      ).query.bool.filter,
    ).toContainEqual({ term: { inStock: false } });
    expect(requests[3]?.method).toBe('DELETE');
  });
});
