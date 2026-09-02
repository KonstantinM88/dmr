import { defineRouting } from 'next-intl/routing';

/**
 * Локали DMR (docs/localization.md).
 * Публично включены `de` и `ru`; fallback остаётся немецким.
 * Инфраструктура готова к добавлению `en` без изменения схемы данных.
 */
export const locales = ['de', 'ru'] as const;
export type AppLocale = (typeof locales)[number];

export const defaultLocale: AppLocale = 'de';

/** Локали, планируемые к включению. Используется в тестах fallback. */
export const plannedLocales = ['en'] as const;

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'always',
  localeCookie: {
    name: 'dmr_locale',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  },
});

export function isSupportedLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value);
}
