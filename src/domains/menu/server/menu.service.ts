import 'server-only';
import { prisma } from '@/lib/prisma';
import { recordAuditLog } from '@/domains/audit/server/audit.service';
import type { ProductionSlaThresholds } from '@/domains/production/shared/sla';
import { isCompleteSlaThresholds } from '@/domains/production/shared/sla';
import type { SpiceLevel } from '@/domains/menu/shared/types';

type MenuActor = { staffUserId: string; venueId: string; ip?: string };
type CategoryTranslationInput = { title: string; description: string };
type ItemTranslationInput = {
  name: string;
  shortDescription: string;
  fullDescription: string;
  ingredients: string;
};

export type CategoryEditorInput = {
  id?: string;
  slug: string;
  sortOrder: number;
  isPublished: boolean;
  translations: { de: CategoryTranslationInput; ru: CategoryTranslationInput };
};

export type MenuItemEditorInput = {
  id?: string;
  categoryId: string;
  stationId: string | null;
  taxProfileId: string | null;
  slug: string;
  basePriceCents: number;
  isPublished: boolean;
  isAvailable: boolean;
  spiceLevel: SpiceLevel;
  sortOrder: number;
  allergenIds: string[];
  translations: { de: ItemTranslationInput; ru: ItemTranslationInput };
};

type EditorResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'not_found' | 'duplicate_slug' | 'invalid_reference' };

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export async function saveMenuCategory(
  input: CategoryEditorInput,
  actor: MenuActor,
): Promise<EditorResult> {
  const duplicate = await prisma.menuCategory.findFirst({
    where: {
      venueId: actor.venueId,
      slug: input.slug,
      ...(input.id ? { id: { not: input.id } } : {}),
    },
    select: { id: true },
  });
  if (duplicate) return { ok: false, reason: 'duplicate_slug' };

  if (input.id) {
    const existing = await prisma.menuCategory.findFirst({
      where: { id: input.id, venueId: actor.venueId },
      include: { translations: true },
    });
    if (!existing) return { ok: false, reason: 'not_found' };

    await prisma.$transaction(async (tx) => {
      await tx.menuCategory.update({
        where: { id: existing.id },
        data: {
          slug: input.slug,
          sortOrder: input.sortOrder,
          isPublished: input.isPublished,
          translations: {
            upsert: (['de', 'ru'] as const).map((locale) => ({
              where: { categoryId_locale: { categoryId: existing.id, locale } },
              create: {
                locale,
                title: input.translations[locale].title.trim(),
                description: optionalText(input.translations[locale].description),
              },
              update: {
                title: input.translations[locale].title.trim(),
                description: optionalText(input.translations[locale].description),
              },
            })),
          },
        },
      });
      await recordAuditLog(
        {
          venueId: actor.venueId,
          actorType: 'STAFF',
          actorId: actor.staffUserId,
          action: 'MENU_CATEGORY_UPDATED',
          entityType: 'MenuCategory',
          entityId: existing.id,
          previousValue: {
            slug: existing.slug,
            sortOrder: existing.sortOrder,
            isPublished: existing.isPublished,
          },
          newValue: {
            slug: input.slug,
            sortOrder: input.sortOrder,
            isPublished: input.isPublished,
          },
          ip: actor.ip,
        },
        tx,
      );
    });
    return { ok: true, id: existing.id };
  }

  const category = await prisma.$transaction(async (tx) => {
    const created = await tx.menuCategory.create({
      data: {
        venueId: actor.venueId,
        slug: input.slug,
        sortOrder: input.sortOrder,
        isPublished: input.isPublished,
        translations: {
          create: (['de', 'ru'] as const).map((locale) => ({
            locale,
            title: input.translations[locale].title.trim(),
            description: optionalText(input.translations[locale].description),
          })),
        },
      },
      select: { id: true },
    });
    await recordAuditLog(
      {
        venueId: actor.venueId,
        actorType: 'STAFF',
        actorId: actor.staffUserId,
        action: 'MENU_CATEGORY_CREATED',
        entityType: 'MenuCategory',
        entityId: created.id,
        newValue: { slug: input.slug, isPublished: input.isPublished },
        ip: actor.ip,
      },
      tx,
    );
    return created;
  });
  return { ok: true, id: category.id };
}

export async function saveMenuItem(
  input: MenuItemEditorInput,
  actor: MenuActor,
): Promise<EditorResult> {
  const [category, station, taxProfile, allergens, duplicate] = await Promise.all([
    prisma.menuCategory.findFirst({
      where: { id: input.categoryId, venueId: actor.venueId },
      select: { id: true },
    }),
    input.stationId
      ? prisma.productionStation.findFirst({
          where: { id: input.stationId, venueId: actor.venueId, isActive: true },
          select: { id: true },
        })
      : Promise.resolve(null),
    input.taxProfileId
      ? prisma.taxProfile.findFirst({
          where: { id: input.taxProfileId, venueId: actor.venueId },
          select: { id: true },
        })
      : Promise.resolve(null),
    prisma.allergen.findMany({
      where: { id: { in: input.allergenIds } },
      select: { id: true },
    }),
    prisma.menuItem.findFirst({
      where: {
        venueId: actor.venueId,
        slug: input.slug,
        ...(input.id ? { id: { not: input.id } } : {}),
      },
      select: { id: true },
    }),
  ]);

  if (
    !category ||
    (input.stationId && !station) ||
    (input.taxProfileId && !taxProfile) ||
    allergens.length !== input.allergenIds.length
  ) {
    return { ok: false, reason: 'invalid_reference' };
  }
  if (duplicate) return { ok: false, reason: 'duplicate_slug' };

  const existing = input.id
    ? await prisma.menuItem.findFirst({
        where: { id: input.id, venueId: actor.venueId },
        select: {
          id: true,
          slug: true,
          categoryId: true,
          stationId: true,
          taxProfileId: true,
          basePriceCents: true,
          isPublished: true,
          isAvailable: true,
          spiceLevel: true,
          sortOrder: true,
          allergens: { select: { allergenId: true } },
        },
      })
    : null;
  if (input.id && !existing) return { ok: false, reason: 'not_found' };

  const item = await prisma.$transaction(async (tx) => {
    const data = {
      categoryId: input.categoryId,
      stationId: input.stationId,
      taxProfileId: input.taxProfileId,
      slug: input.slug,
      basePriceCents: input.basePriceCents,
      isPublished: input.isPublished,
      isAvailable: input.isAvailable,
      spiceLevel: input.spiceLevel,
      sortOrder: input.sortOrder,
    };
    const saved = existing
      ? await tx.menuItem.update({
          where: { id: existing.id },
          data: {
            ...data,
            translations: {
              upsert: (['de', 'ru'] as const).map((locale) => ({
                where: { itemId_locale: { itemId: existing.id, locale } },
                create: {
                  locale,
                  name: input.translations[locale].name.trim(),
                  shortDescription: optionalText(input.translations[locale].shortDescription),
                  fullDescription: optionalText(input.translations[locale].fullDescription),
                  ingredients: optionalText(input.translations[locale].ingredients),
                },
                update: {
                  name: input.translations[locale].name.trim(),
                  shortDescription: optionalText(input.translations[locale].shortDescription),
                  fullDescription: optionalText(input.translations[locale].fullDescription),
                  ingredients: optionalText(input.translations[locale].ingredients),
                },
              })),
            },
          },
          select: { id: true },
        })
      : await tx.menuItem.create({
          data: {
            venueId: actor.venueId,
            ...data,
            translations: {
              create: (['de', 'ru'] as const).map((locale) => ({
                locale,
                name: input.translations[locale].name.trim(),
                shortDescription: optionalText(input.translations[locale].shortDescription),
                fullDescription: optionalText(input.translations[locale].fullDescription),
                ingredients: optionalText(input.translations[locale].ingredients),
              })),
            },
          },
          select: { id: true },
        });

    await tx.menuItemAllergen.deleteMany({ where: { itemId: saved.id } });
    if (input.allergenIds.length > 0) {
      await tx.menuItemAllergen.createMany({
        data: input.allergenIds.map((allergenId) => ({ itemId: saved.id, allergenId })),
      });
    }

    await recordAuditLog(
      {
        venueId: actor.venueId,
        actorType: 'STAFF',
        actorId: actor.staffUserId,
        action: existing ? 'MENU_ITEM_UPDATED' : 'MENU_ITEM_CREATED',
        entityType: 'MenuItem',
        entityId: saved.id,
        previousValue: existing
          ? {
              ...existing,
              allergenIds: existing.allergens.map((link) => link.allergenId),
            }
          : undefined,
        newValue: { ...data, allergenIds: input.allergenIds },
        ip: actor.ip,
      },
      tx,
    );
    return saved;
  });

  return { ok: true, id: item.id };
}

export async function setMenuItemAvailability(
  itemId: string,
  isAvailable: boolean,
  actor: { staffUserId: string; venueId: string; ip?: string },
): Promise<{ ok: true } | { ok: false; reason: 'not_found' }> {
  const item = await prisma.menuItem.findFirst({
    where: { id: itemId, venueId: actor.venueId },
    select: { id: true, isAvailable: true },
  });
  if (!item) return { ok: false, reason: 'not_found' };

  if (item.isAvailable !== isAvailable) {
    await prisma.menuItem.update({ where: { id: item.id }, data: { isAvailable } });
    await recordAuditLog({
      venueId: actor.venueId,
      actorType: 'STAFF',
      actorId: actor.staffUserId,
      action: 'MENU_ITEM_AVAILABILITY_CHANGED',
      entityType: 'MenuItem',
      entityId: item.id,
      previousValue: { isAvailable: item.isAvailable },
      newValue: { isAvailable },
      ip: actor.ip,
    });
  }

  return { ok: true };
}

export async function updateMenuItemPreparationSla(
  itemId: string,
  thresholds: ProductionSlaThresholds,
  actor: { staffUserId: string; venueId: string; ip?: string },
): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'invalid_input' }> {
  if (!isCompleteSlaThresholds(thresholds)) {
    return { ok: false, reason: 'invalid_input' };
  }

  const item = await prisma.menuItem.findFirst({
    where: { id: itemId, venueId: actor.venueId },
    select: {
      id: true,
      recommendedPreparationMinutes: true,
      criticalPreparationMinutes: true,
    },
  });
  if (!item) return { ok: false, reason: 'not_found' };

  const previous = {
    warningMinutes: item.recommendedPreparationMinutes,
    criticalMinutes: item.criticalPreparationMinutes,
  };
  if (
    previous.warningMinutes === thresholds.warningMinutes &&
    previous.criticalMinutes === thresholds.criticalMinutes
  ) {
    return { ok: true };
  }

  await prisma.$transaction(async (tx) => {
    await tx.menuItem.update({
      where: { id: item.id },
      data: {
        recommendedPreparationMinutes: thresholds.warningMinutes,
        criticalPreparationMinutes: thresholds.criticalMinutes,
      },
    });
    await recordAuditLog(
      {
        venueId: actor.venueId,
        actorType: 'STAFF',
        actorId: actor.staffUserId,
        action: 'MENU_ITEM_PREPARATION_SLA_CHANGED',
        entityType: 'MenuItem',
        entityId: item.id,
        previousValue: previous,
        newValue: thresholds,
        ip: actor.ip,
      },
      tx,
    );
  });

  return { ok: true };
}
