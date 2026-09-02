import 'server-only';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma/client';
import { recordAuditLog, recordLifecycleEvent } from '@/domains/audit/server/audit.service';
import {
  assertItemTransition,
  assertRoundTransition,
  resolveRoundDecision,
} from '@/domains/orders/server/order-state-machine';
import {
  resolveRoundQuantities,
  type RoundItemQuantityInput,
} from '@/domains/orders/shared/round-quantity';
import {
  createProductionTicketsForAcceptedItems,
  handoffAndServeItem,
} from '@/domains/production/server/production.service';

export type DecisionResult =
  | { ok: true; status: 'ACCEPTED' | 'PARTIALLY_ACCEPTED' | 'REJECTED' }
  | { ok: false; reason: 'not_pending' | 'unknown_items' | 'invalid_quantities' };

const ORDER_DECISION_TRANSACTION_OPTIONS = { maxWait: 5_000, timeout: 20_000 } as const;

class RoundQuantityConflictError extends Error {}

/**
 * Решение официанта по раунду (permission APPROVE_ORDER_ROUND).
 *
 * Частичное принятие — штатный случай: часть позиций уходит в работу,
 * остальные отклоняются с указанием причины. История решений
 * append-only, ретроактивно не переписывается.
 */
export async function decideRound(
  roundId: string,
  input: {
    acceptedItemIds: string[];
    rejectedItemIds: string[];
    itemQuantities: RoundItemQuantityInput[];
    note?: string;
  },
  actor: { staffUserId: string; venueId: string; ip?: string },
): Promise<DecisionResult> {
  const round = await prisma.orderRound.findFirst({
    where: { id: roundId, session: { venueId: actor.venueId } },
    include: {
      items: {
        select: {
          id: true,
          status: true,
          quantity: true,
          unitPriceCents: true,
          lineTotalCents: true,
          taxRateBasisPoints: true,
          taxAmountCents: true,
          allocatedPaidCents: true,
        },
      },
    },
  });

  if (!round) return { ok: false, reason: 'unknown_items' };
  if (round.status !== 'SUBMITTED') return { ok: false, reason: 'not_pending' };

  const knownIds = new Set(round.items.map((item) => item.id));
  const decided = [...input.acceptedItemIds, ...input.rejectedItemIds];
  const decidedIds = new Set(decided);

  if (
    decided.length !== knownIds.size ||
    decidedIds.size !== knownIds.size ||
    decided.some((id) => !knownIds.has(id))
  ) {
    return { ok: false, reason: 'unknown_items' };
  }

  if (round.items.some((item) => item.allocatedPaidCents !== 0)) {
    return { ok: false, reason: 'invalid_quantities' };
  }

  const quantities = resolveRoundQuantities(round.items, input.itemQuantities);
  if (!quantities.ok) return quantities;

  const nextStatus = resolveRoundDecision(input);
  assertRoundTransition(round.status, nextStatus);

  for (const item of round.items) {
    const target = input.acceptedItemIds.includes(item.id) ? 'ACCEPTED' : 'REJECTED';
    assertItemTransition(item.status, target);
  }

  let committed: boolean;
  try {
    committed = await prisma.$transaction(async (tx) => {
      const updatedRound = await tx.orderRound.updateMany({
        where: { id: roundId, status: 'SUBMITTED', session: { venueId: actor.venueId } },
        data: {
          status: nextStatus,
          totalGrossCents: quantities.totalGrossCents,
          decidedAt: new Date(),
        },
      });
      if (updatedRound.count !== 1) return false;

      if (quantities.changes.length > 0) {
        const rows = quantities.changes.map((item) =>
          Prisma.sql`(
            ${item.orderItemId}::text,
            ${item.previousQuantity}::integer,
            ${item.quantity}::integer,
            ${item.lineTotalCents}::integer,
            ${item.taxAmountCents}::integer
          )`,
        );
        const updatedItems = await tx.$executeRaw(Prisma.sql`
          UPDATE "order_items" AS item
          SET
            "quantity" = amendment."quantity",
            "lineTotalCents" = amendment."lineTotalCents",
            "taxAmountCents" = amendment."taxAmountCents",
            "remainingCents" = amendment."lineTotalCents",
            "updatedAt" = CURRENT_TIMESTAMP
          FROM (VALUES ${Prisma.join(rows)}) AS amendment(
            "orderItemId",
            "previousQuantity",
            "quantity",
            "lineTotalCents",
            "taxAmountCents"
          )
          WHERE item."id" = amendment."orderItemId"
            AND item."roundId" = ${roundId}
            AND item."status" = 'SUBMITTED'
            AND item."quantity" = amendment."previousQuantity"
            AND item."allocatedPaidCents" = 0
        `);
        if (updatedItems !== quantities.changes.length) {
          throw new RoundQuantityConflictError('Concurrent order item quantity change detected.');
        }
      }

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
          metadata: {
            quantityChanges: quantities.changes.map((item) => ({
              orderItemId: item.orderItemId,
              from: item.previousQuantity,
              to: item.quantity,
            })),
          },
        },
        tx,
      );
      return true;
    }, ORDER_DECISION_TRANSACTION_OPTIONS);
  } catch (error) {
    if (error instanceof RoundQuantityConflictError) {
      return { ok: false, reason: 'not_pending' };
    }
    throw error;
  }

  if (!committed) return { ok: false, reason: 'not_pending' };

  await recordAuditLog({
    venueId: actor.venueId,
    actorType: 'STAFF',
    actorId: actor.staffUserId,
    action: 'ORDER_ROUND_DECIDED',
    entityType: 'OrderRound',
    entityId: roundId,
    previousValue: {
      totalGrossCents: round.totalGrossCents,
      quantities: quantities.changes.map((item) => ({
        orderItemId: item.orderItemId,
        quantity: item.previousQuantity,
      })),
    },
    newValue: {
      decision: nextStatus,
      acceptedCount: input.acceptedItemIds.length,
      rejectedCount: input.rejectedItemIds.length,
      totalGrossCents: quantities.totalGrossCents,
      quantities: quantities.changes.map((item) => ({
        orderItemId: item.orderItemId,
        quantity: item.quantity,
      })),
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
