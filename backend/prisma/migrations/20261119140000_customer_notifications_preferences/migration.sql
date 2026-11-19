CREATE TYPE "AccountNotificationType" AS ENUM ('ORDER', 'PAYMENT', 'SHIPPING', 'RETURN', 'REFUND', 'SECURITY', 'GENERAL');

CREATE TABLE "AccountNotification" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "type" "AccountNotificationType" NOT NULL DEFAULT 'GENERAL',
  "title" VARCHAR(160) NOT NULL,
  "body" VARCHAR(2000) NOT NULL,
  "href" VARCHAR(500),
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountNotification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AccountNotification_userId_readAt_createdAt_idx" ON "AccountNotification"("userId", "readAt", "createdAt");

CREATE TABLE "NotificationPreference" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "orderUpdatesEmail" BOOLEAN NOT NULL DEFAULT true,
  "promotionalEmail" BOOLEAN NOT NULL DEFAULT false,
  "recommendationsEmail" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotificationPreference_userId_key" UNIQUE ("userId"),
  CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
