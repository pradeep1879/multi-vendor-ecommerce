import { AppError } from '../../common/errors/app-error';
import { OrdersRepository } from './orders.repository';
import { createInvoicePdf } from './invoice-pdf';

export class OrdersService {
  constructor(private readonly repository = new OrdersRepository()) {}

  async create(userId: string, addressId: string, key: string, couponCodes: string[] = []) {
    if (!key.trim() || key.length > 160)
      throw new AppError(
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
        'A valid Idempotency-Key header is required.',
      );
    const result = await this.repository.create(userId, addressId, key, couponCodes);
    if (result.kind === 'ADDRESS_NOT_FOUND')
      throw new AppError(404, 'ADDRESS_NOT_FOUND', 'Shipping address was not found.');
    if (result.kind === 'CART_EMPTY')
      throw new AppError(400, 'CART_EMPTY', 'Add at least one item before checkout.');
    if (result.kind === 'PRODUCT_UNAVAILABLE')
      throw new AppError(409, 'PRODUCT_UNAVAILABLE', 'A cart product is no longer available.');
    if (result.kind === 'INSUFFICIENT_STOCK')
      throw new AppError(409, 'INSUFFICIENT_STOCK', 'Available stock changed.');
    if (result.kind === 'KEY_REUSED')
      throw new AppError(
        409,
        'IDEMPOTENCY_KEY_REUSED',
        'This key was already used for a different checkout request.',
      );
    const order = await this.repository.findCustomerOrder(userId, result.orderId);
    if (!order)
      throw new AppError(500, 'ORDER_LOOKUP_FAILED', 'Created order could not be loaded.');
    return { order, replayed: result.kind === 'EXISTING' };
  }

  async listCustomer(userId: string) {
    return this.repository.findCustomerOrders(userId);
  }
  listAdmin(page: number, pageSize: number, status?: string) {
    return this.repository.findAdminOrders(page, pageSize, status);
  }
  async getCustomer(userId: string, orderId: string) {
    const order = await this.repository.findCustomerOrder(userId, orderId);
    if (!order) throw new AppError(404, 'NOT_FOUND', 'Order was not found.');
    return order;
  }
  async invoice(userId: string, isAdmin: boolean, orderId: string) {
    const order = isAdmin
      ? await this.repository.findInvoiceOrder(orderId)
      : await this.repository.findCustomerOrder(userId, orderId);
    if (!order) throw new AppError(404, 'NOT_FOUND', 'Order was not found.');
    if (order.status === 'PENDING_PAYMENT')
      throw new AppError(
        409,
        'INVOICE_NOT_READY',
        'Invoice is available after payment confirmation.',
      );
    return { orderNumber: order.orderNumber, bytes: await createInvoicePdf(order) };
  }
  async listVendor(vendorId: string) {
    return this.repository.findVendorOrders(vendorId);
  }
  async getVendor(vendorId: string, id: string) {
    const order = await this.repository.findVendorOrder(vendorId, id);
    if (!order) throw new AppError(404, 'NOT_FOUND', 'Order was not found.');
    return order;
  }
  async transition(
    vendorId: string,
    actorId: string,
    id: string,
    next: 'ACCEPTED' | 'PACKED' | 'SHIPPED' | 'DELIVERED',
    tracking?: { trackingReference?: string; carrier?: string; trackingUrl?: string },
  ) {
    const result = await this.repository.transitionVendorOrder(
      vendorId,
      actorId,
      id,
      next,
      tracking,
    );
    if (result.kind === 'NOT_FOUND') throw new AppError(404, 'NOT_FOUND', 'Order was not found.');
    if (result.kind === 'INVALID_TRANSITION')
      throw new AppError(
        409,
        'INVALID_ORDER_TRANSITION',
        'This fulfillment transition is not allowed.',
      );
    return result.order;
  }
  async cancel(userId: string, id: string, reason: string) {
    const result = await this.repository.cancel(userId, id, reason);
    if (result.kind === 'NOT_FOUND') throw new AppError(404, 'NOT_FOUND', 'Order was not found.');
    if (result.kind === 'INVALID_TRANSITION')
      throw new AppError(409, 'INVALID_ORDER_TRANSITION', 'This order can no longer be cancelled.');
  }
}
