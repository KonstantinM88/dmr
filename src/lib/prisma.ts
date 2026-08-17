import 'server-only';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { getEnv } from '@/lib/env';

/**
 * Единственный PrismaClient на процесс (docs/architecture.md §5).
 * Runtime-запросы идут через Neon pooled DATABASE_URL; миграции используют
 * DIRECT_DATABASE_URL и выполняются Prisma CLI, а не этим клиентом.
 */
const globalForPrisma = globalThis as unknown as {
  dmrPrisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const env = getEnv();

  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    // Явный потолок пула: shared hosting + Neon, см. docs/scaling-thresholds.md.
    max: 10,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });

  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma: PrismaClient = globalForPrisma.dmrPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.dmrPrisma = prisma;
}
