import { AppError } from '../../common/errors/app-error.js';
import { CartRepository } from './cart.repository.js';
import { CouponsService } from '../coupons/coupons.service.js';
import { calculateCouponDiscount } from '../coupons/coupon-discount.js';

const BASIS_POINTS = 10_000n;
function applyRate(amount: bigint, rate: number): bigint {
  return (amount * BigInt(rate) + BASIS_POINTS / 2n) / BASIS_POINTS;
}

export class CheckoutPreviewService {
  constructor(
    private readonly repository = new CartRepository(),
    private readonly coupons = new CouponsService(),
  ) {}

  async preview(userId: string, addressId: string, couponCodes: string[] = []) {
    const { address, items } = await this.repository.getCheckoutData(userId, addressId);
    if (!address) throw new AppError(404, 'ADDRESS_NOT_FOUND', 'Shipping address was not found.');
    if (!items.length)
      throw new AppError(400, 'CART_EMPTY', 'Add at least one item before checkout.');
    for (const item of items) {
      const p = item.product;
      const stock = item.variant.inventory ?? p.inventory;
      const available = (stock?.onHand ?? 0) - (stock?.reserved ?? 0);
      if (p.status !== 'ACTIVE' || !p.category.active || p.vendor.status !== 'APPROVED')
        throw new AppError(409, 'PRODUCT_UNAVAILABLE', `Product ${p.name} is no longer available.`);
      if (!item.variant.active)
        throw new AppError(
          409,
          'PRODUCT_UNAVAILABLE',
          `Variant ${item.variant.name} is no longer available.`,
        );
      if (available < item.quantity)
        throw new AppError(409, 'INSUFFICIENT_STOCK', `Available stock for ${p.name} changed.`);
    }
    if (couponCodes.length > 1)
      throw new AppError(400, 'COUPONS_DO_NOT_STACK', 'Only one coupon can be used per order.');
    const discounts = new Map<string, bigint>();
    if (couponCodes.length === 1) {
      const validation = await this.coupons.validate(userId, couponCodes);
      const eligible = validation.eligible[0];
      if (!eligible)
        throw new AppError(
          409,
          'COUPON_NOT_APPLICABLE',
          validation.rejected[0]?.reason ?? 'Coupon is not applicable.',
        );
      const coupon = await this.repository.getCoupon(eligible.code);
      if (!coupon) throw new AppError(409, 'COUPON_INVALID', 'Coupon is invalid or inactive.');
      const allocation = calculateCouponDiscount(
        coupon,
        items.map((item) => ({
          id: item.variantId,
          vendorId: item.product.vendorId,
          categoryId: item.product.categoryId,
          subtotalPaise: item.variant.pricePaise * BigInt(item.quantity),
        })),
      );
      for (const [variantId, amount] of allocation.allocations) discounts.set(variantId, amount);
    }
    const jurisdiction = address.countryCode === 'IN' ? 'IN-DEFAULT' : address.countryCode;
    const now = new Date();
    const taxCodes = [...new Set(items.map((i) => i.product.taxCode))];
    const vendorIds = [...new Set(items.map((i) => i.product.vendorId))];
    const categoryIds = [...new Set(items.map((i) => i.product.categoryId))];
    const [taxRules, commissionRules] = await Promise.all([
      this.repository.getTaxRules(taxCodes, jurisdiction, now),
      this.repository.getCommissionRules(vendorIds, categoryIds, now),
    ]);
    const taxRate = (code: string) =>
      taxRules.find((rule) => rule.taxCode === code)?.rateBasisPoints;
    const groups = new Map<
      string,
      {
        vendorId: string;
        vendorName: string;
        items: Array<Record<string, unknown>>;
        itemSubtotalPaise: bigint;
        discountPaise: bigint;
        taxPaise: bigint;
        shippingPaise: bigint;
        shippingTaxPaise: bigint;
        commissionPaise: bigint;
      }
    >();
    for (const item of items) {
      const p = item.product;
      const subtotal = item.variant.pricePaise * BigInt(item.quantity);
      const discount = discounts.get(item.variantId) ?? 0n;
      const discountedSubtotal = subtotal - discount;
      const taxRateBasisPoints = taxRate(p.taxCode);
      if (taxRateBasisPoints === undefined)
        throw new AppError(
          503,
          'TAX_CONFIGURATION_MISSING',
          `No tax rule is configured for ${p.taxCode} in ${jurisdiction}.`,
        );
      const rule =
        commissionRules.find((r) => r.vendorId === p.vendorId && r.categoryId === p.categoryId) ??
        commissionRules.find((r) => r.vendorId === p.vendorId && r.categoryId === null) ??
        commissionRules.find((r) => r.vendorId === null && r.categoryId === p.categoryId) ??
        commissionRules.find((r) => r.vendorId === null && r.categoryId === null);
      if (!rule)
        throw new AppError(
          503,
          'COMMISSION_CONFIGURATION_MISSING',
          'No commission rule is configured for a cart item.',
        );
      const tax = applyRate(discountedSubtotal, taxRateBasisPoints);
      const commission = applyRate(discountedSubtotal, rule.rateBasisPoints);
      const group = groups.get(p.vendorId) ?? {
        vendorId: p.vendorId,
        vendorName: p.vendor.name,
        items: [],
        itemSubtotalPaise: 0n,
        discountPaise: 0n,
        taxPaise: 0n,
        shippingPaise: 0n,
        shippingTaxPaise: 0n,
        commissionPaise: 0n,
      };
      group.items.push({
        productId: p.id,
        name: p.name,
        sku: item.variant.sku,
        variantId: item.variant.id,
        variantName: item.variant.name,
        quantity: item.quantity,
        unitPricePaise: item.variant.pricePaise,
        lineSubtotalPaise: subtotal,
        discountPaise: discount,
        taxCode: p.taxCode,
        taxRateBasisPoints,
        taxPaise: tax,
        commissionRateBasisPoints: rule.rateBasisPoints,
        commissionPaise: commission,
      });
      group.itemSubtotalPaise += subtotal;
      group.discountPaise += discount;
      group.taxPaise += tax;
      group.commissionPaise += commission;
      groups.set(p.vendorId, group);
    }
    const vendors = [...groups.values()].map((group) => {
      const payablePaise = group.itemSubtotalPaise - group.discountPaise + group.taxPaise;
      return { ...group, payablePaise, vendorPayablePaise: payablePaise - group.commissionPaise };
    });
    const total = (
      key:
        | 'itemSubtotalPaise'
        | 'discountPaise'
        | 'taxPaise'
        | 'shippingPaise'
        | 'shippingTaxPaise'
        | 'commissionPaise'
        | 'payablePaise',
    ) => vendors.reduce((sum, v) => sum + v[key], 0n);
    return {
      currency: 'INR',
      addressId,
      jurisdiction,
      vendors,
      totals: {
        itemSubtotalPaise: total('itemSubtotalPaise'),
        discountPaise: total('discountPaise'),
        taxPaise: total('taxPaise'),
        shippingPaise: total('shippingPaise'),
        commissionPaise: total('commissionPaise'),
        payablePaise: total('payablePaise'),
      },
      note: 'Shipping is not charged. Product taxes and discounts are recalculated at order creation.',
    };
  }
}
