import 'server-only';
import { prisma } from '@/lib/prisma';
import { getEnv } from '@/lib/env';
import {
  createGuestTableAccessToken,
  isGuestTableAccessInvalidated,
  nextGuestTableAccessIssuedAt,
  verifyGuestTableAccessToken,
} from '@/domains/tables/server/guest-table-access-token';
import {
  resolveTableByToken,
  type ResolvedTable,
} from '@/domains/tables/server/table.service';

export type GuestTableAccessResolution =
  | { status: 'missing' | 'invalid' }
  | { status: 'expired'; table: ResolvedTable }
  | {
      status: 'valid';
      table: ResolvedTable;
      issuedAt: Date;
    };

async function latestTerminalSessionTime(tableId: string): Promise<Date | null> {
  const session = await prisma.diningSession.findFirst({
    where: {
      tableId,
      status: { in: ['CLOSED', 'CANCELLED'] },
      closedAt: { not: null },
    },
    orderBy: { closedAt: 'desc' },
    select: { closedAt: true },
  });

  return session?.closedAt ?? null;
}

/**
 * Выпускается исключительно после настоящего перехода через `/t/<token>`.
 * Время ставится позже последнего закрытия, даже при небольшом clock skew.
 */
export async function issueGuestTableAccess(
  tableToken: string,
): Promise<{ cookieValue: string; table: ResolvedTable } | null> {
  const table = await resolveTableByToken(tableToken);
  if (!table) return null;

  const latestTerminalAt = await latestTerminalSessionTime(table.tableId);
  const issuedAt = nextGuestTableAccessIssuedAt(new Date(), latestTerminalAt);
  const cookieValue = createGuestTableAccessToken(
    tableToken,
    issuedAt,
    getEnv().STAFF_SESSION_SECRET,
  );

  return { cookieValue, table };
}

/**
 * Проверяет подпись QR-входа и отзывает его сервером после CLOSED/CANCELLED.
 * Удалять cookie удалённо невозможно, поэтому авторизация всегда повторяется.
 */
export async function resolveGuestTableAccess(
  cookieValue: string | undefined,
): Promise<GuestTableAccessResolution> {
  if (!cookieValue) return { status: 'missing' };

  const payload = verifyGuestTableAccessToken(
    cookieValue,
    getEnv().STAFF_SESSION_SECRET,
  );
  if (!payload) return { status: 'invalid' };

  const table = await resolveTableByToken(payload.tableToken);
  if (!table) return { status: 'invalid' };

  const latestTerminalAt = await latestTerminalSessionTime(table.tableId);
  if (isGuestTableAccessInvalidated(payload.issuedAt, latestTerminalAt)) {
    return { status: 'expired', table };
  }

  return { status: 'valid', table, issuedAt: payload.issuedAt };
}
