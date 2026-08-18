import type { OrderItemStatus, OrderRoundStatus } from '@/domains/orders/shared/types';
import type { ProductionTicketStatus } from '@/domains/production/shared/types';

export const PRODUCTION_TICKET_TRANSITIONS: Record<
  ProductionTicketStatus,
  readonly ProductionTicketStatus[]
> = {
  QUEUED: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['READY', 'CANCELLED'],
  READY: ['HANDED_OFF'],
  HANDED_OFF: [],
  CANCELLED: [],
};

export class ProductionTransitionError extends Error {
  constructor(from: ProductionTicketStatus, to: ProductionTicketStatus) {
    super(`Недопустимый переход ProductionTicket: ${from} → ${to}`);
    this.name = 'ProductionTransitionError';
  }
}

export function canTransitionProductionTicket(
  from: ProductionTicketStatus,
  to: ProductionTicketStatus,
): boolean {
  return PRODUCTION_TICKET_TRANSITIONS[from].includes(to);
}

export function assertProductionTicketTransition(
  from: ProductionTicketStatus,
  to: ProductionTicketStatus,
): void {
  if (!canTransitionProductionTicket(from, to)) {
    throw new ProductionTransitionError(from, to);
  }
}

/** Статус позиции, который сопровождает переход производственного тикета. */
export function itemStatusForTicketTransition(
  to: ProductionTicketStatus,
): OrderItemStatus | null {
  if (to === 'IN_PROGRESS') return 'IN_PREPARATION';
  if (to === 'READY') return 'READY';
  if (to === 'HANDED_OFF') return 'SERVED';
  if (to === 'CANCELLED') return 'CANCELLED';
  return null;
}

/**
 * Вычисляет агрегированный production-статус раунда по позициям.
 * Отклонённые/отменённые позиции не блокируют готовность остальных.
 */
export function deriveRoundProductionStatus(
  current: OrderRoundStatus,
  itemStatuses: readonly OrderItemStatus[],
): OrderRoundStatus {
  if (
    current === 'SUBMITTED' ||
    current === 'REJECTED' ||
    current === 'CANCELLED' ||
    current === 'SERVED'
  ) {
    return current;
  }

  const active = itemStatuses.filter(
    (status) => status !== 'REJECTED' && status !== 'CANCELLED',
  );
  if (active.length === 0) return current;
  if (active.every((status) => status === 'SERVED')) return 'SERVED';
  if (active.every((status) => status === 'READY' || status === 'SERVED')) return 'READY';
  if (active.some((status) => ['IN_PREPARATION', 'READY', 'SERVED'].includes(status))) {
    return 'IN_PROGRESS';
  }
  return current;
}

/** Последовательный путь без перепрыгивания переходов OrderRound. */
export function roundProductionPath(
  from: OrderRoundStatus,
  to: OrderRoundStatus,
): OrderRoundStatus[] {
  const path: OrderRoundStatus[] = [];
  const order: OrderRoundStatus[] = ['IN_PROGRESS', 'READY', 'SERVED'];
  const start =
    from === 'ACCEPTED' || from === 'PARTIALLY_ACCEPTED'
      ? 0
      : from === 'IN_PROGRESS'
        ? 1
        : from === 'READY'
          ? 2
          : order.length;
  const end = order.indexOf(to);
  if (end < start || end === -1) return path;
  for (let index = start; index <= end; index += 1) path.push(order[index] as OrderRoundStatus);
  return path;
}
