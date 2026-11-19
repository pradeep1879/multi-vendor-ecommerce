CREATE TABLE "SearchOutboxEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "productId" UUID,
  "eventType" VARCHAR(20) NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SearchOutboxEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SearchOutboxEvent_processedAt_availableAt_createdAt_idx" ON "SearchOutboxEvent"("processedAt", "availableAt", "createdAt");
CREATE INDEX "SearchOutboxEvent_productId_createdAt_idx" ON "SearchOutboxEvent"("productId", "createdAt");
ALTER TABLE "SearchOutboxEvent" ADD CONSTRAINT "SearchOutboxEvent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
