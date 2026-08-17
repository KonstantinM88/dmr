import { getTranslations } from 'next-intl/server';

export default async function NotFound() {
  const t = await getTranslations('common');

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <p className="eyebrow">404</p>
      <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl">{t('notFoundTitle')}</h1>
      <p className="mt-3 text-[var(--color-paper-dim)]">{t('notFoundBody')}</p>
    </main>
  );
}
