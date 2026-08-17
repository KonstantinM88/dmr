import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { defaultLocale, isSupportedLocale } from '@/i18n/routing';
import { resolveTableByToken } from '@/domains/tables/server/table.service';
import { TABLE_TOKEN_COOKIE } from '@/lib/venue';
import { checkRateLimit } from '@/lib/rate-limit';
import { getEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * Вход по QR-коду: нейтральный к языку URL (docs/localization.md §2).
 *
 *  1. Проверяет rate limit по IP — защита от перебора токенов.
 *  2. Разрешает стол по opaque токену.
 *  3. Ставит HttpOnly-cookie со ссылкой на стол.
 *  4. Редиректит на сохранённый язык участника, иначе на `de`.
 *
 * Редирект только на внутренний путь: никакого `next=` из query
 * (docs/security-threat-model.md §2, «Открытая переадресация»).
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const env = getEnv();
  const { token } = await context.params;

  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const limit = checkRateLimit(`qr:${clientIp}`, 30, 60_000);
  if (!limit.allowed) {
    return new NextResponse('Too Many Requests', { status: 429 });
  }

  const table = await resolveTableByToken(token);
  const cookieStore = await cookies();

  const savedLocale = cookieStore.get('dmr_locale')?.value;
  const locale = savedLocale && isSupportedLocale(savedLocale) ? savedLocale : defaultLocale;

  if (!table) {
    cookieStore.delete(TABLE_TOKEN_COOKIE);
    return NextResponse.redirect(new URL(`/${locale}?table=invalid`, request.url));
  }

  cookieStore.set(TABLE_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8,
  });

  return NextResponse.redirect(new URL(`/${locale}`, request.url));
}
