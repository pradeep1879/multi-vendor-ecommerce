import { describe, expect, test } from 'bun:test';
import type { AxiosAdapter } from 'axios';
import { api } from './client';
import { accountApi } from '../features/account/account-api';

describe('customer storefront API contract adapters', () => {
  test('maps catalog filters and response pagination to the merged API', async () => {
    let requestUrl = '';
    const response = await api.get('/products?sort=price-asc&limit=8&category=makeup', {
      adapter: (async (config) => {
        requestUrl = config.url ?? '';
        return {
          data: { data: { products: [{ id: 'product-1' }] }, meta: { total: 9 } },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }) as AxiosAdapter,
    });
    const params = new URLSearchParams(requestUrl.split('?')[1]);
    expect(requestUrl.startsWith('/catalog/products?')).toBe(true);
    expect(params.get('sort')).toBe('price_asc');
    expect(params.get('pageSize')).toBe('8');
    expect(params.get('categorySlug')).toBe('makeup');
    expect(response.data.data).toEqual({
      items: [{ id: 'product-1' }],
      total: 9,
      totalPages: 2,
    });
  });

  test('maps Google credentials and product slugs to target routes', async () => {
    const requests: Array<{ url: string; data: unknown }> = [];
    const adapter: AxiosAdapter = async (config) => {
      requests.push({
        url: config.url ?? '',
        data: typeof config.data === 'string' ? JSON.parse(config.data) : config.data,
      });
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
    };
    await api.post('/auth/google', { credential: 'verified-id-token' }, { adapter });
    await api.get('/products/rose-water-by-brand', { adapter });
    expect(requests).toEqual([
      { url: '/auth/google', data: { idToken: 'verified-id-token' } },
      { url: '/catalog/products/rose-water-by-brand', data: undefined },
    ]);
  });

  test('reads wishlist rows from the backend items envelope', async () => {
    const originalAdapter = api.defaults.adapter;
    api.defaults.adapter = (async (config) => ({
      data: {
        data: {
          items: [
            {
              id: 'wishlist-1',
              productId: 'product-1',
              product: {
                name: 'Calm Cream',
                slug: 'calm-cream',
                status: 'ACTIVE',
                brand: { name: 'Maison' },
                images: [],
                variants: [],
              },
            },
          ],
        },
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    })) as AxiosAdapter;
    try {
      expect(await accountApi.wishlist()).toMatchObject([
        { id: 'wishlist-1', productId: 'product-1', name: 'Calm Cream' },
      ]);
    } finally {
      api.defaults.adapter = originalAdapter;
    }
  });
});
