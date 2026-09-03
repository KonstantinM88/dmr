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
import {
  MAX_ORDER_ITEM_QUANTITY,
  MIN_ORDER_ITEM_QUANTITY,
} from '@/domains/orders/shared/round-quantity';
import { requestPayment } from '@/domains/billing/server/bill.service';
import { recordAuditLog } from '@/domains/audit/server/audit.service';
import {
  updateWaiterCallByStaff,
} from '@/domains/service-requests/server/waiter-call.service';
import {
  cancelCashAttemptByStaff,
  confirmCashPayment,
  startCashPaymentByStaff,
} from '@/domains/payments/server/payment.service';

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
  itemQuantities: z.array(
    z.object({
      orderItemId: z.string().min(1).max(64),
      quantity: z.number().int().min(MIN_ORDER_ITEM_QUANTITY).max(MAX_ORDER_ITEM_QUANTITY),
    }),
  ).min(1).max(100),
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
      itemQuantities: parsed.data.itemQuantities,
      note: parsed.data.note,
    },
    { staffUserId: principal.id, venueId: principal.venueId, ip: await clientIp() },
  );

  revalidatePath('/[locale]/service/[sessionId]', 'page');
  revalidatePath('/[locale]/service', 'page');
  revalidatePath('/[locale]', 'page');
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
  revalidatePath('/[locale]/service', 'page');
  revalidatePath('/[locale]', 'page');
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

/**
 * Официант готовит счёт к оплате (permission REQUEST_PAYMENT).
 * Сессия при этом НЕ блокируется: PAYMENT_PENDING наступает только при
 * реальной попытке оплаты, иначе стол «залипал» бы от случайного нажатия.
 */
export async function requestPaymentAction(sessionId: string) {
  const principal = await requirePermission('REQUEST_PAYMENT');
  const safeSessionId = z.string().min(1).max(64).parse(sessionId);

  const result = await requestPayment(safeSessionId, {
    staffUserId: principal.id,
    venueId: principal.venueId,
  });

  await recordAuditLog({
    venueId: principal.venueId,
    actorType: 'STAFF',
    actorId: principal.id,
    action: 'PAYMENT_REQUESTED',
    entityType: 'Bill',
    entityId: result.billId,
    ip: await clientIp(),
  });

  revalidatePath('/[locale]/service/[sessionId]', 'page');
  return result;
}

const callIdSchema = z.string().min(1).max(64);

export async function acknowledgeWaiterCallAction(callId: string) {
  const parsed = callIdSchema.safeParse(callId);
  if (!parsed.success) return { ok: false as const };
  const principal = await requirePermission('VIEW_ASSIGNED_TABLES');
  const result = await updateWaiterCallByStaff(parsed.data, 'ACKNOWLEDGED', {
    staffUserId: principal.id,
    venueId: principal.venueId,
  });
  revalidatePath('/[locale]/service', 'page');
  return result;
}

export async function resolveWaiterCallAction(callId: string) {
  const parsed = callIdSchema.safeParse(callId);
  if (!parsed.success) return { ok: false as const };
  const principal = await requirePermission('VIEW_ASSIGNED_TABLES');
  const result = await updateWaiterCallByStaff(parsed.data, 'RESOLVED', {
    staffUserId: principal.id,
    venueId: principal.venueId,
  });
  revalidatePath('/[locale]/service', 'page');
  return result;
}

const confirmCashSchema = z.object({
  attemptId: z.string().min(1).max(64),
  receivedCents: z.number().int().positive().max(10_000_000),
});

const staffCashStartSchema = z.object({
  sessionId: z.string().min(1).max(64),
  selectedItems: z.array(z.object({
    orderItemId: z.string().min(1).max(64),
    quantity: z.number().int().min(1).max(50),
  })).min(1).max(100),
});

export async function startStaffCashPaymentAction(payload: unknown) {
  const parsed = staffCashStartSchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, reason: 'invalid_selection' as const };

  const principal = await requirePermission('REGISTER_CASH_PAYMENT');
  const result = await startCashPaymentByStaff({
    sessionId: parsed.data.sessionId,
    selectedItems: parsed.data.selectedItems,
    staffUserId: principal.id,
    venueId: principal.venueId,
    ip: await clientIp(),
  });

  revalidatePath('/[locale]/service', 'page');
  revalidatePath('/[locale]/service/[sessionId]', 'page');
  revalidatePath('/[locale]/bezahlen', 'page');
  return result;
}

export async function confirmCashPaymentAction(payload: unknown) {
  const parsed = confirmCashSchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, reason: 'invalid_amount' as const };
  const principal = await requirePermission('REGISTER_CASH_PAYMENT');
  const result = await confirmCashPayment(parsed.data, {
    staffUserId: principal.id,
    venueId: principal.venueId,
  });
  revalidatePath('/[locale]/service', 'page');
  revalidatePath('/[locale]/service/[sessionId]', 'page');
  revalidatePath('/[locale]/bezahlen', 'page');
  return result;
}

export async function cancelCashPaymentAction(attemptId: string) {
  const parsed = z.string().min(1).max(64).safeParse(attemptId);
  if (!parsed.success) return { ok: true as const };
  const principal = await requirePermission('REGISTER_CASH_PAYMENT');
  await cancelCashAttemptByStaff(parsed.data, {
    staffUserId: principal.id,
    venueId: principal.venueId,
  });
  revalidatePath('/[locale]/service', 'page');
  revalidatePath('/[locale]/service/[sessionId]', 'page');
  revalidatePath('/[locale]/bezahlen', 'page');
  return { ok: true as const };
}
