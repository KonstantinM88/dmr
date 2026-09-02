import 'server-only';
import { prisma } from '@/lib/prisma';
import {
  computeBillTotals,
  isFullyPaid,
  isPartiallyPaid,
  type BillableItem,
} from '@/domains/billing/shared/allocation';
import type { BillView } from '@/domains/billing/shared/types';
import { remainingQuantityForItem } from '@/domains/billing/shared/allocation';
import type { Prisma } from '@/generated/prisma/client';

/**
 * Счёт сессии (docs/payment-model.md §3.1–3.3).
 *
 * Сумма ВСЕГДА пересчитывается на сервере из принятых и ещё не оплаченных
 * позиций. Клиентские суммы не принимаются ни при каких условиях.
 */

/** Позиции, попадающие в счёт: принятые и дальше по производственному пути. */
const BILLABLE_ITEM_STATUSES = ['ACCEPTED', 'IN_PREPARATION', 'READY', 'SERVED'] as const;

type TxClient = Prisma.TransactionClient;

export async function loadBillableItems(
  sessionId: string,
  tx: TxClient | typeof prisma = prisma,
) {
  return tx.orderItem.findMany({
    where: {
      round: { sessionId, status: { notIn: ['REJECTED', 'CANCELLED'] } },
      status: { in: [...BILLABLE_ITEM_STATUSES] },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      nameSnapshot: true,
      variantNameSnapshot: true,
      quantity: true,
      unitPriceCents: true,
      lineTotalCents: true,
      allocatedPaidCents: true,
      taxRateBasisPoints: true,
      taxAmountCents: true,
    },
  });
}

function toBillableItems(
  items: Awaited<ReturnType<typeof loadBillableItems>>,
): BillableItem[] {
  return items.map((item) => ({
    orderItemId: item.id,
    lineTotalCents: item.lineTotalCents,
    allocatedPaidCents: item.allocatedPaidCents,
    taxRateBasisPoints: item.taxRateBasisPoints,
    taxAmountCents: item.taxAmountCents,
  }));
}

/**
 * Пересчёт счёта. Вызывается перед созданием PaymentIntent и после каждого
 * подтверждённого платежа. Идемпотентен: один счёт на сессию.
 */
export async function recalculateBill(
  sessionId: string,
  tx: TxClient | typeof prisma = prisma,
): Promise<{ billId: string; totals: ReturnType<typeof computeBillTotals> }> {
  const items = await loadBillableItems(sessionId, tx);
  const billable = toBillableItems(items);
  const totals = computeBillTotals(billable);

  const existing = await tx.bill.findUnique({
    where: { sessionId },
    select: {
      id: true,
      status: true,
      closedAt: true,
      attempts: {
        where: { status: { in: ['CREATED', 'PENDING'] } },
        take: 1,
        select: { id: true },
      },
    },
  });

  const status =
    billable.length === 0
      ? 'OPEN'
      : isFullyPaid(billable)
        ? 'PAID'
        : isPartiallyPaid(billable)
          ? 'PARTIALLY_PAID'
          : existing?.attempts.length
            ? 'PAYMENT_PENDING'
            : 'OPEN';

  const data = {
    status,
    totalGrossCents: totals.totalGrossCents,
    paidCents: totals.paidCents,
    remainingCents: totals.remainingCents,
    taxTotalCents: totals.taxTotalCents,
    closedAt: status === 'PAID' ? (existing?.closedAt ?? new Date()) : null,
  } as const;

  if (existing) {
    await tx.bill.updateMany({
      where: {
        id: existing.id,
        OR: [
          { status: { not: data.status } },
          { totalGrossCents: { not: data.totalGrossCents } },
          { paidCents: { not: data.paidCents } },
          { remainingCents: { not: data.remainingCents } },
          { taxTotalCents: { not: data.taxTotalCents } },
        ],
      },
      data,
    });
    return { billId: existing.id, totals };
  }

  const created = await tx.bill.create({
    data: { sessionId, ...data },
    select: { id: true },
  });

  return { billId: created.id, totals };
}

/** Счёт для показа гостю и персоналу. */
export async function getBillView(sessionId: string): Promise<BillView | null> {
  const { billId } = await recalculateBill(sessionId);

  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: {
      attempts: {
        where: { status: { in: ['CREATED', 'PENDING'] } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: {
          plannedAllocations: {
            select: { orderItemId: true, quantity: true, amountCents: true },
          },
        },
      },
    },
  });
  if (!bill) return null;

  const items = await loadBillableItems(sessionId);

  const activeAttempt = bill.attempts[0];

  return {
    id: bill.id,
    sessionId: bill.sessionId,
    status: bill.status,
    currency: bill.currency,
    totalGrossCents: bill.totalGrossCents,
    paidCents: bill.paidCents,
    remainingCents: bill.remainingCents,
    taxTotalCents: bill.taxTotalCents,
    requestedAt: bill.requestedAt?.toISOString() ?? null,
    lines: items.map((item) => {
      const remainingQuantity = remainingQuantityForItem({
        orderItemId: item.id,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        lineTotalCents: item.lineTotalCents,
        allocatedPaidCents: item.allocatedPaidCents,
        taxRateBasisPoints: item.taxRateBasisPoints,
        taxAmountCents: item.taxAmountCents,
      });
      return {
        orderItemId: item.id,
        name: item.nameSnapshot,
        variantName: item.variantNameSnapshot,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        lineTotalCents: item.lineTotalCents,
        allocatedPaidCents: item.allocatedPaidCents,
        allocatedPaidQuantity: item.quantity - remainingQuantity,
        remainingCents: item.lineTotalCents - item.allocatedPaidCents,
        remainingQuantity,
        taxRateBasisPoints: item.taxRateBasisPoints,
        taxAmountCents: item.taxAmountCents,
      };
    }),
    activeAttempt: activeAttempt
      ? {
          id: activeAttempt.id,
          method: activeAttempt.method,
          status: activeAttempt.status as 'CREATED' | 'PENDING',
          amountCents: activeAttempt.amountCents,
          createdAt: activeAttempt.createdAt.toISOString(),
          selectedItemIds: activeAttempt.plannedAllocations.map(
            (allocation) => allocation.orderItemId,
          ),
          allocations: activeAttempt.plannedAllocations.map((allocation) => ({
            orderItemId: allocation.orderItemId,
            quantity: allocation.quantity,
            amountCents: allocation.amountCents,
          })),
        }
      : null,
  };
}

/**
 * Официант просит гостя оплатить (permission REQUEST_PAYMENT).
 * Сессию в PAYMENT_PENDING это НЕ переводит: блокировка заказов начинается
 * только при реальной попытке оплаты, иначе стол «залипал» бы из-за
 * случайного нажатия.
 */
export async function requestPayment(
  sessionId: string,
  actor: { staffUserId: string; venueId: string },
): Promise<{ ok: true; billId: string }> {
  await prisma.diningSession.findFirstOrThrow({
    where: { id: sessionId, venueId: actor.venueId, status: { notIn: ['CLOSED', 'CANCELLED'] } },
    select: { id: true },
  });

  const { billId } = await recalculateBill(sessionId);

  await prisma.bill.update({
    where: { id: billId },
    data: { requestedAt: new Date(), requestedByStaffUserId: actor.staffUserId },
  });

  return { ok: true, billId };
}
