export type CouponTarget = {
  id: string;
  vendorId: string;
  categoryId: string;
  subtotalPaise: bigint;
};

export type CouponDefinition = {
  scope: 'PLATFORM' | 'VENDOR';
  vendorId: string | null;
  discountType: 'FIXED' | 'PERCENTAGE';
  value: number;
  maxDiscountPaise: bigint | null;
  minOrderPaise: bigint;
  products: Array<{ productId: string }>;
  categories: Array<{ categoryId: string }>;
};

export function calculateCouponDiscount(coupon: CouponDefinition, items: CouponTarget[]) {
  const explicitProducts = new Set(coupon.products.map(({ productId }) => productId));
  const explicitCategories = new Set(coupon.categories.map(({ categoryId }) => categoryId));
  const eligible = items.filter((item) => {
    const matchesTarget =
      (explicitProducts.size === 0 && explicitCategories.size === 0) ||
      explicitProducts.has(item.id) ||
      explicitCategories.has(item.categoryId);
    return matchesTarget && (coupon.scope === 'PLATFORM' || coupon.vendorId === item.vendorId);
  });
  const subtotal = eligible.reduce((sum, item) => sum + item.subtotalPaise, 0n);
  if (subtotal < coupon.minOrderPaise || subtotal <= 0n)
    return { total: 0n, allocations: new Map<string, bigint>() };
  const raw =
    coupon.discountType === 'FIXED'
      ? BigInt(coupon.value)
      : (subtotal * BigInt(coupon.value) + 5_000n) / 10_000n;
  const total = [raw, subtotal, coupon.maxDiscountPaise ?? raw].reduce((min, value) =>
    value < min ? value : min,
  );
  const allocations = new Map<string, bigint>();
  let assigned = 0n;
  eligible.forEach((item, index) => {
    const amount =
      index === eligible.length - 1 ? total - assigned : (total * item.subtotalPaise) / subtotal;
    allocations.set(item.id, amount);
    assigned += amount;
  });
  return { total, allocations };
}
