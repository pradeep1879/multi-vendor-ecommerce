import { AppError } from '../../common/errors/app-error.js';
import { WishlistRepository } from './wishlist.repository.js';

export class WishlistService {
  constructor(private readonly repository = new WishlistRepository()) {}

  list(userId: string) {
    return this.repository.list(userId);
  }

  async add(userId: string, productId: string) {
    const item = await this.repository.add(userId, productId);
    if (!item)
      throw new AppError(404, 'PRODUCT_NOT_FOUND', 'The product is not available to save.');
    return item;
  }

  async remove(userId: string, productId: string) {
    await this.repository.remove(userId, productId);
  }
}
