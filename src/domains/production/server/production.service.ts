import 'server-only';
import { prisma } from '@/lib/prisma';
import { recordAuditLog, recordLifecycleEvent } from '@/domains/audit/server/audit.service';
import { assertItemTransition, assertRoundTransition } from '@/domains/orders/server/order-state-machine';
import {
  assertProductionTicketTransition,
  deriveRoundProductionStatus,
  itemStatusForTicketTransition,
  roundProductionPath,
} from '@/domains/production/server/production-state-machine';
import type { OrderItemStatus, OrderRoundStatus } from '@/domains/orders/shared/types';
import type {
  ProductionQueueDelta,
  ProductionQueueTicket,
  ProductionStationKind,
  ProductionTicketStatus,
  TransitionTicketResult,
} from '@/domains/production/shared/types';
import type { Prisma } from '@/generated/prisma/client';

type TransactionClient = Prisma.TransactionClient;

/**
 * Идемпотентно создаёт тикеты для только что принятых позиций.
 * Вызывается внутри транзакции принятия/создания OrderRound.
 */
export async function createProductionTicketsForAcceptedItems(
  itemIds: readonly string[],
  tx: TransactionClient,
  actor: { actorType: 'STAFF' | 'SYSTEM' | 'GUEST'; actorId?: string | null },
): Promise<void> {
  if (itemIds.length === 0) return;

  const items = await tx.orderItem.findMany({
    where: {
      id: { in: [...itemIds] },
      status: 'ACCEPTED',
      stationId: { not: null },
      productionTicket: null,
    },
    select: { id: true, stationId: true, stationKindSnapshot: true },
  });

  for (const item of items) {
    if (!item.stationId) continue;
    const ticket = await tx.productionTicket.create({
      data: { orderItemId: item.id, stationId: item.stationId },
      select: { id: true },
    });
    await recordLifecycleEvent(
      {
        entityType: 'ProductionTicket',
        entityId: ticket.id,
        fromState: null,
        toState: 'QUEUED',
        actorType: actor.actorType,
        actorId: actor.actorId,
        metadata: { stationKind: item.stationKindSnapshot },
      },
      tx,
    );
  }
}

/** Полный snapshot либо изменения после cursor для polling/reconnect. */
export async function getProductionQueueDelta(input: {
  venueId: string;
  stationKind: ProductionStationKind;
  cursor?: Date;
}): Promise<ProductionQueueDelta> {
  const [{ snapshotAt }] = await prisma.$queryRaw<[{ snapshotAt: Date }]>`
    SELECT CURRENT_TIMESTAMP AS "snapshotAt"
  `;
  const full = input.cursor === undefined;

  const tickets = await prisma.productionTicket.findMany({
    where: {
      station: { venueId: input.venueId, kind: input.stationKind, isActive: true },
      updatedAt: {
        ...(input.cursor ? { gt: input.cursor } : {}),
        lte: snapshotAt,
      },
      ...(full ? { status: { notIn: ['HANDED_OFF', 'CANCELLED'] } } : {}),
    },
    orderBy: [{ queuedAt: 'asc' }, { id: 'asc' }],
    include: {
      station: { select: { kind: true, name: true } },
      orderItem: {
        include: {
          modifiers: { orderBy: { createdAt: 'asc' } },
          round: {
            select: {
              sequence: true,
              session: { select: { table: { select: { label: true } } } },
            },
          },
        },
      },
    },
  });

  return {
    stationKind: input.stationKind,
    cursor: snapshotAt.toISOString(),
    full,
    tickets: tickets.map(mapQueueTicket),
  };
}

type ProductionQueuePayload = Prisma.ProductionTicketGetPayload<{
  include: {
    station: { select: { kind: true; name: true } };
    orderItem: {
      include: {
        modifiers: true;
        round: {
          select: {
            sequence: true;
            session: { select: { table: { select: { label: true } } } };
          };
        };
      };
    };
  };
}>;

function mapQueueTicket(ticket: ProductionQueuePayload): ProductionQueueTicket {
  return {
    id: ticket.id,
    status: ticket.status,
    stationKind: ticket.station.kind,
    stationName: ticket.station.name,
    tableLabel: ticket.orderItem.round.session.table.label,
    roundSequence: ticket.orderItem.round.sequence,
    itemName: ticket.orderItem.nameSnapshot,
    variantName: ticket.orderItem.variantNameSnapshot,
    modifiers: ticket.orderItem.modifiers.map((modifier) => modifier.nameSnapshot),
    quantity: ticket.orderItem.quantity,
    note: ticket.orderItem.guestNote,
    queuedAt: ticket.queuedAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

/** Переход, выполняемый сотрудником конкретной станции. */
export async function transitionProductionTicket(
  ticketId: string,
  to: Exclude<ProductionTicketStatus, 'QUEUED' | 'HANDED_OFF'>,
  actor: {
    staffUserId: string;
    venueId: string;
    stationKind: ProductionStationKind;
    ip?: string;
  },
): Promise<TransitionTicketResult> {
  const ticket = await prisma.productionTicket.findUnique({
    where: { id: ticketId },
    include: {
      station: { select: { venueId: true, kind: true } },
      orderItem: { select: { id: true, status: true, roundId: true } },
    },
  });

  if (!ticket) return { ok: false, reason: 'not_found' };
  if (ticket.station.venueId !== actor.venueId || ticket.station.kind !== actor.stationKind) {
    return { ok: false, reason: 'wrong_station' };
  }

  try {
    assertProductionTicketTransition(ticket.status, to);
  } catch {
    return { ok: false, reason: 'invalid_transition' };
  }

  const itemTarget = itemStatusForTicketTransition(to);
  if (itemTarget) {
    try {
      assertItemTransition(ticket.orderItem.status, itemTarget);
    } catch {
      return { ok: false, reason: 'invalid_transition' };
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const ticketUpdate = await tx.productionTicket.updateMany({
        where: { id: ticket.id, status: ticket.status },
        data: {
          status: to,
          ...(to === 'ACCEPTED' ? { acceptedAt: new Date() } : {}),
          ...(to === 'IN_PROGRESS' ? { startedAt: new Date() } : {}),
          ...(to === 'READY' ? { readyAt: new Date() } : {}),
          ...(to === 'CANCELLED' ? { cancelledAt: new Date() } : {}),
        },
      });
      if (ticketUpdate.count !== 1) throw new ProductionConcurrencyError();

      await recordLifecycleEvent(
        {
          entityType: 'ProductionTicket',
          entityId: ticket.id,
          fromState: ticket.status,
          toState: to,
          actorType: 'STAFF',
          actorId: actor.staffUserId,
        },
        tx,
      );

      if (itemTarget) {
        const itemUpdate = await tx.orderItem.updateMany({
          where: { id: ticket.orderItem.id, status: ticket.orderItem.status },
          data: { status: itemTarget },
        });
        if (itemUpdate.count !== 1) throw new ProductionConcurrencyError();
        await recordLifecycleEvent(
          {
            entityType: 'OrderItem',
            entityId: ticket.orderItem.id,
            fromState: ticket.orderItem.status,
            toState: itemTarget,
            actorType: 'STAFF',
            actorId: actor.staffUserId,
            metadata: { via: 'production_ticket', ticketId: ticket.id },
          },
          tx,
        );
        await syncRoundProductionStatus(ticket.orderItem.roundId, tx, actor.staffUserId);
      }
    });
  } catch (error) {
    if (error instanceof ProductionConcurrencyError) {
      return { ok: false, reason: 'invalid_transition' };
    }
    throw error;
  }

  await recordAuditLog({
    venueId: actor.venueId,
    actorType: 'STAFF',
    actorId: actor.staffUserId,
    action: 'PRODUCTION_TICKET_TRANSITIONED',
    entityType: 'ProductionTicket',
    entityId: ticket.id,
    previousValue: { status: ticket.status },
    newValue: { status: to, stationKind: actor.stationKind },
    ip: actor.ip,
  });

  return { ok: true, status: to };
}

/** Waiter flow: READY ticket передаётся и позиция отмечается поданной. */
export async function handoffAndServeItem(
  orderItemId: string,
  actor: { staffUserId: string; venueId: string; ip?: string },
): Promise<{ ok: boolean; reason?: 'invalid_transition' }> {
  const item = await prisma.orderItem.findUnique({
    where: { id: orderItemId },
    select: {
      id: true,
      status: true,
      roundId: true,
      productionTicket: {
        select: {
          id: true,
          status: true,
          station: { select: { venueId: true } },
        },
      },
    },
  });

  if (
    !item?.productionTicket ||
    item.productionTicket.station.venueId !== actor.venueId ||
    item.status !== 'READY' ||
    item.productionTicket.status !== 'READY'
  ) {
    return { ok: false, reason: 'invalid_transition' };
  }

  assertItemTransition(item.status, 'SERVED');
  assertProductionTicketTransition(item.productionTicket.status, 'HANDED_OFF');

  try {
    await prisma.$transaction(async (tx) => {
      const now = new Date();
      const ticketUpdate = await tx.productionTicket.updateMany({
        where: { id: item.productionTicket!.id, status: 'READY' },
        data: { status: 'HANDED_OFF', handedOffAt: now },
      });
      if (ticketUpdate.count !== 1) throw new ProductionConcurrencyError();
      const itemUpdate = await tx.orderItem.updateMany({
        where: { id: item.id, status: 'READY' },
        data: { status: 'SERVED' },
      });
      if (itemUpdate.count !== 1) throw new ProductionConcurrencyError();

      await recordLifecycleEvent(
        {
          entityType: 'ProductionTicket',
          entityId: item.productionTicket!.id,
          fromState: 'READY',
          toState: 'HANDED_OFF',
          actorType: 'STAFF',
          actorId: actor.staffUserId,
        },
        tx,
      );
      await recordLifecycleEvent(
        {
          entityType: 'OrderItem',
          entityId: item.id,
          fromState: 'READY',
          toState: 'SERVED',
          actorType: 'STAFF',
          actorId: actor.staffUserId,
          metadata: { via: 'production_handoff', ticketId: item.productionTicket!.id },
        },
        tx,
      );
      await syncRoundProductionStatus(item.roundId, tx, actor.staffUserId);
    });
  } catch (error) {
    if (error instanceof ProductionConcurrencyError) {
      return { ok: false, reason: 'invalid_transition' };
    }
    throw error;
  }

  await recordAuditLog({
    venueId: actor.venueId,
    actorType: 'STAFF',
    actorId: actor.staffUserId,
    action: 'ORDER_ITEM_SERVED',
    entityType: 'OrderItem',
    entityId: item.id,
    newValue: { via: 'production_handoff' },
    ip: actor.ip,
  });

  return { ok: true };
}

class ProductionConcurrencyError extends Error {}

async function syncRoundProductionStatus(
  roundId: string,
  tx: TransactionClient,
  staffUserId: string,
): Promise<void> {
  const round = await tx.orderRound.findUniqueOrThrow({
    where: { id: roundId },
    select: { status: true, items: { select: { status: true } } },
  });
  const target = deriveRoundProductionStatus(
    round.status as OrderRoundStatus,
    round.items.map((item) => item.status as OrderItemStatus),
  );
  const path = roundProductionPath(round.status as OrderRoundStatus, target);
  let current = round.status as OrderRoundStatus;

  for (const next of path) {
    assertRoundTransition(current, next);
    const roundUpdate = await tx.orderRound.updateMany({
      where: { id: roundId, status: current },
      data: { status: next },
    });
    if (roundUpdate.count !== 1) throw new ProductionConcurrencyError();
    await recordLifecycleEvent(
      {
        entityType: 'OrderRound',
        entityId: roundId,
        fromState: current,
        toState: next,
        actorType: 'STAFF',
        actorId: staffUserId,
        metadata: { via: 'production_aggregate' },
      },
      tx,
    );
    current = next;
  }
}
