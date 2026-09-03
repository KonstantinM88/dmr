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
 * Возвращает действующий QR-токен только для локального dev-входа.
 * Двойной NODE_ENV guard не позволяет случайно использовать helper в production.
 * Токен должен оставаться внутри server-only redirect flow и не передаваться в UI.
 */
export async function getActiveTableTokenForDevelopment(
  venueSlug: string,
  tableLabel: string,
): Promise<string | null> {
  if (process.env.NODE_ENV !== 'development') return null;

  const record = await prisma.tableQrToken.findFirst({
    where: {
      revokedAt: null,
      table: {
        label: tableLabel,
        isActive: true,
        venue: { slug: venueSlug },
      },
    },
    orderBy: { issuedAt: 'desc' },
    select: { token: true },
  });

  return record?.token ?? null;
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

/** Создание стола. Первый QR-токен выпускается сразу. */
export async function createTable(
  input: { venueId: string; label: string; seats?: number | null },
  actor: { staffUserId: string; ip?: string },
): Promise<{ ok: true; tableId: string; token: string } | { ok: false; reason: 'duplicate_label' }> {
  const existing = await prisma.diningTable.findFirst({
    where: { venueId: input.venueId, label: input.label },
    select: { id: true },
  });

  if (existing) return { ok: false, reason: 'duplicate_label' };

  const token = generateOpaqueToken(24);
  const maxSortOrder = await prisma.diningTable.aggregate({
    where: { venueId: input.venueId },
    _max: { sortOrder: true },
  });

  const table = await prisma.$transaction(async (tx) => {
    const created = await tx.diningTable.create({
      data: {
        venueId: input.venueId,
        label: input.label,
        seats: input.seats ?? null,
        sortOrder: (maxSortOrder._max.sortOrder ?? 0) + 1,
      },
      select: { id: true },
    });
    await tx.tableQrToken.create({ data: { tableId: created.id, token } });
    return created;
  });

  await recordAuditLog({
    venueId: input.venueId,
    actorType: 'STAFF',
    actorId: actor.staffUserId,
    action: 'TABLE_CREATED',
    entityType: 'DiningTable',
    entityId: table.id,
    newValue: { label: input.label },
    ip: actor.ip,
  });

  return { ok: true, tableId: table.id, token };
}

/** Включение/выключение стола. Стол не удаляется: у него есть история заказов. */
export async function setTableActive(
  tableId: string,
  isActive: boolean,
  actor: { staffUserId: string; venueId: string; ip?: string },
): Promise<void> {
  await prisma.diningTable.update({ where: { id: tableId }, data: { isActive } });

  await recordAuditLog({
    venueId: actor.venueId,
    actorType: 'STAFF',
    actorId: actor.staffUserId,
    action: isActive ? 'TABLE_ACTIVATED' : 'TABLE_DEACTIVATED',
    entityType: 'DiningTable',
    entityId: tableId,
    ip: actor.ip,
  });
}

/** Список столов для админки. Сами токены наружу не отдаются. */
export async function listTables(venueSlug: string) {
  const tables = await prisma.diningTable.findMany({
    where: { venue: { slug: venueSlug } },
    orderBy: { sortOrder: 'asc' },
    include: {
      _count: { select: { qrTokens: true } },
      qrTokens: { where: { revokedAt: null }, select: { id: true, issuedAt: true } },
    },
  });

  return tables.map((table) => ({
    id: table.id,
    label: table.label,
    seats: table.seats,
    isActive: table.isActive,
    hasActiveToken: table.qrTokens.length > 0,
    issuedAt: table.qrTokens[0]?.issuedAt.toISOString() ?? null,
    tokenHistoryCount: table._count.qrTokens,
  }));
}

/**
 * Действующие QR-токены для защищённой server-side печатной страницы.
 * Результат нельзя передавать в Client Component или журналировать: QR является
 * bearer-доступом к столу. На страницу уходит только уже отрисованное QR-изображение.
 */
export async function listPrintableTableQrTokens(
  venueSlug: string,
  tableLabels?: readonly string[],
) {
  const tables = await prisma.diningTable.findMany({
    where: {
      venue: { slug: venueSlug },
      isActive: true,
      ...(tableLabels && tableLabels.length > 0 ? { label: { in: [...tableLabels] } } : {}),
    },
    orderBy: { sortOrder: 'asc' },
    select: {
      label: true,
      qrTokens: {
        where: { revokedAt: null },
        orderBy: { issuedAt: 'desc' },
        take: 1,
        select: { token: true },
      },
    },
  });

  return tables.flatMap((table) => {
    const token = table.qrTokens[0]?.token;
    return token ? [{ label: table.label, token }] : [];
  });
}

/** Минимальный список активных столов для service board. */
export async function listActiveTablesForService(venueSlug: string) {
  return prisma.diningTable.findMany({
    where: { venue: { slug: venueSlug }, isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, label: true },
  });
}

/** Абсолютный URL для печати QR-кода стола. */
export function buildTableQrUrl(siteUrl: string, token: string): string {
  return new URL(`/t/${token}`, siteUrl).toString();
}
