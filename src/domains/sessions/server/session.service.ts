import 'server-only';
import { prisma } from '@/lib/prisma';
import { recordAuditLog, recordLifecycleEvent } from '@/domains/audit/server/audit.service';
import {
  assertSessionTransition,
  canSetApprovalMode,
  isSessionTerminal,
} from '@/domains/sessions/server/session-state-machine';
import type { ReorderApprovalMode, SessionStatus } from '@/domains/sessions/shared/types';
import type { Prisma } from '@/generated/prisma/client';

type TransactionClient = Prisma.TransactionClient;

export type ActiveSession = {
  id: string;
  venueId: string;
  tableId: string;
  tableLabel: string;
  status: SessionStatus;
  reorderApprovalMode: ReorderApprovalMode;
  openedAt: Date;
};

export type PaidSessionAwaitingClose = {
  id: string;
  tableLabel: string;
  openedAt: Date;
  paidAt: Date;
  totalGrossCents: number;
  currency: string;
};

/** Полностью оплаченные сессии, которые ещё занимают физический стол. */
export async function listPaidSessionsAwaitingClose(
  venueId: string,
): Promise<PaidSessionAwaitingClose[]> {
  const sessions = await prisma.diningSession.findMany({
    where: {
      venueId,
      status: 'PAID',
      bills: { some: { status: 'PAID', remainingCents: 0 } },
    },
    orderBy: { openedAt: 'asc' },
    select: {
      id: true,
      openedAt: true,
      table: { select: { label: true } },
      bills: {
        where: { status: 'PAID', remainingCents: 0 },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          totalGrossCents: true,
          currency: true,
          closedAt: true,
          updatedAt: true,
        },
      },
    },
  });

  return sessions.flatMap((session) => {
    const bill = session.bills[0];
    if (!bill) return [];

    return [{
      id: session.id,
      tableLabel: session.table.label,
      openedAt: session.openedAt,
      paidAt: bill.closedAt ?? bill.updatedAt,
      totalGrossCents: bill.totalGrossCents,
      currency: bill.currency,
    }];
  });
}

/** Активная (незавершённая) сессия стола или null. */
export async function getActiveSessionForTable(tableId: string): Promise<ActiveSession | null> {
  const session = await prisma.diningSession.findFirst({
    where: { tableId, status: { notIn: ['CLOSED', 'CANCELLED'] } },
    orderBy: { openedAt: 'desc' },
    include: { table: { select: { label: true } } },
  });

  if (!session) return null;

  return {
    id: session.id,
    venueId: session.venueId,
    tableId: session.tableId,
    tableLabel: session.table.label,
    status: session.status,
    reorderApprovalMode: session.reorderApprovalMode,
    openedAt: session.openedAt,
  };
}

/**
 * Открывает сессию стола, если активной нет.
 *
 * Гонка двух устройств, сканирующих QR одновременно, разрешается внутри
 * транзакции: второй вызов видит уже созданную сессию и возвращает её.
 * Дополнительной страховкой служит partial unique index в миграции
 * (см. инструкцию к Этапу 2).
 */
export async function openSessionForTable(
  tableId: string,
  actor: { staffUserId?: string; actorType: 'STAFF' | 'GUEST' },
): Promise<ActiveSession> {
  const created = await prisma.$transaction(async (tx) => {
    const existing = await tx.diningSession.findFirst({
      where: { tableId, status: { notIn: ['CLOSED', 'CANCELLED'] } },
      orderBy: { openedAt: 'desc' },
    });
    if (existing) return { session: existing, isNew: false };

    const table = await tx.diningTable.findUniqueOrThrow({
      where: { id: tableId },
      select: { venueId: true, isActive: true },
    });
    if (!table.isActive) throw new Error('Стол неактивен: сессию открыть нельзя.');

    const session = await tx.diningSession.create({
      data: {
        venueId: table.venueId,
        tableId,
        status: 'OPEN',
        reorderApprovalMode: 'REQUIRE_WAITER',
        openedByStaffUserId: actor.staffUserId ?? null,
      },
    });

    await recordLifecycleEvent(
      {
        entityType: 'DiningSession',
        entityId: session.id,
        fromState: null,
        toState: 'OPEN',
        actorType: actor.actorType,
        actorId: actor.staffUserId ?? null,
      },
      tx,
    );

    return { session, isNew: true };
  });

  const table = await prisma.diningTable.findUniqueOrThrow({
    where: { id: tableId },
    select: { label: true },
  });

  return {
    id: created.session.id,
    venueId: created.session.venueId,
    tableId: created.session.tableId,
    tableLabel: table.label,
    status: created.session.status,
    reorderApprovalMode: created.session.reorderApprovalMode,
    openedAt: created.session.openedAt,
  };
}

/** Перевод сессии в новый статус с проверкой машины состояний. */
export async function transitionSession(
  sessionId: string,
  to: SessionStatus,
  actor: { staffUserId?: string; actorType: 'STAFF' | 'GUEST' | 'SYSTEM' },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await transitionSessionInTransaction(sessionId, to, actor, tx);
  });
}

/** Тот же переход внутри уже открытой доменной транзакции. */
export async function transitionSessionInTransaction(
  sessionId: string,
  to: SessionStatus,
  actor: { staffUserId?: string; actorType: 'STAFF' | 'GUEST' | 'SYSTEM' },
  tx: TransactionClient,
): Promise<void> {
  const session = await tx.diningSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: { status: true },
  });

  assertSessionTransition(session.status, to);

  const updated = await tx.diningSession.updateMany({
    where: { id: sessionId, status: session.status },
    data: {
      status: to,
      ...(to === 'CLOSED' || to === 'CANCELLED'
        ? {
            closedAt: new Date(),
            closedByStaffUserId: actor.staffUserId ?? null,
            reorderApprovalMode: 'REQUIRE_WAITER' as const,
          }
        : {}),
    },
  });

  if (updated.count !== 1) {
    throw new Error('Сессия была изменена параллельно; переход нужно повторить.');
  }

  await recordLifecycleEvent(
    {
      entityType: 'DiningSession',
      entityId: sessionId,
      fromState: session.status,
      toState: to,
      actorType: actor.actorType,
      actorId: actor.staffUserId ?? null,
    },
    tx,
  );
}

/**
 * Переключение режима подтверждения дозаказов.
 * Каждое изменение аудируется: было, стало, кто, когда
 * (docs/order-state-machines.md §7).
 */
export async function setReorderApprovalMode(
  sessionId: string,
  mode: ReorderApprovalMode,
  actor: { staffUserId: string; venueId: string; ip?: string },
): Promise<{ ok: boolean; reason?: 'forbidden_status' }> {
  const session = await prisma.diningSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: { status: true, reorderApprovalMode: true },
  });

  if (!canSetApprovalMode(session.status, mode)) {
    return { ok: false, reason: 'forbidden_status' };
  }

  if (session.reorderApprovalMode === mode) return { ok: true };

  await prisma.diningSession.update({
    where: { id: sessionId },
    data: { reorderApprovalMode: mode },
  });

  await recordAuditLog({
    venueId: actor.venueId,
    actorType: 'STAFF',
    actorId: actor.staffUserId,
    action: 'SESSION_REORDER_MODE_CHANGED',
    entityType: 'DiningSession',
    entityId: sessionId,
    previousValue: { reorderApprovalMode: session.reorderApprovalMode },
    newValue: { reorderApprovalMode: mode },
    ip: actor.ip,
  });

  return { ok: true };
}

export async function closeSession(
  sessionId: string,
  actor: { staffUserId: string; venueId: string; ip?: string },
): Promise<void> {
  await prisma.diningSession.findFirstOrThrow({
    where: { id: sessionId, venueId: actor.venueId, status: 'PAID' },
    select: { id: true },
  });
  await transitionSession(sessionId, 'CLOSED', {
    staffUserId: actor.staffUserId,
    actorType: 'STAFF',
  });

  await recordAuditLog({
    venueId: actor.venueId,
    actorType: 'STAFF',
    actorId: actor.staffUserId,
    action: 'SESSION_CLOSED',
    entityType: 'DiningSession',
    entityId: sessionId,
    ip: actor.ip,
  });
}

export function isTerminal(status: SessionStatus): boolean {
  return isSessionTerminal(status);
}
