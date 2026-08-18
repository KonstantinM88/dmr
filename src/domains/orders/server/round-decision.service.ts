import 'server-only';
import { prisma } from '@/lib/prisma';
import { recordAuditLog, recordLifecycleEvent } from '@/domains/audit/server/audit.service';
import {
  assertItemTransition,
  assertRoundTransition,
  resolveRoundDecision,
} from '@/domains/orders/server/order-state-machine';
import {
  createProductionTicketsForAcceptedItems,
  handoffAndServeItem,
} from '@/domains/production/server/production.service';

export type DecisionResult =
  | { ok: true; status: 'ACCEPTED' | 'PARTIALLY_ACCEPTED' | 'REJECTED' }
  | { ok: false; reason: 'not_pending' | 'unknown_items' };

/**
 * Решение официанта по раунду (permission APPROVE_ORDER_ROUND).
 *
 * Частичное принятие — штатный случай: часть позиций уходит в работу,
 * остальные отклоняются с указанием причины. История решений
 * append-only, ретроактивно не переписывается.
 */
export async function decideRound(
  roundId: string,
  input: { acceptedItemIds: string[]; rejectedItemIds: string[]; note?: string },
  actor: { staffUserId: string; venueId: string; ip?: string },
): Promise<DecisionResult> {
  const round = await prisma.orderRound.findUnique({
    where: { id: roundId },
    include: { items: { select: { id: true, status: true } } },
  });

  if (!round) return { ok: false, reason: 'unknown_items' };
  if (round.status !== 'SUBMITTED') return { ok: false, reason: 'not_pending' };

  const knownIds = new Set(round.items.map((item) => item.id));
  const decided = [...input.acceptedItemIds, ...input.rejectedItemIds];

  if (decided.length !== knownIds.size || decided.some((id) => !knownIds.has(id))) {
    return { ok: false, reason: 'unknown_items' };
  }

  const nextStatus = resolveRoundDecision(input);
  assertRoundTransition(round.status, nextStatus);

  for (const item of round.items) {
    const target = input.acceptedItemIds.includes(item.id) ? 'ACCEPTED' : 'REJECTED';
    assertItemTransition(item.status, target);
  }

  await prisma.$transaction(async (tx) => {
    await tx.orderRound.update({
      where: { id: roundId },
      data: { status: nextStatus, decidedAt: new Date() },
    });

    if (input.acceptedItemIds.length > 0) {
      await tx.orderItem.updateMany({
        where: { id: { in: input.acceptedItemIds } },
        data: { status: 'ACCEPTED' },
      });
    }

    if (input.rejectedItemIds.length > 0) {
      await tx.orderItem.updateMany({
        where: { id: { in: input.rejectedItemIds } },
        data: { status: 'REJECTED', rejectedReason: input.note ?? null },
      });
    }

    await createProductionTicketsForAcceptedItems(input.acceptedItemIds, tx, {
      actorType: 'STAFF',
      actorId: actor.staffUserId,
    });

    await tx.orderRoundDecision.create({
      data: {
        roundId,
        staffUserId: actor.staffUserId,
        decision: nextStatus,
        acceptedItemIds: input.acceptedItemIds,
        rejectedItemIds: input.rejectedItemIds,
        note: input.note ?? null,
      },
    });

    await recordLifecycleEvent(
      {
        entityType: 'OrderRound',
        entityId: roundId,
        fromState: round.status,
        toState: nextStatus,
        actorType: 'STAFF',
        actorId: actor.staffUserId,
      },
      tx,
    );
  });

  await recordAuditLog({
    venueId: actor.venueId,
    actorType: 'STAFF',
    actorId: actor.staffUserId,
    action: 'ORDER_ROUND_DECIDED',
    entityType: 'OrderRound',
    entityId: roundId,
    newValue: {
      decision: nextStatus,
      acceptedCount: input.acceptedItemIds.length,
      rejectedCount: input.rejectedItemIds.length,
    },
    ip: actor.ip,
  });

  return { ok: true, status: nextStatus };
}

/**
 * Отметка о подаче позиции (permission MARK_ITEM_SERVED).
 * На Этапе 3 доступна только после READY производственного тикета.
 */
export async function markItemServed(
  orderItemId: string,
  actor: { staffUserId: string; venueId: string; ip?: string },
): Promise<{ ok: boolean; reason?: 'invalid_transition' }> {
  return handoffAndServeItem(orderItemId, actor);
}
