import createIntlMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';

/**
 * Next.js 16 использует `proxy.ts` вместо прежнего `middleware.ts`.
 *
 * Из обработки исключены:
 *  - `/t/:token` — нейтральный к языку вход по QR, редирект делает сам route
 *    (docs/localization.md §2);
 *  - `/api/*` — health/ready/webhook не должны получать locale-префикс.
 */
export default createIntlMiddleware(routing);

export const config = {
  matcher: ['/((?!api|t/|_next|_vercel|.*\\..*).*)'],
};
