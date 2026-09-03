'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type {
  AdminMenuCategoryView,
  AdminMenuItemView,
  MenuEditorReferenceData,
} from '@/domains/menu/shared/types';
import {
  countAdminMenuItems,
  DEFAULT_ADMIN_MENU_CATALOG_FILTERS,
  filterAdminMenuCategories,
  hasActiveAdminMenuFilters,
  type AdminMenuCatalogFilters,
} from '@/domains/menu/shared/admin-catalog-filters';
import { formatCents } from '@/lib/money';
import { MenuCategoryEditor } from '@/components/admin/MenuCategoryEditor';
import { MenuItemAdminCard } from '@/components/admin/MenuItemAdminCard';

type Props = {
  categories: AdminMenuCategoryView[];
  locale: string;
  references: MenuEditorReferenceData;
  availabilityAction: (payload: unknown) => Promise<{ ok: boolean }>;
  slaAction: (payload: unknown) => Promise<{ ok: boolean; reason?: string }>;
  itemEditorAction: (payload: unknown) => Promise<{ ok: boolean; reason?: string }>;
  categoryEditorAction: (payload: unknown) => Promise<{ ok: boolean; reason?: string }>;
};

function firstPreview(item: AdminMenuItemView) {
  const image = item.media.find((asset) => asset.kind === 'IMAGE');
  const video = item.media.find((asset) => asset.kind === 'VIDEO');
  return image?.url ?? video?.posterUrl ?? null;
}

export function MenuCatalogWorkspace({
  categories,
  locale,
  references,
  availabilityAction,
  slaAction,
  itemEditorAction,
  categoryEditorAction,
}: Props) {
  const t = useTranslations('admin');
  const [filters, setFilters] = useState<AdminMenuCatalogFilters>(
    DEFAULT_ADMIN_MENU_CATALOG_FILTERS,
  );
  const deferredQuery = useDeferredValue(filters.query);
  const effectiveFilters = useMemo(
    () => ({ ...filters, query: deferredQuery }),
    [deferredQuery, filters],
  );
  const filteredCategories = useMemo(
    () => filterAdminMenuCategories(categories, effectiveFilters),
    [categories, effectiveFilters],
  );
  const totalCount = countAdminMenuItems(categories);
  const visibleCount = countAdminMenuItems(filteredCategories);
  const allItems = categories.flatMap((category) => category.items);
  const draftCount = allItems.filter((item) => !item.isPublished).length;
  const missingMediaCount = allItems.filter((item) => item.media.length === 0).length;
  const categoryOptions = categories.map((category) => ({ id: category.id, title: category.title }));
  const activeFilters = hasActiveAdminMenuFilters(filters);

  const updateFilter = <Key extends keyof AdminMenuCatalogFilters>(
    key: Key,
    value: AdminMenuCatalogFilters[Key],
  ) => setFilters((current) => ({ ...current, [key]: value }));

  const stationLabel = (item: AdminMenuItemView) => {
    if (item.stationKind === 'KITCHEN') return t('stationKitchen');
    if (item.stationKind === 'BAR') return t('stationBar');
    if (item.stationKind === 'OTHER') return t('stationOther');
    return item.stationName ?? t('stationUnassigned');
  };

  return (
    <section aria-labelledby="menu-catalog-title" className="pb-12">
      <div className="sticky top-3 z-20 mb-7 overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-ink-700)] bg-[color:color-mix(in_srgb,var(--color-ink-950)_94%,transparent)] shadow-2xl shadow-black/20 backdrop-blur-xl">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--color-ink-800)] px-5 py-4">
          <div>
            <p className="eyebrow">{t('catalogEyebrow')}</p>
            <h2 id="menu-catalog-title" className="mt-1 font-[family-name:var(--font-display)] text-xl">
              {t('catalogTitle')}
            </h2>
          </div>
          <div className="grid grid-cols-4 gap-4 text-right text-xs">
            <div>
              <strong className="block font-[family-name:var(--font-mono)] text-lg text-[var(--color-paper)]">{totalCount}</strong>
              <span className="text-[var(--color-paper-faint)]">{t('catalogTotal')}</span>
            </div>
            <div>
              <strong className="block font-[family-name:var(--font-mono)] text-lg text-[var(--color-brass)]">{visibleCount}</strong>
              <span className="text-[var(--color-paper-faint)]">{t('catalogShown')}</span>
            </div>
            <div>
              <strong className="block font-[family-name:var(--font-mono)] text-lg text-[var(--color-paper)]">{draftCount}</strong>
              <span className="text-[var(--color-paper-faint)]">{t('catalogDrafts')}</span>
            </div>
            <div>
              <strong className="block font-[family-name:var(--font-mono)] text-lg text-[var(--color-paper)]">{missingMediaCount}</strong>
              <span className="text-[var(--color-paper-faint)]">{t('catalogWithoutMedia')}</span>
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-4 lg:grid-cols-[minmax(15rem,1.6fr)_repeat(3,minmax(9rem,1fr))]">
          <label className="text-xs text-[var(--color-paper-dim)]">
            <span className="mb-1.5 block">{t('catalogSearchLabel')}</span>
            <input
              type="search"
              value={filters.query}
              onChange={(event) => updateFilter('query', event.target.value)}
              placeholder={t('catalogSearchPlaceholder')}
              className="admin-input"
            />
          </label>
          <FilterSelect
            label={t('catalogCategoryLabel')}
            value={filters.categoryId}
            onChange={(value) => updateFilter('categoryId', value)}
            options={[
              { value: 'ALL', label: t('catalogAllCategories') },
              ...categoryOptions.map((category) => ({ value: category.id, label: category.title })),
            ]}
          />
          <FilterSelect
            label={t('catalogStationLabel')}
            value={filters.station}
            onChange={(value) => updateFilter('station', value as AdminMenuCatalogFilters['station'])}
            options={[
              { value: 'ALL', label: t('catalogAllStations') },
              { value: 'KITCHEN', label: t('stationKitchen') },
              { value: 'BAR', label: t('stationBar') },
              { value: 'OTHER', label: t('stationOther') },
              { value: 'UNASSIGNED', label: t('stationUnassigned') },
            ]}
          />
          <FilterSelect
            label={t('catalogStatusLabel')}
            value={filters.status}
            onChange={(value) => updateFilter('status', value as AdminMenuCatalogFilters['status'])}
            options={[
              { value: 'ALL', label: t('catalogAllStatuses') },
              { value: 'PUBLISHED', label: t('published') },
              { value: 'DRAFT', label: t('unpublished') },
              { value: 'AVAILABLE', label: t('available') },
              { value: 'UNAVAILABLE', label: t('soldOut') },
            ]}
          />
          <FilterSelect
            label={t('catalogMediaLabel')}
            value={filters.media}
            onChange={(value) => updateFilter('media', value as AdminMenuCatalogFilters['media'])}
            options={[
              { value: 'ALL', label: t('catalogAllMedia') },
              { value: 'WITH_MEDIA', label: t('catalogWithMedia') },
              { value: 'WITHOUT_MEDIA', label: t('catalogWithoutMediaFilter') },
            ]}
          />
          <FilterSelect
            label={t('catalogSortLabel')}
            value={filters.sort}
            onChange={(value) => updateFilter('sort', value as AdminMenuCatalogFilters['sort'])}
            options={[
              { value: 'MENU', label: t('catalogSortMenu') },
              { value: 'NAME', label: t('catalogSortName') },
              { value: 'PRICE_ASC', label: t('catalogSortPriceAsc') },
              { value: 'PRICE_DESC', label: t('catalogSortPriceDesc') },
              { value: 'PREPARATION', label: t('catalogSortPreparation') },
            ]}
          />
          <div className="flex items-end lg:col-span-2">
            <button
              type="button"
              onClick={() => setFilters(DEFAULT_ADMIN_MENU_CATALOG_FILTERS)}
              disabled={!activeFilters}
              className="min-h-11 rounded-full border border-[var(--color-ink-700)] px-5 text-sm text-[var(--color-paper-dim)] transition hover:border-[var(--color-brass-dim)] hover:text-[var(--color-paper)] disabled:cursor-not-allowed disabled:opacity-35"
            >
              {t('catalogReset')}
            </button>
          </div>
        </div>
      </div>

      <p aria-live="polite" className="mb-4 text-xs text-[var(--color-paper-faint)]">
        {t('catalogResultSummary', { visible: visibleCount, total: totalCount })}
      </p>

      {filteredCategories.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-ink-700)] px-6 py-12 text-center">
          <h3 className="font-[family-name:var(--font-display)] text-xl">{t('catalogEmptyTitle')}</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-paper-dim)]">{t('catalogEmptyIntro')}</p>
          <button
            type="button"
            onClick={() => setFilters(DEFAULT_ADMIN_MENU_CATALOG_FILTERS)}
            className="mt-5 rounded-full border border-[var(--color-brass-dim)] px-5 py-2 text-sm text-[var(--color-brass)]"
          >
            {t('catalogReset')}
          </button>
        </div>
      ) : (
        <div className="space-y-7">
          {filteredCategories.map((category) => (
            <section key={category.id}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-ink-800)] pb-3">
                <div className="flex items-center gap-3">
                  <h3 className="font-[family-name:var(--font-display)] text-xl">{category.title}</h3>
                  <span className="rounded-full bg-[var(--color-ink-850)] px-2.5 py-1 font-[family-name:var(--font-mono)] text-xs text-[var(--color-paper-dim)]">
                    {category.items.length}
                  </span>
                  <span className="eyebrow">{category.isPublished ? t('published') : t('unpublished')}</span>
                </div>
                <details className="relative">
                  <summary className="cursor-pointer list-none rounded-full border border-[var(--color-ink-700)] px-4 py-2 text-xs text-[var(--color-brass)]">
                    {t('editorEditCategory')}
                  </summary>
                  <div className="mt-3 rounded-[var(--radius-card)] border border-[var(--color-ink-700)] bg-[var(--color-ink-900)] p-4 sm:min-w-[34rem]">
                    <MenuCategoryEditor category={category} action={categoryEditorAction} />
                  </div>
                </details>
              </div>

              <ul className="mt-3 space-y-2">
                {category.items.map((item) => {
                  const preview = firstPreview(item);
                  return (
                    <li key={item.id}>
                      <details className="group overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-ink-800)] bg-[var(--color-ink-900)]/55 open:border-[var(--color-brass-dim)]">
                        <summary className="grid cursor-pointer list-none grid-cols-[3.75rem_minmax(0,1fr)_auto] items-center gap-3 p-3 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto_auto]">
                          <div className="h-12 overflow-hidden rounded-lg bg-[var(--color-ink-850)] sm:h-14">
                            {preview ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={preview} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="grid h-full place-items-center font-[family-name:var(--font-mono)] text-[10px] text-[var(--color-paper-faint)]">—</div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-[family-name:var(--font-display)] text-base sm:text-lg">{item.name}</p>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--color-paper-faint)]">
                              <span>{stationLabel(item)}</span>
                              <span>{item.isPublished ? t('published') : t('unpublished')}</span>
                              <span className={item.isAvailable ? 'text-[var(--color-sage)]' : 'text-[var(--color-clay)]'}>
                                {item.isAvailable ? t('available') : t('soldOut')}
                              </span>
                            </div>
                          </div>
                          <span className="font-[family-name:var(--font-mono)] text-sm text-[var(--color-brass)]">
                            {formatCents(item.basePriceCents, locale)}
                          </span>
                          <span aria-hidden="true" className="hidden text-lg text-[var(--color-paper-faint)] transition group-open:rotate-180 sm:block">⌄</span>
                        </summary>
                        <div className="border-t border-[var(--color-ink-800)] p-3">
                          <MenuItemAdminCard
                            item={item}
                            locale={locale}
                            availabilityAction={availabilityAction}
                            slaAction={slaAction}
                            editorAction={itemEditorAction}
                            categories={categoryOptions}
                            references={references}
                          />
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function FilterSelect(props: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs text-[var(--color-paper-dim)]">
      <span className="mb-1.5 block">{props.label}</span>
      <select
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className="admin-input cursor-pointer"
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}
