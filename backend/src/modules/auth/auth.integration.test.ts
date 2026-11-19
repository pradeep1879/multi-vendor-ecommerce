import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Server } from 'node:http';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../prisma-client/client.js';
import { createApp } from '../../app.js';
import { createAccountsRouter } from '../accounts/accounts.routes.js';
import { authentication, requireRole } from '../../common/middleware/authentication.js';
import { loadEnvironment } from '../../config/env.js';
import { disconnectDatabase } from '../../infrastructure/database/client.js';
import { AuthService, hashOpaqueToken } from './auth.service.js';
import type { EmailSender, OutboundEmail } from './email.adapter.js';
import { createAuthRouter } from './auth.routes.js';
import type { JWTPayload } from 'jose';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const databaseName = testDatabaseUrl
  ? new URL(testDatabaseUrl).pathname.split('/').at(-1)
  : undefined;
if (testDatabaseUrl && !databaseName?.endsWith('_test')) {
  throw new Error('TEST_DATABASE_URL must target a database whose name ends with _test.');
}

class CapturingEmailSender implements EmailSender {
  public readonly messages: OutboundEmail[] = [];

  async send(message: OutboundEmail): Promise<void> {
    this.messages.push(message);
  }
}

const authTest = testDatabaseUrl ? describe : describe.skip;
const authSecret = crypto.randomUUID() + crypto.randomUUID();
const environment = loadEnvironment({
  NODE_ENV: 'test',
  DATABASE_URL: testDatabaseUrl,
  JWT_ACCESS_SECRET: authSecret,
  GOOGLE_CLIENT_ID: 'google-test-client.apps.example.test',
  CORS_ORIGINS: 'http://localhost:5173',
  RATE_LIMIT_MAX: '100',
  AUTH_RATE_LIMIT_MAX: '100',
});
let prisma: PrismaClient;
let server: Server;
let baseUrl = '';
const emailSender = new CapturingEmailSender();
let googleClaims: JWTPayload = {};

authTest('Authentication and session lifecycle', () => {
  beforeAll(async () => {
    if (!testDatabaseUrl) return;
    process.env.DATABASE_URL = testDatabaseUrl;
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl }) });
    const authService = new AuthService(
      environment,
      undefined,
      emailSender,
      async () => googleClaims,
    );
    const authRouter = createAuthRouter(environment, authService);
    authRouter.get(
      '/admin-check',
      authentication(authService),
      requireRole('ADMIN'),
      (_request, response) => {
        response.status(204).end();
      },
    );
    authRouter.get(
      '/vendor-check',
      authentication(authService),
      requireRole('VENDOR'),
      (_request, response) => {
        response.status(204).end();
      },
    );
    authRouter.use(createAccountsRouter(environment));
    const app = createApp(authRouter, environment);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Authentication test server failed to start.');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  test('Google identity links only verified email and preserves existing roles', async () => {
    googleClaims = {
      sub: `google-${crypto.randomUUID()}`,
      email: `auth-google-new-${crypto.randomUUID()}@example.test`,
      email_verified: true,
      name: 'Google Customer',
    };
    const firstLogin = await fetch(`${baseUrl}/api/v1/auth/google`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken: 'fixture-google-id-token'.padEnd(120, 'x') }),
    });
    expect(firstLogin.status).toBe(200);
    const first = (await firstLogin.json()) as { data: { user: { id: string; roles: string[] } } };
    expect(first.data.user.roles).toEqual(['CUSTOMER']);
    const repeatedLogin = await fetch(`${baseUrl}/api/v1/auth/google`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken: 'fixture-google-id-token'.padEnd(120, 'x') }),
    });
    expect(((await repeatedLogin.json()) as { data: { user: { id: string } } }).data.user.id).toBe(
      first.data.user.id,
    );
    expect(await prisma.externalIdentity.count({ where: { userId: first.data.user.id } })).toBe(1);

    const vendorId = crypto.randomUUID();
    const vendorEmail = `auth-google-vendor-${crypto.randomUUID()}@example.test`;
    await prisma.user.create({
      data: {
        id: vendorId,
        email: vendorEmail,
        normalizedEmail: vendorEmail,
        name: 'Existing Vendor',
        passwordHash: 'fixture-hash',
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.userRole.create({ data: { userId: vendorId, role: 'VENDOR' } });
    await prisma.vendor.create({
      data: {
        ownerId: vendorId,
        name: 'Google Vendor Store',
        slug: `auth-google-vendor-${crypto.randomUUID()}`,
        status: 'APPROVED',
        approvedAt: new Date(),
      },
    });
    googleClaims = {
      sub: `google-${crypto.randomUUID()}`,
      email: vendorEmail,
      email_verified: true,
      name: 'Existing Vendor',
    };
    const vendorLogin = await fetch(`${baseUrl}/api/v1/auth/google`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken: 'fixture-google-id-token'.padEnd(120, 'x') }),
    });
    const vendorResult = (await vendorLogin.json()) as {
      data: { user: { id: string; roles: string[] } };
    };
    expect(vendorLogin.status).toBe(200);
    expect(vendorResult.data.user).toMatchObject({ id: vendorId, roles: ['VENDOR'] });

    const unverifiedEmail = `auth-google-unverified-${crypto.randomUUID()}@example.test`;
    const unverifiedId = crypto.randomUUID();
    await prisma.user.create({
      data: {
        id: unverifiedId,
        email: unverifiedEmail,
        normalizedEmail: unverifiedEmail,
        name: 'Unverified Customer',
        passwordHash: 'fixture-hash',
      },
    });
    googleClaims = {
      sub: `google-${crypto.randomUUID()}`,
      email: unverifiedEmail,
      email_verified: true,
      name: 'Unverified Customer',
    };
    const unsafeLink = await fetch(`${baseUrl}/api/v1/auth/google`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken: 'fixture-google-id-token'.padEnd(120, 'x') }),
    });
    expect(unsafeLink.status).toBe(409);
    expect(await prisma.externalIdentity.count({ where: { userId: unverifiedId } })).toBe(0);
  });

  afterAll(async () => {
    if (server?.listening) {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
    if (prisma) {
      await prisma.vendor.deleteMany({
        where: { owner: { normalizedEmail: { startsWith: 'auth-google-vendor-' } } },
      });
      await prisma.user.deleteMany({ where: { normalizedEmail: { startsWith: 'auth-' } } });
      await prisma.$disconnect();
    }
    await disconnectDatabase();
  });

  test('registers a customer, stores only a refresh-token hash, and returns a usable access token', async () => {
    const testEmail = `auth-${crypto.randomUUID()}@example.test`;
    const response = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'correct-horse-battery-1',
        name: 'Auth Tester',
      }),
    });
    const body = (await response.json()) as {
      data: { accessToken: string; user: { id: string; email: string; roles: string[] } };
    };
    const setCookie = response.headers.get('set-cookie');
    const cookiePair = setCookie?.split(';')[0];
    const rawRefresh = cookiePair?.slice(cookiePair.indexOf('=') + 1);
    expect(response.status).toBe(201);
    expect(body.data.user).toMatchObject({
      id: expect.any(String),
      email: testEmail,
      name: 'Auth Tester',
      roles: ['CUSTOMER'],
    });
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(rawRefresh).toBeTruthy();
    expect(JSON.stringify(body)).not.toContain(rawRefresh ?? '');

    const session = await prisma.session.findUnique({
      where: { tokenHash: hashOpaqueToken(rawRefresh!) },
    });
    expect(session?.revokedAt).toBeNull();
    expect(session?.tokenHash).not.toBe(rawRefresh);
    expect(
      await prisma.auditLog.findFirst({
        where: { actorId: body.data.user.id, action: 'auth.register', targetId: body.data.user.id },
      }),
    ).toBeTruthy();

    const me = await fetch(`${baseUrl}/api/v1/me`, {
      headers: { authorization: `Bearer ${body.data.accessToken}` },
    });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({
      data: { user: { email: testEmail, roles: ['CUSTOMER'] } },
    });
  });

  test('login errors are generic and refresh rotation detects reuse', async () => {
    const testEmail = `auth-${crypto.randomUUID()}@example.test`;
    await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'correct-horse-battery-1',
        name: 'Auth Tester',
      }),
    });
    const badLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: 'wrong-password-value' }),
    });
    const unknownLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `unknown-${testEmail}`, password: 'wrong-password-value' }),
    });
    expect(badLogin.status).toBe(401);
    expect(unknownLogin.status).toBe(401);
    expect(await badLogin.json()).toMatchObject({
      error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' },
    });
    expect(await unknownLogin.json()).toMatchObject({
      error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' },
    });
    const invalidRefresh = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        origin: 'http://localhost:5173',
        cookie: 'marketplace_refresh=invalid-opaque-token-value-that-is-long-enough',
      },
    });
    expect(invalidRefresh.status).toBe(401);

    const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: 'correct-horse-battery-1' }),
    });
    const loginBody = (await login.json()) as { data: { accessToken: string } };
    const oldCookie = login.headers.get('set-cookie')?.split(';')[0];
    const oldRefreshToken = decodeURIComponent(oldCookie?.slice(oldCookie.indexOf('=') + 1) ?? '');
    expect(
      await prisma.session.findUnique({ where: { tokenHash: hashOpaqueToken(oldRefreshToken) } }),
    ).toBeTruthy();
    const refresh = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { origin: 'http://localhost:5173', cookie: oldCookie ?? '' },
    });
    expect(refresh.status).toBe(200);
    const rotatedCookie = refresh.headers.get('set-cookie')?.split(';')[0];
    expect(rotatedCookie).toBeTruthy();
    expect(rotatedCookie).not.toBe(oldCookie);

    const reused = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { origin: 'http://localhost:5173', cookie: oldCookie ?? '' },
    });
    expect(reused.status).toBe(401);
    const latestSession = await prisma.session.findFirst({
      where: { replacedBySessionId: { not: null }, user: { normalizedEmail: testEmail } },
      orderBy: { createdAt: 'desc' },
    });
    expect(latestSession?.revokedAt).not.toBeNull();

    const revokedAccess = await fetch(`${baseUrl}/api/v1/me`, {
      headers: { authorization: `Bearer ${loginBody.data.accessToken}` },
    });
    expect(revokedAccess.status).toBe(401);

    const expiringLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: 'correct-horse-battery-1' }),
    });
    const expiringCookie = expiringLogin.headers.get('set-cookie')?.split(';')[0] ?? '';
    const expiringToken = decodeURIComponent(expiringCookie.slice(expiringCookie.indexOf('=') + 1));
    const expiringSession = await prisma.session.findUnique({
      where: { tokenHash: hashOpaqueToken(expiringToken) },
    });
    expect(expiringSession).toBeTruthy();
    await prisma.session.update({
      where: { id: expiringSession!.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expiredRefresh = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { origin: 'http://localhost:5173', cookie: expiringCookie },
    });
    expect(expiredRefresh.status).toBe(401);
  });

  test('password reset uses a one-time token and revokes existing sessions', async () => {
    const testEmail = `auth-${crypto.randomUUID()}@example.test`;
    const registration = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'correct-horse-battery-1',
        name: 'Auth Tester',
      }),
    });
    const resetRequest = await fetch(`${baseUrl}/api/v1/auth/password-reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: testEmail }),
    });
    expect(resetRequest.status).toBe(202);
    expect(await resetRequest.json()).toEqual({ data: { accepted: true } });
    const resetEmail = emailSender.messages.find((message) => message.purpose === 'PASSWORD_RESET');
    expect(resetEmail?.recipient).toBe(testEmail);
    expect(resetEmail?.token).toBeTruthy();

    const registrationBody = (await registration.json()) as { data: { accessToken: string } };
    const completed = await fetch(`${baseUrl}/api/v1/auth/password-reset/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: resetEmail?.token,
        newPassword: 'new-correct-horse-battery-2',
      }),
    });
    expect(completed.status).toBe(200);
    const reused = await fetch(`${baseUrl}/api/v1/auth/password-reset/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: resetEmail?.token,
        newPassword: 'new-correct-horse-battery-2',
      }),
    });
    expect(reused.status).toBe(400);
    const oldAccess = await fetch(`${baseUrl}/api/v1/me`, {
      headers: { authorization: `Bearer ${registrationBody.data.accessToken}` },
    });
    expect(oldAccess.status).toBe(401);

    const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: 'new-correct-horse-battery-2' }),
    });
    expect(login.status).toBe(200);
  });

  test('refresh/logout require a trusted origin and logout-all revokes access sessions', async () => {
    const testEmail = `auth-${crypto.randomUUID()}@example.test`;
    const registration = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'new-correct-horse-battery-2',
        name: 'Auth Tester',
      }),
    });
    const auth = (await registration.json()) as { data: { accessToken: string } };
    const denied = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { origin: 'https://attacker.example' },
    });
    expect(denied.status).toBe(403);

    const logoutAll = await fetch(`${baseUrl}/api/v1/auth/logout-all`, {
      method: 'POST',
      headers: { authorization: `Bearer ${auth.data.accessToken}` },
    });
    expect(logoutAll.status).toBe(204);
    const me = await fetch(`${baseUrl}/api/v1/me`, {
      headers: { authorization: `Bearer ${auth.data.accessToken}` },
    });
    expect(me.status).toBe(401);
  });

  test('role middleware rejects customers and logout revokes the current session', async () => {
    const testEmail = `auth-${crypto.randomUUID()}@example.test`;
    const registration = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'correct-horse-battery-1',
        name: 'Auth Tester',
      }),
    });
    const auth = (await registration.json()) as { data: { accessToken: string } };
    const forbidden = await fetch(`${baseUrl}/api/v1/admin-check`, {
      headers: { authorization: `Bearer ${auth.data.accessToken}` },
    });
    expect(forbidden.status).toBe(403);

    const cookie = registration.headers.get('set-cookie')?.split(';')[0] ?? '';
    const logout = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { origin: 'http://localhost:5173', cookie },
    });
    expect(logout.status).toBe(204);
    const revoked = await fetch(`${baseUrl}/api/v1/me`, {
      headers: { authorization: `Bearer ${auth.data.accessToken}` },
    });
    expect(revoked.status).toBe(401);
  });

  test('admin and vendor sessions cannot cross into the other workspace', async () => {
    const password = 'workspace-test-password-2026';
    const adminEmail = `workspace-admin-${crypto.randomUUID()}@example.test`;
    const vendorEmail = `workspace-vendor-${crypto.randomUUID()}@example.test`;
    const passwordHash = await Bun.password.hash(password);
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        normalizedEmail: adminEmail,
        name: 'Workspace Admin',
        passwordHash,
        emailVerifiedAt: new Date(),
        roles: { create: [{ role: 'ADMIN' }] },
      },
    });
    const vendor = await prisma.user.create({
      data: {
        email: vendorEmail,
        normalizedEmail: vendorEmail,
        name: 'Workspace Vendor',
        passwordHash,
        emailVerifiedAt: new Date(),
        roles: { create: [{ role: 'VENDOR' }] },
      },
    });
    expect(admin.id).not.toBe(vendor.id);

    const login = async (email: string) => {
      const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      expect(response.status).toBe(200);
      const result = (await response.json()) as { data: { accessToken: string } };
      return result.data.accessToken;
    };
    const check = (path: string, accessToken?: string) =>
      fetch(`${baseUrl}/api/v1/${path}`, {
        headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {},
      });
    const adminToken = await login(adminEmail);
    const vendorToken = await login(vendorEmail);
    expect((await check('admin-check', adminToken)).status).toBe(204);
    expect((await check('vendor-check', adminToken)).status).toBe(403);
    expect((await check('vendor-check', vendorToken)).status).toBe(204);
    expect((await check('admin-check', vendorToken)).status).toBe(403);
    expect((await check('admin-check')).status).toBe(401);
    expect((await check('vendor-check')).status).toBe(401);
  });

  test('email verification is one-time and password reset does not expose account existence', async () => {
    const testEmail = `auth-${crypto.randomUUID()}@example.test`;
    await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'new-correct-horse-battery-2',
        name: 'Auth Tester',
      }),
    });
    const requestForUnknown = await fetch(`${baseUrl}/api/v1/auth/password-reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `absent-${testEmail}` }),
    });
    expect(requestForUnknown.status).toBe(202);
    expect(await requestForUnknown.json()).toEqual({ data: { accepted: true } });

    const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: 'new-correct-horse-battery-2' }),
    });
    const loginBody = (await login.json()) as { data: { accessToken: string } };
    const requested = await fetch(`${baseUrl}/api/v1/auth/email-verification`, {
      method: 'POST',
      headers: { authorization: `Bearer ${loginBody.data.accessToken}` },
    });
    expect(requested.status).toBe(202);
    const verification = emailSender.messages.find(
      (message) => message.purpose === 'EMAIL_VERIFICATION',
    );
    expect(verification?.token).toBeTruthy();

    const confirmed = await fetch(`${baseUrl}/api/v1/auth/email-verification/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: verification?.token }),
    });
    expect(confirmed.status).toBe(200);
    const reused = await fetch(`${baseUrl}/api/v1/auth/email-verification/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: verification?.token }),
    });
    expect(reused.status).toBe(400);
  });

  test('authenticated password changes verify the current password and revoke sessions', async () => {
    const email = `auth-${crypto.randomUUID()}@example.test`;
    const registration = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'old-correct-horse-battery-1',
        name: 'Password Tester',
      }),
    });
    const { data } = (await registration.json()) as { data: { accessToken: string } };
    const invalid = await fetch(`${baseUrl}/api/v1/auth/password/change`, {
      method: 'POST',
      headers: { authorization: `Bearer ${data.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        currentPassword: 'incorrect-current-password',
        newPassword: 'new-correct-horse-battery-2',
      }),
    });
    expect(invalid.status).toBe(400);
    const changed = await fetch(`${baseUrl}/api/v1/auth/password/change`, {
      method: 'POST',
      headers: { authorization: `Bearer ${data.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        currentPassword: 'old-correct-horse-battery-1',
        newPassword: 'new-correct-horse-battery-2',
      }),
    });
    expect(changed.status).toBe(200);
    const revoked = await fetch(`${baseUrl}/api/v1/me`, {
      headers: { authorization: `Bearer ${data.accessToken}` },
    });
    expect(revoked.status).toBe(401);
    const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'new-correct-horse-battery-2' }),
    });
    expect(login.status).toBe(200);
  });
});
