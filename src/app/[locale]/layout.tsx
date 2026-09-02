import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { Bricolage_Grotesque, Karla, IBM_Plex_Mono } from 'next/font/google';
import { locales, isSupportedLocale } from '@/i18n/routing';
import { LocaleSwitcher } from '@/components/localization/LocaleSwitcher';
import '@/app/globals.css';

const display = Bricolage_Grotesque({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-bricolage',
  display: 'swap',
});

const body = Karla({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-karla',
  display: 'swap',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: 'common' });

  return {
    title: { default: t('appName'), template: `%s · ${t('appName')}` },
    robots: { index: false, follow: false },
  };
}

export default async function LocaleLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  if (!isSupportedLocale(locale)) notFound();

  setRequestLocale(locale);
  const [messages, tCommon] = await Promise.all([
    getMessages(),
    getTranslations('common'),
  ]);

  return (
    <html lang={locale} className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="min-h-dvh antialiased">
        <NextIntlClientProvider messages={messages}>
          <div className="mx-auto flex w-full max-w-4xl justify-end px-5 pt-3">
            <LocaleSwitcher label={tCommon('language')} />
          </div>
          {props.children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
