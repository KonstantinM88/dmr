import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { addCents } from '@/lib/money';
import { recordAuditLog, recordLifecycleEvent } from '@/domains/audit/server/audit.service';
import { resolveTableByToken } from '@/domains/tables/server/table.service';
import {
  getActiveSessionForTable,
  openSessionForTable,
} from '@/domains/sessions/server/session.service';
import { canSubmitOrders } from '@/domains/sessions/server/session-state-machine';
import { getOrCreateParticipant } from '@/domains/sessions/server/participant.service';
import { decideInitialRoundStatus } from '@/domains/orders/server/order-state-machine';
import { computeOrderLine } from '@/domains/orders/shared/pricing';
import { createProductionTicketsForAcceptedItems } from '@/domains/production/server/production.service';
import type { CartLineInput, SubmitOrderResult } from '@/domains/orders/shared/types';

export const cartLineSchema = z.object({
  menuItemId: z.string().min(1).max(64),
  menuVariantId: z.string().min(1).max(64).nullish(),
  modifierOptionIds: z.array(z.string().min(1).max(64)).max(20).optional(),
  quantity: z.number().int().min(1).max(50),
  note: z.string().max(280).nullish(),
  expectedUnitPriceCents: z.number().int().min(0).nullish(),
});

export const submitOrderSchema = z.object({
  clientRequestId: z.string().min(8).max(64),
  locale: z.string().min(2).max(10),
  lines: z.array(cartLineSchema).min(1).max(50),
});

export type SubmitOrderInput = z.infer<typeof submitOrderSchema>;

const ORDER_RATE_LIMIT = 12;
const ORDER_RATE_WINDOW_MS = 5 * 60 * 1000;

type PreparedLine = {
  input: CartLineInput;
  menuItemId: string;
  menuVariantId: string | null;
  stationId: string | null;
  stationKind: 'KITCHEN' | 'BAR' | 'OTHER' | null;
  nameSnapshot: string;
  variantNameSnapshot: string | null;
  unitPriceCents: number;
  lineTotalCents: number;
  taxRateBasisPoints: number;
  taxAmountCents: number;
  modifiers: Array<{
    modifierOptionId: string;
    groupTitleSnapshot: string;
    nameSnapshot: string;
    priceDeltaCents: number;
  }>;
};

/**
 * Отправка заказа гостем — шаги 1–13 из docs/order-state-machines.md §6.
 *
 * Клиентским ценам не доверяем: цены и доступность читаются из БД в момент
 * запроса, расхождение возвращается как `price_changed`, а не молча
 * принимается.
 */
export async function submitGuestOrder(
  input: SubmitOrderInput,
  context: { tableToken: string | undefined; ip?: string },
): Promise<SubmitOrderResult> {
  // Шаг 3: вход только по валидному opaque-токену стола.
  if (!context.tableToken) return { ok: false, reason: 'no_table' };

  const table = await resolveTableByToken(context.tableToken);
  if (!table) return { ok: false, reason: 'no_table' };

  // Шаг 4: rate limit по столу.
  const limit = checkRateLimit(`order:${table.tableId}`, ORDER_RATE_LIMIT, ORDER_RATE_WINDOW_MS);
  if (!limit.allowed) {
    logger.warn('Order rate limit exceeded', { tableId: table.tableId });
    return { ok: false, reason: 'rate_limited' };
  }

  // Шаги 1–2: активная сессия, не в PAYMENT_PENDING.
  // Первый заказ за пустым столом открывает сессию автоматически;
  // официант может закрыть её в любой момент.
  let session = await getActiveSessionForTable(table.tableId);
  if (!session) {
    session = await openSessionForTable(table.tableId, { actorType: 'GUEST' });
  }

  if (!canSubmitOrders(session.status)) {
    return {
      ok: false,
      reason: session.status === 'PAYMENT_PENDING' ? 'payment_pending' : 'session_closed',
    };
  }

  const participant = await getOrCreateParticipant(session.id);

  return createRound({
    sessionId: session.id,
    venueId: session.venueId,
    approvalMode: session.reorderApprovalMode,
    input,
    participantId: participant.id,
    staffUserId: null,
    ip: context.ip,
  });
}

/**
 * Ручной заказ официанта (permission CREATE_MANUAL_ORDER).
 * Такой раунд сразу ACCEPTED: решение сотрудника уже принято.
 */
export async function createManualOrder(
  input: SubmitOrderInput,
  context: { sessionId: string; staffUserId: string; venueId: string; ip?: string },
): Promise<SubmitOrderResult> {
  const session = await prisma.diningSession.findUnique({
    where: { id: context.sessionId },
    select: { id: true, venueId: true, status: true, reorderApprovalMode: true },
  });

  if (!session) return { ok: false, reason: 'no_session' };
  if (!canSubmitOrders(session.status)) {
    return {
      ok: false,
      reason: session.status === 'PAYMENT_PENDING' ? 'payment_pending' : 'session_closed',
    };
  }

  return createRound({
    sessionId: session.id,
    venueId: session.venueId,
    approvalMode: session.reorderApprovalMode,
    input,
    participantId: null,
    staffUserId: context.staffUserId,
    ip: context.ip,
  });
}

async function createRound(args: {
  sessionId: string;
  venueId: string;
  approvalMode: 'REQUIRE_WAITER' | 'AUTO_ACCEPT';
  input: SubmitOrderInput;
  participantId: string | null;
  staffUserId: string | null;
  ip?: string;
}): Promise<SubmitOrderResult> {
  const { input } = args;

  // Шаг 5: идемпотентность. Повтор с тем же clientRequestId возвращает
  // существующий раунд, а не создаёт дубликат.
  const existing = await prisma.orderRound.findUnique({
    where: {
      sessionId_clientRequestId: {
        sessionId: args.sessionId,
        clientRequestId: input.clientRequestId,
      },
    },
    select: { id: true, sequence: true, status: true, totalGrossCents: true },
  });

  if (existing) {
    return {
      ok: true,
      roundId: existing.id,
      sequence: existing.sequence,
      status: existing.status,
      totalGrossCents: existing.totalGrossCents,
      deduplicated: true,
    };
  }

  // Шаги 6–9: цены и доступность — только из БД.
  const prepared = await prepareLines(input, args.venueId);
  if (!prepared.ok) return prepared.error;

  const totalGrossCents =
    prepared.lines.length > 0 ? addCents(...prepared.lines.map((line) => line.lineTotalCents)) : 0;

  try {
    const round = await prisma.$transaction(async (tx) => {
      const roundCount = await tx.orderRound.count({ where: { sessionId: args.sessionId } });
      const isFirstRound = roundCount === 0;

      // Шаг 11: статус по режиму сессии; первый раунд всегда ждёт официанта.
      const status = decideInitialRoundStatus({
        isFirstRound,
        approvalMode: args.approvalMode,
        createdByStaff: args.staffUserId !== null,
      });

      const itemStatus = status === 'ACCEPTED' ? 'ACCEPTED' : 'SUBMITTED';

      const created = await tx.orderRound.create({
        data: {
          sessionId: args.sessionId,
          sequence: roundCount + 1,
          status,
          // Шаг 10: snapshot режима на момент создания раунда.
          approvalMode: args.approvalMode,
          isFirstRound,
          clientRequestId: input.clientRequestId,
          createdByParticipantId: args.participantId,
          createdByStaffUserId: args.staffUserId,
          totalGrossCents,
          decidedAt: status === 'ACCEPTED' ? new Date() : null,
          items: {
            create: prepared.lines.map((line) => ({
              orderedByParticipantId: args.participantId,
              menuItemId: line.menuItemId,
              menuVariantId: line.menuVariantId,
              stationId: line.stationId,
              status: itemStatus,
              guestNote: line.input.note ?? null,
              nameSnapshot: line.nameSnapshot,
              variantNameSnapshot: line.variantNameSnapshot,
              localeSnapshot: input.locale,
              unitPriceCents: line.unitPriceCents,
              quantity: line.input.quantity,
              lineTotalCents: line.lineTotalCents,
              taxRateBasisPoints: line.taxRateBasisPoints,
              taxAmountCents: line.taxAmountCents,
              stationKindSnapshot: line.stationKind,
              remainingCents: line.lineTotalCents,
              modifiers: {
                create: line.modifiers.map((modifier) => ({
                  modifierOptionId: modifier.modifierOptionId,
                  groupTitleSnapshot: modifier.groupTitleSnapshot,
                  nameSnapshot: modifier.nameSnapshot,
                  priceDeltaCents: modifier.priceDeltaCents,
                })),
              },
            })),
          },
        },
        select: {
          id: true,
          sequence: true,
          status: true,
          totalGrossCents: true,
          items: { select: { id: true, status: true } },
        },
      });

      if (created.status === 'ACCEPTED') {
        await createProductionTicketsForAcceptedItems(
          created.items.map((item) => item.id),
          tx,
          {
            actorType: args.staffUserId ? 'STAFF' : 'GUEST',
            actorId: args.staffUserId,
          },
        );
      }

      // Шаг 12: событие жизненного цикла — в той же транзакции.
      await recordLifecycleEvent(
        {
          entityType: 'OrderRound',
          entityId: created.id,
          fromState: null,
          toState: created.status,
          actorType: args.staffUserId ? 'STAFF' : 'GUEST',
          actorId: args.staffUserId,
          metadata: { isFirstRound, approvalMode: args.approvalMode },
        },
        tx,
      );

      return created;
    });

    if (args.staffUserId) {
      await recordAuditLog({
        venueId: args.venueId,
        actorType: 'STAFF',
        actorId: args.staffUserId,
        action: 'ORDER_ROUND_CREATED_MANUALLY',
        entityType: 'OrderRound',
        entityId: round.id,
        ip: args.ip,
      });
    }

    return {
      ok: true,
      roundId: round.id,
      sequence: round.sequence,
      status: round.status,
      totalGrossCents: round.totalGrossCents,
      deduplicated: false,
    };
  } catch (error) {
    // Шаг 13: параллельный повтор с тем же ключом упирается в unique index —
    // возвращаем уже созданный раунд, а не ошибку.
    const duplicate = await prisma.orderRound.findUnique({
      where: {
        sessionId_clientRequestId: {
          sessionId: args.sessionId,
          clientRequestId: input.clientRequestId,
        },
      },
      select: { id: true, sequence: true, status: true, totalGrossCents: true },
    });

    if (duplicate) {
      return {
        ok: true,
        roundId: duplicate.id,
        sequence: duplicate.sequence,
        status: duplicate.status,
        totalGrossCents: duplicate.totalGrossCents,
        deduplicated: true,
      };
    }

    logger.error('Order submission failed', { error: String(error) });
    throw error;
  }
}

type PrepareResult =
  | { ok: true; lines: PreparedLine[] }
  | { ok: false; error: SubmitOrderResult };

async function prepareLines(input: SubmitOrderInput, venueId: string): Promise<PrepareResult> {
  if (input.lines.length === 0) {
    return { ok: false, error: { ok: false, reason: 'empty_cart' } };
  }

  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: input.lines.map((line) => line.menuItemId) }, venueId },
    include: {
      translations: true,
      taxProfile: true,
      station: true,
      variants: { include: { translations: true, taxProfile: true } },
      modifierGroups: {
        include: { translations: true, options: { include: { translations: true } } },
      },
    },
  });

  const byId = new Map(menuItems.map((item) => [item.id, item]));
  const unavailableItemIds: string[] = [];
  const changedPrices: Array<{ menuItemId: string; actualUnitPriceCents: number }> = [];
  const lines: PreparedLine[] = [];

  for (const line of input.lines) {
    const item = byId.get(line.menuItemId);

    // Шаг 7: публикация и доступность.
    if (!item || !item.isPublished || !item.isAvailable) {
      unavailableItemIds.push(line.menuItemId);
      continue;
    }

    const variant = line.menuVariantId
      ? item.variants.find((candidate) => candidate.id === line.menuVariantId)
      : null;

    if (line.menuVariantId && (!variant || !variant.isAvailable)) {
      unavailableItemIds.push(line.menuItemId);
      continue;
    }

    const options = new Map(
      item.modifierGroups.flatMap((group) =>
        group.options.map((option) => [option.id, { group, option }] as const),
      ),
    );

    const modifiers: PreparedLine['modifiers'] = [];
    let modifierUnavailable = false;

    for (const optionId of line.modifierOptionIds ?? []) {
      const found = options.get(optionId);
      if (!found || !found.option.isAvailable) {
        modifierUnavailable = true;
        break;
      }
      modifiers.push({
        modifierOptionId: found.option.id,
        groupTitleSnapshot: pickText(found.group.translations, input.locale, 'title') ?? '',
        nameSnapshot: pickText(found.option.translations, input.locale, 'name') ?? '',
        priceDeltaCents: found.option.priceDeltaCents,
      });
    }

    if (modifierUnavailable) {
      unavailableItemIds.push(line.menuItemId);
      continue;
    }

    // Шаг 8: базовая цена только из БД.
    const basePriceCents = variant ? variant.priceCents : item.basePriceCents;
    // Ставка варианта имеет приоритет над ставкой позиции; обе настраиваются
    // владельцем и не хардкодятся.
    const taxRateBasisPoints =
      variant?.taxProfile?.rateBasisPoints ?? item.taxProfile?.rateBasisPoints ?? 0;

    // Шаг 9: расчёт на сервере.
    const totals = computeOrderLine({
      basePriceCents,
      modifierDeltaCents: modifiers.map((modifier) => modifier.priceDeltaCents),
      quantity: line.quantity,
      taxRateBasisPoints,
    });

    if (
      typeof line.expectedUnitPriceCents === 'number' &&
      line.expectedUnitPriceCents !== totals.unitPriceCents
    ) {
      changedPrices.push({
        menuItemId: line.menuItemId,
        actualUnitPriceCents: totals.unitPriceCents,
      });
      continue;
    }

    lines.push({
      input: line,
      menuItemId: item.id,
      menuVariantId: variant?.id ?? null,
      stationId: item.stationId,
      stationKind: item.station?.kind ?? null,
      nameSnapshot: pickText(item.translations, input.locale, 'name') ?? item.slug,
      variantNameSnapshot: variant
        ? (pickText(variant.translations, input.locale, 'name') ?? null)
        : null,
      unitPriceCents: totals.unitPriceCents,
      lineTotalCents: totals.lineTotalCents,
      taxRateBasisPoints,
      taxAmountCents: totals.taxAmountCents,
      modifiers,
    });
  }

  if (unavailableItemIds.length > 0) {
    return { ok: false, error: { ok: false, reason: 'item_unavailable', unavailableItemIds } };
  }

  if (changedPrices.length > 0) {
    return { ok: false, error: { ok: false, reason: 'price_changed', changedPrices } };
  }

  return { ok: true, lines };
}

/**
 * Выбор перевода с откатом на `de`. Сознательно без generic-параметра по полю:
 * снимки заказа берут произвольные текстовые колонки переводов, и жёсткий
 * `keyof T` здесь только мешал бы без выигрыша в безопасности.
 */
function pickText(
  translations: Array<Record<string, unknown> & { locale: string }>,
  locale: string,
  field: string,
): string | null {
  const match =
    translations.find((translation) => translation.locale === locale) ??
    translations.find((translation) => translation.locale === 'de') ??
    translations[0];

  const value = match?.[field];
  return typeof value === 'string' ? value : null;
}
