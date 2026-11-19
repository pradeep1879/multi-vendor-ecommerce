import { describe, expect, test } from 'bun:test';
import { AppError } from '../../common/errors/app-error.js';
import { WishlistService } from './wishlist.service.js';

describe('customer wishlist rules', () => {
  test('returns only the authenticated user’s saved items', async () => {
    const repository = {
      list: async (userId: string) => [{ id: 'saved-item', userId }],
      add: async () => ({ id: 'saved-item' }),
      remove: async () => undefined,
    };
    const service = new WishlistService(repository as never);
    const result: unknown = await service.list('customer-1');
    expect(result).toEqual([{ id: 'saved-item', userId: 'customer-1' }]);
  });

  test('does not save products outside the public catalog', async () => {
    const repository = {
      list: async () => [],
      add: async () => null,
      remove: async () => undefined,
    };
    const service = new WishlistService(repository as never);
    await expect(service.add('customer-1', 'unpublished')).rejects.toBeInstanceOf(AppError);
  });
});
