'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/domains/staff/server/rbac';
import { setMenuItemAvailability } from '@/domains/menu/server/menu.service';
import {
  saveMenuCategory,
  saveMenuItem,
  updateMenuItemPreparationSla,
} from '@/domains/menu/server/menu.service';
import { updateReadyHandoffSlaSettings } from '@/domains/production/server/production-sla.service';
import { MAX_SLA_MINUTES, MIN_SLA_MINUTES } from '@/domains/production/shared/sla';
import {
  MAX_MENU_PRICE_CENTS,
  MAX_MENU_ITEM_ALLERGENS,
  MENU_SLUG_PATTERN,
  parseEuroPrice,
  uniqueReferenceIds,
} from '@/domains/menu/shared/editor';

const availabilitySchema = z.object({
  itemId: z.string().min(1).max(64),
  isAvailable: z.boolean(),
});

const minutesSchema = z.number().int().min(MIN_SLA_MINUTES).max(MAX_SLA_MINUTES).nullable();
const thresholdsSchema = z
  .object({
    warningMinutes: minutesSchema,
    criticalMinutes: minutesSchema,
  })
  .refine(
    (value) =>
      (value.warningMinutes === null && value.criticalMinutes === null) ||
      (value.warningMinutes !== null &&
        value.criticalMinutes !== null &&
        value.criticalMinutes >= value.warningMinutes),
  );

const preparationSlaSchema = z
  .object({
    itemId: z.string().min(1).max(64),
    warningMinutes: minutesSchema,
    criticalMinutes: minutesSchema,
  })
  .refine(
    (value) =>
      (value.warningMinutes === null && value.criticalMinutes === null) ||
      (value.warningMinutes !== null &&
        value.criticalMinutes !== null &&
        value.criticalMinutes >= value.warningMinutes),
  );

const slugSchema = z.string().trim().min(2).max(80).regex(MENU_SLUG_PATTERN);
const translatedCategorySchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500),
});
const translatedItemSchema = z.object({
  name: z.string().trim().min(1).max(160),
  shortDescription: z.string().trim().max(300),
  fullDescription: z.string().trim().max(4_000),
  ingredients: z.string().trim().max(2_000),
});
const categoryEditorSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  slug: slugSchema,
  sortOrder: z.number().int().min(0).max(10_000),
  isPublished: z.boolean(),
  translations: z.object({ de: translatedCategorySchema, ru: translatedCategorySchema }),
});
const itemEditorSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  categoryId: z.string().min(1).max(64),
  stationId: z.string().min(1).max(64).nullable(),
  taxProfileId: z.string().min(1).max(64).nullable(),
  slug: slugSchema,
  price: z.string().trim().min(1).max(20),
  isPublished: z.boolean(),
  isAvailable: z.boolean(),
  spiceLevel: z.enum(['NONE', 'MILD', 'MEDIUM', 'HOT']),
  sortOrder: z.number().int().min(0).max(10_000),
  allergenIds: z.array(z.string().min(1).max(64)).max(MAX_MENU_ITEM_ALLERGENS),
  translations: z.object({ de: translatedItemSchema, ru: translatedItemSchema }),
});

export async function saveMenuCategoryAction(payload: unknown) {
  const parsed = categoryEditorSchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, reason: 'invalid_input' as const };

  const principal = await requirePermission('MANAGE_MENU');
  const headerList = await headers();
  let result;
  try {
    result = await saveMenuCategory(parsed.data, {
      staffUserId: principal.id,
      venueId: principal.venueId,
      ip: forwardedIp(headerList),
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { ok: false as const, reason: 'duplicate_slug' as const };
    }
    throw error;
  }
  revalidateMenuScreens();
  return result;
}

export async function saveMenuItemAction(payload: unknown) {
  const parsed = itemEditorSchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, reason: 'invalid_input' as const };
  const basePriceCents = parseEuroPrice(parsed.data.price);
  if (basePriceCents === null || basePriceCents > MAX_MENU_PRICE_CENTS) {
    return { ok: false as const, reason: 'invalid_input' as const };
  }
  const allergenIds = uniqueReferenceIds(parsed.data.allergenIds);
  if (allergenIds.length !== parsed.data.allergenIds.length) {
    return { ok: false as const, reason: 'invalid_input' as const };
  }

  const principal = await requirePermission('MANAGE_MENU');
  const headerList = await headers();
  const { price: ignoredPrice, ...input } = parsed.data;
  void ignoredPrice;
  let result;
  try {
    result = await saveMenuItem(
      { ...input, allergenIds, basePriceCents },
      {
        staffUserId: principal.id,
        venueId: principal.venueId,
        ip: forwardedIp(headerList),
      },
    );
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { ok: false as const, reason: 'duplicate_slug' as const };
    }
    throw error;
  }
  revalidateMenuScreens();
  return result;
}

export async function setAvailabilityAction(payload: unknown) {
  const parsed = availabilitySchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, reason: 'invalid_input' as const };
  const principal = await requirePermission('MANAGE_MENU');
  const headerList = await headers();
  const result = await setMenuItemAvailability(parsed.data.itemId, parsed.data.isAvailable, {
    staffUserId: principal.id,
    venueId: principal.venueId,
    ip: headerList.get('x-forwarded-for')?.split(',')[0]?.trim(),
  });
  revalidatePath('/[locale]/admin/speisekarte', 'page');
  revalidatePath('/[locale]', 'page');
  return result;
}

export async function updatePreparationSlaAction(payload: unknown) {
  const parsed = preparationSlaSchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, reason: 'invalid_input' as const };

  const principal = await requirePermission('MANAGE_MENU');
  const headerList = await headers();
  const result = await updateMenuItemPreparationSla(
    parsed.data.itemId,
    {
      warningMinutes: parsed.data.warningMinutes,
      criticalMinutes: parsed.data.criticalMinutes,
    },
    {
      staffUserId: principal.id,
      venueId: principal.venueId,
      ip: headerList.get('x-forwarded-for')?.split(',')[0]?.trim(),
    },
  );
  revalidateOperationalScreens();
  return result;
}

export async function updateReadyHandoffSlaAction(payload: unknown) {
  const parsed = thresholdsSchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, reason: 'invalid_input' as const };

  const principal = await requirePermission('MANAGE_OPERATIONAL_SETTINGS');
  const headerList = await headers();
  const result = await updateReadyHandoffSlaSettings(parsed.data, {
    staffUserId: principal.id,
    venueId: principal.venueId,
    ip: headerList.get('x-forwarded-for')?.split(',')[0]?.trim(),
  });
  revalidateOperationalScreens();
  return result;
}

function revalidateOperationalScreens() {
  revalidatePath('/[locale]/admin/speisekarte', 'page');
  revalidatePath('/[locale]/service', 'page');
  revalidatePath('/[locale]/service/[sessionId]', 'page');
  revalidatePath('/[locale]/produktion/kueche', 'page');
  revalidatePath('/[locale]/produktion/bar', 'page');
}

function revalidateMenuScreens() {
  revalidatePath('/[locale]/admin/speisekarte', 'page');
  revalidatePath('/[locale]', 'page');
}

function forwardedIp(headerList: Headers): string | undefined {
  return headerList.get('x-forwarded-for')?.split(',')[0]?.trim();
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}
