import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { requirePermission } from '@/domains/staff/server/rbac';
import { getStaffPrincipal } from '@/domains/staff/server/session.service';
import { getMenuOverview } from '@/domains/menu/server/menu.queries';
import { DEFAULT_VENUE_SLUG } from '@/lib/venue';
import { MenuItemAdminCard } from '@/components/admin/MenuItemAdminCard';
import { ProductionSlaEditor } from '@/components/admin/ProductionSlaEditor';
import { getReadyHandoffSlaSettings } from '@/domains/production/server/production-sla.service';
import {
  setAvailabilityAction,
  updatePreparationSlaAction,
  updateReadyHandoffSlaAction,
} from './actions';

export const dynamic = 'force-dynamic';

/**
 * Рабочий каталог меню: rich-карточки и реальные production SLA.
 * CRUD категорий/позиций и media-upload добавляются отдельными потоками.
 */
export default async function AdminMenuPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  // Layout и page рендерятся параллельно: анонимный direct request должен
  // тихо уйти на login, а не оставить AuthenticationRequiredError в dev-log.
  const authenticatedPrincipal = await getStaffPrincipal();
  if (!authenticatedPrincipal) redirect(`/${locale}/anmelden`);
  const principal = await requirePermission('MANAGE_MENU');

  const t = await getTranslations('admin');
  const categories = await getMenuOverview(DEFAULT_VENUE_SLUG, locale);
  const canManageOperationalSettings = principal.permissions.includes(
    'MANAGE_OPERATIONAL_SETTINGS',
  );
  const readyHandoffSla = canManageOperationalSettings
    ? await getReadyHandoffSlaSettings(principal.venueId)
    : null;

  if (categories.length === 0) {
    return <p className="pt-10 text-sm text-[var(--color-paper-dim)]">{t('emptyMenu')}</p>;
  }

  return (
    <div className="pt-8">
      <div className="mb-8">
        <p className="eyebrow">{t('menuDashboardEyebrow')}</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl">
          {t('menuDashboardTitle')}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-paper-dim)]">
          {t('menuDashboardIntro')}
        </p>
      </div>

      {readyHandoffSla && (
        <section className="mb-10 rounded-[var(--radius-card)] border border-[var(--color-brass-dim)] bg-[var(--color-brass)]/5 p-5">
          <h2 className="font-[family-name:var(--font-display)] text-xl">
            {t('readyHandoffSlaTitle')}
          </h2>
          <p className="mt-2 text-sm text-[var(--color-paper-dim)]">
            {t('readyHandoffSlaIntro')}
          </p>
          <ProductionSlaEditor
            warningMinutes={readyHandoffSla.warningMinutes}
            criticalMinutes={readyHandoffSla.criticalMinutes}
            action={updateReadyHandoffSlaAction}
          />
        </section>
      )}

      {categories.map((category) => (
        <section key={category.id} className="pb-10">
          <div className="flex items-baseline gap-3 border-b border-[var(--color-ink-800)] pb-2">
            <h2 className="font-[family-name:var(--font-display)] text-xl">{category.title}</h2>
            <span className="eyebrow">
              {category.isPublished ? t('published') : t('unpublished')}
            </span>
          </div>

          <ul className="mt-4 grid gap-4 md:grid-cols-2">
            {category.items.map((item) => (
              <li key={item.id}>
                <MenuItemAdminCard
                  item={item}
                  locale={locale}
                  availabilityAction={setAvailabilityAction}
                  slaAction={updatePreparationSlaAction}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
