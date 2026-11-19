import { api } from '../../api/client';

export type Address = {
  id: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  district: string | null;
  state: string;
  stateCode: string;
  pincode: string;
  country: string;
  label: 'Home' | 'Work' | 'Other';
  isDefault: boolean;
};
export type AccountProduct = {
  id: string;
  productName: string;
  variantName: string;
  sku: string;
  quantity: number;
  unitPricePaise: number;
  taxPaise: number;
  discountPaise: number;
  variant?: { product?: { images?: Array<{ url: string; alt: string }> } };
};
export type AccountOrder = {
  id: string;
  number: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  shippingStatus: string;
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  shippingPaise: number;
  totalPaise: number;
  shippingAddress: Record<string, string | null>;
  createdAt: string;
  updatedAt: string;
  items: AccountProduct[];
  shipment?: {
    trackingNumber: string | null;
    courier: string | null;
    status: string;
    events?: Array<{
      status: string;
      description: string | null;
      occurredAt: string;
    }>;
  } | null;
  invoice?: { id: string; number: string; issuedAt?: string } | null;
  returns?: Array<{ id: string; number: string; status: string }>;
};
export type Page<T> = {
  items: T[];
  pagination: { page: number; limit: number; total: number; pages: number };
};
export type Profile = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  firstName: string;
  lastName: string;
  emailVerifiedAt: string | null;
  status: string;
  createdAt: string;
};
export type WishlistItem = {
  id: string;
  productId: string;
  name: string;
  slug: string;
  status: string;
  brand: string;
  image: string | null;
  variants: Array<{
    id: string;
    name: string;
    sku: string;
    pricePaise: number;
    compareAtPaise: number | null;
    availableQuantity: number;
    reservedQuantity: number;
  }>;
  reviewCount: number;
  averageRating: number | null;
};
export type ReturnItem = {
  id: string;
  number: string;
  quantity: number;
  reason: string;
  description: string | null;
  status: string;
  requestedAt: string;
  order: { id: string; number: string };
  orderItem: { productName: string; variantName: string; quantity: number };
  refund: {
    number: string;
    amountPaise: number;
    status: string;
    method: string;
    createdAt: string;
  } | null;
};
export type ReviewItem = {
  id: string;
  productId: string;
  orderId?: string;
  orderItemId?: string;
  rating: number;
  title: string | null;
  comment: string;
  verified: boolean;
  published: boolean;
  createdAt: string;
  product: {
    name: string;
    brand: { name: string };
    images: Array<{ url: string }>;
  };
};
export type RefundItem = {
  id: string;
  number: string;
  amountPaise: number;
  method: string;
  status: string;
  createdAt: string;
  order: { id: string; number: string };
};
export type Overview = {
  name: string;
  metrics: {
    orders: number;
    wishlist: number;
    reviews: number;
    pendingDeliveries: number;
    pendingReturns: number;
  };
  recentOrders: Array<
    Pick<AccountOrder, 'id' | 'number' | 'status' | 'totalPaise' | 'createdAt' | 'items'>
  >;
  activeOrder: {
    id: string;
    number: string;
    status: string;
    shipment: {
      trackingNumber: string | null;
      courier: string | null;
      status: string;
      events: Array<{
        status: string;
        description: string | null;
        occurredAt: string;
      }>;
    } | null;
  } | null;
  addresses: Address[];
};

async function data<T>(promise: Promise<{ data: { data: T } }>) {
  return (await promise).data.data;
}
type TargetOrder = Record<string, unknown> & {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  itemSubtotalPaise: number | string;
  discountPaise: number | string;
  taxPaise: number | string;
  shippingPaise: number | string;
  payablePaise: number | string;
  shippingAddress: Record<string, string | null>;
  items: Array<Record<string, unknown>>;
  vendorOrders?: Array<Record<string, unknown>>;
  payment?: { provider: string; status: string } | null;
};
function toAccountOrder(value: TargetOrder): AccountOrder {
  const shipments = value.vendorOrders ?? [];
  const firstShipment = shipments.find((entry) => entry.shipment) as
    | {
        shipment?: {
          trackingReference?: string | null;
          carrier?: string | null;
          status: string;
          events?: Array<{ status: string; description: string | null; occurredAt: string }>;
        };
      }
    | undefined;
  const shipment = firstShipment?.shipment;
  return {
    id: value.id,
    number: value.orderNumber,
    status: value.status,
    paymentStatus:
      value.payment?.status ?? (value.status === 'PENDING_PAYMENT' ? 'PENDING' : value.status),
    paymentMethod: value.payment?.provider ?? 'RAZORPAY',
    shippingStatus: shipment?.status ?? value.status,
    subtotalPaise: Number(value.itemSubtotalPaise),
    discountPaise: Number(value.discountPaise),
    taxPaise: Number(value.taxPaise),
    shippingPaise: Number(value.shippingPaise),
    totalPaise: Number(value.payablePaise),
    shippingAddress: value.shippingAddress,
    createdAt: value.createdAt,
    updatedAt: value.createdAt,
    items: value.items.map((item) => ({
      id: String(item.id),
      productName: String(item.productNameSnapshot ?? ''),
      variantName: String(item.variantNameSnapshot ?? ''),
      sku: String(item.skuSnapshot ?? ''),
      quantity: Number(item.quantity ?? 0),
      unitPricePaise: Number(item.unitPricePaise ?? 0),
      taxPaise: Number(item.taxPaise ?? 0),
      discountPaise: Number(item.discountPaise ?? 0),
    })),
    shipment: shipment
      ? {
          trackingNumber: shipment.trackingReference ?? null,
          courier: shipment.carrier ?? null,
          status: shipment.status,
          events: shipment.events ?? [],
        }
      : null,
  };
}
type BackendAddress = {
  id: string;
  recipient: string;
  phone: string | null;
  line1: string;
  line2: string | null;
  locality: string | null;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
  isDefault: boolean;
};
const toAddress = (value: BackendAddress): Address => ({
  id: value.id,
  fullName: value.recipient,
  phone: value.phone ?? '',
  line1: value.line1,
  line2: value.line2,
  landmark: value.locality,
  city: value.city,
  district: null,
  state: value.region,
  stateCode: '',
  pincode: value.postalCode,
  country: value.countryCode,
  label: 'Home',
  isDefault: value.isDefault,
});
const addressBody = (value: Partial<Omit<Address, 'id'>>) => ({
  type: 'SHIPPING' as const,
  ...(value.fullName !== undefined ? { recipient: value.fullName } : {}),
  ...(value.phone !== undefined ? { phone: value.phone || null } : {}),
  ...(value.line1 !== undefined ? { line1: value.line1 } : {}),
  ...(value.line2 !== undefined ? { line2: value.line2 } : {}),
  ...(value.landmark !== undefined ? { locality: value.landmark } : {}),
  ...(value.city !== undefined ? { city: value.city } : {}),
  ...(value.state !== undefined ? { region: value.state } : {}),
  ...(value.pincode !== undefined ? { postalCode: value.pincode } : {}),
  countryCode: value.country ?? 'IN',
  ...(value.isDefault !== undefined ? { isDefault: value.isDefault } : {}),
});
export const accountApi = {
  overview: async () => {
    const [profile, orders, addresses, wishlist] = await Promise.all([
      accountApi.profile(),
      accountApi.orders({}),
      accountApi.addresses(),
      accountApi.wishlist(),
    ]);
    const recentOrders = orders.items
      .slice(0, 3)
      .map(({ id, number, status, totalPaise, createdAt, items }) => ({
        id,
        number,
        status,
        totalPaise,
        createdAt,
        items,
      }));
    const active = orders.items.find(
      (order) => !['DELIVERED', 'CANCELLED', 'REFUNDED'].includes(order.status),
    );
    return {
      name: profile.name,
      metrics: {
        orders: orders.pagination.total,
        wishlist: wishlist.length,
        reviews: 0,
        pendingDeliveries: orders.items.filter(
          (order) => !['DELIVERED', 'CANCELLED'].includes(order.status),
        ).length,
        pendingReturns: 0,
      },
      recentOrders,
      activeOrder: active
        ? {
            id: active.id,
            number: active.number,
            status: active.status,
            shipment: active.shipment
              ? {
                  trackingNumber: active.shipment.trackingNumber,
                  courier: active.shipment.courier,
                  status: active.shipment.status,
                  events: active.shipment.events ?? [],
                }
              : null,
          }
        : null,
      addresses,
    };
  },
  profile: async () => {
    const result = await data<{
      user: {
        id: string;
        name: string;
        email: string;
        phone: string | null;
        createdAt: string;
        emailVerifiedAt?: string | null;
      };
    }>(api.get('/me'));
    const [firstName, ...last] = result.user.name.split(' ');
    return {
      id: result.user.id,
      name: result.user.name,
      email: result.user.email,
      phone: result.user.phone,
      firstName,
      lastName: last.join(' '),
      emailVerifiedAt: result.user.emailVerifiedAt ?? null,
      status: 'ACTIVE',
      createdAt: result.user.createdAt,
    };
  },
  updateProfile: async (input: { firstName: string; lastName: string; phone?: string }) => {
    await api.patch('/me', {
      name: `${input.firstName} ${input.lastName}`.trim(),
      phone: input.phone,
    });
    return accountApi.profile();
  },
  requestEmailVerification: () => api.post('/auth/email-verification'),
  orders: async (params: Record<string, string | number | undefined>) => {
    const result = await data<{ orders: TargetOrder[] }>(api.get('/orders'));
    const search = String(params.q ?? '')
      .trim()
      .toLocaleLowerCase();
    const from = params.from ? new Date(`${params.from}T00:00:00`) : null;
    const to = params.to ? new Date(`${params.to}T23:59:59.999`) : null;
    const all = result.orders
      .map(toAccountOrder)
      .filter((order) => !params.status || order.status === params.status)
      .filter((order) => !params.paymentStatus || order.paymentStatus === params.paymentStatus)
      .filter((order) => {
        if (!search) return true;
        return (
          order.number.toLocaleLowerCase().includes(search) ||
          order.items.some((item) =>
            [item.productName, item.variantName, item.sku].some((value) =>
              value.toLocaleLowerCase().includes(search),
            ),
          )
        );
      })
      .filter((order) => {
        const date = new Date(order.createdAt);
        return (!from || date >= from) && (!to || date <= to);
      });
    all.sort((a, b) => {
      switch (params.sort) {
        case 'oldest':
          return Date.parse(a.createdAt) - Date.parse(b.createdAt);
        case 'amount-asc':
          return a.totalPaise - b.totalPaise;
        case 'amount-desc':
          return b.totalPaise - a.totalPaise;
        default:
          return Date.parse(b.createdAt) - Date.parse(a.createdAt);
      }
    });
    const page = Math.max(1, Number(params.page ?? 1));
    const limit = Math.max(1, Number(params.limit ?? 20));
    return {
      items: all.slice((page - 1) * limit, page * limit),
      pagination: { page, limit, total: all.length, pages: Math.ceil(all.length / limit) },
    };
  },
  order: async (id: string) =>
    toAccountOrder((await data<{ order: TargetOrder }>(api.get(`/orders/${id}`))).order),
  cancelOrder: async (id: string) => {
    await api.post(`/orders/${id}/cancel`, { reason: 'Customer requested cancellation' });
    return accountApi.order(id);
  },
  addresses: async () =>
    (await data<{ addresses: BackendAddress[] }>(api.get('/me/addresses'))).addresses.map(
      toAddress,
    ),
  addAddress: async (input: Omit<Address, 'id'>) =>
    toAddress(
      (await data<{ address: BackendAddress }>(api.post('/me/addresses', addressBody(input))))
        .address,
    ),
  updateAddress: async (id: string, input: Partial<Omit<Address, 'id'>>) =>
    toAddress(
      (
        await data<{ address: BackendAddress }>(
          api.patch(`/me/addresses/${id}`, addressBody(input)),
        )
      ).address,
    ),
  removeAddress: async (id: string) => {
    await api.delete(`/me/addresses/${id}`);
    return { deleted: true };
  },
  defaultAddress: async (id: string) =>
    toAddress(
      (
        await data<{ address: BackendAddress }>(
          api.patch(`/me/addresses/${id}`, { isDefault: true }),
        )
      ).address,
    ),
  wishlist: async (): Promise<WishlistItem[]> => {
    const rows = await data<
      Array<{ id: string; productId: string; product: Record<string, unknown> }>
    >(api.get('/wishlist'));
    return rows.map((row) => {
      const product = row.product as Record<string, unknown>;
      const brand = product.brand as { name?: string } | null;
      const images = product.images as Array<{ url: string }> | undefined;
      const variants = (product.variants as Array<Record<string, unknown>> | undefined) ?? [];
      return {
        id: row.id,
        productId: row.productId,
        name: String(product.name ?? ''),
        slug: String(product.slug ?? ''),
        status: String(product.status ?? 'ACTIVE'),
        brand: brand?.name ?? '',
        image: images?.[0]?.url ?? null,
        variants: variants.map((variant) => {
          const inventory = (variant.inventory ?? {}) as Record<string, unknown>;
          return {
            id: String(variant.id),
            name: String(variant.name),
            sku: String(variant.sku),
            pricePaise: Number(variant.pricePaise),
            compareAtPaise:
              variant.compareAtPricePaise == null ? null : Number(variant.compareAtPricePaise),
            availableQuantity: Number(inventory.onHand ?? 0),
            reservedQuantity: Number(inventory.reserved ?? 0),
          };
        }),
        reviewCount: 0,
        averageRating: null,
      };
    });
  },
  addWishlist: async (id: string) =>
    data<{ item: { id: string } }>(api.put(`/wishlist/${id}`)).then((result) => result.item),
  removeWishlist: async (id: string) => {
    await api.delete(`/wishlist/${id}`);
    return { removed: true };
  },
  wishlistToCart: async (id: string, variantId?: string) => {
    const product = (
      await data<{ product: { variants: Array<{ id: string }> } }>(
        api.get(`/catalog/products/${id}`),
      )
    ).product;
    const selected = variantId ?? product.variants[0]?.id;
    if (!selected) throw new Error('This product has no active variant.');
    await api.put('/cart/items', { productId: id, variantId: selected, quantity: 1 });
    return { id: selected };
  },
  reviews: async (page = 1): Promise<Page<ReviewItem>> => {
    const result = await data<{ reviews: Array<Record<string, unknown>>; meta: { total: number } }>(
      api.get('/me/reviews', { params: { page, pageSize: 20 } }),
    );
    const items = result.reviews.map((row) => {
      const product = row.product as Record<string, unknown>;
      return {
        id: String(row.id),
        productId: String(row.productId),
        rating: Number(row.rating),
        title: (row.title as string | null) ?? null,
        comment: String(row.body ?? ''),
        verified: true,
        published: row.status === 'PUBLISHED',
        createdAt: String(row.createdAt),
        product: {
          name: String(product.name ?? ''),
          brand: { name: typeof product.brand === 'string' ? product.brand : '' },
          images: (product.images as Array<{ url: string }> | undefined) ?? [],
        },
      };
    });
    return {
      items,
      pagination: {
        page,
        limit: 20,
        total: result.meta.total,
        pages: Math.ceil(result.meta.total / 20),
      },
    };
  },
  eligibleReviews: async () => {
    const result = await data<{ items: Array<Record<string, unknown>> }>(
      api.get('/me/reviews/eligible'),
    );
    return result.items.map((row) => {
      const product = row.product as Record<string, unknown>;
      return {
        id: String(row.id),
        orderId: String(row.orderId),
        productId: String(row.productId),
        name: String(product.name ?? row.productNameSnapshot ?? ''),
        brand: { name: typeof product.brand === 'string' ? product.brand : '' },
        images: (product.images as Array<{ url: string }> | undefined) ?? [],
      };
    });
  },
  createReview: (input: {
    productId: string;
    orderId: string;
    orderItemId: string;
    rating: number;
    title?: string;
    comment: string;
  }) =>
    data<ReviewItem>(
      api.post(`/orders/${input.orderId}/items/${input.orderItemId}/review`, {
        rating: input.rating,
        title: input.title,
        body: input.comment,
      }),
    ),
  returns: async (page = 1) => {
    const orders = await data<{ orders: Array<{ id: string; orderNumber: string }> }>(
      api.get('/orders'),
    );
    const rows = (
      await Promise.all(
        orders.orders.map(async (order) => {
          const result = await data<{ items: Array<Record<string, unknown>> }>(
            api.get(`/orders/${order.id}/returns`),
          );
          return result.items.map((item) => ({
            id: String(item.id),
            number: String(item.id),
            quantity: Number(item.quantity),
            reason: String(item.reason),
            description: null,
            status: String(item.status),
            requestedAt: String(item.requestedAt),
            order: { id: order.id, number: order.orderNumber },
            orderItem: {
              productName: String(
                (item.orderItem as Record<string, unknown> | undefined)?.productNameSnapshot ?? '',
              ),
              variantName: String(
                (item.orderItem as Record<string, unknown> | undefined)?.variantNameSnapshot ?? '',
              ),
              quantity: Number(
                (item.orderItem as Record<string, unknown> | undefined)?.quantity ?? 0,
              ),
            },
            refund: null,
          })) as ReturnItem[];
        }),
      )
    ).flat();
    return {
      items: rows.slice((page - 1) * 20, page * 20),
      pagination: { page, limit: 20, total: rows.length, pages: Math.ceil(rows.length / 20) },
    };
  },
  requestReturn: (input: {
    orderId: string;
    orderItemId: string;
    quantity: number;
    reason: string;
    description?: string;
  }) =>
    data<{ request: ReturnItem }>(
      api.post(`/orders/${input.orderId}/returns`, {
        orderItemId: input.orderItemId,
        quantity: input.quantity,
        reason: input.reason,
      }),
    ).then((result) => result.request),
  refunds: async (page = 1) => {
    const result = await data<{ items: Array<Record<string, unknown>>; meta: { total: number } }>(
      api.get('/refunds', { params: { page, pageSize: 20 } }),
    );
    return {
      items: result.items.map((item) => ({
        id: String(item.id),
        number: String(item.id),
        amountPaise: Number(item.amountPaise),
        method: String(item.provider ?? 'RAZORPAY'),
        status: String(item.status),
        createdAt: String(item.createdAt),
        order: {
          id: String((item.order as Record<string, unknown>).id),
          number: String((item.order as Record<string, unknown>).orderNumber),
        },
      })),
      pagination: {
        page,
        limit: 20,
        total: result.meta.total,
        pages: Math.ceil(result.meta.total / 20),
      },
    };
  },
  notifications: (page = 1) =>
    data<{
      items: Array<{
        id: string;
        title: string;
        body: string;
        type: string;
        href: string | null;
        readAt: string | null;
        createdAt: string;
      }>;
      unread: number;
      pagination: Page<never>['pagination'];
    }>(api.get('/account/notifications', { params: { page } })),
  markRead: (id: string) => data<{ read: boolean }>(api.patch(`/account/notifications/${id}/read`)),
  markAllRead: () => data<{ updated: number }>(api.post('/account/notifications/read-all')),
  preferences: () =>
    data<{
      orderUpdatesEmail: boolean;
      promotionalEmail: boolean;
      recommendationsEmail: boolean;
    }>(api.get('/account/preferences')),
  updatePreferences: (input: Record<string, boolean>) =>
    data<{
      orderUpdatesEmail: boolean;
      promotionalEmail: boolean;
      recommendationsEmail: boolean;
    }>(api.patch('/account/preferences', input)),
};
