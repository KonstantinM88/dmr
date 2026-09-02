import { NextResponse } from 'next/server';
import { getActiveTableTokenForDevelopment } from '@/domains/tables/server/table.service';
import { PARTICIPANT_COOKIE } from '@/domains/sessions/server/participant.service';
import { DEFAULT_VENUE_SLUG } from '@/lib/venue';

const DEVELOPMENT_TABLE_LABEL = '1';
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

/**
 * Локальный симулятор QR-сканирования для стола 1.
 * В production маршрут закрыт до обращения к БД и отвечает как несуществующий.
 */
export async function GET(request: Request): Promise<Response> {
  if (process.env.NODE_ENV !== 'development') {
    return new Response(null, { status: 404, headers: NO_STORE_HEADERS });
  }

  const token = await getActiveTableTokenForDevelopment(
    DEFAULT_VENUE_SLUG,
    DEVELOPMENT_TABLE_LABEL,
  );

  if (!token) {
    return Response.json(
      { error: 'No active QR token is available for development table 1.' },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  const response = new NextResponse(null, {
    status: 307,
    headers: {
      ...NO_STORE_HEADERS,
      Location: new URL(`/t/${encodeURIComponent(token)}`, request.url).toString(),
    },
  });

  // Каждый локальный QR-smoke имитирует новое гостевое устройство. Старый
  // participant-token намеренно отзывается только в browser cookie; история
  // прошлой сессии в БД остаётся неизменной.
  response.cookies.set(PARTICIPANT_COOKIE, '', {
    expires: new Date(0),
    path: '/',
    sameSite: 'lax',
  });

  return response;
}
