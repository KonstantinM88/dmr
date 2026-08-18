'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/domains/staff/server/rbac';
import { transitionProductionTicket } from '@/domains/production/server/production.service';
import type { TransitionTicketResult } from '@/domains/production/shared/types';

const transitionSchema = z.object({
  ticketId: z.string().min(1).max(64),
  stationKind: z.enum(['KITCHEN', 'BAR']),
  to: z.enum(['ACCEPTED', 'IN_PROGRESS', 'READY', 'CANCELLED']),
});

export async function transitionTicketAction(payload: unknown): Promise<TransitionTicketResult> {
  const parsed = transitionSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, reason: 'invalid_transition' };

  const principal = await requirePermission('MANAGE_PRODUCTION_TICKET');
  await requirePermission(
    parsed.data.stationKind === 'KITCHEN' ? 'VIEW_KITCHEN_QUEUE' : 'VIEW_BAR_QUEUE',
  );
  const headerList = await headers();

  const result = await transitionProductionTicket(parsed.data.ticketId, parsed.data.to, {
    staffUserId: principal.id,
    venueId: principal.venueId,
    stationKind: parsed.data.stationKind,
    ip: headerList.get('x-forwarded-for')?.split(',')[0]?.trim(),
  });

  revalidatePath('/[locale]/produktion/kueche', 'page');
  revalidatePath('/[locale]/produktion/bar', 'page');
  revalidatePath('/[locale]/service/[sessionId]', 'page');
  revalidatePath('/[locale]', 'page');
  return result;
}
