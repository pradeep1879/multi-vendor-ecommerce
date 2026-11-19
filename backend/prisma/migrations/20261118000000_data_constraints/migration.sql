ALTER TABLE "Inventory"
  ADD CONSTRAINT "Inventory_quantities_nonnegative_check"
    CHECK ("onHand" >= 0 AND "reserved" >= 0 AND "reserved" <= "onHand");

ALTER TABLE "Vendor"
  ADD CONSTRAINT "Vendor_shipping_nonnegative_check"
    CHECK ("flatShippingPaise" >= 0);

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_prices_nonnegative_check"
    CHECK ("pricePaise" >= 0 AND ("compareAtPricePaise" IS NULL OR "compareAtPricePaise" >= 0));

ALTER TABLE "CartItem"
  ADD CONSTRAINT "CartItem_quantity_positive_check"
    CHECK ("quantity" > 0);

ALTER TABLE "TaxRule"
  ADD CONSTRAINT "TaxRule_rate_bounds_check"
    CHECK ("rateBasisPoints" BETWEEN 0 AND 10000);

ALTER TABLE "CommissionRule"
  ADD CONSTRAINT "CommissionRule_rate_bounds_check"
    CHECK ("rateBasisPoints" BETWEEN 0 AND 10000);

ALTER TABLE "Coupon"
  ADD CONSTRAINT "Coupon_value_bounds_check"
    CHECK (("discountType" = 'FIXED' AND "value" > 0) OR ("discountType" = 'PERCENTAGE' AND "value" BETWEEN 1 AND 100)),
  ADD CONSTRAINT "Coupon_minimum_nonnegative_check"
    CHECK ("minOrderPaise" >= 0 AND ("maxDiscountPaise" IS NULL OR "maxDiscountPaise" >= 0));

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_totals_consistent_check"
    CHECK (
      "itemSubtotalPaise" >= 0 AND "discountPaise" BETWEEN 0 AND "itemSubtotalPaise"
      AND "taxPaise" >= 0 AND "shippingPaise" >= 0
      AND "payablePaise" = "itemSubtotalPaise" - "discountPaise" + "taxPaise" + "shippingPaise"
    );

ALTER TABLE "VendorOrder"
  ADD CONSTRAINT "VendorOrder_totals_consistent_check"
    CHECK (
      "itemSubtotalPaise" >= 0 AND "discountPaise" BETWEEN 0 AND "itemSubtotalPaise"
      AND "taxPaise" >= 0 AND "shippingPaise" >= 0 AND "commissionPaise" >= 0
      AND "vendorPayablePaise" = "itemSubtotalPaise" - "discountPaise" + "taxPaise" + "shippingPaise" - "commissionPaise"
      AND "vendorPayablePaise" >= 0
    );

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_amounts_consistent_check"
    CHECK (
      "quantity" > 0 AND "unitPricePaise" >= 0
      AND "lineSubtotalPaise" = "unitPricePaise" * "quantity"
      AND "discountPaise" BETWEEN 0 AND "lineSubtotalPaise"
      AND "taxPaise" >= 0 AND "commissionPaise" >= 0
      AND "commissionPaise" <= "lineSubtotalPaise" - "discountPaise"
      AND "vendorPayablePaise" = "lineSubtotalPaise" - "discountPaise" + "taxPaise" - "commissionPaise"
      AND "vendorPayablePaise" >= 0
    );

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_amount_positive_check"
    CHECK ("amountPaise" > 0);

ALTER TABLE "PaymentAttempt"
  ADD CONSTRAINT "PaymentAttempt_amount_positive_check"
    CHECK ("amountPaise" > 0);

ALTER TABLE "Refund"
  ADD CONSTRAINT "Refund_amount_positive_check"
    CHECK ("amountPaise" > 0);

ALTER TABLE "RefundAllocation"
  ADD CONSTRAINT "RefundAllocation_amount_positive_check"
    CHECK ("amountPaise" > 0);

ALTER TABLE "VendorSettlement"
  ADD CONSTRAINT "VendorSettlement_amount_nonnegative_check"
    CHECK ("amountPaise" >= 0);

ALTER TABLE "SettlementItem"
  ADD CONSTRAINT "SettlementItem_amount_nonnegative_check"
    CHECK ("amountPaise" >= 0);

ALTER TABLE "Review"
  ADD CONSTRAINT "Review_rating_bounds_check"
    CHECK ("rating" BETWEEN 1 AND 5);

ALTER TABLE "LedgerEntry"
  ADD CONSTRAINT "LedgerEntry_amount_positive_check"
    CHECK ("amountPaise" > 0);
