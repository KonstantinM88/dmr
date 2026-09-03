'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/domains/staff/server/rbac';
import { setMenuItemAvailability } from '@/domains/menu/server/menu.service';
import { updateMenuItemPreparationSla } from '@/domains/menu/server/menu.service';
import { updateReadyHandoffSlaSettings } from '@/domains/production/server/production-sla.service';
import { MAX_SLA_MINUTES, MIN_SLA_MINUTES } from '@/domains/production/shared/sla';

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
