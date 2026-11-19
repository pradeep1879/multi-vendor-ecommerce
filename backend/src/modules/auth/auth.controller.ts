import { parse, serialize } from 'cookie';
import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { sendData } from '../../common/middleware/response.js';
import { getAuthContext } from '../../common/middleware/authentication.js';
import { getValidatedRequest } from '../../common/validation/validate-request.js';
import type { Environment } from '../../config/env.js';
import type { AuthService } from './auth.service.js';

const REFRESH_COOKIE = 'marketplace_refresh';
type AuthBody = { email: string; password: string; name?: string };
type ResetBody = { email: string };
type ResetConfirmBody = { token: string; newPassword: string };
type TokenBody = { token: string };

export function createAuthController(service: AuthService, environment: Environment) {
  const setRefreshCookie = (response: Parameters<RequestHandler>[1], token: string): void => {
    response.setHeader(
      'Set-Cookie',
      serialize(REFRESH_COOKIE, token, {
        httpOnly: true,
        secure: environment.nodeEnv === 'production',
        sameSite: environment.nodeEnv === 'production' ? 'none' : 'strict',
        path: '/api/v1/auth',
        maxAge: environment.refreshTokenTtlDays * 24 * 60 * 60,
      }),
    );
  };

  const clearRefreshCookie = (response: Parameters<RequestHandler>[1]): void => {
    response.setHeader(
      'Set-Cookie',
      serialize(REFRESH_COOKIE, '', {
        httpOnly: true,
        secure: environment.nodeEnv === 'production',
        sameSite: environment.nodeEnv === 'production' ? 'none' : 'strict',
        path: '/api/v1/auth',
        maxAge: 0,
        expires: new Date(0),
      }),
    );
  };

  const readRefreshCookie = (request: Parameters<RequestHandler>[0]): string | undefined =>
    parse(request.headers.cookie ?? '')[REFRESH_COOKIE];

  const sendAuthResult = (
    response: Parameters<RequestHandler>[1],
    result: Awaited<ReturnType<AuthService['login']>>,
    statusCode = 200,
  ): void => {
    setRefreshCookie(response, result.refreshToken);
    const { refreshToken: _refreshToken, ...safeResponse } = result;
    void _refreshToken;
    sendData(response, safeResponse, statusCode);
  };

  const register: RequestHandler = async (_request, response) => {
    const body = getValidatedRequest<{ body: AuthBody }>(response).body;
    if (!body.name) throw new AppError(400, 'VALIDATION_ERROR', 'Name is required.');
    const result = await service.register({
      email: body.email,
      password: body.password,
      name: body.name,
    });
    sendAuthResult(response, result, 201);
  };

  const login: RequestHandler = async (_request, response) => {
    const body = getValidatedRequest<{ body: AuthBody }>(response).body;
    const result = await service.login({ email: body.email, password: body.password });
    sendAuthResult(response, result);
  };

  const googleLogin: RequestHandler = async (_request, response) => {
    const body = getValidatedRequest<{ body: { idToken: string } }>(response).body;
    sendAuthResult(response, await service.loginWithGoogle(body.idToken));
  };

  const refresh: RequestHandler = async (request, response, next) => {
    const token = readRefreshCookie(request);
    if (!token) {
      clearRefreshCookie(response);
      next(new AppError(401, 'INVALID_SESSION', 'Session is invalid or expired.'));
      return;
    }
    try {
      sendAuthResult(response, await service.refresh(token));
    } catch (error: unknown) {
      clearRefreshCookie(response);
      next(error);
    }
  };

  const logout: RequestHandler = async (request, response) => {
    await service.logout(readRefreshCookie(request));
    clearRefreshCookie(response);
    response.status(204).end();
  };

  const logoutAll: RequestHandler = async (_request, response) => {
    const context = getAuthContext(response);
    await service.logoutAll(context.userId);
    clearRefreshCookie(response);
    response.status(204).end();
  };

  const requestPasswordReset: RequestHandler = async (_request, response) => {
    const body = getValidatedRequest<{ body: ResetBody }>(response).body;
    await service.requestPasswordReset(body.email);
    sendData(response, { accepted: true }, 202);
  };

  const confirmPasswordReset: RequestHandler = async (_request, response) => {
    const body = getValidatedRequest<{ body: ResetConfirmBody }>(response).body;
    await service.confirmPasswordReset(body.token, body.newPassword);
    sendData(response, { completed: true });
  };

  const requestEmailVerification: RequestHandler = async (_request, response) => {
    const context = getAuthContext(response);
    await service.requestEmailVerification(context.userId);
    sendData(response, { accepted: true }, 202);
  };

  const confirmEmailVerification: RequestHandler = async (_request, response) => {
    const body = getValidatedRequest<{ body: TokenBody }>(response).body;
    await service.confirmEmailVerification(body.token);
    sendData(response, { verified: true });
  };

  const me: RequestHandler = (_request, response) => {
    const context = getAuthContext(response);
    sendData(response, { user: context.user });
  };

  const switchRole: RequestHandler = async (_request, response) => {
    const context = getAuthContext(response);
    const body = getValidatedRequest<{ body: { role: 'CUSTOMER' | 'VENDOR' | 'ADMIN' } }>(
      response,
    ).body;
    sendData(response, await service.switchRole(context.userId, body.role));
  };

  return {
    register,
    login,
    googleLogin,
    refresh,
    logout,
    logoutAll,
    requestPasswordReset,
    confirmPasswordReset,
    requestEmailVerification,
    confirmEmailVerification,
    me,
    switchRole,
  };
}
