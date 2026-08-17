import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * Readiness: проверка соединения с Neon (docs/hostinger-deployment.md §4).
 * Детали ошибки наружу не отдаются — только в лог.
 */
export async function GET() {
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: 'ready',
      database: 'up',
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    logger.error('Readiness check failed', { error: String(error) });
    return NextResponse.json({ status: 'degraded', database: 'down' }, { status: 503 });
  }
}
