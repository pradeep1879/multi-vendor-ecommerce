import { AppError } from '../../common/errors/app-error';
import { ReturnsRepository, type ReturnTransition } from './returns.repository';

export class ReturnsService {
  constructor(private readonly repository = new ReturnsRepository()) {}

  listCustomer(customerId: string, orderId: string) {
    return this.repository.listCustomer(customerId, orderId);
  }

  async create(
    customerId: string,
    orderId: string,
    itemId: string,
    quantity: number,
    reason: string,
  ) {
    const result = await this.repository.create(customerId, orderId, itemId, quantity, reason);
    if (result.kind === 'NOT_RETURNABLE')
      throw new AppError(409, 'ORDER_NOT_RETURNABLE', 'Only delivered orders can be returned.');
    if (result.kind === 'RETURN_WINDOW_CLOSED')
      throw new AppError(
        409,
        'RETURN_WINDOW_CLOSED',
        'Returns must be requested within seven days of delivery.',
      );
    if (result.kind === 'ITEM_NOT_FOUND')
      throw new AppError(404, 'ORDER_ITEM_NOT_FOUND', 'Order item was not found.');
    if (result.kind === 'QUANTITY_EXCEEDED')
      throw new AppError(
        409,
        'RETURN_QUANTITY_EXCEEDED',
        'The requested quantity exceeds the unreturned units.',
      );
    return result.request;
  }

  listAdmin(page: number, pageSize: number, status?: string) {
    return this.repository.listAdmin(page, pageSize, status);
  }

  listVendor(vendorId: string, page: number, pageSize: number, status?: string) {
    return this.repository.listVendor(vendorId, page, pageSize, status);
  }

  async getForRefund(returnId: string) {
    const request = await this.repository.findForRefund(returnId);
    if (!request) throw new AppError(404, 'RETURN_NOT_FOUND', 'Return request was not found.');
    return request;
  }

  async transition(actorId: string, returnId: string, status: ReturnTransition, reason: string) {
    const result = await this.repository.transitionAdmin(actorId, returnId, status, reason);
    if (result.kind === 'NOT_FOUND')
      throw new AppError(404, 'RETURN_NOT_FOUND', 'Return request was not found.');
    if (result.kind === 'INVALID_TRANSITION')
      throw new AppError(
        409,
        'RETURN_TRANSITION_INVALID',
        'That return status change is not allowed.',
      );
    return result.request;
  }

  linkRefund(returnId: string, refundId: string) {
    return this.repository.linkRefund(returnId, refundId);
  }

  markRefunded(returnId: string) {
    return this.repository.markRefunded(returnId);
  }
}
