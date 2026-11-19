import type { RequestHandler } from 'express';
import { AppError } from '../errors/app-error';
import type { AuthService } from '../../modules/auth/auth.service';

export type AuthContext = {
  userId: string;
  sessionId: string;
  roles: string[];
  user: { id: string; email: string; name: string; roles: string[] };
};

export function authentication(service: AuthService): RequestHandler {
  return async (request, response, next) => {
    const header = request.header('authorization');
    const match = header?.match(/^Bearer ([A-Za-z0-9._~-]+)$/);
    if (!match?.[1]) {
      next(new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.'));
      return;
    }
    try {
      response.locals.auth = await service.authenticateAccessToken(match[1]);
      next();
    } catch (error: unknown) {
      next(error);
    }
  };
}

export function requireRole(...roles: string[]): RequestHandler {
  return (_request, response, next) => {
    const context: unknown = response.locals.auth;
    if (typeof context !== 'object' || context === null || !('roles' in context)) {
      next(new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.'));
      return;
    }
    const grantedRoles: unknown = context.roles;
    if (!Array.isArray(grantedRoles) || !roles.some((role) => grantedRoles.includes(role))) {
      next(new AppError(403, 'FORBIDDEN', 'You are not allowed to perform this action.'));
      return;
    }
    next();
  };
}

export function getAuthContext(response: Parameters<RequestHandler>[1]): AuthContext {
  const context: unknown = response.locals.auth;
  if (
    typeof context !== 'object' ||
    context === null ||
    !('userId' in context) ||
    !('sessionId' in context) ||
    !('roles' in context) ||
    !('user' in context) ||
    typeof context.userId !== 'string' ||
    typeof context.sessionId !== 'string' ||
    !Array.isArray(context.roles) ||
    typeof context.user !== 'object' ||
    context.user === null
  ) {
    throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
  }
  return context as AuthContext;
}
