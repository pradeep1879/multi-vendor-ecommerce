INSERT INTO "UserRole" ("id", "userId", "role", "createdAt")
SELECT gen_random_uuid(), application."applicantId", 'VENDOR', CURRENT_TIMESTAMP
FROM "VendorApplication" AS application
WHERE application."status" = 'PENDING'
ON CONFLICT ("userId", "role") DO NOTHING;

WITH pending_applications AS (
    SELECT DISTINCT ON (application."applicantId")
        application."id",
        application."applicantId",
        application."businessName"
    FROM "VendorApplication" AS application
    WHERE application."status" = 'PENDING'
    ORDER BY application."applicantId", application."createdAt" DESC
)
INSERT INTO "Vendor" (
    "id", "ownerId", "applicationId", "name", "slug", "status", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid(),
    application."applicantId",
    application."id",
    application."businessName",
    COALESCE(
        NULLIF(trim(both '-' from regexp_replace(lower(application."businessName"), '[^a-z0-9]+', '-', 'g')), ''),
        'vendor'
    ) || '-' || substring(application."id"::text, 1, 8),
    'PENDING',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM pending_applications AS application
WHERE NOT EXISTS (
    SELECT 1 FROM "Vendor" AS vendor WHERE vendor."ownerId" = application."applicantId"
);
