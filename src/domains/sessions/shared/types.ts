/** Client-safe типы сессии стола (Этап 2). Без Prisma. */

import type {
  ProductionStationKind,
  ProductionTicketStatus,
} from '@/domains/production/shared/types';

export const SESSION_STATUSES = [
  'OPEN',
  'PAYMENT_PENDING',
  'PARTIALLY_PAID',
  'PAID',
  'CLOSED',
  'CANCELLED',
] as const;

export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const REORDER_APPROVAL_MODES = ['REQUIRE_WAITER', 'AUTO_ACCEPT'] as const;
export type ReorderApprovalMode = (typeof REORDER_APPROVAL_MODES)[number];

export type ServiceProductionItem = {
  id: string;
  name: string;
  quantity: number;
  ticketStatus: Exclude<ProductionTicketStatus, 'HANDED_OFF' | 'CANCELLED'>;
  stationKind: ProductionStationKind;
  statusSince: string;
  queuedAt: string;
  recommendedPreparationMinutes: number | null;
  criticalPreparationMinutes: number | null;
};

export type SessionSummary = {
  id: string;
  tableId: string;
  tableLabel: string;
  status: SessionStatus;
  reorderApprovalMode: ReorderApprovalMode;
  openedAt: string;
  participantCount: number;
  pendingRoundCount: number;
  pendingRounds: {
    id: string;
    submittedAt: string;
  }[];
  productionItems: ServiceProductionItem[];
  totalGrossCents: number;
  waiterCall: {
    id: string;
    status: 'OPEN' | 'ACKNOWLEDGED';
    requestedAt: string;
  } | null;
  activePaymentAttempt: {
    id: string;
    method: 'STRIPE' | 'CASH' | 'TERMINAL';
    amountCents: number;
    createdAt: string;
  } | null;
};
