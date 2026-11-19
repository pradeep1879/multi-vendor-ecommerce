export type User = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  roles: string[];
};
export type Address = {
  id: string;
  recipient: string;
  line1: string;
  city: string;
  region: string;
  postalCode: string;
  isDefault: boolean;
};
export type Application = {
  id: string;
  businessName: string;
  legalName: string;
  contactEmail: string;
  contactPhone: string;
  status: string;
  decisionReason: string | null;
};
export type Vendor = { id: string; name: string; description: string | null; status: string };
export type CartLine = {
  id: string;
  productId: string;
  variantId: string;
  quantity: number;
  isAvailable: boolean;
  availableToAdd: number;
  product: {
    name: string;
    sku: string;
    pricePaise: string;
    images?: Array<{ url: string; altText?: string | null }>;
    vendor: { name: string };
  };
};
export type CartData = { items: CartLine[] };
export type CheckoutTotals = {
  itemSubtotalPaise: string;
  discountPaise?: string;
  taxPaise: string;
  shippingPaise: string;
  commissionPaise: string;
  payablePaise: string;
};
export type Category = { id: string; name: string; slug: string };
export type AdminCategory = Category & { description?: string | null; active: boolean };
export type Product = {
  id: string;
  name: string;
  description: string;
  sku: string;
  taxCode?: string;
  pricePaise: string;
  compareAtPricePaise?: string | null;
  status?: string;
  categoryId: string;
  category?: { name: string };
  vendor: { id: string; name: string; description?: string | null };
  images?: Array<{
    id?: string;
    url?: string;
    altText?: string | null;
    objectKey?: string;
    isPrimary?: boolean;
  }>;
  inventory?: { available?: number; onHand?: number; reserved?: number };
  brand?: { id: string; name: string; slug: string } | null;
  variants?: Array<{
    id: string;
    sku: string;
    name: string;
    optionValues: Record<string, string>;
    pricePaise: string;
    compareAtPricePaise?: string | null;
    active: boolean;
    isDefault: boolean;
    inventory?: { id: string; onHand: number; reserved: number } | null;
  }>;
  attributes?: Record<string, string | number | boolean> | null;
};
export type Order = {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  payablePaise: string;
  items: Array<{
    id: string;
    productNameSnapshot: string;
    quantity: number;
    productId: string | null;
  }>;
  vendorOrders?: Array<{ id: string; status: string; vendor?: { name: string } }>;
};
export type Coupon = {
  id: string;
  code: string;
  status: string;
  startsAt: string;
  endsAt: string;
  discountType?: 'FIXED' | 'PERCENTAGE';
  value?: number;
};
export type Metrics = Record<string, string | number | Record<string, number>>;
export type ModerationReview = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  status: string;
  createdAt: string;
  user: { id: string; name: string };
  product: { id: string; name: string; vendor: { id: string; name: string } };
};
export type Settlement = {
  id: string;
  amountPaise: string;
  currency: string;
  status: string;
  createdAt: string;
  settledAt?: string | null;
  vendor?: { name: string };
};
export type VendorOrder = {
  id: string;
  status: string;
  createdAt: string;
  order: {
    orderNumber: string;
    status: string;
    createdAt: string;
    shippingAddress: {
      recipient: string;
      line1: string;
      city: string;
      region: string;
      postalCode: string;
    };
  };
  items: Array<{ id: string; productNameSnapshot: string; skuSnapshot: string; quantity: number }>;
};
export type AdminOrder = {
  id: string;
  orderNumber: string;
  status: string;
  currency: string;
  payablePaise: string;
  createdAt: string;
  items: Array<{ id: string; productNameSnapshot: string; quantity: number }>;
  payment: { status: string; provider: string; amountPaise: string } | null;
  refunds: Array<{ id: string; amountPaise: string; status: string }>;
  vendorOrders: Array<{ id: string; status: string; vendor: { name: string } }>;
};
export type OrderDetail = Omit<Order, 'vendorOrders'> & {
  payment: { status: string; provider: string; amountPaise: string } | null;
  shippingAddress: {
    recipient: string;
    line1: string;
    city: string;
    region: string;
    postalCode: string;
  };
  statusHistory: Array<{ id: string; to: string; reason: string | null; createdAt: string }>;
  vendorOrders: Array<{
    id: string;
    status: string;
    trackingReference: string | null;
    vendor: { name: string };
    items: Array<{ id: string; productNameSnapshot: string; quantity: number }>;
  }>;
};
