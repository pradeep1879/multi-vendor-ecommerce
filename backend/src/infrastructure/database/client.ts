import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient as PrismaClientRuntime } from '../../prisma-client/client.runtime.js';
import type { PrismaClient } from '../../prisma-client/client.js';

let singleton: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  if (singleton) return singleton;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to connect to PostgreSQL.');
  }
  singleton = new PrismaClientRuntime({
    adapter: new PrismaPg({ connectionString }),
    // Neon can take several seconds to wake/acquire a pooled transaction.
    // Keep application transaction callbacks bounded but tolerate that cold start.
    transactionOptions: { maxWait: 10_000, timeout: 15_000 },
  }) as unknown as PrismaClient;
  return singleton;
}

export async function verifyDatabaseConnection(): Promise<void> {
  await getPrismaClient().$queryRaw`SELECT 1`;
}

export async function disconnectDatabase(): Promise<void> {
  if (!singleton) return;
  await singleton.$disconnect();
  singleton = undefined;
}
