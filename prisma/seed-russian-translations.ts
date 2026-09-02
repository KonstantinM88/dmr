import type { PrismaClient } from '../src/generated/prisma/client.js';

const RU = 'ru';

const ALLERGENS: Record<string, string> = {
  GLUTEN: 'Злаки, содержащие глютен',
  CRUSTACEANS: 'Ракообразные',
  EGGS: 'Яйца',
  FISH: 'Рыба',
  PEANUTS: 'Арахис',
  SOY: 'Соя',
  MILK: 'Молоко',
  NUTS: 'Орехи',
  CELERY: 'Сельдерей',
  MUSTARD: 'Горчица',
  SESAME: 'Кунжут',
  SULPHITES: 'Диоксид серы и сульфиты',
  LUPIN: 'Люпин',
  MOLLUSCS: 'Моллюски',
};

const ADDITIVES: Record<string, string> = {
  COLORANT: 'с красителем',
  PRESERVATIVE: 'с консервантом',
  ANTIOXIDANT: 'с антиоксидантом',
  FLAVOUR_ENHANCER: 'с усилителем вкуса',
  CAFFEINE: 'содержит кофеин',
};

const DIETARY_TAGS: Record<string, string> = {
  VEGETARIAN: 'вегетарианское',
  VEGAN: 'веганское',
  GLUTEN_FREE: 'без глютена',
  LACTOSE_FREE: 'без лактозы',
};

const CATEGORIES: Record<string, string> = {
  vorspeisen: 'Закуски',
  hauptgerichte: 'Основные блюда',
  desserts: 'Десерты',
  getraenke: 'Напитки',
};

const ITEMS: Record<
  string,
  { name: string; shortDescription: string; ingredients?: string; variants?: string[] }
> = {
  kartoffelsuppe: {
    name: 'Картофельный суп',
    shortDescription: 'Нежный суп с майораном и поджаренным хлебом',
    ingredients: 'Картофель, лук-порей, сельдерей, сливки, майоран, пшеничный хлеб',
  },
  feldsalat: {
    name: 'Салат корн с грецкими орехами',
    shortDescription: 'Салат корн, грецкие орехи, яблоко и горчичная заправка',
  },
  'wiener-schnitzel': {
    name: 'Венский шницель',
    shortDescription: 'Шницель из телятины в панировке, картофельный салат и лимон',
    ingredients: 'Телятина, пшеничная мука, яйцо, панировочные сухари, топлёное масло',
  },
  'pfifferlinge-rahm': {
    name: 'Лисички в сливочном соусе',
    shortDescription: 'С хлебными кнедликами и петрушкой',
  },
  gulasch: {
    name: 'Гуляш из говядины',
    shortDescription: 'Томлёная говядина с красной капустой и клёцками',
  },
  apfelstrudel: {
    name: 'Яблочный штрудель',
    shortDescription: 'Подаётся тёплым с ванильным соусом',
  },
  pils: {
    name: 'Разливной пилс',
    shortDescription: 'Свежий разливной лагер',
    variants: ['Маленький бокал', 'Большой бокал'],
  },
  apfelschorle: {
    name: 'Яблочный шорле',
    shortDescription: 'Нефильтрованный яблочный сок с минеральной водой',
    variants: ['Маленький', 'Большой'],
  },
  kaffee: {
    name: 'Кофе',
    shortDescription: 'Фильтр-кофе местной обжарки',
  },
};

/**
 * Идемпотентно добавляет только русские переводы существующих seed-сущностей.
 * Операционные поля меню, столы, QR, пользователи и заказы не изменяются.
 */
export async function seedRussianTranslations(prisma: PrismaClient, venueId: string) {
  for (const [code, name] of Object.entries(ALLERGENS)) {
    const entity = await prisma.allergen.findUnique({ where: { code }, select: { id: true } });
    if (!entity) continue;
    await prisma.allergenTranslation.upsert({
      where: { allergenId_locale: { allergenId: entity.id, locale: RU } },
      update: { name },
      create: { allergenId: entity.id, locale: RU, name },
    });
  }

  for (const [code, name] of Object.entries(ADDITIVES)) {
    const entity = await prisma.additive.findUnique({ where: { code }, select: { id: true } });
    if (!entity) continue;
    await prisma.additiveTranslation.upsert({
      where: { additiveId_locale: { additiveId: entity.id, locale: RU } },
      update: { name },
      create: { additiveId: entity.id, locale: RU, name },
    });
  }

  for (const [code, name] of Object.entries(DIETARY_TAGS)) {
    const entity = await prisma.dietaryTag.findUnique({ where: { code }, select: { id: true } });
    if (!entity) continue;
    await prisma.dietaryTagTranslation.upsert({
      where: { tagId_locale: { tagId: entity.id, locale: RU } },
      update: { name },
      create: { tagId: entity.id, locale: RU, name },
    });
  }

  for (const [slug, title] of Object.entries(CATEGORIES)) {
    const category = await prisma.menuCategory.findUnique({
      where: { venueId_slug: { venueId, slug } },
      select: { id: true },
    });
    if (!category) continue;
    await prisma.menuCategoryTranslation.upsert({
      where: { categoryId_locale: { categoryId: category.id, locale: RU } },
      update: { title },
      create: { categoryId: category.id, locale: RU, title },
    });
  }

  for (const [slug, translation] of Object.entries(ITEMS)) {
    const item = await prisma.menuItem.findUnique({
      where: { venueId_slug: { venueId, slug } },
      select: {
        id: true,
        variants: { orderBy: { sortOrder: 'asc' }, select: { id: true } },
      },
    });
    if (!item) continue;

    await prisma.menuItemTranslation.upsert({
      where: { itemId_locale: { itemId: item.id, locale: RU } },
      update: {
        name: translation.name,
        shortDescription: translation.shortDescription,
        ingredients: translation.ingredients ?? null,
      },
      create: {
        itemId: item.id,
        locale: RU,
        name: translation.name,
        shortDescription: translation.shortDescription,
        ingredients: translation.ingredients ?? null,
      },
    });

    for (const [index, name] of (translation.variants ?? []).entries()) {
      const variant = item.variants[index];
      if (!variant) continue;
      await prisma.menuVariantTranslation.upsert({
        where: { variantId_locale: { variantId: variant.id, locale: RU } },
        update: { name },
        create: { variantId: variant.id, locale: RU, name },
      });
    }
  }
}
