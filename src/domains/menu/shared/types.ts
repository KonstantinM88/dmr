/**
 * Client-safe типы меню. Ни один из них не тянет Prisma
 * (docs/architecture.md §2). Цены — всегда целые центы.
 */

export type SpiceLevel = 'NONE' | 'MILD' | 'MEDIUM' | 'HOT';

export type MenuMedia = {
  id: string;
  kind: 'IMAGE' | 'VIDEO';
  url: string;
  posterUrl: string | null;
  altText: string | null;
  width: number | null;
  height: number | null;
};

export type MenuVariantView = {
  id: string;
  name: string;
  priceCents: number;
  amountValue: number | null;
  amountUnit: string | null;
  isDefault: boolean;
  isAvailable: boolean;
};

export type ModifierOptionView = {
  id: string;
  name: string;
  priceDeltaCents: number;
  isDefault: boolean;
  isAvailable: boolean;
};

export type ModifierGroupView = {
  id: string;
  title: string;
  selectionType: 'SINGLE' | 'MULTIPLE';
  minSelections: number;
  maxSelections: number;
  isRequired: boolean;
  options: ModifierOptionView[];
};

export type MenuItemView = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  fullDescription: string | null;
  ingredients: string | null;
  basePriceCents: number;
  isAvailable: boolean;
  spiceLevel: SpiceLevel;
  allergens: string[];
  additives: string[];
  dietaryTags: string[];
  variants: MenuVariantView[];
  modifierGroups: ModifierGroupView[];
  media: MenuMedia[];
};

export type MenuCategoryView = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  items: MenuItemView[];
};

export type MenuView = {
  venueId: string;
  venueName: string;
  currency: string;
  locale: string;
  categories: MenuCategoryView[];
};

/** Минимальная цена позиции для списка: база или самый дешёвый вариант. */
export function displayPriceCents(item: MenuItemView): number {
  const available = item.variants.filter((variant) => variant.isAvailable);
  if (available.length === 0) return item.basePriceCents;
  return Math.min(...available.map((variant) => variant.priceCents));
}

export function hasMultiplePrices(item: MenuItemView): boolean {
  const prices = new Set(item.variants.filter((v) => v.isAvailable).map((v) => v.priceCents));
  return prices.size > 1;
}
