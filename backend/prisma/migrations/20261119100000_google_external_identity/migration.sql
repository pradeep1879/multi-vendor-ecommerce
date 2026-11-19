-- Additive identity linking. Existing password accounts and sessions are preserved.
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

CREATE TABLE "ExternalIdentity" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "providerSubject" VARCHAR(255) NOT NULL,
    "emailAtLink" VARCHAR(320) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExternalIdentity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExternalIdentity_provider_providerSubject_key"
    ON "ExternalIdentity"("provider", "providerSubject");
CREATE INDEX "ExternalIdentity_userId_provider_idx"
    ON "ExternalIdentity"("userId", "provider");
ALTER TABLE "ExternalIdentity"
    ADD CONSTRAINT "ExternalIdentity_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
