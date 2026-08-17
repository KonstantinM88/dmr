import { cookies } from 'next/headers';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getPublishedMenu } from '@/domains/menu/server/menu.queries';
import { resolveTableByToken } from '@/domains/tables/server/table.service';
import { MenuItemCard } from '@/components/menu/MenuItemCard';
import { DEFAULT_VENUE_SLUG, TABLE_TOKEN_COOKIE } from '@/lib/venue';

/**
 * Публичное меню (Server Component).
 * Динамический рендер, потому что страница читает cookie стола. Кэширование
 * самого каталога по revalidateTag включается вместе с admin-мутациями меню
 * (docs/architecture.md §10).
 */
export const dynamic = 'force-dynamic';

export default async function MenuPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ table?: string }>;
}) {
  const { locale } = await props.params;
  const { table: tableFlag } = await props.searchParams;
  setRequestLocale(locale);

  const t = await getTranslations('menu');
  const tCommon = await getTranslations('common');
  const tTable = await getTranslations('table');

  const cookieStore = await cookies();
  const tableToken = cookieStore.get(TABLE_TOKEN_COOKIE)?.value;
  const table = tableToken ? await resolveTableByToken(tableToken) : null;

  const menu = await getPublishedMenu(DEFAULT_VENUE_SLUG, locale);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pb-24 pt-10">
      <header className="border-b border-[var(--color-ink-800)] pb-6">
        <p className="eyebrow">{menu?.venueName ?? tCommon('appName')}</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl leading-none tracking-tight">
          {t('title')}
        </h1>
        <p className="mt-3 text-sm text-[var(--color-paper-dim)]">{t('subtitle')}</p>

        {table && (
          <p className="mt-5 inline-flex items-center rounded-full border border-[var(--color-brass-dim)] px-3 py-1 font-[family-name:var(--font-mono)] text-xs text-[var(--color-brass)]">
            {tTable('label', { label: table.label })}
          </p>
        )}

        {tableFlag === 'invalid' && (
          <div className="mt-5 rounded-[var(--radius-card)] border border-[var(--color-clay)]/40 bg-[var(--color-clay)]/10 p-4">
            <p className="text-sm text-[var(--color-clay)]">{tTable('invalidToken')}</p>
            <p className="mt-1 text-xs text-[var(--color-paper-dim)]">{tTable('invalidTokenBody')}</p>
          </div>
        )}
      </header>

      {!menu || menu.categories.length === 0 ? (
        <p className="py-16 text-center text-sm text-[var(--color-paper-dim)]">{t('empty')}</p>
      ) : (
        menu.categories.map((category) => (
          <section key={category.id} className="pt-10" aria-labelledby={`cat-${category.id}`}>
            <h2
              id={`cat-${category.id}`}
              className="eyebrow border-b border-[var(--color-brass-dim)] pb-2"
            >
              {category.title}
            </h2>

            {category.description && (
              <p className="pt-3 text-sm text-[var(--color-paper-dim)]">{category.description}</p>
            )}

            {category.items.length === 0 ? (
              <p className="py-6 text-sm text-[var(--color-paper-faint)]">{t('categoryEmpty')}</p>
            ) : (
              <div className="pt-2">
                {category.items.map((item) => (
                  <MenuItemCard
                    key={item.id}
                    item={item}
                    locale={locale}
                    currency={menu.currency}
                  />
                ))}
              </div>
            )}
          </section>
        ))
      )}

      <footer className="mt-14 border-t border-[var(--color-ink-800)] pt-6">
        <p className="text-xs leading-relaxed text-[var(--color-paper-faint)]">
          {t('allergenDisclaimer')}
        </p>
      </footer>
    </main>
  );
}
