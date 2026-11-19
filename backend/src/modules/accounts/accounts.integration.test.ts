import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Server } from 'node:http';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';
import { createApp } from '../../app';
import { loadEnvironment } from '../../config/env';
import { disconnectDatabase } from '../../infrastructure/database/client';
import { createApiRouter } from '../../routes';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const databaseName = testDatabaseUrl
  ? new URL(testDatabaseUrl).pathname.split('/').at(-1)
  : undefined;
if (testDatabaseUrl && !databaseName?.endsWith('_test')) {
  throw new Error('TEST_DATABASE_URL must target a database whose name ends with _test.');
}

const accountTest = testDatabaseUrl ? describe : describe.skip;
const environment = loadEnvironment({
  NODE_ENV: 'test',
  DATABASE_URL: testDatabaseUrl,
  JWT_ACCESS_SECRET: crypto.randomUUID() + crypto.randomUUID(),
  CORS_ORIGINS: 'http://localhost:5173',
  AUTH_RATE_LIMIT_MAX: '100',
});
let prisma: PrismaClient;
let server: Server;
let baseUrl = '';

accountTest('Customer profile, addresses, and vendor onboarding', () => {
  beforeAll(async () => {
    if (!testDatabaseUrl) return;
    process.env.DATABASE_URL = testDatabaseUrl;
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl }) });
    server = createApp(createApiRouter(environment), environment).listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Accounts test server failed to start.');
    baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
  });

  afterAll(async () => {
    if (server?.listening) {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
    await prisma?.$disconnect();
    await disconnectDatabase();
  });

  async function createAccount(label: string) {
    const email = `phase5-${label}-${crypto.randomUUID()}@example.test`;
    const response = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'phase-five-password-2026',
        name: 'Phase Five User',
      }),
    });
    const body = (await response.json()) as { data: { accessToken: string; user: { id: string } } };
    expect(response.status).toBe(201);
    return { email, token: body.data.accessToken, userId: body.data.user.id };
  }

  async function createAdmin() {
    const account = await createAccount('admin');
    await prisma.userRole.create({ data: { userId: account.userId, role: 'ADMIN' } });
    return account.token;
  }

  test('customer can read/update their profile and cannot modify another customer address', async () => {
    const customer = await createAccount('customer');
    const other = await createAccount('other');
    const profile = await fetch(`${baseUrl}/me`, {
      headers: { authorization: `Bearer ${customer.token}` },
    });
    expect(await profile.json()).toMatchObject({
      data: { user: { id: customer.userId, email: customer.email } },
    });

    const changed = await fetch(`${baseUrl}/me`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${customer.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Updated Customer', phone: '+919876543210' }),
    });
    expect(changed.status).toBe(200);
    expect(await changed.json()).toMatchObject({
      data: { user: { name: 'Updated Customer', phone: '+919876543210' } },
    });

    const created = await fetch(`${baseUrl}/me/addresses`, {
      method: 'POST',
      headers: { authorization: `Bearer ${other.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        recipient: 'Other User',
        line1: '1 Main Street',
        city: 'Pune',
        region: 'Maharashtra',
        postalCode: '411001',
        countryCode: 'IN',
        type: 'SHIPPING',
        isDefault: true,
      }),
    });
    const addressBody = (await created.json()) as { data: { address: { id: string } } };
    expect(created.status).toBe(201);
    const denied = await fetch(`${baseUrl}/me/addresses/${addressBody.data.address.id}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${customer.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ recipient: 'Takeover' }),
    });
    expect(denied.status).toBe(404);

    const ownAddress = await fetch(`${baseUrl}/me/addresses`, {
      method: 'POST',
      headers: { authorization: `Bearer ${customer.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        recipient: 'Customer',
        line1: '2 Own Street',
        city: 'Pune',
        region: 'Maharashtra',
        postalCode: '411001',
        countryCode: 'IN',
        type: 'SHIPPING',
        isDefault: true,
      }),
    });
    const ownAddressBody = (await ownAddress.json()) as { data: { address: { id: string } } };
    const updatedAddress = await fetch(
      `${baseUrl}/me/addresses/${ownAddressBody.data.address.id}`,
      {
        method: 'PATCH',
        headers: { authorization: `Bearer ${customer.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ recipient: 'Customer Updated' }),
      },
    );
    expect(updatedAddress.status).toBe(200);
    const deletedAddress = await fetch(
      `${baseUrl}/me/addresses/${ownAddressBody.data.address.id}`,
      {
        method: 'DELETE',
        headers: { authorization: `Bearer ${customer.token}` },
      },
    );
    expect(deletedAddress.status).toBe(204);
  });

  test('customer notification preferences are persisted and role protected', async () => {
    const customer = await createAccount('preferences');
    const defaults = await fetch(`${baseUrl}/account/preferences`, {
      headers: { authorization: `Bearer ${customer.token}` },
    });
    expect(defaults.status).toBe(200);
    expect(await defaults.json()).toMatchObject({
      data: { orderUpdatesEmail: true, promotionalEmail: false, recommendationsEmail: false },
    });
    const changed = await fetch(`${baseUrl}/account/preferences`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${customer.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ promotionalEmail: true }),
    });
    expect(await changed.json()).toMatchObject({ data: { promotionalEmail: true } });
    const unauthenticated = await fetch(`${baseUrl}/account/notifications`);
    expect(unauthenticated.status).toBe(401);
  });

  test('customer submits an application and sees its pending status; duplicate pending applications are denied', async () => {
    const customer = await createAccount('applicant');
    const input = {
      businessName: 'Northwind Goods',
      legalName: 'Northwind Goods Private Limited',
      contactEmail: customer.email,
      contactPhone: '+919876543211',
    };
    const submitted = await fetch(`${baseUrl}/vendor-applications`, {
      method: 'POST',
      headers: { authorization: `Bearer ${customer.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    expect(submitted.status).toBe(201);
    expect(await submitted.json()).toMatchObject({
      data: { application: { status: 'PENDING', businessName: input.businessName } },
    });
    const status = await fetch(`${baseUrl}/vendor-applications/me`, {
      headers: { authorization: `Bearer ${customer.token}` },
    });
    expect(await status.json()).toMatchObject({ data: { application: { status: 'PENDING' } } });
    const blockedVendorAccess = await fetch(`${baseUrl}/vendor`, {
      headers: { authorization: `Bearer ${customer.token}` },
    });
    expect(blockedVendorAccess.status).toBe(403);
    const duplicate = await fetch(`${baseUrl}/vendor-applications`, {
      method: 'POST',
      headers: { authorization: `Bearer ${customer.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    expect(duplicate.status).toBe(409);
  });

  test('admin approval grants vendor role and creates an owner-scoped store; suspension disables its store profile', async () => {
    const adminToken = await createAdmin();
    const applicant = await createAccount('approved');
    const applicationResponse = await fetch(`${baseUrl}/vendor-applications`, {
      method: 'POST',
      headers: { authorization: `Bearer ${applicant.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        businessName: 'Harbor Market',
        legalName: 'Harbor Market Ltd',
        contactEmail: applicant.email,
        contactPhone: '+919876543212',
      }),
    });
    const application = (await applicationResponse.json()) as {
      data: { application: { id: string } };
    };
    const unauthorized = await fetch(`${baseUrl}/admin/vendor-applications`, {
      headers: { authorization: `Bearer ${applicant.token}` },
    });
    expect(unauthorized.status).toBe(403);
    const approved = await fetch(
      `${baseUrl}/admin/vendor-applications/${application.data.application.id}/approve`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'Business identity verified.' }),
      },
    );
    expect(approved.status).toBe(200);
    const queue = await fetch(`${baseUrl}/admin/vendor-applications?status=APPROVED`, {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(queue.status).toBe(200);
    const detail = await fetch(
      `${baseUrl}/admin/vendor-applications/${application.data.application.id}`,
      { headers: { authorization: `Bearer ${adminToken}` } },
    );
    expect(detail.status).toBe(200);
    const approvalBody = await approved.json();
    expect(approvalBody).toMatchObject({
      data: {
        application: {
          status: 'APPROVED',
          reviewerId: expect.any(String),
          decisionReason: 'Business identity verified.',
        },
        vendor: { ownerId: applicant.userId, status: 'APPROVED', flatShippingPaise: '0' },
      },
    });
    expect(
      await prisma.auditLog.findFirst({
        where: {
          action: 'vendor.application.approved',
          targetId: application.data.application.id,
          reason: 'Business identity verified.',
        },
      }),
    ).toBeTruthy();

    const ownerStore = await fetch(`${baseUrl}/vendor`, {
      headers: { authorization: `Bearer ${applicant.token}` },
    });
    expect(ownerStore.status).toBe(200);
    const store = (await ownerStore.json()) as { data: { vendor: { id: string } } };
    const storeUpdated = await fetch(`${baseUrl}/vendor`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${applicant.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Harbor Market Updated',
        description: 'Phase five test store.',
      }),
    });
    expect(storeUpdated.status).toBe(200);

    const secondApplicant = await createAccount('second-approved');
    const secondApplication = await fetch(`${baseUrl}/vendor-applications`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secondApplicant.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        businessName: 'Cedar Supplies',
        legalName: 'Cedar Supplies Ltd',
        contactEmail: secondApplicant.email,
        contactPhone: '+919876543214',
      }),
    });
    const secondApplicationBody = (await secondApplication.json()) as {
      data: { application: { id: string } };
    };
    await fetch(
      `${baseUrl}/admin/vendor-applications/${secondApplicationBody.data.application.id}/approve`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'Second business identity verified.' }),
      },
    );
    const secondStoreResponse = await fetch(`${baseUrl}/vendor`, {
      headers: { authorization: `Bearer ${secondApplicant.token}` },
    });
    const secondStore = (await secondStoreResponse.json()) as {
      data: { vendor: { id: string; name: string } };
    };
    expect(secondStore.data.vendor.id).not.toBe(store.data.vendor.id);
    const secondStoreUpdate = await fetch(`${baseUrl}/vendor`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${secondApplicant.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Cedar Supplies Updated' }),
    });
    expect(secondStoreUpdate.status).toBe(200);
    const firstStoreAfterSecondUpdate = await fetch(`${baseUrl}/vendor`, {
      headers: { authorization: `Bearer ${applicant.token}` },
    });
    expect(await firstStoreAfterSecondUpdate.json()).toMatchObject({
      data: { vendor: { id: store.data.vendor.id, name: 'Harbor Market Updated' } },
    });

    const suspended = await fetch(`${baseUrl}/admin/vendors/${store.data.vendor.id}/suspend`, {
      method: 'POST',
      headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Policy review.' }),
    });
    expect(suspended.status).toBe(200);
    const inactiveStore = await fetch(`${baseUrl}/vendor`, {
      headers: { authorization: `Bearer ${applicant.token}` },
    });
    expect(inactiveStore.status).toBe(404);
  });

  test('admin must give a reason to reject, and rejected applicants may revise and resubmit', async () => {
    const adminToken = await createAdmin();
    const applicant = await createAccount('rejected');
    const createApplication = async (businessName: string) =>
      fetch(`${baseUrl}/vendor-applications`, {
        method: 'POST',
        headers: { authorization: `Bearer ${applicant.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          businessName,
          legalName: `${businessName} Ltd`,
          contactEmail: applicant.email,
          contactPhone: '+919876543213',
        }),
      });
    const first = await createApplication('Needs Changes');
    const firstBody = (await first.json()) as { data: { application: { id: string } } };
    const rejected = await fetch(
      `${baseUrl}/admin/vendor-applications/${firstBody.data.application.id}/reject`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'Please provide a registered business name.' }),
      },
    );
    expect(rejected.status).toBe(200);
    const second = await createApplication('Updated Business');
    expect(second.status).toBe(201);
  });
});
