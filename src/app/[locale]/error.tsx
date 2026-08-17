'use client';

import { useTranslations } from 'next-intl';

export default function ErrorBoundary({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('common');

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <p className="eyebrow">Fehler</p>
      <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl">{t('errorTitle')}</h1>
      <p className="mt-3 text-[var(--color-paper-dim)]">{t('errorBody')}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 self-start rounded-full border border-[var(--color-brass-dim)] px-5 py-2 text-sm text-[var(--color-brass)]"
      >
        {t('retry')}
      </button>
    </main>
  );
}
