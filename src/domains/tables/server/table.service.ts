import 'server-only';
import { prisma } from '@/lib/prisma';
import { generateOpaqueToken } from '@/lib/hash';
import { recordAuditLog } from '@/domains/audit/server/audit.service';

export type ResolvedTable = {
  tableId: string;
  label: string;
  venueId: string;
  venueSlug: string;
  isActive: boolean;
};

/**
 * Разрешение стола по opaque QR-токену.
 * Токен непрогнозируемый и отзываемый; истёкший/отозванный токен даёт null,
 * без раскрытия того, существовал ли он раньше
 * (docs/security-threat-model.md §2).
 */
export async function resolveTableByToken(token: string): Promise<ResolvedTable | null> {
  if (token.length < 16 || token.length > 128) return null;

  const record = await prisma.tableQrToken.findUnique({
    where: { token },
    include: { table: { include: { venue: { select: { id: true, slug: true } } } } },
  });

  if (!record || record.revokedAt !== null) return null;
  if (!record.table.isActive) return null;

  return {
    tableId: record.table.id,
    label: record.table.label,
    venueId: record.table.venue.id,
    venueSlug: record.table.venue.slug,
    isActive: record.table.isActive,
  };
}

/**
 * Ротация QR-токена стола: старый отзывается, новый выпускается в одной
 * транзакции. Сам стол не пересоздаётся.
 */
export async function rotateTableToken(
  tableId: string,
  actor: { staffUserId: string; venueId: string; ip?: string },
): Promise<string> {
  const token = generateOpaqueToken(24);

  await prisma.$transaction(async (tx) => {
    await tx.tableQrToken.updateMany({
      where: { tableId, revokedAt: null },
      data: { revokedAt: new Date(), revokedBy: actor.staffUserId },
    });
    await tx.tableQrToken.create({ data: { tableId, token } });
  });

  await recordAuditLog({
    venueId: actor.venueId,
    actorType: 'STAFF',
    actorId: actor.staffUserId,
    action: 'TABLE_QR_ROTATED',
    entityType: 'DiningTable',
    entityId: tableId,
    ip: actor.ip,
  });

  return token;
}

/** Абсолютный URL для печати QR-кода стола. */
export function buildTableQrUrl(siteUrl: string, token: string): string {
  return new URL(`/t/${token}`, siteUrl).toString();
}
