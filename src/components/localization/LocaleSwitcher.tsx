'use client';

import { useTransition } from 'react';
import { useLocale } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { locales, type AppLocale } from '@/i18n/routing';

const LOCALE_LABELS: Record<AppLocale, string> = {
  de: 'DE',
  ru: 'RU',
};

export function LocaleSwitcher(props: { label: string }) {
  const locale = useLocale() as AppLocale;
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const switchTo = (nextLocale: AppLocale) => {
    if (nextLocale === locale) return;

    const segments = pathname.split('/');
    segments[1] = nextLocale;
    const nextPath = `${segments.join('/')}${window.location.search}${window.location.hash}`;

    startTransition(() => router.replace(nextPath));
  };

  return (
    <nav aria-label={props.label} className="flex items-center gap-1">
      {locales.map((candidate) => (
        <button
          key={candidate}
          type="button"
          disabled={pending}
          aria-current={candidate === locale ? 'true' : undefined}
          onClick={() => switchTo(candidate)}
          className={
            candidate === locale
              ? 'rounded-full bg-[var(--color-brass)] px-3 py-1 font-[family-name:var(--font-mono)] text-xs text-[var(--color-ink-950)]'
              : 'rounded-full border border-[var(--color-ink-700)] px-3 py-1 font-[family-name:var(--font-mono)] text-xs text-[var(--color-paper-dim)]'
          }
        >
          {LOCALE_LABELS[candidate]}
        </button>
      ))}
    </nav>
  );
}
