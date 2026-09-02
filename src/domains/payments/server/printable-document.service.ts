import 'server-only';
import { computeTaxBreakdown, type BillableItem } from '@/domains/billing/shared/allocation';
import type {
  PrintableBillDocument,
  PrintablePaymentPart,
} from '@/domains/payments/shared/printable-document';
import { taxFromGrossCents } from '@/lib/money';
import { prisma } from '@/lib/prisma';

const BILLABLE_ITEM_STATUSES = ['ACCEPTED', 'IN_PREPARATION', 'READY', 'SERVED'] as const;

/**
 * Read-only snapshot для печати. Bill и Payment жёстко ограничены venue
 * сотрудника; клиентские суммы и подписи в документ не принимаются.
 */
export async function getPrintableBillDocument(
  sessionId: string,
  venueId: string,
): Promise<PrintableBillDocument | null> {
  const bill = await prisma.bill.findFirst({
    where: { sessionId, session: { venueId } },
    select: {
      id: true,
      status: true,
      currency: true,
      totalGrossCents: true,
      paidCents: true,
      remainingCents: true,
      session: {
        select: {
          id: true,
          status: true,
          openedAt: true,
          closedAt: true,
          table: { select: { label: true } },
          venue: { select: { name: true, timeZone: true } },
        },
      },
      payments: {
        where: { status: 'SUCCEEDED' },
        orderBy: { receivedAt: 'asc' },
        select: {
          id: true,
          method: true,
          amountCents: true,
          receivedAt: true,
          cashSettlement: { select: { receivedCents: true, changeCents: true } },
          allocations: {
            orderBy: { createdAt: 'asc' },
            select: {
              amountCents: true,
              quantity: true,
              orderItem: {
                select: {
                  id: true,
                  nameSnapshot: true,
                  variantNameSnapshot: true,
                  quantity: true,
                  taxRateBasisPoints: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!bill) return null;

  const items = await prisma.orderItem.findMany({
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
      lineTotalCents: true,
      taxRateBasisPoints: true,
      taxAmountCents: true,
    },
  });

  const payments: PrintablePaymentPart[] = bill.payments.map((payment) => {
    const taxItems: BillableItem[] = payment.allocations.map((allocation) => ({
      orderItemId: allocation.orderItem.id,
      lineTotalCents: allocation.amountCents,
      allocatedPaidCents: allocation.amountCents,
      taxRateBasisPoints: allocation.orderItem.taxRateBasisPoints,
      taxAmountCents: taxFromGrossCents(
        allocation.amountCents,
        allocation.orderItem.taxRateBasisPoints,
      ),
    }));

    return {
      id: payment.id,
      method: payment.method,
      amountCents: payment.amountCents,
      receivedAt: payment.receivedAt.toISOString(),
      receivedCents: payment.cashSettlement?.receivedCents ?? null,
      changeCents: payment.cashSettlement?.changeCents ?? null,
      lines: payment.allocations.map((allocation) => ({
        orderItemId: allocation.orderItem.id,
        name: allocation.orderItem.nameSnapshot,
        variantName: allocation.orderItem.variantNameSnapshot,
        quantity: allocation.quantity,
        amountCents: allocation.amountCents,
      })),
      taxBreakdown: computeTaxBreakdown(taxItems),
    };
  });

  return {
    billId: bill.id,
    sessionId: bill.session.id,
    venueName: bill.session.venue.name,
    tableLabel: bill.session.table.label,
    sessionStatus: bill.session.status,
    openedAt: bill.session.openedAt.toISOString(),
    closedAt: bill.session.closedAt?.toISOString() ?? null,
    timeZone: bill.session.venue.timeZone,
    currency: bill.currency,
    status: bill.status,
    totalGrossCents: bill.totalGrossCents,
    paidCents: bill.paidCents,
    remainingCents: bill.remainingCents,
    lines: items.map((item) => ({
      orderItemId: item.id,
      name: item.nameSnapshot,
      variantName: item.variantNameSnapshot,
      quantity: item.quantity,
      amountCents: item.lineTotalCents,
    })),
    taxBreakdown: computeTaxBreakdown(items.map((item) => ({
      orderItemId: item.id,
      lineTotalCents: item.lineTotalCents,
      allocatedPaidCents: item.lineTotalCents,
      taxRateBasisPoints: item.taxRateBasisPoints,
      taxAmountCents: item.taxAmountCents,
    }))),
    payments,
  };
}
