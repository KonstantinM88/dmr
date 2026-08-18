import 'server-only';
import { prisma } from '@/lib/prisma';
import { resolveTableByToken } from '@/domains/tables/server/table.service';
import { getActiveSessionForTable } from '@/domains/sessions/server/session.service';

export type ChangeFeedResult = { changed: boolean; cursor: string };

/** Lightweight guest feed: сообщает только факт изменений после cursor. */
export async function getGuestChangeFeed(
  tableToken: string | undefined,
  cursor?: Date,
): Promise<ChangeFeedResult> {
  const [{ snapshotAt }] = await prisma.$queryRaw<[{ snapshotAt: Date }]>`
    SELECT CURRENT_TIMESTAMP AS "snapshotAt"
  `;
  if (!tableToken) return { changed: false, cursor: snapshotAt.toISOString() };
  const table = await resolveTableByToken(tableToken);
  if (!table) return { changed: false, cursor: snapshotAt.toISOString() };
  if (!cursor) return { changed: false, cursor: snapshotAt.toISOString() };

  const session = await getActiveSessionForTable(table.tableId);
  const [menuChanged, roundsChanged, itemsChanged] = await Promise.all([
    prisma.menuItem.count({
      where: { venueId: table.venueId, updatedAt: { gt: cursor, lte: snapshotAt } },
      take: 1,
    }),
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
    changed: menuChanged + roundsChanged + itemsChanged > 0,
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

  const [sessionsChanged, roundsChanged, itemsChanged] = await Promise.all([
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
  ]);

  return {
    changed: sessionsChanged + roundsChanged + itemsChanged > 0,
    cursor: snapshotAt.toISOString(),
  };
}
