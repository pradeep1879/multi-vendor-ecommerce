ALTER TABLE "Coupon"
  DROP CONSTRAINT "Coupon_value_bounds_check",
  ADD CONSTRAINT "Coupon_value_bounds_check"
    CHECK (
      ("discountType" = 'FIXED' AND "value" > 0)
      OR ("discountType" = 'PERCENTAGE' AND "value" BETWEEN 1 AND 10000)
    );
