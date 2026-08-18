import type { ReorderApprovalMode } from '@/domains/sessions/shared/types';
import type { OrderItemStatus, OrderRoundStatus } from '@/domains/orders/shared/types';

/**
 * Машины состояний OrderRound и OrderItem
 * (docs/order-state-machines.md §2–3).
 *
 * Модуль чистый: без Prisma и I/O, полностью покрыт unit-тестами.
 */
export const ROUND_TRANSITIONS: Record<OrderRoundStatus, readonly OrderRoundStatus[]> = {
  SUBMITTED: ['ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED'],
  ACCEPTED: ['IN_PROGRESS', 'CANCELLED'],
  PARTIALLY_ACCEPTED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['READY', 'CANCELLED'],
  READY: ['SERVED', 'CANCELLED'],
  SERVED: [],
  REJECTED: [],
  CANCELLED: [],
};

export const ITEM_TRANSITIONS: Record<OrderItemStatus, readonly OrderItemStatus[]> = {
  SUBMITTED: ['ACCEPTED', 'REJECTED'],
  ACCEPTED: ['IN_PREPARATION', 'CANCELLED'],
  IN_PREPARATION: ['READY', 'CANCELLED'],
  READY: ['SERVED'],
  SERVED: [],
  REJECTED: [],
  CANCELLED: [],
};

export class OrderTransitionError extends Error {
  constructor(entity: 'OrderRound' | 'OrderItem', from: string, to: string) {
    super(`Недопустимый переход ${entity}: ${from} → ${to}`);
    this.name = 'OrderTransitionError';
  }
}

export function canTransitionRound(from: OrderRoundStatus, to: OrderRoundStatus): boolean {
  return ROUND_TRANSITIONS[from].includes(to);
}

export function assertRoundTransition(from: OrderRoundStatus, to: OrderRoundStatus): void {
  if (!canTransitionRound(from, to)) throw new OrderTransitionError('OrderRound', from, to);
}

export function canTransitionItem(from: OrderItemStatus, to: OrderItemStatus): boolean {
  return ITEM_TRANSITIONS[from].includes(to);
}

export function assertItemTransition(from: OrderItemStatus, to: OrderItemStatus): void {
  if (!canTransitionItem(from, to)) throw new OrderTransitionError('OrderItem', from, to);
}

/**
 * Начальный статус раунда (docs/order-state-machines.md §2, шаг 11 алгоритма).
 *
 * Первый раунд сессии ВСЕГДА требует решения официанта, независимо от режима:
 * это зафиксированное бизнес-правило, а не настройка.
 */
export function decideInitialRoundStatus(input: {
  isFirstRound: boolean;
  approvalMode: ReorderApprovalMode;
  createdByStaff?: boolean;
}): OrderRoundStatus {
  // Ручной заказ официанта уже является решением сотрудника.
  if (input.createdByStaff) return 'ACCEPTED';
  if (input.isFirstRound) return 'SUBMITTED';
  return input.approvalMode === 'AUTO_ACCEPT' ? 'ACCEPTED' : 'SUBMITTED';
}

/**
 * Итоговый статус раунда по решению официанта: полное принятие, частичное
 * либо отказ. Пустой список принятых позиций означает REJECTED.
 */
export type RoundDecisionStatus = Extract<
  OrderRoundStatus,
  'ACCEPTED' | 'PARTIALLY_ACCEPTED' | 'REJECTED'
>;

export function resolveRoundDecision(input: {
  acceptedItemIds: readonly string[];
  rejectedItemIds: readonly string[];
}): RoundDecisionStatus {
  if (input.acceptedItemIds.length === 0) return 'REJECTED';
  if (input.rejectedItemIds.length === 0) return 'ACCEPTED';
  return 'PARTIALLY_ACCEPTED';
}

/** Статусы раунда, при которых позиции уже ушли в работу. */
export function isRoundAccepted(status: OrderRoundStatus): boolean {
  return status === 'ACCEPTED' || status === 'PARTIALLY_ACCEPTED';
}

/** Раунд, ожидающий решения официанта. */
export function isRoundPending(status: OrderRoundStatus): boolean {
  return status === 'SUBMITTED';
}
