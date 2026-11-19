import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../errors/app-error';

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  void request;
  next(new AppError(404, 'NOT_FOUND', 'Route not found.'));
};

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, _next) => {
  void _next;
  const appError = error instanceof AppError ? error : undefined;
  const parserError =
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    error.type === 'entity.parse.failed';
  const payloadTooLarge =
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    error.type === 'entity.too.large';
  const statusCode = appError?.statusCode ?? (parserError ? 400 : payloadTooLarge ? 413 : 500);
  const code =
    appError?.code ??
    (parserError ? 'INVALID_JSON' : payloadTooLarge ? 'PAYLOAD_TOO_LARGE' : 'INTERNAL_ERROR');
  const message =
    appError?.message ??
    (parserError
      ? 'Request body must contain valid JSON.'
      : payloadTooLarge
        ? 'Request body exceeds the configured size limit.'
        : 'An unexpected error occurred.');
  const requestId = String(response.locals.requestId ?? 'unknown');

  const log = {
    level: statusCode >= 500 ? 'error' : 'warn',
    event: 'http_request_failed',
    requestId,
    method: request.method,
    statusCode,
    code,
  };
  (statusCode >= 500 ? console.error : console.warn)(JSON.stringify(log));

  response.status(statusCode).json({
    error: {
      code,
      message,
      requestId,
      ...(appError?.details ? { details: appError.details } : {}),
    },
  });
};
