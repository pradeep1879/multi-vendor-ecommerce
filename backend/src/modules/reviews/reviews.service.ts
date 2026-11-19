import { AppError } from '../../common/errors/app-error.js';
import { ReviewsRepository } from './reviews.repository.js';

export class ReviewsService {
  constructor(private readonly repository = new ReviewsRepository()) {}
  listForModeration(
    status: 'PENDING' | 'PUBLISHED' | 'HIDDEN' | 'REJECTED',
    page: number,
    pageSize: number,
  ) {
    return this.repository.listForModeration(status, (page - 1) * pageSize, pageSize);
  }
  listCustomer(userId: string, page: number, pageSize: number) {
    return this.repository.listCustomer(userId, (page - 1) * pageSize, pageSize);
  }
  listEligible(userId: string) {
    return this.repository.listEligible(userId);
  }
  async create(
    userId: string,
    orderId: string,
    itemId: string,
    input: { rating: number; title?: string; body?: string },
  ) {
    try {
      const result = await this.repository.create(userId, orderId, itemId, input);
      if (result.kind === 'NOT_ELIGIBLE')
        throw new AppError(
          409,
          'REVIEW_NOT_ELIGIBLE',
          'A review requires an item from a delivered order you own.',
        );
      return result.review;
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')
        throw new AppError(409, 'REVIEW_ALREADY_EXISTS', 'This order item already has a review.');
      throw error;
    }
  }
  list(productId: string, page: number, pageSize: number) {
    return this.repository.list(productId, (page - 1) * pageSize, pageSize);
  }
  async update(
    userId: string,
    id: string,
    input: { rating?: number; title?: string | null; body?: string | null },
  ) {
    const result = await this.repository.update(userId, id, input);
    if (result.kind === 'NOT_FOUND') throw new AppError(404, 'NOT_FOUND', 'Review was not found.');
    if (result.kind === 'EXPIRED')
      throw new AppError(
        409,
        'REVIEW_EDIT_WINDOW_EXPIRED',
        'Reviews can only be edited within 30 days.',
      );
    return result.review;
  }
  async remove(userId: string, id: string) {
    const result = await this.repository.remove(userId, id);
    if (result.kind === 'NOT_FOUND') throw new AppError(404, 'NOT_FOUND', 'Review was not found.');
    if (result.kind === 'EXPIRED')
      throw new AppError(
        409,
        'REVIEW_EDIT_WINDOW_EXPIRED',
        'Reviews can only be removed within 30 days.',
      );
  }
  async moderate(
    actorId: string,
    id: string,
    status: 'PUBLISHED' | 'HIDDEN' | 'REJECTED',
    reason: string,
  ) {
    const review = await this.repository.moderate(actorId, id, status, reason);
    if (!review) throw new AppError(404, 'NOT_FOUND', 'Review was not found.');
    return review;
  }
}
