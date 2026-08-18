'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/domains/staff/server/rbac';
import { setMenuItemAvailability } from '@/domains/menu/server/menu.service';

const availabilitySchema = z.object({
  itemId: z.string().min(1).max(64),
  isAvailable: z.boolean(),
});

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
