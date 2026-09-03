import 'server-only';
import { prisma } from '@/lib/prisma';
import { defaultLocale } from '@/i18n/routing';
import type {
  AdminMenuCategoryTranslation,
  AdminMenuItemTranslation,
  MenuCategoryView,
  MenuItemView,
  MenuView,
  ModifierGroupView,
  MenuVariantView,
} from '@/domains/menu/shared/types';

/** Тег кэша публичного меню (docs/architecture.md §10). */
export const MENU_CACHE_TAG = 'menu';

export function menuCacheTagForVenue(venueSlug: string): string {
  return `${MENU_CACHE_TAG}:${venueSlug}`;
}

type Translated = { locale: string };

/**
 * Выбор перевода с безопасным откатом на `de` (docs/localization.md §1):
 * отсутствующий перевод не роняет страницу и не показывает ключ.
 */
function pickTranslation<T extends Translated>(
  translations: T[],
  locale: string,
): T | undefined {
  return (
    translations.find((translation) => translation.locale === locale) ??
    translations.find((translation) => translation.locale === defaultLocale) ??
    translations[0]
  );
}

/**
 * Публичное меню заведения на заданной локали.
 * Возвращает только опубликованные категории и позиции; недоступные позиции
 * остаются в выдаче, но помечены isAvailable=false («Ausverkauft»).
 */
export async function getPublishedMenu(venueSlug: string, locale: string): Promise<MenuView | null> {
  const venue = await prisma.venue.findUnique({
    where: { slug: venueSlug },
    select: { id: true, name: true, currency: true },
  });

  if (!venue) return null;

  const categories = await prisma.menuCategory.findMany({
    where: { venue: { slug: venueSlug }, isPublished: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      translations: true,
      items: {
        where: { isPublished: true },
        orderBy: { sortOrder: 'asc' },
        include: {
          translations: true,
          variants: {
            orderBy: { sortOrder: 'asc' },
            include: { translations: true },
          },
          modifierGroups: {
            orderBy: { sortOrder: 'asc' },
            include: {
              translations: true,
              options: { orderBy: { sortOrder: 'asc' }, include: { translations: true } },
            },
          },
          media: { where: { status: 'READY' }, orderBy: { sortOrder: 'asc' } },
          allergens: { include: { allergen: { include: { translations: true } } } },
          additives: { include: { additive: { include: { translations: true } } } },
          dietaryTags: { include: { tag: { include: { translations: true } } } },
        },
      },
    },
  });

  const categoryViews: MenuCategoryView[] = categories.map((category) => {
    const categoryTranslation = pickTranslation(category.translations, locale);

    const items: MenuItemView[] = category.items.map((item) => {
      const itemTranslation = pickTranslation(item.translations, locale);

      const variants: MenuVariantView[] = item.variants.map((variant) => ({
        id: variant.id,
        name: pickTranslation(variant.translations, locale)?.name ?? '',
        priceCents: variant.priceCents,
        amountValue: variant.amountValue,
        amountUnit: variant.amountUnit,
        isDefault: variant.isDefault,
        isAvailable: variant.isAvailable,
      }));

      const modifierGroups: ModifierGroupView[] = item.modifierGroups.map((group) => ({
        id: group.id,
        title: pickTranslation(group.translations, locale)?.title ?? '',
        selectionType: group.selectionType,
        minSelections: group.minSelections,
        maxSelections: group.maxSelections,
        isRequired: group.isRequired,
        options: group.options.map((option) => ({
          id: option.id,
          name: pickTranslation(option.translations, locale)?.name ?? '',
          priceDeltaCents: option.priceDeltaCents,
          isDefault: option.isDefault,
          isAvailable: option.isAvailable,
        })),
      }));

      return {
        id: item.id,
        slug: item.slug,
        name: itemTranslation?.name ?? item.slug,
        shortDescription: itemTranslation?.shortDescription ?? null,
        fullDescription: itemTranslation?.fullDescription ?? null,
        ingredients: itemTranslation?.ingredients ?? null,
        basePriceCents: item.basePriceCents,
        isAvailable: item.isAvailable,
        spiceLevel: item.spiceLevel,
        allergens: item.allergens
          .map((link) => pickTranslation(link.allergen.translations, locale)?.name ?? link.allergen.code)
          .sort((a, b) => a.localeCompare(b, locale)),
        additives: item.additives.map(
          (link) => pickTranslation(link.additive.translations, locale)?.name ?? link.additive.code,
        ),
        dietaryTags: item.dietaryTags.map(
          (link) => pickTranslation(link.tag.translations, locale)?.name ?? link.tag.code,
        ),
        variants,
        modifierGroups,
        media: item.media.map((asset) => ({
          id: asset.id,
          kind: asset.kind,
          url: asset.url,
          posterUrl: asset.posterUrl,
          altText: asset.altText,
          width: asset.width,
          height: asset.height,
        })),
      };
    });

    return {
      id: category.id,
      slug: category.slug,
      title: categoryTranslation?.title ?? category.slug,
      description: categoryTranslation?.description ?? null,
      items,
    };
  });

  return {
    venueId: venue.id,
    venueName: venue.name,
    currency: venue.currency,
    locale,
    categories: categoryViews,
  };
}

/** Рабочий каталог admin-панели: карточки, media-preview и production SLA. */
export async function getMenuOverview(venueSlug: string, locale: string) {
  const categories = await prisma.menuCategory.findMany({
    where: { venue: { slug: venueSlug } },
    orderBy: { sortOrder: 'asc' },
    include: {
      translations: true,
      items: {
        orderBy: { sortOrder: 'asc' },
        include: {
          translations: true,
          station: true,
          taxProfile: true,
          media: { where: { status: 'READY' }, orderBy: { sortOrder: 'asc' } },
          allergens: { select: { allergenId: true } },
        },
      },
    },
  });

  return categories.map((category) => ({
    id: category.id,
    slug: category.slug,
    title: pickTranslation(category.translations, locale)?.title ?? category.slug,
    isPublished: category.isPublished,
    sortOrder: category.sortOrder,
    translations: {
      de: adminCategoryTranslation(category.translations, 'de'),
      ru: adminCategoryTranslation(category.translations, 'ru'),
    },
    items: category.items.map((item) => {
      const translation = pickTranslation(item.translations, locale);
      return {
        id: item.id,
        slug: item.slug,
        name: translation?.name ?? item.slug,
        shortDescription: translation?.shortDescription ?? null,
        fullDescription: translation?.fullDescription ?? null,
        ingredients: translation?.ingredients ?? null,
        basePriceCents: item.basePriceCents,
        categoryId: item.categoryId,
        stationId: item.stationId,
        taxProfileId: item.taxProfileId,
        spiceLevel: item.spiceLevel,
        sortOrder: item.sortOrder,
        isPublished: item.isPublished,
        isAvailable: item.isAvailable,
        stationName: item.station?.name ?? null,
        stationKind: item.station?.kind ?? null,
        taxRateBasisPoints: item.taxProfile?.rateBasisPoints ?? null,
        recommendedPreparationMinutes: item.recommendedPreparationMinutes,
        criticalPreparationMinutes: item.criticalPreparationMinutes,
        allergenIds: item.allergens.map((link) => link.allergenId),
        translations: {
          de: adminItemTranslation(item.translations, 'de'),
          ru: adminItemTranslation(item.translations, 'ru'),
        },
        media: item.media.map((asset) => ({
          id: asset.id,
          kind: asset.kind,
          url: asset.url,
          posterUrl: asset.posterUrl,
          altText: asset.altText,
          width: asset.width,
          height: asset.height,
        })),
      };
    }),
  }));
}

function adminCategoryTranslation(
  translations: Array<{ locale: string; title: string; description: string | null }>,
  locale: 'de' | 'ru',
): AdminMenuCategoryTranslation {
  const translation = translations.find((entry) => entry.locale === locale);
  return {
    title: translation?.title ?? '',
    description: translation?.description ?? '',
  };
}

function adminItemTranslation(
  translations: Array<{
    locale: string;
    name: string;
    shortDescription: string | null;
    fullDescription: string | null;
    ingredients: string | null;
  }>,
  locale: 'de' | 'ru',
): AdminMenuItemTranslation {
  const translation = translations.find((entry) => entry.locale === locale);
  return {
    name: translation?.name ?? '',
    shortDescription: translation?.shortDescription ?? '',
    fullDescription: translation?.fullDescription ?? '',
    ingredients: translation?.ingredients ?? '',
  };
}

export async function getMenuEditorReferenceData(venueId: string, locale: string) {
  const [stations, taxProfiles, allergens] = await Promise.all([
    prisma.productionStation.findMany({
      where: { venueId, isActive: true },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, kind: true },
    }),
    prisma.taxProfile.findMany({
      where: { venueId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, rateBasisPoints: true, isDefault: true },
    }),
    prisma.allergen.findMany({
      orderBy: { code: 'asc' },
      include: { translations: true },
    }),
  ]);

  return {
    stations,
    taxProfiles,
    allergens: allergens
      .map((allergen) => ({
        id: allergen.id,
        code: allergen.code,
        name: pickTranslation(allergen.translations, locale)?.name ?? allergen.code,
      }))
      .sort((first, second) => first.name.localeCompare(second.name, locale)),
  };
}

/** Позиции для ручного заказа официанта. */
export async function getManualOrderOptions(venueSlug: string, locale: string) {
  const items = await prisma.menuItem.findMany({
    where: { venue: { slug: venueSlug }, isPublished: true, isAvailable: true },
    orderBy: { sortOrder: 'asc' },
    include: { translations: true },
  });

  return items.map((item) => ({
    menuItemId: item.id,
    name:
      pickTranslation(item.translations, locale)?.name ??
      pickTranslation(item.translations, defaultLocale)?.name ??
      item.slug,
    priceCents: item.basePriceCents,
  }));
}
