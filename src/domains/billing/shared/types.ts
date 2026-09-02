/** Client-safe типы счёта (Этап 4). Без Prisma. */

export const BILL_STATUSES = [
  'DRAFT',
  'OPEN',
  'PAYMENT_PENDING',
  'PARTIALLY_PAID',
  'PAID',
  'VOID',
] as const;

export type BillStatus = (typeof BILL_STATUSES)[number];

export type BillLineView = {
  orderItemId: string;
  name: string;
  variantName: string | null;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  allocatedPaidCents: number;
  allocatedPaidQuantity: number;
  remainingQuantity: number;
  remainingCents: number;
  taxRateBasisPoints: number;
  taxAmountCents: number;
};

export type BillView = {
  id: string;
  sessionId: string;
  status: BillStatus;
  currency: string;
  totalGrossCents: number;
  paidCents: number;
  remainingCents: number;
  taxTotalCents: number;
  requestedAt: string | null;
  lines: BillLineView[];
  activeAttempt: {
    id: string;
    method: 'STRIPE' | 'CASH' | 'TERMINAL';
    status: 'CREATED' | 'PENDING';
    amountCents: number;
    createdAt: string;
    selectedItemIds: string[];
    allocations: Array<{
      orderItemId: string;
      quantity: number;
      amountCents: number;
    }>;
  } | null;
};

/** Разрез по ставкам НДС для бухгалтерского отчёта. */
export type TaxBreakdownRow = {
  rateBasisPoints: number;
  grossCents: number;
  netCents: number;
  taxCents: number;
};
