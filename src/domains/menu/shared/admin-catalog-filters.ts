import type { AdminMenuCategoryView, AdminMenuItemView } from './types';

export type AdminMenuCatalogFilters = {
  query: string;
  categoryId: string;
  station: 'ALL' | 'KITCHEN' | 'BAR' | 'OTHER' | 'UNASSIGNED';
  status: 'ALL' | 'PUBLISHED' | 'DRAFT' | 'AVAILABLE' | 'UNAVAILABLE';
  media: 'ALL' | 'WITH_MEDIA' | 'WITHOUT_MEDIA';
  sort: 'MENU' | 'NAME' | 'PRICE_ASC' | 'PRICE_DESC' | 'PREPARATION';
};

export const DEFAULT_ADMIN_MENU_CATALOG_FILTERS: AdminMenuCatalogFilters = {
  query: '',
  categoryId: 'ALL',
  station: 'ALL',
  status: 'ALL',
  media: 'ALL',
  sort: 'MENU',
};

function includesQuery(
  item: AdminMenuItemView,
  category: AdminMenuCategoryView,
  normalizedQuery: string,
): boolean {
  if (!normalizedQuery) return true;

  const searchableValues = [
    item.slug,
    item.name,
    item.shortDescription,
    item.fullDescription,
    item.ingredients,
    item.translations.de.name,
    item.translations.de.shortDescription,
    item.translations.de.fullDescription,
    item.translations.de.ingredients,
    item.translations.ru.name,
    item.translations.ru.shortDescription,
    item.translations.ru.fullDescription,
    item.translations.ru.ingredients,
    category.slug,
    category.title,
    category.translations.de.title,
    category.translations.ru.title,
  ];

  return searchableValues.some((value) => value?.toLocaleLowerCase().includes(normalizedQuery));
}

function matchesFilters(
  item: AdminMenuItemView,
  category: AdminMenuCategoryView,
  filters: AdminMenuCatalogFilters,
  normalizedQuery: string,
): boolean {
  if (filters.categoryId !== 'ALL' && category.id !== filters.categoryId) return false;
  if (!includesQuery(item, category, normalizedQuery)) return false;

  if (filters.station === 'UNASSIGNED') {
    if (item.stationKind !== null) return false;
  } else if (filters.station !== 'ALL' && item.stationKind !== filters.station) {
    return false;
  }

  if (filters.status === 'PUBLISHED' && !item.isPublished) return false;
  if (filters.status === 'DRAFT' && item.isPublished) return false;
  if (filters.status === 'AVAILABLE' && !item.isAvailable) return false;
  if (filters.status === 'UNAVAILABLE' && item.isAvailable) return false;
  if (filters.media === 'WITH_MEDIA' && item.media.length === 0) return false;
  if (filters.media === 'WITHOUT_MEDIA' && item.media.length > 0) return false;

  return true;
}

function compareItems(
  first: AdminMenuItemView,
  second: AdminMenuItemView,
  sort: AdminMenuCatalogFilters['sort'],
): number {
  if (sort === 'NAME') return first.name.localeCompare(second.name);
  if (sort === 'PRICE_ASC') return first.basePriceCents - second.basePriceCents;
  if (sort === 'PRICE_DESC') return second.basePriceCents - first.basePriceCents;
  if (sort === 'PREPARATION') {
    const firstMinutes = first.recommendedPreparationMinutes ?? Number.MAX_SAFE_INTEGER;
    const secondMinutes = second.recommendedPreparationMinutes ?? Number.MAX_SAFE_INTEGER;
    return firstMinutes - secondMinutes || first.name.localeCompare(second.name);
  }

  return first.sortOrder - second.sortOrder || first.name.localeCompare(second.name);
}

export function filterAdminMenuCategories(
  categories: AdminMenuCategoryView[],
  filters: AdminMenuCatalogFilters,
): AdminMenuCategoryView[] {
  const normalizedQuery = filters.query.trim().toLocaleLowerCase();

  return categories
    .filter((category) => filters.categoryId === 'ALL' || category.id === filters.categoryId)
    .map((category) => ({
      ...category,
      items: category.items
        .filter((item) => matchesFilters(item, category, filters, normalizedQuery))
        .sort((first, second) => compareItems(first, second, filters.sort)),
    }))
    .filter((category) => category.items.length > 0)
    .sort((first, second) => first.sortOrder - second.sortOrder || first.title.localeCompare(second.title));
}

export function countAdminMenuItems(categories: AdminMenuCategoryView[]): number {
  return categories.reduce((total, category) => total + category.items.length, 0);
}

export function hasActiveAdminMenuFilters(filters: AdminMenuCatalogFilters): boolean {
  return Object.entries(DEFAULT_ADMIN_MENU_CATALOG_FILTERS).some(
    ([key, value]) => filters[key as keyof AdminMenuCatalogFilters] !== value,
  );
}
