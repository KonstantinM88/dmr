import 'server-only';
import { prisma } from '@/lib/prisma';
import type { OrderRoundView } from '@/domains/orders/shared/types';
import type { SessionSummary } from '@/domains/sessions/shared/types';
import type { ProductionTicketStatus } from '@/domains/production/shared/types';

/** Раунды сессии для гостевого и staff-экрана, свежие сверху. */
export async function getRoundsForSession(sessionId: string): Promise<OrderRoundView[]> {
  const rounds = await prisma.orderRound.findMany({
    where: { sessionId },
    orderBy: { sequence: 'desc' },
    include: {
      items: {
        orderBy: { createdAt: 'asc' },
        include: {
          modifiers: { orderBy: { createdAt: 'asc' } },
          productionTicket: {
            select: {
              status: true,
              queuedAt: true,
              acceptedAt: true,
              startedAt: true,
              readyAt: true,
              station: { select: { kind: true } },
            },
          },
        },
      },
    },
  });

  return rounds.map((round) => ({
    id: round.id,
    sequence: round.sequence,
    status: round.status,
    isFirstRound: round.isFirstRound,
    approvalMode: round.approvalMode,
    submittedAt: round.submittedAt.toISOString(),
    totalGrossCents: round.totalGrossCents,
    createdByStaff: round.createdByStaffUserId !== null,
    items: round.items.map((item) => ({
      id: item.id,
      name: item.nameSnapshot,
      variantName: item.variantNameSnapshot,
      modifiers: item.modifiers.map((modifier) => modifier.nameSnapshot),
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      lineTotalCents: item.lineTotalCents,
      status: item.status,
      seatLabel: item.seatLabel,
      note: item.guestNote,
      productionStatus: item.productionTicket?.status ?? null,
      productionStatusSince: item.productionTicket
        ? productionStatusStartedAt(item.productionTicket).toISOString()
        : null,
      productionQueuedAt: item.productionTicket?.queuedAt.toISOString() ?? null,
      stationKind: item.productionTicket?.station.kind ?? null,
      recommendedPreparationMinutes: item.recommendedPreparationMinutesSnapshot,
      criticalPreparationMinutes: item.criticalPreparationMinutesSnapshot,
    })),
  }));
}

/** Доска активных сессий для персонала. */
export async function getActiveSessionBoard(venueSlug: string): Promise<SessionSummary[]> {
  const sessions = await prisma.diningSession.findMany({
    where: { venue: { slug: venueSlug }, status: { notIn: ['CLOSED', 'CANCELLED'] } },
    orderBy: { openedAt: 'asc' },
    include: {
      table: { select: { label: true } },
      _count: { select: { participants: true } },
      rounds: {
        select: {
          id: true,
          status: true,
          submittedAt: true,
          totalGrossCents: true,
          items: {
            where: { status: { in: ['ACCEPTED', 'IN_PREPARATION', 'READY'] } },
            select: {
              id: true,
              nameSnapshot: true,
              quantity: true,
              recommendedPreparationMinutesSnapshot: true,
              criticalPreparationMinutesSnapshot: true,
              productionTicket: {
                select: {
                  status: true,
                  queuedAt: true,
                  acceptedAt: true,
                  startedAt: true,
                  readyAt: true,
                  station: { select: { kind: true } },
                },
              },
            },
          },
        },
      },
      waiterCalls: {
        where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
        orderBy: { requestedAt: 'asc' },
        take: 1,
      },
      bills: {
        take: 1,
        include: {
          attempts: {
            where: { status: { in: ['CREATED', 'PENDING'] } },
            orderBy: { createdAt: 'asc' },
            take: 1,
          },
        },
      },
    },
  });

  return sessions.map((session) => {
    const waiterCall = session.waiterCalls[0];
    const activePaymentAttempt = session.bills[0]?.attempts[0];
    const pendingRounds = session.rounds
      .filter((round) => round.status === 'SUBMITTED')
      .map((round) => ({ id: round.id, submittedAt: round.submittedAt.toISOString() }))
      .sort((left, right) => left.submittedAt.localeCompare(right.submittedAt));
    const productionItems = session.rounds.flatMap((round) =>
      round.items.flatMap((item) =>
        item.productionTicket &&
        !['HANDED_OFF', 'CANCELLED'].includes(item.productionTicket.status)
          ? [{
              id: item.id,
              name: item.nameSnapshot,
              quantity: item.quantity,
              ticketStatus: item.productionTicket.status as 'QUEUED' | 'ACCEPTED' | 'IN_PROGRESS' | 'READY',
              stationKind: item.productionTicket.station.kind,
              statusSince: productionStatusStartedAt(item.productionTicket).toISOString(),
              queuedAt: item.productionTicket.queuedAt.toISOString(),
              recommendedPreparationMinutes: item.recommendedPreparationMinutesSnapshot,
              criticalPreparationMinutes: item.criticalPreparationMinutesSnapshot,
            }]
          : [],
      ),
    ).sort((left, right) => left.statusSince.localeCompare(right.statusSince));
    return {
    id: session.id,
    tableId: session.tableId,
    tableLabel: session.table.label,
    status: session.status,
    reorderApprovalMode: session.reorderApprovalMode,
    openedAt: session.openedAt.toISOString(),
    participantCount: session._count.participants,
    pendingRoundCount: pendingRounds.length,
    pendingRounds,
    productionItems,
    totalGrossCents: session.rounds
      .filter((round) => round.status !== 'REJECTED' && round.status !== 'CANCELLED')
      .reduce((sum, round) => sum + round.totalGrossCents, 0),
    waiterCall: waiterCall
      ? {
          id: waiterCall.id,
          status: waiterCall.status as 'OPEN' | 'ACKNOWLEDGED',
          requestedAt: waiterCall.requestedAt.toISOString(),
        }
      : null,
    activePaymentAttempt: activePaymentAttempt
      ? {
          id: activePaymentAttempt.id,
          method: activePaymentAttempt.method,
          amountCents: activePaymentAttempt.amountCents,
          createdAt: activePaymentAttempt.createdAt.toISOString(),
        }
      : null,
    };
  });
}

function productionStatusStartedAt(ticket: {
  status: ProductionTicketStatus;
  queuedAt: Date;
  acceptedAt: Date | null;
  startedAt: Date | null;
  readyAt: Date | null;
}): Date {
  if (ticket.status === 'READY') return ticket.readyAt ?? ticket.startedAt ?? ticket.queuedAt;
  if (ticket.status === 'IN_PROGRESS') return ticket.startedAt ?? ticket.acceptedAt ?? ticket.queuedAt;
  if (ticket.status === 'ACCEPTED') return ticket.acceptedAt ?? ticket.queuedAt;
  return ticket.queuedAt;
}

export async function getSessionDetail(sessionId: string) {
  const session = await prisma.diningSession.findUnique({
    where: { id: sessionId },
    include: {
      table: { select: { label: true } },
      _count: { select: { participants: true } },
    },
  });

  if (!session) return null;

  return {
    id: session.id,
    venueId: session.venueId,
    tableLabel: session.table.label,
    status: session.status,
    reorderApprovalMode: session.reorderApprovalMode,
    openedAt: session.openedAt.toISOString(),
    participantCount: session._count.participants,
    rounds: await getRoundsForSession(sessionId),
  };
}
