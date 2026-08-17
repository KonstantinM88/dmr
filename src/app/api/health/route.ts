import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Liveness: процесс жив. Без обращения к БД, быстрый ответ
 * (docs/hostinger-deployment.md §4).
 */
export function GET() {
  return NextResponse.json({ status: 'ok', at: new Date().toISOString() });
}
