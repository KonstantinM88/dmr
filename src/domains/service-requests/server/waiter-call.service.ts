import 'server-only';
import { prisma } from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rate-limit';
import { resolveTableByToken } from '@/domains/tables/server/table.service';
import {
  getActiveSessionForTable,
  openSessionForTable,
} from '@/domains/sessions/server/session.service';
import { recordLifecycleEvent } from '@/domains/audit/server/audit.service';
import type {
  CallWaiterResult,
  WaiterCallView,
} from '@/domains/service-requests/shared/types';
import { assertWaiterCallTransition } from './waiter-call-state-machine';

const CALL_RATE_LIMIT = 4;
const CALL_RATE_WINDOW_MS = 10 * 60 * 1000;

export async function getActiveWaiterCall(sessionId: string): Promise<WaiterCallView | null> {
  const call = await prisma.waiterCall.findFirst({
    where: { sessionId, status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
    orderBy: { requestedAt: 'asc' },
    include: { session: { include: { table: { select: { label: true } } } } },
  });
  return call
    ? toView({ ...call, status: call.status as 'OPEN' | 'ACKNOWLEDGED' })
    : null;
}

export async function callWaiter(context: {
  tableToken: string | undefined;
}): Promise<CallWaiterResult> {
  if (!context.tableToken) return { ok: false, reason: 'no_table' };
  const table = await resolveTableByToken(context.tableToken);
  if (!table) return { ok: false, reason: 'no_table' };

  let session = await getActiveSessionForTable(table.tableId);
  if (!session) {
    session = await openSessionForTable(table.tableId, { actorType: 'GUEST' });
  }
  if (session.status === 'CLOSED' || session.status === 'CANCELLED') {
    return { ok: false, reason: 'session_closed' };
  }

  const existing = await getActiveWaiterCall(session.id);
  if (existing) return { ok: true, call: existing, reused: true };

  const limit = checkRateLimit(
    `waiter-call:${table.tableId}`,
    CALL_RATE_LIMIT,
    CALL_RATE_WINDOW_MS,
  );
  if (!limit.allowed) return { ok: false, reason: 'rate_limited' };

  try {
    const call = await prisma.$transaction(async (tx) => {
      const created = await tx.waiterCall.create({ data: { sessionId: session.id } });
      await recordLifecycleEvent(
        {
          entityType: 'WaiterCall',
          entityId: created.id,
          fromState: null,
          toState: 'OPEN',
          actorType: 'GUEST',
          metadata: { tableId: table.tableId },
        },
        tx,
      );
      return created;
    });
    return {
      ok: true,
      reused: false,
      call: {
        id: call.id,
        sessionId: session.id,
        tableLabel: table.label,
        status: 'OPEN',
        requestedAt: call.requestedAt.toISOString(),
        acknowledgedAt: null,
      },
    };
  } catch (error) {
    const winner = await getActiveWaiterCall(session.id);
    if (winner) return { ok: true, call: winner, reused: true };
    throw error;
  }
}

export async function cancelGuestWaiterCall(input: {
  callId: string;
  tableToken: string | undefined;
}): Promise<void> {
  if (!input.tableToken) return;
  const table = await resolveTableByToken(input.tableToken);
  if (!table) return;
  const call = await prisma.waiterCall.findFirst({
    where: {
      id: input.callId,
      status: { in: ['OPEN', 'ACKNOWLEDGED'] },
      session: { tableId: table.tableId },
    },
    select: { id: true, status: true },
  });
  if (!call) return;
  await transitionCall(call.id, call.status as 'OPEN' | 'ACKNOWLEDGED', 'CANCELLED', {
    actorType: 'GUEST',
  });
}

export async function updateWaiterCallByStaff(
  callId: string,
  target: 'ACKNOWLEDGED' | 'RESOLVED',
  actor: { staffUserId: string; venueId: string },
): Promise<{ ok: boolean }> {
  const call = await prisma.waiterCall.findFirst({
    where: {
      id: callId,
      status: { in: ['OPEN', 'ACKNOWLEDGED'] },
      session: { venueId: actor.venueId },
    },
    select: { id: true, status: true },
  });
  if (!call) return { ok: false };
  if (call.status === target) return { ok: true };
  await transitionCall(call.id, call.status as 'OPEN' | 'ACKNOWLEDGED', target, {
    actorType: 'STAFF',
    staffUserId: actor.staffUserId,
  });
  return { ok: true };
}

async function transitionCall(
  callId: string,
  from: 'OPEN' | 'ACKNOWLEDGED',
  to: 'ACKNOWLEDGED' | 'RESOLVED' | 'CANCELLED',
  actor: { actorType: 'GUEST' | 'STAFF'; staffUserId?: string },
): Promise<void> {
  assertWaiterCallTransition(from, to);
  await prisma.$transaction(async (tx) => {
    const now = new Date();
    const updated = await tx.waiterCall.updateMany({
      where: { id: callId, status: from },
      data: {
        status: to,
        ...(to === 'ACKNOWLEDGED'
          ? { acknowledgedAt: now, acknowledgedByStaffUserId: actor.staffUserId ?? null }
          : {}),
        ...(to === 'RESOLVED' || to === 'CANCELLED'
          ? { resolvedAt: now, resolvedByStaffUserId: actor.staffUserId ?? null }
          : {}),
      },
    });
    if (updated.count !== 1) return;
    await recordLifecycleEvent(
      {
        entityType: 'WaiterCall',
        entityId: callId,
        fromState: from,
        toState: to,
        actorType: actor.actorType,
        actorId: actor.staffUserId ?? null,
      },
      tx,
    );
  });
}

function toView(call: {
  id: string;
  sessionId: string;
  status: 'OPEN' | 'ACKNOWLEDGED';
  requestedAt: Date;
  acknowledgedAt: Date | null;
  session: { table: { label: string } };
}): WaiterCallView {
  return {
    id: call.id,
    sessionId: call.sessionId,
    tableLabel: call.session.table.label,
    status: call.status,
    requestedAt: call.requestedAt.toISOString(),
    acknowledgedAt: call.acknowledgedAt?.toISOString() ?? null,
  };
}
