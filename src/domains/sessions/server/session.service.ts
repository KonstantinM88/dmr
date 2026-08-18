import 'server-only';
import { prisma } from '@/lib/prisma';
import { recordAuditLog, recordLifecycleEvent } from '@/domains/audit/server/audit.service';
import {
  assertSessionTransition,
  canSetApprovalMode,
  isSessionTerminal,
} from '@/domains/sessions/server/session-state-machine';
import type { ReorderApprovalMode, SessionStatus } from '@/domains/sessions/shared/types';

export type ActiveSession = {
  id: string;
  venueId: string;
  tableId: string;
  tableLabel: string;
  status: SessionStatus;
  reorderApprovalMode: ReorderApprovalMode;
  openedAt: Date;
};

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
    const session = await tx.diningSession.findUniqueOrThrow({
      where: { id: sessionId },
      select: { status: true, venueId: true },
    });

    assertSessionTransition(session.status, to);

    await tx.diningSession.update({
      where: { id: sessionId },
      data: {
        status: to,
        ...(to === 'CLOSED' || to === 'CANCELLED'
          ? {
              closedAt: new Date(),
              closedByStaffUserId: actor.staffUserId ?? null,
              // Режим не переживает закрытие сессии.
              reorderApprovalMode: 'REQUIRE_WAITER',
            }
          : {}),
      },
    });

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
  });
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
