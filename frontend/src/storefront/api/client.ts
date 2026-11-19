import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

let accessToken = '';
export function setStorefrontAccessToken(token: string) {
  accessToken = token;
}
api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  const originalUrl = config.url ?? '';
  const path = originalUrl.split('?')[0];
  const query = originalUrl.includes('?') ? `?${originalUrl.split('?').slice(1).join('?')}` : '';
  const aliases: Record<string, string> = {
    '/auth/me': '/me',
    '/auth/signup': '/auth/register',
    '/products': '/catalog/products',
    '/categories': '/catalog/categories',
    '/account/wishlist': '/wishlist',
    '/account/addresses': '/me/addresses',
  };
  if (aliases[path]) config.url = `${aliases[path]}${query}`;
  if (path.startsWith('/products/'))
    config.url = path.replace('/products/', '/catalog/products/') + query;
  if (path.startsWith('/account/addresses/'))
    config.url = path.replace('/account/addresses/', '/me/addresses/') + query;
  if (path.startsWith('/account/orders/'))
    config.url = path.replace('/account/orders/', '/orders/') + query;
  if (path === '/account/profile') config.url = `/me${query}`;
  if (path === '/account/orders') config.url = `/orders${query}`;
  if (path === '/auth/forgot-password') config.url = `/auth/password-reset${query}`;
  if (path === '/auth/reset-password') config.url = `/auth/password-reset/confirm${query}`;
  if (path === '/auth/verify-email') config.url = `/auth/email-verification/confirm${query}`;
  if (path === '/products') {
    const params = new URLSearchParams(query);
    for (const [key, value] of Object.entries(config.params ?? {})) {
      if (value !== undefined && value !== null) params.set(key, String(value));
    }
    const limit = params.get('limit');
    if (limit) {
      params.set('pageSize', limit);
      params.delete('limit');
    }
    const category = params.get('category');
    if (category) {
      params.set('categorySlug', category);
      params.delete('category');
    }
    for (const name of ['minPrice', 'maxPrice']) {
      const value = params.get(name);
      if (value) {
        params.set(`${name}Paise`, value);
        params.delete(name);
      }
    }
    params.set(
      'sort',
      ({ 'price-asc': 'price_asc', 'price-desc': 'price_desc' } as Record<string, string>)[
        params.get('sort') ?? ''
      ] ??
        params.get('sort') ??
        'newest',
    );
    config.url = `/catalog/products?${params.toString()}`;
    config.params = undefined;
  }
  if (path === '/wishlist' && config.method?.toLowerCase() === 'post') config.method = 'put';
  if (path.startsWith('/account/wishlist/') && config.method?.toLowerCase() === 'post') {
    config.url = path.replace('/account/wishlist/', '/wishlist/') + query;
    config.method = 'put';
  }
  if (path.startsWith('/account/wishlist/') && config.method?.toLowerCase() === 'delete')
    config.url = path.replace('/account/wishlist/', '/wishlist/') + query;
  if (path === '/auth/signup' && config.data) {
    config.data = Object.fromEntries(
      Object.entries(config.data).filter(([key]) => key !== 'confirmPassword'),
    );
  }
  if (path === '/auth/google' && config.data?.credential) {
    config.data = { idToken: config.data.credential };
  }
  if (path === '/auth/reset-password' && config.data) {
    config.data = { token: config.data.token, newPassword: config.data.password };
  }
  if (path.startsWith('/account/orders/') && path.endsWith('/cancel') && !config.data) {
    config.data = { reason: 'Customer requested cancellation' };
  }
  return config;
});

api.interceptors.response.use((response) => {
  if (response.config.url?.startsWith('/catalog/products?') && response.data?.data?.products) {
    const pageSize = Number(
      new URLSearchParams(response.config.url.split('?')[1]).get('pageSize') ?? 20,
    );
    const total = Number(response.data.meta?.total ?? response.data.data.products.length);
    response.data = {
      ...response.data,
      data: {
        items: response.data.data.products,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }
  if (response.config.url === '/catalog/categories' && response.data?.data?.categories) {
    response.data = { ...response.data, data: response.data.data.categories };
  }
  if (response.config.url === '/wishlist' && response.data?.data?.items) {
    response.data = { ...response.data, data: response.data.data.items };
  }
  if (response.config.url === '/cart' && response.data?.data?.cart?.items) {
    const cart = response.data.data.cart;
    response.data = {
      ...response.data,
      data: {
        items: cart.items.map(
          (item: {
            id: string;
            productId: string;
            variantId: string;
            quantity: number;
            product: Record<string, unknown>;
          }) => {
            const variant = (item.product.selectedVariant ?? {}) as Record<string, unknown>;
            const inventory = (item.product.inventory ?? {}) as Record<string, unknown>;
            const category = (item.product.category ?? {}) as Record<string, unknown>;
            return {
              ...item,
              variantId: item.variantId,
              variant: {
                ...variant,
                pricePaise: Number(variant.pricePaise ?? item.product.pricePaise ?? 0),
                compareAtPaise: variant.compareAtPricePaise ?? null,
                availableQuantity: inventory.onHand ?? 0,
                reservedQuantity: inventory.reserved ?? 0,
                product: {
                  ...item.product,
                  type: category.name ?? '',
                  shortDescription: item.product.description ?? '',
                  brand: item.product.brand ?? { name: '' },
                },
              },
            };
          },
        ),
      },
    };
  }
  return response;
});

let refreshRequest: Promise<void> | null = null;
api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error) || !error.config || error.response?.status !== 401)
      return Promise.reject(error);
    const config = error.config as typeof error.config & { _authRetry?: boolean };
    const url = config.url ?? '';
    if (config._authRetry || /\/auth\/(login|signup|refresh|google|admin\/mfa\/verify)/.test(url))
      return Promise.reject(error);
    config._authRetry = true;
    try {
      refreshRequest ??= axios
        .post<{ data?: { accessToken?: string } }>(
          `${api.defaults.baseURL}/auth/refresh`,
          {},
          { withCredentials: true, timeout: 8000 },
        )
        .then((response) => {
          accessToken = response.data.data?.accessToken ?? '';
        })
        .finally(() => {
          refreshRequest = null;
        });
      await refreshRequest;
      return await api.request(config);
    } catch (refreshError) {
      if (accessToken && !/\/auth\/(me|logout)$/.test(url))
        window.dispatchEvent(new Event('auth:expired'));
      return Promise.reject(refreshError);
    }
  },
);
