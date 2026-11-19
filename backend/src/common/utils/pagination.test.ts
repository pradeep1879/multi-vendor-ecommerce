import { describe, expect, test } from 'bun:test';
import { ValidationError } from '../errors/app-error.js';
import { parsePagination, parseSort } from './pagination.js';

describe('pagination and sorting helpers', () => {
  test('uses bounded defaults and calculates offset', () => {
    expect(parsePagination({})).toEqual({ page: 1, pageSize: 20, skip: 0, take: 20 });
    expect(parsePagination({ page: '3', pageSize: '10' })).toEqual({
      page: 3,
      pageSize: 10,
      skip: 20,
      take: 10,
    });
  });
  test('rejects unbounded page sizes', () => {
    expect(() => parsePagination({ pageSize: '1000' })).toThrow(ValidationError);
  });
  test('sort fields must come from an allowlist', () => {
    expect(parseSort('createdAt', 'desc', ['createdAt', 'name'], 'createdAt')).toEqual({
      field: 'createdAt',
      direction: 'desc',
    });
    expect(() => parseSort('rawSql', 'asc', ['createdAt'], 'createdAt')).toThrow(ValidationError);
    expect(() => parseSort('createdAt', 'sideways', ['createdAt'], 'createdAt')).toThrow();
  });
});
