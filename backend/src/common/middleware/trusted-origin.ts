import type { RequestHandler } from 'express';
import { AppError } from '../errors/app-error.js';

export function requireTrustedOrigin(origins: readonly string[]): RequestHandler {
  return (request, _response, next) => {
    const origin = request.get('origin');
    if (!origin || !origins.includes(origin)) {
      next(new AppError(403, 'CSRF_ORIGIN_DENIED', 'Request origin is not allowed.'));
      return;
    }
    next();
  };
}
