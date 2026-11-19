import { describe, expect, test } from 'bun:test';
import type { Request, Response } from 'express';
import { AppError } from '../errors/app-error.js';
import { authentication, requireRole } from './authentication.js';
import type { AuthService } from '../../modules/auth/auth.service.js';

describe('workspace route authorization', () => {
  const authorize = async (workspace: 'ADMIN' | 'VENDOR', token?: string) => {
    const identities: Record<string, string[]> = {
      admin_test_token: ['ADMIN'],
      vendor_test_token: ['VENDOR'],
      customer_test_token: ['CUSTOMER'],
    };
    const authService = {
      authenticateAccessToken: async (token: string) => {
        const roles = identities[token];
        if (!roles) throw new AppError(401, 'SESSION_EXPIRED', 'Session has expired.');
        return {
          userId: `${token}_user`,
          sessionId: `${token}_session`,
          roles,
          user: { id: `${token}_user`, email: `${token}@example.test`, name: token, roles },
        };
      },
    } as unknown as AuthService;
    const request = {
      header: (name: string) =>
        name.toLowerCase() === 'authorization' && token ? `Bearer ${token}` : undefined,
    } as Request;
    const response = { locals: {} } as Response;
    let authError: unknown;
    await new Promise<void>((resolve) => {
      void authentication(authService)(request, response, (error?: unknown) => {
        authError = error;
        resolve();
      });
    });
    if (authError instanceof AppError) return authError.statusCode;
    let roleError: unknown;
    requireRole(workspace)(request, response, (error?: unknown) => {
      roleError = error;
    });
    return roleError instanceof AppError ? roleError.statusCode : 204;
  };

  test('each dashboard accepts only its matching role', async () => {
    expect(await authorize('ADMIN', 'admin_test_token')).toBe(204);
    expect(await authorize('VENDOR', 'vendor_test_token')).toBe(204);
    expect(await authorize('ADMIN', 'vendor_test_token')).toBe(403);
    expect(await authorize('VENDOR', 'admin_test_token')).toBe(403);
    expect(await authorize('ADMIN', 'customer_test_token')).toBe(403);
    expect(await authorize('VENDOR', 'customer_test_token')).toBe(403);
  });

  test('unauthenticated and expired-session requests are rejected', async () => {
    expect(await authorize('ADMIN')).toBe(401);
    expect(await authorize('VENDOR')).toBe(401);
    expect(await authorize('ADMIN', 'expired_test_token')).toBe(401);
    expect(await authorize('VENDOR', 'expired_test_token')).toBe(401);
  });
});
