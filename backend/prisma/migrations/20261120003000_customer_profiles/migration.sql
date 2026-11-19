CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Customer_userId_key" ON "Customer"("userId");

INSERT INTO "Customer" ("id", "userId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), role."userId", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "UserRole" AS role
WHERE role."role" = 'CUSTOMER'
ON CONFLICT ("userId") DO NOTHING;

ALTER TABLE "Customer"
ADD CONSTRAINT "Customer_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
