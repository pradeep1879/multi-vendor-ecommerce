import type { Environment } from '../../config/env.js';

export const PRODUCT_INDEX = 'marketplace-products-v1';

export type SearchFilters = {
  q?: string;
  categoryId?: string;
  vendorId?: string;
  minPrice?: string;
  maxPrice?: string;
  inStock?: boolean;
  page: number;
  pageSize: number;
  sort: 'newest' | 'price_asc' | 'price_desc' | 'name';
};

export type ProductDocument = {
  id: string;
  name: string;
  description: string;
  sku: string;
  categoryId: string;
  categoryName: string;
  vendorId: string;
  vendorName: string;
  pricePaise: string;
  inStock: boolean;
  imageUrl: string | null;
  createdAt: string;
};

export class SearchIndex {
  constructor(private readonly configuration: NonNullable<Environment['elasticsearch']>) {}

  async ensureIndex(): Promise<void> {
    const response = await this.request(`/${PRODUCT_INDEX}`, {
      method: 'PUT',
      body: JSON.stringify({
        mappings: {
          properties: {
            id: { type: 'keyword' },
            name: { type: 'text', fields: { keyword: { type: 'keyword' } } },
            description: { type: 'text' },
            sku: { type: 'keyword' },
            categoryId: { type: 'keyword' },
            categoryName: { type: 'text' },
            vendorId: { type: 'keyword' },
            vendorName: { type: 'text' },
            pricePaise: { type: 'long' },
            inStock: { type: 'boolean' },
            imageUrl: { type: 'keyword', index: false },
            createdAt: { type: 'date' },
          },
        },
      }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: { type?: string } };
      if (body.error?.type !== 'resource_already_exists_exception')
        throw new Error(`Elasticsearch index setup returned ${response.status}.`);
    }
  }

  async indexProduct(document: ProductDocument): Promise<void> {
    const response = await this.request(
      `/${PRODUCT_INDEX}/_doc/${encodeURIComponent(document.id)}`,
      {
        method: 'PUT',
        body: JSON.stringify(document),
      },
    );
    if (!response.ok) throw new Error(`Elasticsearch document update returned ${response.status}.`);
  }

  async deleteProduct(productId: string): Promise<void> {
    const response = await this.request(`/${PRODUCT_INDEX}/_doc/${encodeURIComponent(productId)}`, {
      method: 'DELETE',
    });
    if (!response.ok && response.status !== 404)
      throw new Error(`Elasticsearch document delete returned ${response.status}.`);
  }

  async clearIndex(): Promise<void> {
    const response = await this.request(
      `/${PRODUCT_INDEX}/_delete_by_query?conflicts=proceed&refresh=true`,
      { method: 'POST', body: JSON.stringify({ query: { match_all: {} } }) },
    );
    if (!response.ok && response.status !== 404)
      throw new Error(`Elasticsearch index clear returned ${response.status}.`);
  }

  async search(filters: SearchFilters): Promise<{ ids: string[]; total: number }> {
    const filter: Array<Record<string, unknown>> = [];
    if (filters.categoryId) filter.push({ term: { categoryId: filters.categoryId } });
    if (filters.vendorId) filter.push({ term: { vendorId: filters.vendorId } });
    if (filters.minPrice || filters.maxPrice)
      filter.push({
        range: {
          pricePaise: {
            ...(filters.minPrice ? { gte: filters.minPrice } : {}),
            ...(filters.maxPrice ? { lte: filters.maxPrice } : {}),
          },
        },
      });
    if (filters.inStock !== undefined) filter.push({ term: { inStock: filters.inStock } });
    const sort =
      filters.sort === 'price_asc'
        ? [{ pricePaise: 'asc' }, { id: 'asc' }]
        : filters.sort === 'price_desc'
          ? [{ pricePaise: 'desc' }, { id: 'asc' }]
          : filters.sort === 'name'
            ? [{ 'name.keyword': 'asc' }, { id: 'asc' }]
            : [{ createdAt: 'desc' }, { id: 'asc' }];
    const response = await this.request(`/${PRODUCT_INDEX}/_search`, {
      method: 'POST',
      body: JSON.stringify({
        from: (filters.page - 1) * filters.pageSize,
        size: filters.pageSize,
        track_total_hits: true,
        query: {
          bool: {
            ...(filters.q
              ? {
                  must: [
                    {
                      multi_match: {
                        query: filters.q,
                        fields: ['name^3', 'sku^2', 'categoryName^2', 'vendorName', 'description'],
                        type: 'best_fields',
                        fuzziness: 'AUTO',
                      },
                    },
                  ],
                }
              : { must: [{ match_all: {} }] }),
            filter,
          },
        },
        sort,
      }),
    });
    if (!response.ok) throw new Error(`Elasticsearch search returned ${response.status}.`);
    const body = (await response.json()) as {
      hits?: { total?: number | { value?: number }; hits?: Array<{ _id?: string }> };
    };
    return {
      ids: (body.hits?.hits ?? []).flatMap((hit) => (hit._id ? [hit._id] : [])),
      total:
        typeof body.hits?.total === 'number' ? body.hits.total : (body.hits?.total?.value ?? 0),
    };
  }

  private request(path: string, init: RequestInit): Promise<Response> {
    const url = new URL(
      path,
      this.configuration.url.endsWith('/') ? this.configuration.url : `${this.configuration.url}/`,
    );
    const headers = new Headers(init.headers);
    headers.set('content-type', 'application/json');
    if (this.configuration.apiKey)
      headers.set('authorization', `ApiKey ${this.configuration.apiKey}`);
    return fetch(url, { ...init, headers, signal: AbortSignal.timeout(5000) });
  }
}
