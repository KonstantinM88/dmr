import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requirePermission } from '@/domains/staff/server/rbac';
import { getMenuOverview } from '@/domains/menu/server/menu.queries';
import { formatCents } from '@/lib/money';
import { DEFAULT_VENUE_SLUG } from '@/lib/venue';

export const dynamic = 'force-dynamic';

/**
 * Обзор меню для персонала. Этап 1 — только чтение: редактирование
 * категорий/позиций/цен добавляется вместе с server actions и инвалидацией
 * кэша меню.
 */
export default async function AdminMenuPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  await requirePermission('MANAGE_MENU');

  const t = await getTranslations('admin');
  const categories = await getMenuOverview(DEFAULT_VENUE_SLUG, locale);

  if (categories.length === 0) {
    return <p className="pt-10 text-sm text-[var(--color-paper-dim)]">{t('emptyMenu')}</p>;
  }

  return (
    <div className="pt-8">
      {categories.map((category) => (
        <section key={category.id} className="pb-8">
          <div className="flex items-baseline gap-3 border-b border-[var(--color-ink-800)] pb-2">
            <h2 className="font-[family-name:var(--font-display)] text-xl">{category.title}</h2>
            <span className="eyebrow">
              {category.isPublished ? t('published') : t('unpublished')}
            </span>
          </div>

          <ul className="divide-y divide-[var(--color-ink-800)]">
            {category.items.map((item) => (
              <li key={item.id} className="flex items-baseline gap-3 py-3">
                <span className="flex-1">{item.name}</span>
                {!item.isAvailable && (
                  <span className="text-xs text-[var(--color-clay)]">{t('soldOut')}</span>
                )}
                {item.stationName && (
                  <span className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-paper-faint)]">
                    {item.stationName}
                  </span>
                )}
                {item.taxRateBasisPoints !== null && (
                  <span className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-paper-faint)]">
                    {(item.taxRateBasisPoints / 100).toFixed(0)} %
                  </span>
                )}
                <span className="font-[family-name:var(--font-mono)] text-sm text-[var(--color-brass)]">
                  {formatCents(item.basePriceCents, locale)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
