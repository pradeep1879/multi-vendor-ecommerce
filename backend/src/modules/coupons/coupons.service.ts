import { AppError } from '../../common/errors/app-error.js';
import { CouponsRepository } from './coupons.repository.js';

export class CouponsService {
  constructor(private readonly repository = new CouponsRepository()) {}
  async list(page: number, pageSize: number) {
    const [coupons, total] = await Promise.all([
      this.repository.list((page - 1) * pageSize, pageSize),
      this.repository.count(),
    ]);
    return { coupons, meta: { page, pageSize, total } };
  }
  create(input: Parameters<CouponsRepository['create']>[0]) {
    if (input.endsAt <= input.startsAt)
      throw new AppError(
        400,
        'INVALID_COUPON_WINDOW',
        'Coupon end time must be after its start time.',
      );
    if (input.scope === 'VENDOR' && !input.vendorId)
      throw new AppError(400, 'VENDOR_REQUIRED', 'Vendor-scoped coupons require a vendor ID.');
    if (input.scope === 'PLATFORM' && input.vendorId)
      throw new AppError(400, 'VENDOR_NOT_ALLOWED', 'Platform coupons cannot name a vendor.');
    if (input.discountType === 'PERCENTAGE' && input.value > 10_000)
      throw new AppError(
        400,
        'INVALID_DISCOUNT',
        'Percentage value is basis points and cannot exceed 10000.',
      );
    return this.repository.create(input);
  }
  async update(id: string, input: Parameters<CouponsRepository['update']>[1]) {
    try {
      return await this.repository.update(id, input);
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2025')
        throw new AppError(404, 'NOT_FOUND', 'Coupon was not found.');
      throw error;
    }
  }
  validate(userId: string, codes: string[]) {
    if (codes.length > 1)
      throw new AppError(400, 'COUPONS_DO_NOT_STACK', 'Only one coupon can be used per order.');
    return this.repository.validate(userId, codes);
  }
}
