import 'server-only';
import { prisma } from '@/lib/prisma';
import { computeTaxBreakdown, type BillableItem } from '@/domains/billing/shared/allocation';
import type { TaxBreakdownRow } from '@/domains/billing/shared/types';

/**
 * Read-only отчёт для бухгалтера (docs/payment-model.md §3, Reconciliation).
 *
 * Отчёт ничего не изменяет и не «чинит» расхождения: он их показывает.
 * Автоматическое исправление финансовых данных недопустимо.
 */
export type ReconciliationRow = {
  paymentId: string;
  createdAt: string;
  amountCents: number;
  currency: string;
  method: string;
  status: string;
  providerRef: string | null;
  /** Для Stripe — сохранено ли событие; для cash/terminal всегда true. */
  hasProviderEvent: boolean;
  allocatedCents: number;
  /** Платёж распределён не полностью — требует внимания. */
  allocationMismatch: boolean;
};

export type ReconciliationReport = {
  from: string;
  to: string;
  payments: ReconciliationRow[];
  totalPaidCents: number;
  taxBreakdown: TaxBreakdownRow[];
  unmatchedEventCount: number;
  failedEventCount: number;
};

export async function getReconciliationReport(range: {
  venueId: string;
  from: Date;
  to: Date;
}): Promise<ReconciliationReport> {
  const payments = await prisma.payment.findMany({
    where: {
      bill: { session: { venueId: range.venueId } },
      createdAt: { gte: range.from, lte: range.to },
    },
    orderBy: { createdAt: 'desc' },
    include: { allocations: { select: { amountCents: true } } },
  });

  const eventIds = payments
    .map((payment) => payment.providerEventId)
    .filter((id): id is string => id !== null);

  const knownEvents = await prisma.paymentProviderEvent.findMany({
    where: { providerEventId: { in: eventIds } },
    select: { providerEventId: true },
  });

  const knownEventIds = new Set(knownEvents.map((event) => event.providerEventId));

  const rows: ReconciliationRow[] = payments.map((payment) => {
    const allocatedCents = payment.allocations.reduce(
      (sum, allocation) => sum + allocation.amountCents,
      0,
    );

    return {
      paymentId: payment.id,
      createdAt: payment.createdAt.toISOString(),
      amountCents: payment.amountCents,
      currency: payment.currency,
      method: payment.method,
      status: payment.status,
      providerRef: payment.providerRef,
      hasProviderEvent:
        payment.method !== 'STRIPE' ||
        (payment.providerEventId !== null && knownEventIds.has(payment.providerEventId)),
      allocatedCents,
      allocationMismatch: allocatedCents !== payment.amountCents,
    };
  });

  const paidItems = await prisma.orderItem.findMany({
    where: {
      allocations: {
        some: {
          payment: {
            bill: { session: { venueId: range.venueId } },
            createdAt: { gte: range.from, lte: range.to },
          },
        },
      },
    },
    select: {
      id: true,
      lineTotalCents: true,
      allocatedPaidCents: true,
      taxRateBasisPoints: true,
      taxAmountCents: true,
    },
  });

  const billable: BillableItem[] = paidItems.map((item) => ({
    orderItemId: item.id,
    lineTotalCents: item.lineTotalCents,
    allocatedPaidCents: item.allocatedPaidCents,
    taxRateBasisPoints: item.taxRateBasisPoints,
    taxAmountCents: item.taxAmountCents,
  }));

  // События, пришедшие от провайдера, но не приведшие к платежу: обычно это
  // отказы и отмены, но сюда же попадут настоящие расхождения.
  const venueIntentRefs = await prisma.paymentAttempt.findMany({
    where: {
      bill: { session: { venueId: range.venueId } },
      providerRef: { not: null },
    },
    select: { providerRef: true },
  });
  const intentIds = venueIntentRefs.flatMap((attempt) =>
    attempt.providerRef ? [attempt.providerRef] : [],
  );

  const [unmatchedEventCount, failedEventCount] = await Promise.all([
    prisma.paymentProviderEvent.count({
      where: {
        createdAt: { gte: range.from, lte: range.to },
        eventType: 'payment_intent.succeeded',
        relatedPaymentIntentId: {
          in: intentIds,
          notIn: payments.map((payment) => payment.providerRef ?? ''),
        },
      },
    }),
    prisma.paymentProviderEvent.count({
      where: {
        createdAt: { gte: range.from, lte: range.to },
        relatedPaymentIntentId: { in: intentIds },
        status: 'FAILED',
      },
    }),
  ]);

  return {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    payments: rows,
    totalPaidCents: rows.reduce((sum, row) => sum + row.amountCents, 0),
    taxBreakdown: computeTaxBreakdown(billable),
    unmatchedEventCount,
    failedEventCount,
  };
}
