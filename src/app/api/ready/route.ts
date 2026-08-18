import { NextResponse } from 'next/server';
import { checkDatabaseReadiness } from '@/domains/system/server/readiness.service';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * Readiness: проверка соединения с Neon (docs/hostinger-deployment.md §4).
 * Детали ошибки наружу не отдаются — только в лог.
 */
export async function GET() {
  const readiness = await checkDatabaseReadiness();

  if (readiness.ready) {
    return NextResponse.json({
      status: 'ready',
      database: 'up',
      latencyMs: readiness.latencyMs,
    });
  }

  logger.error('Readiness check failed', { error: String(readiness.error) });
  return NextResponse.json({ status: 'degraded', database: 'down' }, { status: 503 });
}
