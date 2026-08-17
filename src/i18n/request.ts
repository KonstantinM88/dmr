import { getRequestConfig } from 'next-intl/server';
import { defaultLocale, isSupportedLocale } from '@/i18n/routing';
import { loadMessages } from '@/domains/localization/shared/messages';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = requested && isSupportedLocale(requested) ? requested : defaultLocale;

  return {
    locale,
    messages: await loadMessages(locale),
    timeZone: 'Europe/Berlin',
    now: new Date(),
  };
});
