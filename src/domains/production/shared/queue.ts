import type {
  ProductionQueueDelta,
  ProductionQueueTicket,
  ProductionTicketStatus,
} from '@/domains/production/shared/types';

const TERMINAL_STATUSES = new Set<ProductionTicketStatus>(['HANDED_OFF', 'CANCELLED']);

/**
 * Applies a cursor delta to the last usable queue snapshot. Terminal tickets
 * act as tombstones, so reconnecting clients remove cards without needing a
 * full reload.
 */
export function mergeProductionQueueDelta(
  current: ProductionQueueTicket[],
  delta: ProductionQueueDelta,
): ProductionQueueTicket[] {
  const byId = new Map((delta.full ? [] : current).map((ticket) => [ticket.id, ticket]));

  for (const ticket of delta.tickets) {
    if (TERMINAL_STATUSES.has(ticket.status)) byId.delete(ticket.id);
    else byId.set(ticket.id, ticket);
  }

  return [...byId.values()].sort(
    (left, right) => left.queuedAt.localeCompare(right.queuedAt) || left.id.localeCompare(right.id),
  );
}
