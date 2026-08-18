/** Client-safe типы сессии стола (Этап 2). Без Prisma. */

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

export type SessionSummary = {
  id: string;
  tableId: string;
  tableLabel: string;
  status: SessionStatus;
  reorderApprovalMode: ReorderApprovalMode;
  openedAt: string;
  participantCount: number;
  pendingRoundCount: number;
  totalGrossCents: number;
};
