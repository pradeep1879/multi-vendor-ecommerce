import type { RequestHandler } from 'express';

export const requestLogger: RequestHandler = (request, response, next) => {
  const startedAt = Date.now();
  response.on('finish', () => {
    console.log(
      JSON.stringify({
        level: 'info',
        event: 'http_request_completed',
        requestId: response.locals.requestId ?? 'unknown',
        method: request.method,
        route: request.route?.path ?? 'unmatched',
        statusCode: response.statusCode,
        durationMs: Date.now() - startedAt,
      }),
    );
  });
  next();
};
