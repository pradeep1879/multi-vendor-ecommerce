import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import { AppError } from '../../common/errors/app-error.js';

const claimsSchema = z.object({
  sub: z.uuid(),
  sid: z.uuid(),
});

export type AccessClaims = { userId: string; sessionId: string };

export class AccessTokens {
  private readonly key?: Uint8Array;

  constructor(
    secret: string | undefined,
    private readonly ttlSeconds: number,
  ) {
    if (secret && secret.length >= 32) this.key = new TextEncoder().encode(secret);
  }

  assertConfigured(): void {
    if (!this.key) {
      throw new AppError(503, 'AUTH_UNAVAILABLE', 'Authentication is not configured.');
    }
  }

  async sign(userId: string, sessionId: string): Promise<string> {
    this.assertConfigured();
    return new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer('marketplace-api')
      .setAudience('marketplace-client')
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(`${this.ttlSeconds}s`)
      .sign(this.key!);
  }

  async verify(token: string): Promise<AccessClaims> {
    this.assertConfigured();
    try {
      const { payload } = await jwtVerify(token, this.key!, {
        algorithms: ['HS256'],
        issuer: 'marketplace-api',
        audience: 'marketplace-client',
      });
      const parsed = claimsSchema.safeParse({ sub: payload.sub, sid: payload.sid });
      if (!parsed.success) throw new Error('Invalid claims');
      return { userId: parsed.data.sub, sessionId: parsed.data.sid };
    } catch {
      throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
    }
  }
}
