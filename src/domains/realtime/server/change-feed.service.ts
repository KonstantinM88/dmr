import 'server-only';
import { prisma } from '@/lib/prisma';
import { resolveGuestTableAccess } from '@/domains/tables/server/guest-table-access.service';
import { getActiveSessionForTable } from '@/domains/sessions/server/session.service';

export type ChangeFeedResult = { changed: boolean; cursor: string };

/** Lightweight guest feed: сообщает только факт изменений после cursor. */
export async function getGuestChangeFeed(
  tableAccess: string | undefined,
  cursor?: Date,
): Promise<ChangeFeedResult> {
  const [{ snapshotAt }] = await prisma.$queryRaw<[{ snapshotAt: Date }]>`
    SELECT CURRENT_TIMESTAMP AS "snapshotAt"
  `;
  if (!tableAccess) return { changed: false, cursor: snapshotAt.toISOString() };
  const access = await resolveGuestTableAccess(tableAccess);
  if (access.status !== 'valid') return { changed: false, cursor: snapshotAt.toISOString() };
  const table = access.table;
  if (!cursor) return { changed: false, cursor: snapshotAt.toISOString() };

  const session = await getActiveSessionForTable(table.tableId);
  const [menuChanged, sessionChanged, billChanged, attemptChanged, waiterCallChanged, roundsChanged, itemsChanged] = await Promise.all([
    prisma.menuItem.count({
      where: { venueId: table.venueId, updatedAt: { gt: cursor, lte: snapshotAt } },
      take: 1,
    }),
    session
      ? prisma.diningSession.count({
          where: { id: session.id, updatedAt: { gt: cursor, lte: snapshotAt } },
          take: 1,
        })
      : 0,
    session
      ? prisma.bill.count({
          where: { sessionId: session.id, updatedAt: { gt: cursor, lte: snapshotAt } },
          take: 1,
        })
      : 0,
    session
      ? prisma.paymentAttempt.count({
          where: {
            bill: { sessionId: session.id },
            updatedAt: { gt: cursor, lte: snapshotAt },
          },
          take: 1,
        })
      : 0,
    session
      ? prisma.waiterCall.count({
          where: { sessionId: session.id, updatedAt: { gt: cursor, lte: snapshotAt } },
          take: 1,
        })
      : 0,
    session
      ? prisma.orderRound.count({
          where: { sessionId: session.id, updatedAt: { gt: cursor, lte: snapshotAt } },
          take: 1,
        })
      : 0,
    session
      ? prisma.orderItem.count({
          where: {
            round: { sessionId: session.id },
            updatedAt: { gt: cursor, lte: snapshotAt },
          },
          take: 1,
        })
      : 0,
  ]);

  return {
    changed:
      menuChanged + sessionChanged + billChanged + attemptChanged + waiterCallChanged +
        roundsChanged + itemsChanged >
      0,
    cursor: snapshotAt.toISOString(),
  };
}

/** Lightweight waiter feed: активные сессии/раунды/позиции после cursor. */
export async function getServiceChangeFeed(
  venueId: string,
  cursor?: Date,
): Promise<ChangeFeedResult> {
  const [{ snapshotAt }] = await prisma.$queryRaw<[{ snapshotAt: Date }]>`
    SELECT CURRENT_TIMESTAMP AS "snapshotAt"
  `;
  if (!cursor) return { changed: false, cursor: snapshotAt.toISOString() };

  const [sessionsChanged, roundsChanged, itemsChanged, billsChanged, attemptsChanged, callsChanged] = await Promise.all([
    prisma.diningSession.count({
      where: { venueId, updatedAt: { gt: cursor, lte: snapshotAt } },
      take: 1,
    }),
    prisma.orderRound.count({
      where: { session: { venueId }, updatedAt: { gt: cursor, lte: snapshotAt } },
      take: 1,
    }),
    prisma.orderItem.count({
      where: { round: { session: { venueId } }, updatedAt: { gt: cursor, lte: snapshotAt } },
      take: 1,
    }),
    prisma.bill.count({
      where: { session: { venueId }, updatedAt: { gt: cursor, lte: snapshotAt } },
      take: 1,
    }),
    prisma.paymentAttempt.count({
      where: {
        bill: { session: { venueId } },
        updatedAt: { gt: cursor, lte: snapshotAt },
      },
      take: 1,
    }),
    prisma.waiterCall.count({
      where: { session: { venueId }, updatedAt: { gt: cursor, lte: snapshotAt } },
      take: 1,
    }),
  ]);

  return {
    changed:
      sessionsChanged + roundsChanged + itemsChanged + billsChanged + attemptsChanged +
        callsChanged >
      0,
    cursor: snapshotAt.toISOString(),
  };
}
