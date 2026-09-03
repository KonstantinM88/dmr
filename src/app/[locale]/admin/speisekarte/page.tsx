import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { requirePermission } from '@/domains/staff/server/rbac';
import { getStaffPrincipal } from '@/domains/staff/server/session.service';
import {
  getMenuEditorReferenceData,
  getMenuOverview,
} from '@/domains/menu/server/menu.queries';
import { DEFAULT_VENUE_SLUG } from '@/lib/venue';
import { getEnv } from '@/lib/env';
import { canMutateMenuMedia } from '@/domains/media/shared/types';
import { ProductionSlaEditor } from '@/components/admin/ProductionSlaEditor';
import { MenuCategoryEditor } from '@/components/admin/MenuCategoryEditor';
import { MenuItemEditor } from '@/components/admin/MenuItemEditor';
import { MenuCatalogWorkspace } from '@/components/admin/MenuCatalogWorkspace';
import { getReadyHandoffSlaSettings } from '@/domains/production/server/production-sla.service';
import {
  setAvailabilityAction,
  saveMenuCategoryAction,
  saveMenuItemAction,
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
  const [categories, references] = await Promise.all([
    getMenuOverview(DEFAULT_VENUE_SLUG, locale),
    getMenuEditorReferenceData(principal.venueId, locale),
  ]);
  const canManageOperationalSettings = principal.permissions.includes(
    'MANAGE_OPERATIONAL_SETTINGS',
  );
  const readyHandoffSla = canManageOperationalSettings
    ? await getReadyHandoffSlaSettings(principal.venueId)
    : null;

  const categoryOptions = categories.map((category) => ({ id: category.id, title: category.title }));
  const runtimeEnv = getEnv();
  const mediaWritable = canMutateMenuMedia(
    runtimeEnv.MEDIA_STORAGE_PROVIDER,
    runtimeEnv.NODE_ENV,
  );

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

      <section className="mb-8 rounded-[var(--radius-card)] border border-[var(--color-ink-800)] bg-[var(--color-ink-900)]/50 p-5">
        <details>
          <summary className="cursor-pointer font-[family-name:var(--font-display)] text-xl text-[var(--color-brass)]">
            {t('editorNewCategory')}
          </summary>
          <div className="mt-5"><MenuCategoryEditor action={saveMenuCategoryAction} /></div>
        </details>
      </section>

      <section className="mb-10 rounded-[var(--radius-card)] border border-[var(--color-ink-800)] bg-[var(--color-ink-900)]/50 p-5">
        <details>
          <summary className="cursor-pointer font-[family-name:var(--font-display)] text-xl text-[var(--color-brass)]">
            {t('editorNewItem')}
          </summary>
          <div className="mt-5">
            {categories.length === 0 ? <p className="text-sm text-[var(--color-paper-dim)]">{t('editorCreateCategoryFirst')}</p> : <MenuItemEditor categories={categoryOptions} references={references} action={saveMenuItemAction} />}
          </div>
        </details>
      </section>

      {categories.length === 0 && <p className="pb-10 text-sm text-[var(--color-paper-dim)]">{t('emptyMenu')}</p>}

      {categories.length > 0 && (
        <MenuCatalogWorkspace
          categories={categories}
          locale={locale}
          references={references}
          mediaWritable={mediaWritable}
          availabilityAction={setAvailabilityAction}
          slaAction={updatePreparationSlaAction}
          itemEditorAction={saveMenuItemAction}
          categoryEditorAction={saveMenuCategoryAction}
        />
      )}
    </div>
  );
}
