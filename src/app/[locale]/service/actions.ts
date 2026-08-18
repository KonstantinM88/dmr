'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/domains/staff/server/rbac';
import {
  closeSession,
  openSessionForTable,
  setReorderApprovalMode,
} from '@/domains/sessions/server/session.service';
import { decideRound, markItemServed } from '@/domains/orders/server/round-decision.service';
import { createManualOrder, submitOrderSchema } from '@/domains/orders/server/order.service';
import { REORDER_APPROVAL_MODES } from '@/domains/sessions/shared/types';

/**
 * Server actions экрана официанта.
 * Каждое действие проверяет своё разрешение на сервере: скрытие кнопки в UI
 * защитой не считается (docs/rbac-matrix.md).
 */
async function clientIp(): Promise<string | undefined> {
  const headerList = await headers();
  return headerList.get('x-forwarded-for')?.split(',')[0]?.trim();
}

const decisionSchema = z.object({
  roundId: z.string().min(1).max(64),
  acceptedItemIds: z.array(z.string().min(1).max(64)).max(100),
  rejectedItemIds: z.array(z.string().min(1).max(64)).max(100),
  note: z.string().max(280).optional(),
});

export async function decideRoundAction(payload: unknown) {
  const parsed = decisionSchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, reason: 'invalid_input' as const };

  const principal = await requirePermission('APPROVE_ORDER_ROUND');

  const result = await decideRound(
    parsed.data.roundId,
    {
      acceptedItemIds: parsed.data.acceptedItemIds,
      rejectedItemIds: parsed.data.rejectedItemIds,
      note: parsed.data.note,
    },
    { staffUserId: principal.id, venueId: principal.venueId, ip: await clientIp() },
  );

  revalidatePath('/[locale]/service/[sessionId]', 'page');
  return result;
}

const modeSchema = z.object({
  sessionId: z.string().min(1).max(64),
  mode: z.enum(REORDER_APPROVAL_MODES),
});

export async function setApprovalModeAction(payload: unknown) {
  const parsed = modeSchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, reason: 'invalid_input' as const };

  const principal = await requirePermission('MANAGE_REORDER_APPROVAL');

  const result = await setReorderApprovalMode(parsed.data.sessionId, parsed.data.mode, {
    staffUserId: principal.id,
    venueId: principal.venueId,
    ip: await clientIp(),
  });

  revalidatePath('/[locale]/service/[sessionId]', 'page');
  return result;
}

export async function markServedAction(orderItemId: string) {
  const principal = await requirePermission('MARK_ITEM_SERVED');

  const result = await markItemServed(orderItemId, {
    staffUserId: principal.id,
    venueId: principal.venueId,
    ip: await clientIp(),
  });

  revalidatePath('/[locale]/service/[sessionId]', 'page');
  return result;
}

export async function openSessionAction(tableId: string) {
  const principal = await requirePermission('MANAGE_DINING_SESSION');

  const session = await openSessionForTable(tableId, {
    staffUserId: principal.id,
    actorType: 'STAFF',
  });

  revalidatePath('/[locale]/service', 'page');
  return { ok: true as const, sessionId: session.id };
}

export async function closeSessionAction(sessionId: string) {
  const principal = await requirePermission('MANAGE_DINING_SESSION');

  await closeSession(sessionId, {
    staffUserId: principal.id,
    venueId: principal.venueId,
    ip: await clientIp(),
  });

  revalidatePath('/[locale]/service', 'page');
  return { ok: true as const };
}

const manualOrderSchema = submitOrderSchema.extend({
  sessionId: z.string().min(1).max(64),
});

export async function createManualOrderAction(payload: unknown) {
  const parsed = manualOrderSchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, reason: 'empty_cart' as const };

  const principal = await requirePermission('CREATE_MANUAL_ORDER');

  const { sessionId, ...order } = parsed.data;

  const result = await createManualOrder(order, {
    sessionId,
    staffUserId: principal.id,
    venueId: principal.venueId,
    ip: await clientIp(),
  });

  revalidatePath('/[locale]/service/[sessionId]', 'page');
  return result;
}
