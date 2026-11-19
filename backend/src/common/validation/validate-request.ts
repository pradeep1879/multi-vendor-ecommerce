import type { RequestHandler, Response } from 'express';
import { z } from 'zod';
import { ValidationError } from '../errors/app-error';

export type RequestSchemas = {
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
};

export type ValidatedRequest = {
  params?: unknown;
  query?: unknown;
  body?: unknown;
};

export function getValidatedRequest<T>(response: Response): T {
  const validated: unknown = response.locals.validated;
  if (typeof validated !== 'object' || validated === null) {
    throw new Error('Validated request data is unavailable.');
  }
  return validated as T;
}

export function parseRequest(schemas: RequestSchemas, input: ValidatedRequest): ValidatedRequest {
  const result: ValidatedRequest = {};
  const details: { field: string; issue: string }[] = [];
  for (const part of ['params', 'query', 'body'] as const) {
    const schema = schemas[part];
    if (!schema) continue;
    const parsed = schema.safeParse(input[part]);
    if (parsed.success) {
      result[part] = parsed.data;
    } else {
      details.push(
        ...parsed.error.issues.map((issue) => ({
          field: `${part}${issue.path.length ? `.${issue.path.join('.')}` : ''}`,
          issue: issue.message,
        })),
      );
    }
  }
  if (details.length) throw new ValidationError(details);
  return result;
}

export function validateRequest(schemas: RequestSchemas): RequestHandler {
  return (request, response, next) => {
    try {
      response.locals.validated = parseRequest(schemas, {
        params: request.params,
        query: request.query,
        body: request.body,
      });
      next();
    } catch (error: unknown) {
      next(error);
    }
  };
}
