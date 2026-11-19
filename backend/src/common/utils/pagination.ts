import { z } from 'zod';
import { ValidationError } from '../errors/app-error.js';

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type Pagination = { page: number; pageSize: number; skip: number; take: number };

export function parsePagination(input: { page?: unknown; pageSize?: unknown }): Pagination {
  const result = paginationSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'query',
        issue: issue.message,
      })),
    );
  }
  return {
    page: result.data.page,
    pageSize: result.data.pageSize,
    skip: (result.data.page - 1) * result.data.pageSize,
    take: result.data.pageSize,
  };
}

export type SortOrder = { field: string; direction: 'asc' | 'desc' };

export function parseSort(
  field: unknown,
  direction: unknown,
  allowlist: readonly string[],
  defaultField: string,
): SortOrder {
  const parsed = z
    .object({
      field: z.string().default(defaultField),
      direction: z.enum(['asc', 'desc']).default('asc'),
    })
    .safeParse({ field, direction });
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'sort',
        issue: issue.message,
      })),
    );
  }
  const { field: sortField, direction: sortDirection } = parsed.data;
  if (!allowlist.includes(sortField)) {
    throw new ValidationError([{ field: 'sortBy', issue: 'Unsupported sort field.' }]);
  }
  return { field: sortField, direction: sortDirection };
}
