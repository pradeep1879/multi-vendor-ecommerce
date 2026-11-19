import { getPrismaClient } from '../../infrastructure/database/client.js';

export class AccountsRepository {
  private readonly prisma = getPrismaClient;

  listCustomers(skip: number, take: number) {
    return this.prisma().user.findMany({
      where: {
        roles: {
          some: { role: 'CUSTOMER' },
          none: { role: { in: ['ADMIN', 'VENDOR'] } },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        disabledAt: true,
        createdAt: true,
        _count: { select: { orders: true } },
      },
    });
  }

  countCustomers() {
    return this.prisma().user.count({
      where: {
        roles: {
          some: { role: 'CUSTOMER' },
          none: { role: { in: ['ADMIN', 'VENDOR'] } },
        },
      },
    });
  }

  async setCustomerDisabled(input: { userId: string; disabled: boolean; actorId: string }) {
    return this.prisma().$transaction(async (tx) => {
      const customer = await tx.user.findFirst({
        where: {
          id: input.userId,
          roles: {
            some: { role: 'CUSTOMER' },
            none: { role: { in: ['ADMIN', 'VENDOR'] } },
          },
        },
        select: { id: true },
      });
      if (!customer) return undefined;
      const updated = await tx.user.update({
        where: { id: input.userId },
        data: { disabledAt: input.disabled ? new Date() : null },
        select: { id: true, email: true, name: true, disabledAt: true },
      });
      if (input.disabled)
        await tx.session.updateMany({
          where: { userId: input.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          action: input.disabled ? 'customer.disable' : 'customer.enable',
          targetType: 'user',
          targetId: input.userId,
        },
      });
      return updated;
    });
  }

  getProfile(userId: string) {
    return this.prisma().user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        roles: { select: { role: true } },
        emailVerifiedAt: true,
        createdAt: true,
      },
    });
  }

  updateProfile(userId: string, data: { name?: string; phone?: string | null }) {
    return this.prisma().user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        roles: { select: { role: true } },
        emailVerifiedAt: true,
        createdAt: true,
      },
    });
  }

  listAddresses(userId: string) {
    return this.prisma().address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  createAddress(userId: string, data: AddressInput) {
    return this.prisma().$transaction(async (tx) => {
      if (data.isDefault)
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.address.create({ data: { ...data, userId } });
    });
  }

  updateAddress(userId: string, addressId: string, data: Partial<AddressInput>) {
    return this.prisma().$transaction(async (tx) => {
      const address = await tx.address.findFirst({
        where: { id: addressId, userId },
        select: { id: true },
      });
      if (!address) return undefined;
      if (data.isDefault)
        await tx.address.updateMany({
          where: { userId, id: { not: addressId } },
          data: { isDefault: false },
        });
      return tx.address.update({ where: { id: addressId }, data });
    });
  }

  async deleteAddress(userId: string, addressId: string): Promise<boolean> {
    const result = await this.prisma().address.deleteMany({ where: { id: addressId, userId } });
    return result.count === 1;
  }

  submitApplication(applicantId: string, data: ApplicationInput) {
    return this.prisma().$transaction(async (tx) => {
      const existingVendor = await tx.vendor.findUnique({ where: { ownerId: applicantId } });
      if (existingVendor && existingVendor.status !== 'REJECTED')
        return { conflict: true as const };
      const pending = await tx.vendorApplication.findFirst({
        where: { applicantId, status: 'PENDING' },
      });
      if (pending) return { conflict: true as const };
      const application = await tx.vendorApplication.create({
        data: { applicantId, ...data },
      });
      await tx.auditLog.create({
        data: {
          actorId: applicantId,
          action: 'vendor.application.submit',
          targetType: 'vendor_application',
          targetId: application.id,
        },
      });
      return { conflict: false as const, application };
    });
  }

  getMyApplication(applicantId: string) {
    return this.prisma().vendorApplication.findFirst({
      where: { applicantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        businessName: true,
        legalName: true,
        contactEmail: true,
        contactPhone: true,
        status: true,
        revision: true,
        decisionReason: true,
        reviewedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  listApplications(
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | undefined,
    skip: number,
    take: number,
  ) {
    const where = status ? { status } : undefined;
    return this.prisma().$transaction([
      this.prisma().vendorApplication.findMany({
        where,
        skip,
        take,
        orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
        include: {
          applicant: { select: { id: true, email: true, name: true } },
          reviewer: { select: { id: true, name: true } },
          vendor: true,
        },
      }),
      this.prisma().vendorApplication.count({ where }),
    ]);
  }

  getApplication(applicationId: string) {
    return this.prisma().vendorApplication.findUnique({
      where: { id: applicationId },
      include: {
        applicant: { select: { id: true, email: true, name: true } },
        reviewer: { select: { id: true, name: true } },
        vendor: true,
      },
    });
  }

  decideApplication(input: {
    applicationId: string;
    reviewerId: string;
    decision: 'APPROVED' | 'REJECTED';
    reason: string;
  }) {
    return this.prisma().$transaction(async (tx) => {
      const application = await tx.vendorApplication.findUnique({
        where: { id: input.applicationId },
      });
      if (!application || application.status !== 'PENDING') return undefined;
      const updated = await tx.vendorApplication.update({
        where: { id: application.id },
        data: {
          status: input.decision,
          reviewerId: input.reviewerId,
          reviewedAt: new Date(),
          decisionReason: input.reason,
        },
      });
      let vendor = null;
      if (input.decision === 'APPROVED') {
        const slugBase =
          application.businessName
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 180) || 'vendor';
        vendor = await tx.vendor.create({
          data: {
            ownerId: application.applicantId,
            applicationId: application.id,
            name: application.businessName,
            slug: `${slugBase}-${application.id.slice(0, 8)}`,
            status: 'APPROVED',
            approvedAt: new Date(),
          },
        });
        await tx.userRole.upsert({
          where: { userId_role: { userId: application.applicantId, role: 'VENDOR' } },
          create: { userId: application.applicantId, role: 'VENDOR' },
          update: {},
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: input.reviewerId,
          action: `vendor.application.${input.decision.toLowerCase()}`,
          targetType: 'vendor_application',
          targetId: application.id,
          reason: input.reason,
        },
      });
      return { application: updated, vendor };
    });
  }

  suspendVendor(input: { vendorId: string; reviewerId: string; reason: string }) {
    return this.prisma().$transaction(async (tx) => {
      const vendor = await tx.vendor.findUnique({ where: { id: input.vendorId } });
      if (!vendor || vendor.status !== 'APPROVED') return undefined;
      const updated = await tx.vendor.update({
        where: { id: vendor.id },
        data: { status: 'SUSPENDED', suspendedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: input.reviewerId,
          action: 'vendor.suspend',
          targetType: 'vendor',
          targetId: vendor.id,
          reason: input.reason,
        },
      });
      return updated;
    });
  }

  getVendorByOwner(ownerId: string) {
    return this.prisma().vendor.findUnique({ where: { ownerId } });
  }

  updateVendor(ownerId: string, data: { name?: string; description?: string | null }) {
    return this.prisma().$transaction(async (tx) => {
      const vendor = await tx.vendor.findUnique({ where: { ownerId } });
      if (!vendor || vendor.status !== 'APPROVED') return undefined;
      const updated = await tx.vendor.update({ where: { id: vendor.id }, data });
      await tx.auditLog.create({
        data: {
          actorId: ownerId,
          action: 'vendor.profile.update',
          targetType: 'vendor',
          targetId: vendor.id,
        },
      });
      return updated;
    });
  }
}

export type AddressInput = {
  type: 'SHIPPING' | 'BILLING' | 'BOTH';
  recipient: string;
  phone?: string | null;
  line1: string;
  line2?: string | null;
  locality?: string | null;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
  isDefault: boolean;
};

export type ApplicationInput = {
  businessName: string;
  legalName: string;
  contactEmail: string;
  contactPhone: string;
};
