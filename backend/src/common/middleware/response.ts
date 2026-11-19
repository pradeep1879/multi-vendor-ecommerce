import type { Response } from 'express';

export type ResponseMeta = Record<string, string | number | boolean>;

function jsonSafe(value: unknown): unknown {
  const serialized = JSON.stringify(value, (_key: string, item: unknown) =>
    typeof item === 'bigint' ? item.toString() : item,
  );
  return serialized === undefined ? null : (JSON.parse(serialized) as unknown);
}

export function sendData<T>(
  response: Response,
  data: T,
  statusCode = 200,
  meta?: ResponseMeta,
): void {
  response.status(statusCode).json(jsonSafe({ data, ...(meta ? { meta } : {}) }));
}
