import { defaultLocale, type AppLocale } from '@/i18n/routing';

export type MessageTree = { [key: string]: string | MessageTree };

/**
 * Загрузка каталога сообщений с гарантированным fallback на `de`
 * (docs/localization.md §1): отсутствующий ключ показывает немецкий текст,
 * а не пустую строку и не сам ключ.
 */
export function mergeWithFallback(fallback: MessageTree, override: MessageTree): MessageTree {
  const result: MessageTree = { ...fallback };

  for (const [key, value] of Object.entries(override)) {
    const base = result[key];
    if (typeof value === 'object' && typeof base === 'object') {
      result[key] = mergeWithFallback(base, value);
    } else if (typeof value === 'string' && value.trim() !== '') {
      result[key] = value;
    }
  }

  return result;
}

export async function loadMessages(locale: AppLocale | string): Promise<MessageTree> {
  const fallback = (await import('@/domains/localization/messages/de.json')).default as MessageTree;

  if (locale === defaultLocale) return fallback;

  try {
    const override = (await import(`@/domains/localization/messages/${locale}.json`))
      .default as MessageTree;
    return mergeWithFallback(fallback, override);
  } catch {
    return fallback;
  }
}
