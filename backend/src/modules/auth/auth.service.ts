import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { AppError } from '../../common/errors/app-error.js';
import type { Environment } from '../../config/env.js';
import { AuthRepository, type SessionSeed } from './auth.repository.js';
import { AccessTokens } from './access-tokens.js';
import { AuthEmailSender, type EmailSender } from './email.adapter.js';

type AuthUser = {
  id: string;
  email: string;
  name: string;
  disabledAt: Date | null;
  roles: { role: 'CUSTOMER' | 'VENDOR' | 'ADMIN' }[];
  vendor?: { status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' } | null;
};

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  roles: string[];
  vendorStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
};
export type GoogleIdTokenVerifier = (token: string, audience: string) => Promise<JWTPayload>;

const verifyGoogleIdToken: GoogleIdTokenVerifier = async (token, audience) => {
  const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
  const { payload } = await jwtVerify(token, jwks, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience,
  });
  return payload;
};
export type AuthResult = {
  user: PublicUser;
  accessToken: string;
  expiresInSeconds: number;
  refreshToken: string;
};

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

function publicUser(user: AuthUser): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    roles: user.roles.map(({ role }) => role),
    ...(user.vendor ? { vendorStatus: user.vendor.status } : {}),
  };
}

export class AuthService {
  private readonly tokens: AccessTokens;
  private readonly emailSender: EmailSender;
  private dummyPasswordHash?: Promise<string>;

  constructor(
    private readonly environment: Environment,
    private readonly repository = new AuthRepository(),
    emailSender: EmailSender = new AuthEmailSender(environment),
    private readonly googleIdTokenVerifier: GoogleIdTokenVerifier = verifyGoogleIdToken,
  ) {
    this.tokens = new AccessTokens(environment.jwtAccessSecret, environment.accessTokenTtlSeconds);
    this.emailSender = emailSender;
  }

  async register(input: { email: string; password: string; name: string }): Promise<AuthResult> {
    this.tokens.assertConfigured();
    const email = input.email.trim().toLowerCase();
    const refresh = this.createRefreshSession();
    const existing = await this.repository.findUserByEmail(email);
    if (existing) {
      const passwordMatches = existing.passwordHash
        ? await Bun.password.verify(input.password, existing.passwordHash)
        : false;
      if (existing.disabledAt || !passwordMatches) {
        throw new AppError(
          409,
          'EMAIL_ALREADY_REGISTERED',
          'An account already exists for this email.',
        );
      }
      if (existing.roles.some(({ role }) => role === 'CUSTOMER')) {
        throw new AppError(
          409,
          'EMAIL_ALREADY_REGISTERED',
          'An account already exists for this email.',
        );
      }
      const linked = await this.repository.addCustomerRole(existing.id, refresh.session);
      if (linked.conflict) {
        throw new AppError(
          409,
          'EMAIL_ALREADY_REGISTERED',
          'An account already exists for this email.',
        );
      }
      return this.createAuthResult(linked.user, linked.sessionId, refresh.refreshToken);
    }
    const passwordHash = await Bun.password.hash(input.password, {
      algorithm: 'argon2id',
      memoryCost: 65536,
      timeCost: 3,
    });
    try {
      const account = await this.repository.createCustomerAccount({
        email,
        normalizedEmail: email,
        name: input.name.trim(),
        passwordHash,
        session: refresh.session,
      });
      return this.createAuthResult(account.user, account.sessionId, refresh.refreshToken);
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) {
        throw new AppError(
          409,
          'EMAIL_ALREADY_REGISTERED',
          'An account already exists for this email.',
        );
      }
      throw error;
    }
  }

  async switchRole(userId: string, role: 'CUSTOMER' | 'VENDOR' | 'ADMIN') {
    const user = await this.repository.findUserRolesAndVendorStatus(userId);
    if (!user || user.disabledAt)
      throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
    if (!user.roles.some((assigned) => assigned.role === role))
      throw new AppError(403, 'ROLE_NOT_ASSIGNED', 'This role is not assigned to your account.');
    if (role === 'VENDOR' && !user.vendor)
      throw new AppError(403, 'VENDOR_PROFILE_REQUIRED', 'A vendor profile is not available.');
    return { role, ...(role === 'VENDOR' ? { vendorStatus: user.vendor?.status } : {}) };
  }

  async login(input: { email: string; password: string }): Promise<AuthResult> {
    this.tokens.assertConfigured();
    const email = input.email.trim().toLowerCase();
    const user = await this.repository.findUserByEmail(email);
    const passwordHash = user?.passwordHash ?? (await this.getDummyPasswordHash());
    const matches = user?.passwordHash
      ? await Bun.password.verify(input.password, passwordHash)
      : false;
    if (!user || !matches || user.disabledAt) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }
    const refresh = this.createRefreshSession();
    const session = await this.repository.createSession(user.id, refresh.session);
    return this.createAuthResult(user, session.id, refresh.refreshToken);
  }

  async loginWithGoogle(idToken: string): Promise<AuthResult> {
    this.tokens.assertConfigured();
    if (!this.environment.googleClientId)
      throw new AppError(503, 'GOOGLE_AUTH_UNAVAILABLE', 'Google sign-in is not configured.');
    let claims: JWTPayload;
    try {
      claims = await this.googleIdTokenVerifier(idToken, this.environment.googleClientId);
    } catch {
      throw new AppError(401, 'INVALID_GOOGLE_TOKEN', 'Google identity could not be verified.');
    }
    if (
      typeof claims.sub !== 'string' ||
      typeof claims.email !== 'string' ||
      claims.email_verified !== true
    ) {
      throw new AppError(
        401,
        'INVALID_GOOGLE_IDENTITY',
        'Google identity is missing verified claims.',
      );
    }
    const email = claims.email.trim().toLowerCase();
    const identity = await this.repository.findGoogleIdentity(claims.sub);
    if (identity?.user.disabledAt)
      throw new AppError(403, 'ACCOUNT_DISABLED', 'This account is disabled.');
    const existing = identity ? null : await this.repository.findUserForGoogleLink(email);
    if (existing?.disabledAt)
      throw new AppError(403, 'ACCOUNT_DISABLED', 'This account is disabled.');
    if (existing && !existing.emailVerifiedAt)
      throw new AppError(
        409,
        'ACCOUNT_LINK_REQUIRES_VERIFICATION',
        'Verify the existing account email before linking Google sign-in.',
      );
    const refresh = this.createRefreshSession();
    try {
      const account = await this.repository.createGoogleSession({
        ...(existing ? { userId: existing.id } : {}),
        providerSubject: claims.sub,
        email,
        name:
          typeof claims.name === 'string' && claims.name.trim()
            ? claims.name.trim().slice(0, 160)
            : email,
        session: refresh.session,
      });
      return this.createAuthResult(account.user, account.sessionId, refresh.refreshToken);
    } catch (error: unknown) {
      if (isUniqueConstraintError(error))
        throw new AppError(
          409,
          'IDENTITY_ALREADY_LINKED',
          'This Google identity is already linked to another account.',
        );
      throw error;
    }
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    this.tokens.assertConfigured();
    const session = await this.repository.findSessionByTokenHash(hashOpaqueToken(refreshToken));
    if (!session) throw this.invalidRefresh();

    const now = new Date();
    if (session.revokedAt) {
      await this.repository.revokeFamily(session.familyId, now);
      throw this.invalidRefresh();
    }
    if (session.expiresAt <= now || session.user.disabledAt) {
      await this.repository.revokeSession(session.id, now);
      throw this.invalidRefresh();
    }

    const next = this.createRefreshSession(session.familyId);
    const rotated = await this.repository.rotateSession({
      currentId: session.id,
      userId: session.userId,
      familyId: session.familyId,
      next: next.session,
      now,
    });
    if (!rotated) {
      await this.repository.revokeFamily(session.familyId, now);
      throw this.invalidRefresh();
    }
    return this.createAuthResult(rotated.user, rotated.sessionId, next.refreshToken);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const session = await this.repository.findSessionByTokenHash(hashOpaqueToken(refreshToken));
    if (session) await this.repository.revokeSession(session.id, new Date());
  }

  async logoutAll(userId: string): Promise<void> {
    await this.repository.revokeAllUserSessions(userId, new Date());
  }

  async authenticateAccessToken(token: string): Promise<{
    userId: string;
    sessionId: string;
    roles: string[];
    user: PublicUser;
  }> {
    const claims = await this.tokens.verify(token);
    const active = await this.repository.findActiveSession(
      claims.sessionId,
      claims.userId,
      new Date(),
    );
    if (!active) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
    return {
      userId: active.userId,
      sessionId: active.id,
      roles: active.user.roles.map(({ role }) => role),
      user: publicUser(active.user),
    };
  }

  async requestPasswordReset(emailInput: string): Promise<void> {
    const email = emailInput.trim().toLowerCase();
    const user = await this.repository.findUserForVerification(email);
    if (!user) return;
    await this.issueVerificationToken(
      user.id,
      user.email,
      'PASSWORD_RESET',
      this.environment.passwordResetTtlMinutes * 60_000,
    );
  }

  async confirmPasswordReset(token: string, newPassword: string): Promise<void> {
    const passwordHash = await Bun.password.hash(newPassword, {
      algorithm: 'argon2id',
      memoryCost: 65536,
      timeCost: 3,
    });
    const accepted = await this.repository.consumeVerificationToken({
      tokenHash: hashOpaqueToken(token),
      purpose: 'PASSWORD_RESET',
      now: new Date(),
      passwordHash,
    });
    if (!accepted)
      throw new AppError(400, 'INVALID_RESET_TOKEN', 'Password reset token is invalid or expired.');
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.repository.findPasswordHash(userId);
    if (!user?.passwordHash || !(await Bun.password.verify(currentPassword, user.passwordHash)))
      throw new AppError(400, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect.');
    const passwordHash = await Bun.password.hash(newPassword, {
      algorithm: 'argon2id',
      memoryCost: 65536,
      timeCost: 3,
    });
    await this.repository.changePassword(userId, passwordHash);
  }

  async requestEmailVerification(userId: string): Promise<void> {
    const user = await this.repository.findUserById(userId);
    if (!user) throw new AppError(404, 'NOT_FOUND', 'Account was not found.');
    await this.issueVerificationToken(user.id, user.email, 'EMAIL_VERIFICATION', 24 * 60 * 60_000);
  }

  async confirmEmailVerification(token: string): Promise<void> {
    const accepted = await this.repository.consumeVerificationToken({
      tokenHash: hashOpaqueToken(token),
      purpose: 'EMAIL_VERIFICATION',
      now: new Date(),
    });
    if (!accepted)
      throw new AppError(
        400,
        'INVALID_VERIFICATION_TOKEN',
        'Verification token is invalid or expired.',
      );
  }

  private createRefreshSession(familyId: string = randomUUID()): {
    session: SessionSeed;
    refreshToken: string;
  } {
    const refreshToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + this.environment.refreshTokenTtlDays * 24 * 60 * 60_000,
    );
    return {
      refreshToken,
      session: {
        id: randomUUID(),
        tokenHash: hashOpaqueToken(refreshToken),
        familyId,
        expiresAt,
      },
    };
  }

  private async createAuthResult(
    user: AuthUser,
    sessionId: string,
    refreshToken: string,
  ): Promise<AuthResult> {
    return {
      user: publicUser(user),
      accessToken: await this.tokens.sign(user.id, sessionId),
      expiresInSeconds: this.environment.accessTokenTtlSeconds,
      refreshToken,
    };
  }

  private async issueVerificationToken(
    userId: string,
    recipient: string,
    purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET',
    ttlMs: number,
  ): Promise<void> {
    const token = randomBytes(32).toString('base64url');
    await this.repository.createVerificationToken({
      userId,
      tokenHash: hashOpaqueToken(token),
      purpose,
      expiresAt: new Date(Date.now() + ttlMs),
    });
    await this.emailSender.send({ recipient, purpose, token });
  }

  private getDummyPasswordHash(): Promise<string> {
    this.dummyPasswordHash ??= Bun.password.hash('not-a-valid-user-password', {
      algorithm: 'argon2id',
      memoryCost: 65536,
      timeCost: 3,
    });
    return this.dummyPasswordHash;
  }

  private invalidRefresh(): AppError {
    return new AppError(401, 'INVALID_SESSION', 'Session is invalid or expired.');
  }
}
