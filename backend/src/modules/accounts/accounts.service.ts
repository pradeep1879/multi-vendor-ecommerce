import { AppError } from '../../common/errors/app-error';
import {
  AccountsRepository,
  type AddressInput,
  type ApplicationInput,
} from './accounts.repository';

export class AccountsService {
  constructor(private readonly repository = new AccountsRepository()) {}

  async listCustomers(skip: number, take: number) {
    const [customers, total] = await Promise.all([
      this.repository.listCustomers(skip, take),
      this.repository.countCustomers(),
    ]);
    return { customers, total };
  }

  async setCustomerDisabled(input: { userId: string; disabled: boolean; actorId: string }) {
    const customer = await this.repository.setCustomerDisabled(input);
    if (!customer) throw new AppError(404, 'NOT_FOUND', 'Customer account was not found.');
    return customer;
  }

  async getProfile(userId: string) {
    const profile = await this.repository.getProfile(userId);
    if (!profile) throw new AppError(404, 'NOT_FOUND', 'Account was not found.');
    return { ...profile, roles: profile.roles.map(({ role }) => role) };
  }

  async updateProfile(userId: string, input: { name?: string; phone?: string | null }) {
    try {
      const profile = await this.repository.updateProfile(userId, input);
      return { ...profile, roles: profile.roles.map(({ role }) => role) };
    } catch (error: unknown) {
      if (isMissingRecord(error)) throw new AppError(404, 'NOT_FOUND', 'Account was not found.');
      throw error;
    }
  }

  listAddresses(userId: string) {
    return this.repository.listAddresses(userId);
  }

  createAddress(userId: string, input: AddressInput) {
    return this.repository.createAddress(userId, input);
  }

  async updateAddress(userId: string, addressId: string, input: Partial<AddressInput>) {
    const address = await this.repository.updateAddress(userId, addressId, input);
    if (!address) throw new AppError(404, 'NOT_FOUND', 'Address was not found.');
    return address;
  }

  async deleteAddress(userId: string, addressId: string) {
    if (!(await this.repository.deleteAddress(userId, addressId))) {
      throw new AppError(404, 'NOT_FOUND', 'Address was not found.');
    }
  }

  async submitApplication(applicantId: string, input: ApplicationInput) {
    const result = await this.repository.submitApplication(applicantId, input);
    if (result.conflict)
      throw new AppError(
        409,
        'APPLICATION_CONFLICT',
        'A pending or active vendor application already exists.',
      );
    return result.application;
  }

  getMyApplication(applicantId: string) {
    return this.repository.getMyApplication(applicantId);
  }

  listApplications(
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | undefined,
    skip: number,
    take: number,
  ) {
    return this.repository.listApplications(status, skip, take);
  }

  async getApplication(applicationId: string) {
    const application = await this.repository.getApplication(applicationId);
    if (!application) throw new AppError(404, 'NOT_FOUND', 'Vendor application was not found.');
    return application;
  }

  async decideApplication(input: {
    applicationId: string;
    reviewerId: string;
    decision: 'APPROVED' | 'REJECTED';
    reason: string;
  }) {
    const result = await this.repository.decideApplication(input);
    if (!result)
      throw new AppError(
        409,
        'APPLICATION_NOT_PENDING',
        'Only pending applications can be decided.',
      );
    return result;
  }

  async suspendVendor(input: { vendorId: string; reviewerId: string; reason: string }) {
    const vendor = await this.repository.suspendVendor(input);
    if (!vendor)
      throw new AppError(409, 'VENDOR_NOT_ACTIVE', 'Only approved vendors can be suspended.');
    return vendor;
  }

  async getVendor(ownerId: string) {
    const vendor = await this.repository.getVendorByOwner(ownerId);
    if (!vendor || vendor.status !== 'APPROVED')
      throw new AppError(404, 'NOT_FOUND', 'Approved vendor profile was not found.');
    return vendor;
  }

  async updateVendor(ownerId: string, input: { name?: string; description?: string | null }) {
    const vendor = await this.repository.updateVendor(ownerId, input);
    if (!vendor) throw new AppError(404, 'NOT_FOUND', 'Approved vendor profile was not found.');
    return vendor;
  }
}

function isMissingRecord(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2025';
}
