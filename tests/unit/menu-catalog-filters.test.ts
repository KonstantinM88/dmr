import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ADMIN_MENU_CATALOG_FILTERS,
  filterAdminMenuCategories,
  hasActiveAdminMenuFilters,
  type AdminMenuCatalogFilters,
} from '@/domains/menu/shared/admin-catalog-filters';
import type { AdminMenuCategoryView, AdminMenuItemView } from '@/domains/menu/shared/types';

function item(overrides: Partial<AdminMenuItemView> & Pick<AdminMenuItemView, 'id' | 'name'>): AdminMenuItemView {
  const { id, name, ...rest } = overrides;

  return {
    id,
    slug: name.toLocaleLowerCase().replaceAll(' ', '-'),
    name,
    shortDescription: null,
    fullDescription: null,
    ingredients: null,
    basePriceCents: 1000,
    categoryId: 'food',
    stationId: null,
    taxProfileId: null,
    spiceLevel: 'NONE',
    sortOrder: 0,
    isPublished: true,
    isAvailable: true,
    stationName: null,
    stationKind: 'KITCHEN',
    taxRateBasisPoints: 1900,
    recommendedPreparationMinutes: 10,
    criticalPreparationMinutes: 20,
    media: [],
    translations: {
      de: { name, shortDescription: '', fullDescription: '', ingredients: '' },
      ru: { name, shortDescription: '', fullDescription: '', ingredients: '' },
    },
    ...rest,
    allergenIds: rest.allergenIds ?? [],
  };
}

const categories: AdminMenuCategoryView[] = [
  {
    id: 'food',
    slug: 'hauptgerichte',
    title: 'Основные блюда',
    isPublished: true,
    sortOrder: 1,
    translations: {
      de: { title: 'Hauptgerichte', description: '' },
      ru: { title: 'Основные блюда', description: '' },
    },
    items: [
      item({ id: 'schnitzel', name: 'Wiener Schnitzel', basePriceCents: 2450, sortOrder: 2 }),
      item({ id: 'soup', name: 'Kartoffelsuppe', basePriceCents: 690, sortOrder: 1, isPublished: false }),
    ],
  },
  {
    id: 'drinks',
    slug: 'getraenke',
    title: 'Напитки',
    isPublished: true,
    sortOrder: 2,
    translations: {
      de: { title: 'Getränke', description: '' },
      ru: { title: 'Напитки', description: '' },
    },
    items: [
      item({
        id: 'coffee',
        name: 'Кофе',
        categoryId: 'drinks',
        stationKind: 'BAR',
        basePriceCents: 320,
        media: [{ id: 'photo', kind: 'IMAGE', url: '/coffee.webp', posterUrl: null, altText: null, width: 1600, height: 900 }],
      }),
    ],
  },
];

function withFilters(overrides: Partial<AdminMenuCatalogFilters>): AdminMenuCatalogFilters {
  return { ...DEFAULT_ADMIN_MENU_CATALOG_FILTERS, ...overrides };
}

describe('admin menu catalog filters', () => {
  it('searches across both translations and category titles', () => {
    expect(filterAdminMenuCategories(categories, withFilters({ query: 'schnitzel' }))[0]?.items.map(({ id }) => id)).toEqual(['schnitzel']);
    expect(filterAdminMenuCategories(categories, withFilters({ query: 'Getränke' }))[0]?.items.map(({ id }) => id)).toEqual(['coffee']);
  });

  it('combines category, station, status and media filters', () => {
    const result = filterAdminMenuCategories(categories, withFilters({
      categoryId: 'drinks',
      station: 'BAR',
      status: 'AVAILABLE',
      media: 'WITH_MEDIA',
    }));

    expect(result).toHaveLength(1);
    expect(result[0]?.items.map(({ id }) => id)).toEqual(['coffee']);
  });

  it('removes empty categories and sorts without mutating source data', () => {
    const result = filterAdminMenuCategories(categories, withFilters({ sort: 'PRICE_ASC' }));

    expect(result[0]?.items.map(({ id }) => id)).toEqual(['soup', 'schnitzel']);
    expect(categories[0]?.items.map(({ id }) => id)).toEqual(['schnitzel', 'soup']);
  });

  it('recognizes reset and active filter states', () => {
    expect(hasActiveAdminMenuFilters(DEFAULT_ADMIN_MENU_CATALOG_FILTERS)).toBe(false);
    expect(hasActiveAdminMenuFilters(withFilters({ status: 'DRAFT' }))).toBe(true);
  });
});
