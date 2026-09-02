import type { TaxBreakdownRow } from '@/domains/billing/shared/types';

export type PrintablePaymentLine = {
  orderItemId: string;
  name: string;
  variantName: string | null;
  quantity: number;
  amountCents: number;
};

export type PrintablePaymentPart = {
  id: string;
  method: 'STRIPE' | 'CASH' | 'TERMINAL';
  amountCents: number;
  receivedAt: string;
  receivedCents: number | null;
  changeCents: number | null;
  lines: PrintablePaymentLine[];
  taxBreakdown: TaxBreakdownRow[];
};

export type PrintableBillDocument = {
  billId: string;
  sessionId: string;
  venueName: string;
  tableLabel: string;
  sessionStatus: string;
  openedAt: string;
  closedAt: string | null;
  timeZone: string;
  currency: string;
  status: string;
  totalGrossCents: number;
  paidCents: number;
  remainingCents: number;
  lines: PrintablePaymentLine[];
  taxBreakdown: TaxBreakdownRow[];
  payments: PrintablePaymentPart[];
};

