import { describe, expect, it } from 'vitest';
import {
  mergeProductionQueueDelta,
  queueTicketStatusForSession,
} from '@/domains/production/shared/queue';
import type {
  ProductionQueueDelta,
  ProductionQueueTicket,
  ProductionTicketStatus,
} from '@/domains/production/shared/types';

function ticket(
  id: string,
  status: ProductionTicketStatus,
  queuedAt = '2026-08-18T12:00:00.000Z',
): ProductionQueueTicket {
  return {
    id,
    status,
    stationKind: 'KITCHEN',
    stationName: 'Küche',
    tableLabel: 'Tisch 1',
    roundSequence: 1,
    quantity: 1,
    itemName: `Item ${id}`,
    variantName: null,
    modifiers: [],
    note: null,
    recommendedPreparationMinutes: 10,
    criticalPreparationMinutes: 20,
    queuedAt,
    acceptedAt: status === 'QUEUED' ? null : queuedAt,
    startedAt: status === 'IN_PROGRESS' || status === 'READY' ? queuedAt : null,
    readyAt: status === 'READY' ? queuedAt : null,
    updatedAt: queuedAt,
  };
}

function delta(full: boolean, tickets: ProductionQueueTicket[]): ProductionQueueDelta {
  return {
    cursor: '2026-08-18T12:01:00.000Z',
    full,
    stationKind: 'KITCHEN',
    readyHandoffSla: { warningMinutes: 3, criticalMinutes: 5 },
    tickets,
  };
}

describe('production queue reconnect merge', () => {
  it('превращает незавершённый тикет закрытого стола в tombstone', () => {
    expect(queueTicketStatusForSession('QUEUED', 'CLOSED')).toBe('CANCELLED');
    expect(queueTicketStatusForSession('READY', 'CANCELLED')).toBe('CANCELLED');
    expect(queueTicketStatusForSession('IN_PROGRESS', 'OPEN')).toBe('IN_PROGRESS');
  });

  it('replaces stale local data after a full reconnect snapshot', () => {
    expect(
      mergeProductionQueueDelta(
        [ticket('stale', 'QUEUED')],
        delta(true, [ticket('current', 'ACCEPTED')]),
      ).map(({ id }) => id),
    ).toEqual(['current']);
  });

  it('updates changed tickets and preserves untouched tickets', () => {
    const result = mergeProductionQueueDelta(
      [ticket('a', 'QUEUED'), ticket('b', 'QUEUED', '2026-08-18T12:00:01.000Z')],
      delta(false, [ticket('a', 'IN_PROGRESS')]),
    );

    expect(result.map(({ id, status }) => [id, status])).toEqual([
      ['a', 'IN_PROGRESS'],
      ['b', 'QUEUED'],
    ]);
  });

  it.each(['HANDED_OFF', 'CANCELLED'] as const)(
    'removes a terminal %s tombstone from the visible queue',
    (status) => {
      expect(
        mergeProductionQueueDelta([ticket('done', 'READY')], delta(false, [ticket('done', status)])),
      ).toEqual([]);
    },
  );
});
