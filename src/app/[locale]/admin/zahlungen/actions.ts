'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/domains/staff/server/rbac';
import { closeSession } from '@/domains/sessions/server/session.service';

export async function closePaidSessionAction(sessionId: string): Promise<{ ok: true }> {
  const safeSessionId = z.string().min(1).max(64).parse(sessionId);
  const principal = await requirePermission('MANAGE_DINING_SESSION');
  const headerList = await headers();

  await closeSession(safeSessionId, {
    staffUserId: principal.id,
    venueId: principal.venueId,
    ip: headerList.get('x-forwarded-for')?.split(',')[0]?.trim(),
  });

  revalidatePath('/[locale]/admin/zahlungen', 'page');
  revalidatePath('/[locale]/service', 'page');
  revalidatePath('/[locale]', 'page');

  return { ok: true };
}
