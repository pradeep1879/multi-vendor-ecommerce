import { createClient } from 'redis';
import type { Environment } from '../../config/env';

export type CachedCart = {
  updatedAt: string;
  items: Array<{ id: string; productId: string; variantId: string; quantity: number }>;
};
const cacheInstances = new Set<CartCache>();

export class CartCache {
  private client: ReturnType<typeof createClient> | undefined;
  constructor(private readonly environment: Environment) {
    cacheInstances.add(this);
  }

  async get(userId: string, updatedAt: Date): Promise<CachedCart | null> {
    if (!this.environment.redisUrl) return null;
    try {
      const client = await this.connection();
      const encoded = await client.get(this.key(userId));
      if (!encoded) return null;
      const value = JSON.parse(encoded) as CachedCart;
      if (
        value.updatedAt !== updatedAt.toISOString() ||
        !Array.isArray(value.items) ||
        !value.items.every(
          (item) =>
            typeof item.id === 'string' &&
            typeof item.productId === 'string' &&
            typeof item.variantId === 'string' &&
            Number.isInteger(item.quantity) &&
            item.quantity > 0,
        )
      )
        return null;
      return value;
    } catch {
      return null;
    }
  }

  async set(userId: string, value: CachedCart): Promise<void> {
    if (!this.environment.redisUrl) return;
    try {
      const client = await this.connection();
      await client.set(this.key(userId), JSON.stringify(value), {
        EX: this.environment.redisCartTtlSeconds,
      });
    } catch {
      // PostgreSQL stays authoritative; Redis cache failure must not fail cart writes.
    }
  }

  async invalidate(userId: string): Promise<void> {
    if (!this.environment.redisUrl) return;
    try {
      await (await this.connection()).del(this.key(userId));
    } catch {
      /* Cache miss on next read is safe. */
    }
  }

  async ping(): Promise<boolean> {
    if (!this.environment.redisUrl) return false;
    try {
      return (await (await this.connection()).ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.client?.isOpen) await this.client.quit().catch(() => undefined);
    this.client = undefined;
    cacheInstances.delete(this);
  }

  private key(userId: string): string {
    return `marketplace:cart:${userId}`;
  }

  private async connection() {
    if (!this.environment.redisUrl) throw new Error('REDIS_URL is not configured.');
    if (!this.client) {
      this.client = createClient({
        url: this.environment.redisUrl,
        socket: { connectTimeout: 1000, reconnectStrategy: () => false },
      });
      this.client.on('error', () => undefined);
    }
    if (!this.client.isOpen) await this.client.connect();
    return this.client;
  }
}

export async function closeCartCaches(): Promise<void> {
  await Promise.all([...cacheInstances].map((cache) => cache.close()));
}
