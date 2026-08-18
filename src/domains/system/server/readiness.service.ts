import 'server-only';
import { prisma } from '@/lib/prisma';

export type DatabaseReadiness =
  | { ready: true; latencyMs: number }
  | { ready: false; error: unknown };

/** Keeps infrastructure access behind the same domain-service boundary. */
export async function checkDatabaseReadiness(): Promise<DatabaseReadiness> {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ready: true, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return { ready: false, error };
  }
}
