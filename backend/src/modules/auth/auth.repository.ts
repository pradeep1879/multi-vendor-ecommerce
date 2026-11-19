import { getPrismaClient } from '../../infrastructure/database/client.js';

export type SessionSeed = {
  id: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
};

export class AuthRepository {
  private readonly prisma = getPrismaClient;

  findUserByEmail(normalizedEmail: string) {
    return this.prisma().user.findUnique({
      where: { normalizedEmail },
      include: { roles: true, vendor: { select: { status: true } } },
    });
  }

  findGoogleIdentity(providerSubject: string) {
    return this.prisma().externalIdentity.findUnique({
      where: { provider_providerSubject: { provider: 'GOOGLE', providerSubject } },
      include: { user: { include: { roles: true, vendor: { select: { status: true } } } } },
    });
  }

  findUserForGoogleLink(normalizedEmail: string) {
    return this.prisma().user.findUnique({
      where: { normalizedEmail },
      include: { roles: true, vendor: { select: { status: true } } },
    });
  }

  async createGoogleSession(input: {
    userId?: string;
    providerSubject: string;
    email: string;
    name: string;
    session: SessionSeed;
  }) {
    return this.prisma().$transaction(async (tx) => {
      const identity = await tx.externalIdentity.findUnique({
        where: {
          provider_providerSubject: { provider: 'GOOGLE', providerSubject: input.providerSubject },
        },
        include: { user: { include: { roles: true, vendor: { select: { status: true } } } } },
      });
      let user =
        identity?.user ??
        (input.userId
          ? await tx.user.findUniqueOrThrow({
              where: { id: input.userId },
              include: { roles: true, vendor: { select: { status: true } } },
            })
          : await tx.user.findUnique({
              where: { normalizedEmail: input.email },
              include: { roles: true, vendor: { select: { status: true } } },
            }));
      if (!user) {
        user = await tx.user.create({
          data: {
            email: input.email,
            normalizedEmail: input.email,
            name: input.name,
            passwordHash: null,
            emailVerifiedAt: new Date(),
            roles: { create: { role: 'CUSTOMER' } },
            customer: { create: {} },
          },
          include: { roles: true, vendor: { select: { status: true } } },
        });
      }
      if (user.disabledAt) throw new Error('Google account is disabled.');
      await tx.userRole.upsert({
        where: { userId_role: { userId: user.id, role: 'CUSTOMER' } },
        create: { userId: user.id, role: 'CUSTOMER' },
        update: {},
      });
      await tx.customer.upsert({
        where: { userId: user.id },
        create: { userId: user.id },
        update: {},
      });
      if (!identity)
        await tx.externalIdentity.create({
          data: {
            userId: user.id,
            provider: 'GOOGLE',
            providerSubject: input.providerSubject,
            emailAtLink: input.email,
          },
        });
      const session = await tx.session.create({ data: { userId: user.id, ...input.session } });
      user = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        include: { roles: true, vendor: { select: { status: true } } },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'auth.google.login',
          targetType: 'session',
          targetId: session.id,
        },
      });
      return { user, sessionId: session.id };
    });
  }

  createCustomerAccount(input: {
    email: string;
    normalizedEmail: string;
    name: string;
    passwordHash: string;
    session: SessionSeed;
  }) {
    return this.prisma().$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          normalizedEmail: input.normalizedEmail,
          name: input.name,
          passwordHash: input.passwordHash,
          roles: { create: { role: 'CUSTOMER' } },
          customer: { create: {} },
        },
      });
      const session = await tx.session.create({
        data: { userId: user.id, ...input.session },
      });
      const savedUser = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        include: { roles: true, vendor: { select: { status: true } } },
      });
      await tx.auditLog.create({
        data: { actorId: user.id, action: 'auth.register', targetType: 'user', targetId: user.id },
      });
      return { user: savedUser, sessionId: session.id };
    });
  }

  addCustomerRole(userId: string, sessionSeed: SessionSeed) {
    return this.prisma().$transaction(async (tx) => {
      const existingRole = await tx.userRole.findUnique({
        where: { userId_role: { userId, role: 'CUSTOMER' } },
        select: { id: true },
      });
      if (existingRole) return { conflict: true as const };
      await tx.userRole.create({ data: { userId, role: 'CUSTOMER' } });
      await tx.customer.upsert({ where: { userId }, create: { userId }, update: {} });
      const session = await tx.session.create({ data: { userId, ...sessionSeed } });
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        include: { roles: true, vendor: { select: { status: true } } },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'auth.role.add_customer',
          targetType: 'session',
          targetId: session.id,
        },
      });
      return { conflict: false as const, user, sessionId: session.id };
    });
  }

  findUserRolesAndVendorStatus(userId: string) {
    return this.prisma().user.findUnique({
      where: { id: userId },
      select: {
        disabledAt: true,
        roles: { select: { role: true } },
        vendor: { select: { status: true } },
      },
    });
  }

  createSession(userId: string, session: SessionSeed) {
    return this.prisma().$transaction(async (tx) => {
      const created = await tx.session.create({ data: { userId, ...session } });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'auth.login',
          targetType: 'session',
          targetId: created.id,
        },
      });
      return created;
    });
  }

  findSessionByTokenHash(tokenHash: string) {
    return this.prisma().session.findUnique({
      where: { tokenHash },
      include: { user: { include: { roles: true, vendor: { select: { status: true } } } } },
    });
  }

  async rotateSession(input: {
    currentId: string;
    userId: string;
    familyId: string;
    next: SessionSeed;
    now: Date;
  }) {
    return this.prisma().$transaction(async (tx) => {
      const changed = await tx.session.updateMany({
        where: {
          id: input.currentId,
          userId: input.userId,
          revokedAt: null,
          expiresAt: { gt: input.now },
        },
        data: { revokedAt: input.now },
      });
      if (changed.count !== 1) return undefined;
      const next = await tx.session.create({
        data: { userId: input.userId, ...input.next },
      });
      await tx.session.update({
        where: { id: input.currentId },
        data: { replacedBySessionId: next.id },
      });
      await tx.auditLog.create({
        data: {
          actorId: input.userId,
          action: 'auth.session.refresh',
          targetType: 'session',
          targetId: next.id,
        },
      });
      const user = await tx.user.findUniqueOrThrow({
        where: { id: input.userId },
        include: { roles: true, vendor: { select: { status: true } } },
      });
      return { user, sessionId: next.id };
    });
  }

  revokeSession(sessionId: string, at: Date) {
    return this.prisma().$transaction(async (tx) => {
      const session = await tx.session.findUnique({
        where: { id: sessionId },
        select: { userId: true },
      });
      const revoked = await tx.session.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: at },
      });
      if (session && revoked.count) {
        await tx.auditLog.create({
          data: {
            actorId: session.userId,
            action: 'auth.session.logout',
            targetType: 'session',
            targetId: sessionId,
          },
        });
      }
      return revoked;
    });
  }

  revokeFamily(familyId: string, at: Date) {
    return this.prisma().session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: at },
    });
  }

  revokeAllUserSessions(userId: string, at: Date) {
    return this.prisma().$transaction(async (tx) => {
      const revoked = await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: at },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'auth.session.logout_all',
          targetType: 'user',
          targetId: userId,
        },
      });
      return revoked;
    });
  }

  findActiveSession(sessionId: string, userId: string, now: Date) {
    return this.prisma().session.findFirst({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
        expiresAt: { gt: now },
        user: { disabledAt: null },
      },
      include: { user: { include: { roles: true, vendor: { select: { status: true } } } } },
    });
  }

  createVerificationToken(input: {
    userId: string;
    tokenHash: string;
    purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';
    expiresAt: Date;
  }) {
    return this.prisma().verificationToken.create({ data: input });
  }

  findUserForVerification(normalizedEmail: string) {
    return this.prisma().user.findUnique({
      where: { normalizedEmail },
      select: { id: true, email: true },
    });
  }

  findUserById(id: string) {
    return this.prisma().user.findUnique({ where: { id }, select: { id: true, email: true } });
  }

  findPasswordHash(userId: string) {
    return this.prisma().user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  }

  changePassword(userId: string, passwordHash: string) {
    return this.prisma().$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'auth.password.change',
          targetType: 'user',
          targetId: userId,
        },
      });
      await tx.accountNotification.create({
        data: {
          userId,
          type: 'SECURITY',
          title: 'Password changed',
          body: 'Your account password was changed. If this was not you, reset your password.',
          href: '/account/security',
        },
      });
    });
  }

  consumeVerificationToken(input: {
    tokenHash: string;
    purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';
    now: Date;
    passwordHash?: string;
  }) {
    return this.prisma().$transaction(async (tx) => {
      const token = await tx.verificationToken.findUnique({
        where: { tokenHash: input.tokenHash },
        select: { id: true, userId: true, purpose: true, consumedAt: true, expiresAt: true },
      });
      if (
        !token ||
        token.purpose !== input.purpose ||
        token.consumedAt ||
        token.expiresAt <= input.now
      ) {
        return false;
      }
      const consumed = await tx.verificationToken.updateMany({
        where: { id: token.id, consumedAt: null, expiresAt: { gt: input.now } },
        data: { consumedAt: input.now },
      });
      if (consumed.count !== 1) return false;

      if (input.purpose === 'EMAIL_VERIFICATION') {
        await tx.user.update({ where: { id: token.userId }, data: { emailVerifiedAt: input.now } });
      } else if (input.passwordHash) {
        await tx.user.update({
          where: { id: token.userId },
          data: { passwordHash: input.passwordHash },
        });
        await tx.session.updateMany({
          where: { userId: token.userId, revokedAt: null },
          data: { revokedAt: input.now },
        });
        await tx.auditLog.create({
          data: {
            actorId: token.userId,
            action: 'auth.password.reset',
            targetType: 'user',
            targetId: token.userId,
          },
        });
      } else {
        return false;
      }
      if (input.purpose === 'EMAIL_VERIFICATION') {
        await tx.auditLog.create({
          data: {
            actorId: token.userId,
            action: 'auth.email.verify',
            targetType: 'user',
            targetId: token.userId,
          },
        });
      }
      return true;
    });
  }
}
