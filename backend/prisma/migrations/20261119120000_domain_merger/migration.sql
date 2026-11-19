-- Additive merger domain extensions. Existing product, inventory, cart and order rows remain valid.
CREATE TYPE "ReturnStatus" AS ENUM ('REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'IN_TRANSIT', 'RECEIVED', 'REFUNDED', 'CLOSED');
CREATE TYPE "ShipmentStatus" AS ENUM ('PENDING', 'LABEL_CREATED', 'IN_TRANSIT', 'DELIVERED', 'EXCEPTION', 'RETURNED');

CREATE TABLE "Brand" (
  "id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "slug" VARCHAR(180) NOT NULL,
  "description" VARCHAR(1000),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "vendorId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Brand_slug_key" ON "Brand"("slug");
CREATE INDEX "Brand_active_name_idx" ON "Brand"("active", "name");
CREATE INDEX "Brand_vendorId_active_idx" ON "Brand"("vendorId", "active");
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ProductVariant" (
  "id" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "sku" VARCHAR(100) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "optionValues" JSONB NOT NULL DEFAULT '{}',
  "pricePaise" BIGINT NOT NULL,
  "compareAtPricePaise" BIGINT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductVariant_productId_sku_key" ON "ProductVariant"("productId", "sku");
CREATE INDEX "ProductVariant_productId_active_idx" ON "ProductVariant"("productId", "active");
CREATE UNIQUE INDEX "ProductVariant_one_default_per_product_key" ON "ProductVariant"("productId") WHERE "isDefault" = true;
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Product" ADD COLUMN "brandId" UUID;
CREATE INDEX "Product_brandId_status_idx" ON "Product"("brandId", "status");
ALTER TABLE "Product" ADD CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A default variant preserves the existing single-SKU catalog representation.
INSERT INTO "ProductVariant" ("id", "productId", "sku", "name", "optionValues", "pricePaise", "compareAtPricePaise", "active", "isDefault", "updatedAt")
SELECT gen_random_uuid(), p."id", p."sku", 'Default', '{}', p."pricePaise", p."compareAtPricePaise", true, true, CURRENT_TIMESTAMP
FROM "Product" p;

ALTER TABLE "Inventory" ALTER COLUMN "productId" DROP NOT NULL;
ALTER TABLE "Inventory" ADD COLUMN "variantId" UUID;
CREATE UNIQUE INDEX "Inventory_variantId_key" ON "Inventory"("variantId");
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
UPDATE "Inventory" i SET "variantId" = v."id" FROM "ProductVariant" v WHERE v."productId" = i."productId" AND v."isDefault" = true;

ALTER TABLE "CartItem" ADD COLUMN "variantId" UUID;
CREATE INDEX "CartItem_variantId_idx" ON "CartItem"("variantId");
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
UPDATE "CartItem" c SET "variantId" = v."id" FROM "ProductVariant" v WHERE v."productId" = c."productId" AND v."isDefault" = true;
ALTER TABLE "CartItem" ALTER COLUMN "variantId" SET NOT NULL;
DROP INDEX "CartItem_cartId_productId_key";
CREATE UNIQUE INDEX "CartItem_cartId_variantId_key" ON "CartItem"("cartId", "variantId");

ALTER TABLE "OrderItem" ADD COLUMN "variantId" UUID;
ALTER TABLE "OrderItem" ADD COLUMN "variantNameSnapshot" VARCHAR(160);
CREATE INDEX "OrderItem_variantId_idx" ON "OrderItem"("variantId");
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
UPDATE "OrderItem" oi SET "variantId" = v."id", "variantNameSnapshot" = v."name" FROM "ProductVariant" v WHERE v."productId" = oi."productId" AND v."isDefault" = true;

CREATE TABLE "WishlistItem" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WishlistItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WishlistItem_userId_productId_key" ON "WishlistItem"("userId", "productId");
CREATE INDEX "WishlistItem_userId_createdAt_idx" ON "WishlistItem"("userId", "createdAt");
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ReturnRequest" (
  "id" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "orderItemId" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "reason" VARCHAR(1000) NOT NULL,
  "status" "ReturnStatus" NOT NULL DEFAULT 'REQUESTED',
  "decisionReason" VARCHAR(1000),
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "refundId" UUID,
  CONSTRAINT "ReturnRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReturnRequest_customerId_requestedAt_idx" ON "ReturnRequest"("customerId", "requestedAt");
CREATE INDEX "ReturnRequest_orderId_status_idx" ON "ReturnRequest"("orderId", "status");
CREATE INDEX "ReturnRequest_status_requestedAt_idx" ON "ReturnRequest"("status", "requestedAt");
CREATE UNIQUE INDEX "ReturnRequest_refundId_key" ON "ReturnRequest"("refundId");
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Shipment" (
  "id" UUID NOT NULL,
  "vendorOrderId" UUID NOT NULL,
  "carrier" VARCHAR(120),
  "trackingReference" VARCHAR(200),
  "trackingUrl" VARCHAR(2048),
  "status" "ShipmentStatus" NOT NULL DEFAULT 'PENDING',
  "shippedAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Shipment_vendorOrderId_key" ON "Shipment"("vendorOrderId");
CREATE INDEX "Shipment_status_updatedAt_idx" ON "Shipment"("status", "updatedAt");
CREATE INDEX "Shipment_trackingReference_idx" ON "Shipment"("trackingReference");
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_vendorOrderId_fkey" FOREIGN KEY ("vendorOrderId") REFERENCES "VendorOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ShipmentEvent" (
  "id" UUID NOT NULL,
  "shipmentId" UUID NOT NULL,
  "status" "ShipmentStatus" NOT NULL,
  "description" VARCHAR(500) NOT NULL,
  "location" VARCHAR(200),
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShipmentEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ShipmentEvent_shipmentId_occurredAt_idx" ON "ShipmentEvent"("shipmentId", "occurredAt");
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
