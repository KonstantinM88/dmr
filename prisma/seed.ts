/**
 * Идемпотентный сид (upsert-based): повторный запуск не создаёт дубликаты
 * и не трогает уже изменённые вручную данные сверх описанных полей.
 *
 * Запуск: npm run db:seed
 * Использует DIRECT_DATABASE_URL — как и миграции, минуя pooled-соединение.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { hashPassword, generateOpaqueToken } from '../src/lib/hash.js';
import { ROLE_PERMISSIONS, PERMISSIONS, PERMISSION_DESCRIPTIONS, ROLE_LABELS } from '../src/domains/staff/shared/permissions.js';
import type { Permission, RoleCode } from '../src/domains/staff/shared/permissions.js';

const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error('DIRECT_DATABASE_URL или DATABASE_URL обязателен для сида.');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const VENUE_SLUG = 'restaurant';
const LOCALE = 'de';

/** EU-14: обязательные к маркировке аллергены (LMIV Anhang II). */
const ALLERGENS: Array<[string, string]> = [
  ['GLUTEN', 'Glutenhaltiges Getreide'],
  ['CRUSTACEANS', 'Krebstiere'],
  ['EGGS', 'Eier'],
  ['FISH', 'Fisch'],
  ['PEANUTS', 'Erdnüsse'],
  ['SOY', 'Soja'],
  ['MILK', 'Milch'],
  ['NUTS', 'Schalenfrüchte'],
  ['CELERY', 'Sellerie'],
  ['MUSTARD', 'Senf'],
  ['SESAME', 'Sesam'],
  ['SULPHITES', 'Schwefeldioxid und Sulphite'],
  ['LUPIN', 'Lupinen'],
  ['MOLLUSCS', 'Weichtiere'],
];

const ADDITIVES: Array<[string, string]> = [
  ['COLORANT', 'mit Farbstoff'],
  ['PRESERVATIVE', 'mit Konservierungsstoff'],
  ['ANTIOXIDANT', 'mit Antioxidationsmittel'],
  ['FLAVOUR_ENHANCER', 'mit Geschmacksverstärker'],
  ['CAFFEINE', 'coffeinhaltig'],
];

const DIETARY_TAGS: Array<[string, string]> = [
  ['VEGETARIAN', 'vegetarisch'],
  ['VEGAN', 'vegan'],
  ['GLUTEN_FREE', 'glutenfrei'],
  ['LACTOSE_FREE', 'laktosefrei'],
];

async function seedRbac() {
  for (const code of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code },
      update: { description: PERMISSION_DESCRIPTIONS[code] },
      create: { code, description: PERMISSION_DESCRIPTIONS[code] },
    });
  }

  for (const [roleCode, permissions] of Object.entries(ROLE_PERMISSIONS) as Array<
    [RoleCode, readonly Permission[]]
  >) {
    const role = await prisma.role.upsert({
      where: { code: roleCode },
      update: { name: ROLE_LABELS[roleCode] },
      create: { code: roleCode, name: ROLE_LABELS[roleCode], isSystem: true },
    });

    // Матрица ролей — источник истины в коде: связи приводятся к ней.
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });

    const permissionRows = await prisma.permission.findMany({
      where: { code: { in: [...permissions] } },
      select: { id: true },
    });

    await prisma.rolePermission.createMany({
      data: permissionRows.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
      skipDuplicates: true,
    });
  }
}

async function main() {
  const venue = await prisma.venue.upsert({
    where: { slug: VENUE_SLUG },
    update: {},
    create: {
      slug: VENUE_SLUG,
      name: 'Restaurant',
      defaultLocale: LOCALE,
      currency: 'EUR',
      timeZone: 'Europe/Berlin',
    },
  });

  await prisma.venueSetting.upsert({
    where: { venueId_key: { venueId: venue.id, key: 'defaultReorderApprovalMode' } },
    update: {},
    create: { venueId: venue.id, key: 'defaultReorderApprovalMode', value: 'REQUIRE_WAITER' },
  });

  const standardTax = await prisma.taxProfile.upsert({
    where: { venueId_code: { venueId: venue.id, code: 'DE_STANDARD' } },
    update: { rateBasisPoints: 1900 },
    create: {
      venueId: venue.id,
      code: 'DE_STANDARD',
      name: 'Regelsteuersatz 19 %',
      rateBasisPoints: 1900,
      isDefault: true,
    },
  });

  const reducedTax = await prisma.taxProfile.upsert({
    where: { venueId_code: { venueId: venue.id, code: 'DE_REDUCED' } },
    update: { rateBasisPoints: 700 },
    create: {
      venueId: venue.id,
      code: 'DE_REDUCED',
      name: 'Ermäßigter Steuersatz 7 %',
      rateBasisPoints: 700,
    },
  });

  const kitchen = await prisma.productionStation.upsert({
    where: { venueId_kind_name: { venueId: venue.id, kind: 'KITCHEN', name: 'Küche' } },
    update: {},
    create: { venueId: venue.id, kind: 'KITCHEN', name: 'Küche' },
  });

  const bar = await prisma.productionStation.upsert({
    where: { venueId_kind_name: { venueId: venue.id, kind: 'BAR', name: 'Bar' } },
    update: {},
    create: { venueId: venue.id, kind: 'BAR', name: 'Bar' },
  });

  for (const [code, name] of ALLERGENS) {
    const allergen = await prisma.allergen.upsert({
      where: { code },
      update: {},
      create: { code },
    });
    await prisma.allergenTranslation.upsert({
      where: { allergenId_locale: { allergenId: allergen.id, locale: LOCALE } },
      update: { name },
      create: { allergenId: allergen.id, locale: LOCALE, name },
    });
  }

  for (const [code, name] of ADDITIVES) {
    const additive = await prisma.additive.upsert({ where: { code }, update: {}, create: { code } });
    await prisma.additiveTranslation.upsert({
      where: { additiveId_locale: { additiveId: additive.id, locale: LOCALE } },
      update: { name },
      create: { additiveId: additive.id, locale: LOCALE, name },
    });
  }

  for (const [code, name] of DIETARY_TAGS) {
    const tag = await prisma.dietaryTag.upsert({ where: { code }, update: {}, create: { code } });
    await prisma.dietaryTagTranslation.upsert({
      where: { tagId_locale: { tagId: tag.id, locale: LOCALE } },
      update: { name },
      create: { tagId: tag.id, locale: LOCALE, name },
    });
  }

  const categorySpecs = [
    { slug: 'vorspeisen', title: 'Vorspeisen', sortOrder: 10 },
    { slug: 'hauptgerichte', title: 'Hauptgerichte', sortOrder: 20 },
    { slug: 'desserts', title: 'Desserts', sortOrder: 30 },
    { slug: 'getraenke', title: 'Getränke', sortOrder: 40 },
  ];

  const categories = new Map<string, string>();

  for (const spec of categorySpecs) {
    const category = await prisma.menuCategory.upsert({
      where: { venueId_slug: { venueId: venue.id, slug: spec.slug } },
      update: { sortOrder: spec.sortOrder, isPublished: true },
      create: {
        venueId: venue.id,
        slug: spec.slug,
        sortOrder: spec.sortOrder,
        isPublished: true,
      },
    });
    await prisma.menuCategoryTranslation.upsert({
      where: { categoryId_locale: { categoryId: category.id, locale: LOCALE } },
      update: { title: spec.title },
      create: { categoryId: category.id, locale: LOCALE, title: spec.title },
    });
    categories.set(spec.slug, category.id);
  }

  type ItemSpec = {
    slug: string;
    category: string;
    name: string;
    shortDescription: string;
    ingredients?: string;
    priceCents: number;
    station: string;
    tax: string;
    allergens?: string[];
    dietary?: string[];
    spice?: 'NONE' | 'MILD' | 'MEDIUM' | 'HOT';
    variants?: Array<{ name: string; priceCents: number; amountValue?: number; amountUnit?: string }>;
  };

  const items: ItemSpec[] = [
    {
      slug: 'kartoffelsuppe',
      category: 'vorspeisen',
      name: 'Kartoffelsuppe',
      shortDescription: 'Cremige Suppe mit Majoran und geröstetem Brot',
      ingredients: 'Kartoffeln, Lauch, Sellerie, Sahne, Majoran, Weizenbrot',
      priceCents: 690,
      station: 'KITCHEN',
      tax: 'DE_STANDARD',
      allergens: ['GLUTEN', 'MILK', 'CELERY'],
      dietary: ['VEGETARIAN'],
    },
    {
      slug: 'feldsalat',
      category: 'vorspeisen',
      name: 'Feldsalat mit Walnüssen',
      shortDescription: 'Feldsalat, Walnüsse, Apfel, Senfdressing',
      priceCents: 820,
      station: 'KITCHEN',
      tax: 'DE_STANDARD',
      allergens: ['NUTS', 'MUSTARD'],
      dietary: ['VEGETARIAN', 'GLUTEN_FREE'],
    },
    {
      slug: 'wiener-schnitzel',
      category: 'hauptgerichte',
      name: 'Wiener Schnitzel',
      shortDescription: 'Kalbsschnitzel paniert, mit Kartoffelsalat und Zitrone',
      ingredients: 'Kalbfleisch, Weizenmehl, Ei, Semmelbrösel, Butterschmalz',
      priceCents: 2450,
      station: 'KITCHEN',
      tax: 'DE_STANDARD',
      allergens: ['GLUTEN', 'EGGS', 'MILK'],
    },
    {
      slug: 'pfifferlinge-rahm',
      category: 'hauptgerichte',
      name: 'Pfifferlinge in Rahm',
      shortDescription: 'Mit Semmelknödel und Petersilie',
      priceCents: 1980,
      station: 'KITCHEN',
      tax: 'DE_STANDARD',
      allergens: ['GLUTEN', 'MILK', 'EGGS'],
      dietary: ['VEGETARIAN'],
    },
    {
      slug: 'gulasch',
      category: 'hauptgerichte',
      name: 'Rindergulasch',
      shortDescription: 'Langsam geschmort, mit Rotkohl und Klößen',
      priceCents: 2190,
      station: 'KITCHEN',
      tax: 'DE_STANDARD',
      allergens: ['CELERY', 'GLUTEN'],
      spice: 'MILD',
    },
    {
      slug: 'apfelstrudel',
      category: 'desserts',
      name: 'Apfelstrudel',
      shortDescription: 'Warm, mit Vanillesoße',
      priceCents: 780,
      station: 'KITCHEN',
      tax: 'DE_STANDARD',
      allergens: ['GLUTEN', 'MILK', 'EGGS'],
      dietary: ['VEGETARIAN'],
    },
    {
      slug: 'pils',
      category: 'getraenke',
      name: 'Pils vom Fass',
      shortDescription: 'Frisch gezapft',
      priceCents: 390,
      station: 'BAR',
      tax: 'DE_STANDARD',
      allergens: ['GLUTEN'],
      dietary: ['VEGAN'],
      variants: [
        { name: 'Kleines Glas', priceCents: 390, amountValue: 300, amountUnit: 'ml' },
        { name: 'Großes Glas', priceCents: 520, amountValue: 500, amountUnit: 'ml' },
      ],
    },
    {
      slug: 'apfelschorle',
      category: 'getraenke',
      name: 'Apfelschorle',
      shortDescription: 'Naturtrüb, mit Mineralwasser',
      priceCents: 350,
      station: 'BAR',
      tax: 'DE_REDUCED',
      dietary: ['VEGAN', 'GLUTEN_FREE'],
      variants: [
        { name: 'Klein', priceCents: 350, amountValue: 300, amountUnit: 'ml' },
        { name: 'Groß', priceCents: 490, amountValue: 500, amountUnit: 'ml' },
      ],
    },
    {
      slug: 'kaffee',
      category: 'getraenke',
      name: 'Kaffee',
      shortDescription: 'Filterkaffee aus regionaler Röstung',
      priceCents: 320,
      station: 'BAR',
      tax: 'DE_REDUCED',
      dietary: ['VEGAN'],
    },
  ];

  let sortOrder = 0;

  for (const spec of items) {
    sortOrder += 10;
    const categoryId = categories.get(spec.category);
    if (!categoryId) throw new Error(`Категория ${spec.category} не найдена в сиде.`);

    const item = await prisma.menuItem.upsert({
      where: { venueId_slug: { venueId: venue.id, slug: spec.slug } },
      update: {
        basePriceCents: spec.priceCents,
        isPublished: true,
        isAvailable: true,
        sortOrder,
      },
      create: {
        venueId: venue.id,
        categoryId,
        stationId: spec.station === 'BAR' ? bar.id : kitchen.id,
        taxProfileId: spec.tax === 'DE_REDUCED' ? reducedTax.id : standardTax.id,
        slug: spec.slug,
        basePriceCents: spec.priceCents,
        isPublished: true,
        isAvailable: true,
        spiceLevel: spec.spice ?? 'NONE',
        sortOrder,
      },
    });

    await prisma.menuItemTranslation.upsert({
      where: { itemId_locale: { itemId: item.id, locale: LOCALE } },
      update: {
        name: spec.name,
        shortDescription: spec.shortDescription,
        ingredients: spec.ingredients ?? null,
      },
      create: {
        itemId: item.id,
        locale: LOCALE,
        name: spec.name,
        shortDescription: spec.shortDescription,
        ingredients: spec.ingredients ?? null,
      },
    });

    for (const code of spec.allergens ?? []) {
      const allergen = await prisma.allergen.findUnique({ where: { code } });
      if (!allergen) continue;
      await prisma.menuItemAllergen.upsert({
        where: { itemId_allergenId: { itemId: item.id, allergenId: allergen.id } },
        update: {},
        create: { itemId: item.id, allergenId: allergen.id },
      });
    }

    for (const code of spec.dietary ?? []) {
      const tag = await prisma.dietaryTag.findUnique({ where: { code } });
      if (!tag) continue;
      await prisma.menuItemDietaryTag.upsert({
        where: { itemId_tagId: { itemId: item.id, tagId: tag.id } },
        update: {},
        create: { itemId: item.id, tagId: tag.id },
      });
    }

    let variantOrder = 0;
    for (const variant of spec.variants ?? []) {
      variantOrder += 10;
      const sku = `${spec.slug}-${variantOrder}`;
      const existing = await prisma.menuVariant.findFirst({ where: { itemId: item.id, sku } });

      const saved = existing
        ? await prisma.menuVariant.update({
            where: { id: existing.id },
            data: { priceCents: variant.priceCents, sortOrder: variantOrder },
          })
        : await prisma.menuVariant.create({
            data: {
              itemId: item.id,
              sku,
              priceCents: variant.priceCents,
              amountValue: variant.amountValue ?? null,
              amountUnit: variant.amountUnit ?? null,
              isDefault: variantOrder === 10,
              sortOrder: variantOrder,
              taxProfileId: spec.tax === 'DE_REDUCED' ? reducedTax.id : standardTax.id,
            },
          });

      await prisma.menuVariantTranslation.upsert({
        where: { variantId_locale: { variantId: saved.id, locale: LOCALE } },
        update: { name: variant.name },
        create: { variantId: saved.id, locale: LOCALE, name: variant.name },
      });
    }
  }

  // Столы и QR-токены: токен выпускается только если активного ещё нет.
  const issuedTokens: Array<{ label: string; token: string }> = [];

  for (let number = 1; number <= 8; number += 1) {
    const label = String(number);
    const table = await prisma.diningTable.upsert({
      where: { venueId_label: { venueId: venue.id, label } },
      update: { isActive: true, sortOrder: number },
      create: { venueId: venue.id, label, seats: 4, sortOrder: number },
    });

    const active = await prisma.tableQrToken.findFirst({
      where: { tableId: table.id, revokedAt: null },
    });

    if (!active) {
      const token = generateOpaqueToken(24);
      await prisma.tableQrToken.create({ data: { tableId: table.id, token } });
      issuedTokens.push({ label, token });
    }
  }

  await seedRbac();

  // Учётная запись владельца — только для локальной разработки.
  const ownerEmail = (process.env.SEED_OWNER_EMAIL ?? 'owner@dmr.local').toLowerCase();
  const ownerPassword = process.env.SEED_OWNER_PASSWORD;

  if (!ownerPassword) {
    console.warn('SEED_OWNER_PASSWORD не задан — учётная запись владельца не создана.');
  } else {
    const owner = await prisma.staffUser.upsert({
      where: { email: ownerEmail },
      update: { status: 'ACTIVE' },
      create: {
        venueId: venue.id,
        email: ownerEmail,
        displayName: 'Inhaber',
        passwordHash: await hashPassword(ownerPassword),
        status: 'ACTIVE',
      },
    });

    const ownerRole = await prisma.role.findUnique({ where: { code: 'OWNER' } });
    if (ownerRole) {
      await prisma.staffUserRole.upsert({
        where: { staffUserId_roleId: { staffUserId: owner.id, roleId: ownerRole.id } },
        update: {},
        create: { staffUserId: owner.id, roleId: ownerRole.id },
      });
    }
  }

  console.log('Сид выполнен.');
  if (issuedTokens.length > 0) {
    console.log('Новые QR-токены столов (сохраните, повторно не показываются):');
    for (const entry of issuedTokens) {
      console.log(`  Tisch ${entry.label}: /t/${entry.token}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
import 'dotenv/config';
