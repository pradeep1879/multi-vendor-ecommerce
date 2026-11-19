import { PrismaClient } from '../src/prisma-client/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

if (process.env.NODE_ENV === 'production') {
  throw new Error('The development seed is disabled in production.');
}
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required to run the development seed.');
const seedPassword = process.env.DEV_SEED_PASSWORD;
if (!seedPassword || seedPassword.length < 12) {
  throw new Error('DEV_SEED_PASSWORD must be provided and contain at least 12 characters.');
}
const accountPasswords = {
  admin: process.env.DEV_SEED_ADMIN_PASSWORD ?? seedPassword,
  customer: process.env.DEV_SEED_CUSTOMER_PASSWORD ?? seedPassword,
  vendorOne: process.env.DEV_SEED_VENDOR_ONE_PASSWORD ?? seedPassword,
  vendorTwo: process.env.DEV_SEED_VENDOR_TWO_PASSWORD ?? seedPassword,
};
for (const [account, password] of Object.entries(accountPasswords)) {
  if (password.length < 12) throw new Error(`The development seed password for ${account} must contain at least 12 characters.`);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
  // The development seed performs many idempotent upserts in one transaction.
  // Use a longer limit for Neon cold starts while retaining atomic rollback.
  transactionOptions: { maxWait: 15_000, timeout: 60_000 },
});
const ids = {
  admin: '10000000-0000-4000-8000-000000000001',
  customer: '10000000-0000-4000-8000-000000000002',
  vendorOwnerOne: '10000000-0000-4000-8000-000000000003',
  vendorOwnerTwo: '10000000-0000-4000-8000-000000000004',
  appOne: '20000000-0000-4000-8000-000000000001',
  appTwo: '20000000-0000-4000-8000-000000000002',
  vendorOne: '30000000-0000-4000-8000-000000000001',
  vendorTwo: '30000000-0000-4000-8000-000000000002',
  categoryOne: '40000000-0000-4000-8000-000000000001',
  categoryTwo: '40000000-0000-4000-8000-000000000002',
  productOne: '50000000-0000-4000-8000-000000000001',
  productTwo: '50000000-0000-4000-8000-000000000002',
  variantOne: '51000000-0000-4000-8000-000000000001',
  variantTwo: '51000000-0000-4000-8000-000000000002',
  productImageOne: 'a1000000-0000-4000-8000-000000000001',
  productImageTwo: 'a1000000-0000-4000-8000-000000000002',
  commission: '60000000-0000-4000-8000-000000000001',
  order: '70000000-0000-4000-8000-000000000001',
  vendorOrderOne: '71000000-0000-4000-8000-000000000001',
  vendorOrderTwo: '71000000-0000-4000-8000-000000000002',
  itemOne: '72000000-0000-4000-8000-000000000001',
  itemTwo: '72000000-0000-4000-8000-000000000002',
  payment: '80000000-0000-4000-8000-000000000001',
  attempt: '81000000-0000-4000-8000-000000000001',
  ledger: '90000000-0000-4000-8000-000000000001',
  ledgerDebit: '91000000-0000-4000-8000-000000000001',
  ledgerVendorOne: '91000000-0000-4000-8000-000000000002',
  ledgerVendorTwo: '91000000-0000-4000-8000-000000000003',
  ledgerCommission: '91000000-0000-4000-8000-000000000004',
  reviewOne: 'a0000000-0000-4000-8000-000000000001',
  reviewTwo: 'a0000000-0000-4000-8000-000000000002',
  taxRule: 'b0000000-0000-4000-8000-000000000001',
} as const;

const now = new Date();
const passwordHashes = {
  admin: await Bun.password.hash(accountPasswords.admin),
  customer: await Bun.password.hash(accountPasswords.customer),
  vendorOne: await Bun.password.hash(accountPasswords.vendorOne),
  vendorTwo: await Bun.password.hash(accountPasswords.vendorTwo),
};
const vendors = [
  {
    ownerId: ids.vendorOwnerOne,
    appId: ids.appOne,
    vendorId: ids.vendorOne,
    email: 'vendor-one@example.test',
    business: 'Northstar Goods',
    slug: 'northstar-goods',
    productId: ids.productOne,
    productName: 'Canvas Tote',
    productSlug: 'canvas-tote',
    imageId: ids.productImageOne,
    imageObjectKey: 'external:pexels:8148587',
    imageUrl:
      'https://images.pexels.com/photos/8148587/pexels-photo-8148587.jpeg?auto=compress&dpr=1&h=750&w=1260',
    imageAlt: 'Natural canvas tote bag beside a potted plant',
    sku: 'NORTH-TOTE-01',
    categoryId: ids.categoryOne,
    categoryName: 'Accessories',
    categorySlug: 'accessories',
    pricePaise: 75000n,
    vendorOrderId: ids.vendorOrderOne,
    itemId: ids.itemOne,
    reviewId: ids.reviewOne,
    commissionPaise: 7500n,
    vendorPayablePaise: 67500n,
  },
  {
    ownerId: ids.vendorOwnerTwo,
    appId: ids.appTwo,
    vendorId: ids.vendorTwo,
    email: 'vendor-two@example.test',
    business: 'Field & Form',
    slug: 'field-and-form',
    productId: ids.productTwo,
    productName: 'Stoneware Mug',
    productSlug: 'stoneware-mug',
    imageId: ids.productImageTwo,
    imageObjectKey: 'external:pexels:15084678',
    imageUrl:
      'https://images.pexels.com/photos/15084678/pexels-photo-15084678/free-photo-of-close-up-photo-of-ceramic-mug.jpeg?auto=compress&dpr=1&h=750&w=1260',
    imageAlt: 'Ceramic mug on a wooden surface in warm light',
    sku: 'FIELD-MUG-01',
    categoryId: ids.categoryTwo,
    categoryName: 'Homeware',
    categorySlug: 'homeware',
    pricePaise: 25000n,
    vendorOrderId: ids.vendorOrderTwo,
    itemId: ids.itemTwo,
    reviewId: ids.reviewTwo,
    commissionPaise: 2500n,
    vendorPayablePaise: 22500n,
  },
] as const;

try {
  await prisma.$transaction(async (tx) => {
    const seedUsers = [
      { id: ids.admin, email: 'admin@example.test', name: 'Local Admin', passwordHash: passwordHashes.admin },
      { id: ids.customer, email: 'customer@example.test', name: 'Local Customer', passwordHash: passwordHashes.customer },
      ...vendors.map((vendor, index) => ({
        id: vendor.ownerId,
        email: vendor.email,
        name: vendor.business,
        passwordHash: index === 0 ? passwordHashes.vendorOne : passwordHashes.vendorTwo,
      })),
    ];
    for (const user of seedUsers) {
      await tx.user.upsert({
        where: { id: user.id },
        create: {
          id: user.id,
          email: user.email,
          normalizedEmail: user.email,
          name: user.name,
          passwordHash: user.passwordHash,
          emailVerifiedAt: now,
        },
        update: { name: user.name, passwordHash: user.passwordHash, emailVerifiedAt: now },
      });
    }

    const roles = [
      { userId: ids.admin, role: 'ADMIN' as const },
      { userId: ids.customer, role: 'CUSTOMER' as const },
      ...vendors.flatMap(({ ownerId }) => [
        { userId: ownerId, role: 'CUSTOMER' as const },
        { userId: ownerId, role: 'VENDOR' as const },
      ]),
    ];
    for (const role of roles) {
      await tx.userRole.upsert({
        where: { userId_role: role },
        create: role,
        update: {},
      });
    }

    for (const vendor of vendors) {
      await tx.vendorApplication.upsert({
        where: { id: vendor.appId },
        create: {
          id: vendor.appId,
          applicantId: vendor.ownerId,
          businessName: vendor.business,
          legalName: vendor.business,
          contactEmail: vendor.email,
          contactPhone: '+910000000000',
          status: 'APPROVED',
          reviewerId: ids.admin,
          reviewedAt: now,
          decisionReason: 'Local development seed.',
        },
        update: {},
      });
      await tx.vendor.upsert({
        where: { id: vendor.vendorId },
        create: {
          id: vendor.vendorId,
          ownerId: vendor.ownerId,
          applicationId: vendor.appId,
          name: vendor.business,
          slug: vendor.slug,
          status: 'APPROVED',
          flatShippingPaise: 0n,
        },
        update: {},
      });
      await tx.category.upsert({
        where: { id: vendor.categoryId },
        create: {
          id: vendor.categoryId,
          name: vendor.categoryName,
          slug: vendor.categorySlug,
          active: true,
        },
        update: {},
      });
      await tx.product.upsert({
        where: { id: vendor.productId },
        create: {
          id: vendor.productId,
          vendorId: vendor.vendorId,
          categoryId: vendor.categoryId,
          name: vendor.productName,
          slug: vendor.productSlug,
          sku: vendor.sku,
          description: `Sample development product from ${vendor.business}.`,
          pricePaise: vendor.pricePaise,
          taxCode: 'DEV_ZERO',
          status: 'ACTIVE',
          approvedAt: now,
          submittedAt: now,
        },
        update: {},
      });
      await tx.inventory.upsert({
        where: { productId: vendor.productId },
        create: { productId: vendor.productId, onHand: 25, reserved: 0 },
        update: {},
      });
      const variantId = vendor.productId === ids.productOne ? ids.variantOne : ids.variantTwo;
      const existingDefault = await tx.productVariant.findFirst({
        where: { productId: vendor.productId, isDefault: true },
      });
      const defaultVariant =
        existingDefault ??
        (await tx.productVariant.upsert({
          where: { id: variantId },
          create: {
            id: variantId,
            productId: vendor.productId,
            sku: vendor.sku,
            name: 'Default',
            pricePaise: vendor.pricePaise,
            isDefault: true,
          },
          update: {},
        }));
      await tx.inventory.update({
        where: { productId: vendor.productId },
        data: { variantId: defaultVariant.id },
      });
      // These demo images are externally hosted Pexels photos, not S3 uploads.
      await tx.productImage.upsert({
        where: { id: vendor.imageId },
        create: {
          id: vendor.imageId,
          productId: vendor.productId,
          objectKey: vendor.imageObjectKey,
          url: vendor.imageUrl,
          mimeType: 'image/jpeg',
          sizeBytes: 0,
          altText: vendor.imageAlt,
          sortOrder: 0,
          isPrimary: true,
        },
        update: {
          url: vendor.imageUrl,
          altText: vendor.imageAlt,
          isPrimary: true,
        },
      });
    }

    await tx.taxRule.upsert({
      where: {
        taxCode_jurisdictionCode_effectiveFrom: {
          taxCode: 'DEV_ZERO',
          jurisdictionCode: 'IN-DEFAULT',
          effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
        },
      },
      create: {
        id: ids.taxRule,
        taxCode: 'DEV_ZERO',
        jurisdictionCode: 'IN-DEFAULT',
        rateBasisPoints: 0,
        effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
      },
      update: {},
    });
    await tx.commissionRule.upsert({
      where: { id: ids.commission },
      create: {
        id: ids.commission,
        name: 'Development default commission',
        rateBasisPoints: 1000,
        effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
      },
      update: {},
    });

    const itemSubtotalPaise = vendors.reduce((total, vendor) => total + vendor.pricePaise, 0n);
    const commissionPaise = vendors.reduce((total, vendor) => total + vendor.commissionPaise, 0n);
    await tx.order.upsert({
      where: { id: ids.order },
      create: {
        id: ids.order,
        orderNumber: 'DEV-ORDER-0001',
        customerId: ids.customer,
        status: 'DELIVERED',
        itemSubtotalPaise,
        payablePaise: itemSubtotalPaise,
        shippingAddress: {
          recipient: 'Local Customer',
          line1: 'Development Address',
          city: 'Bengaluru',
          region: 'Karnataka',
          postalCode: '560001',
          countryCode: 'IN',
        },
        idempotencyKey: 'dev-seed-order-0001',
        reservationExpiresAt: now,
        confirmedAt: now,
        deliveredAt: now,
      },
      update: {},
    });

    for (const vendor of vendors) {
      await tx.vendorOrder.upsert({
        where: { id: vendor.vendorOrderId },
        create: {
          id: vendor.vendorOrderId,
          orderId: ids.order,
          vendorId: vendor.vendorId,
          status: 'DELIVERED',
          itemSubtotalPaise: vendor.pricePaise,
          commissionPaise: vendor.commissionPaise,
          vendorPayablePaise: vendor.vendorPayablePaise,
          deliveredAt: now,
        },
        update: {},
      });
      await tx.orderItem.upsert({
        where: { id: vendor.itemId },
        create: {
          id: vendor.itemId,
          orderId: ids.order,
          vendorOrderId: vendor.vendorOrderId,
          productId: vendor.productId,
          productNameSnapshot: vendor.productName,
          skuSnapshot: vendor.sku,
          vendorNameSnapshot: vendor.business,
          quantity: 1,
          unitPricePaise: vendor.pricePaise,
          lineSubtotalPaise: vendor.pricePaise,
          taxCodeSnapshot: 'DEV_ZERO',
          taxRateBasisPoints: 0,
          taxPaise: 0n,
          commissionRuleId: ids.commission,
          commissionRateBasisPoints: 1000,
          commissionPaise: vendor.commissionPaise,
          vendorPayablePaise: vendor.vendorPayablePaise,
        },
        update: {},
      });
      await tx.review.upsert({
        where: { orderItemId: vendor.itemId },
        create: {
          id: vendor.reviewId,
          productId: vendor.productId,
          orderItemId: vendor.itemId,
          userId: ids.customer,
          rating: 5,
          title: 'Development sample',
          body: 'Seeded verified-purchase review.',
          status: 'PUBLISHED',
        },
        update: {},
      });
    }

    await tx.payment.upsert({
      where: { id: ids.payment },
      create: {
        id: ids.payment,
        orderId: ids.order,
        provider: 'TEST',
        currency: 'INR',
        amountPaise: itemSubtotalPaise,
        status: 'SUCCEEDED',
        capturedAt: now,
      },
      update: {},
    });
    await tx.paymentAttempt.upsert({
      where: { id: ids.attempt },
      create: {
        id: ids.attempt,
        paymentId: ids.payment,
        providerOrderId: 'dev-seed-provider-order-0001',
        providerPaymentId: 'dev-seed-provider-payment-0001',
        status: 'CAPTURED',
        amountPaise: itemSubtotalPaise,
      },
      update: {},
    });
    await tx.ledgerTransaction.upsert({
      where: { id: ids.ledger },
      create: {
        id: ids.ledger,
        paymentId: ids.payment,
        reference: 'dev-seed-payment-0001',
        description: 'Development sample order payment.',
        entries: {
          create: [
            {
              id: ids.ledgerDebit,
              accountCode: 'platform_cash',
              side: 'DEBIT',
              amountPaise: itemSubtotalPaise,
            },
            {
              id: ids.ledgerVendorOne,
              accountCode: 'vendor_payable',
              side: 'CREDIT',
              amountPaise: vendors[0].vendorPayablePaise,
              vendorId: ids.vendorOne,
            },
            {
              id: ids.ledgerVendorTwo,
              accountCode: 'vendor_payable',
              side: 'CREDIT',
              amountPaise: vendors[1].vendorPayablePaise,
              vendorId: ids.vendorTwo,
            },
            {
              id: ids.ledgerCommission,
              accountCode: 'platform_commission',
              side: 'CREDIT',
              amountPaise: commissionPaise,
            },
          ],
        },
      },
      update: {},
    });
  });
  console.log('Development seed applied. Login accounts:');
  console.log('  Admin:  admin@example.test (DEV_SEED_ADMIN_PASSWORD or DEV_SEED_PASSWORD)');
  console.log('  Vendor: vendor-one@example.test (DEV_SEED_VENDOR_ONE_PASSWORD or DEV_SEED_PASSWORD)');
  console.log('  Vendor: vendor-two@example.test (DEV_SEED_VENDOR_TWO_PASSWORD or DEV_SEED_PASSWORD)');
  console.log('  Customer fixture: customer@example.test (DEV_SEED_CUSTOMER_PASSWORD or DEV_SEED_PASSWORD)');
} finally {
  await prisma.$disconnect();
}
