import 'server-only';
import { prisma } from '@/lib/prisma';
import type { OrderRoundView } from '@/domains/orders/shared/types';
import type { SessionSummary } from '@/domains/sessions/shared/types';

/** Раунды сессии для гостевого и staff-экрана, свежие сверху. */
export async function getRoundsForSession(sessionId: string): Promise<OrderRoundView[]> {
  const rounds = await prisma.orderRound.findMany({
    where: { sessionId },
    orderBy: { sequence: 'desc' },
    include: {
      items: {
        orderBy: { createdAt: 'asc' },
        include: { modifiers: { orderBy: { createdAt: 'asc' } } },
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
      rounds: { select: { status: true, totalGrossCents: true } },
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
    return {
    id: session.id,
    tableId: session.tableId,
    tableLabel: session.table.label,
    status: session.status,
    reorderApprovalMode: session.reorderApprovalMode,
    openedAt: session.openedAt.toISOString(),
    participantCount: session._count.participants,
    pendingRoundCount: session.rounds.filter((round) => round.status === 'SUBMITTED').length,
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
