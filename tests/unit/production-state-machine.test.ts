import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_TICKET_TRANSITIONS,
  ProductionTransitionError,
  assertProductionTicketTransition,
  canTransitionProductionTicket,
  deriveRoundProductionStatus,
  itemStatusForTicketTransition,
  roundProductionPath,
} from '@/domains/production/server/production-state-machine';
import { PRODUCTION_TICKET_STATUSES } from '@/domains/production/shared/types';

describe('ProductionTicket state machine', () => {
  it('разрешает полный производственный путь', () => {
    expect(canTransitionProductionTicket('QUEUED', 'ACCEPTED')).toBe(true);
    expect(canTransitionProductionTicket('ACCEPTED', 'IN_PROGRESS')).toBe(true);
    expect(canTransitionProductionTicket('IN_PROGRESS', 'READY')).toBe(true);
    expect(canTransitionProductionTicket('READY', 'HANDED_OFF')).toBe(true);
  });

  it('запрещает перепрыгивание и повтор терминального перехода', () => {
    expect(canTransitionProductionTicket('QUEUED', 'READY')).toBe(false);
    expect(canTransitionProductionTicket('HANDED_OFF', 'READY')).toBe(false);
    expect(() => assertProductionTicketTransition('QUEUED', 'READY')).toThrow(
      ProductionTransitionError,
    );
  });

  it('описывает все статусы', () => {
    for (const status of PRODUCTION_TICKET_STATUSES) {
      expect(PRODUCTION_TICKET_TRANSITIONS[status]).toBeDefined();
    }
  });

  it('сопоставляет производственные переходы статусам позиции', () => {
    expect(itemStatusForTicketTransition('ACCEPTED')).toBeNull();
    expect(itemStatusForTicketTransition('IN_PROGRESS')).toBe('IN_PREPARATION');
    expect(itemStatusForTicketTransition('READY')).toBe('READY');
    expect(itemStatusForTicketTransition('HANDED_OFF')).toBe('SERVED');
    expect(itemStatusForTicketTransition('CANCELLED')).toBe('CANCELLED');
  });
});

describe('агрегация статуса OrderRound', () => {
  it('переходит в IN_PROGRESS при начале хотя бы одной принятой позиции', () => {
    expect(deriveRoundProductionStatus('ACCEPTED', ['IN_PREPARATION', 'ACCEPTED'])).toBe(
      'IN_PROGRESS',
    );
  });

  it('считает отклонённые позиции неблокирующими', () => {
    expect(deriveRoundProductionStatus('PARTIALLY_ACCEPTED', ['READY', 'REJECTED'])).toBe('READY');
    expect(deriveRoundProductionStatus('READY', ['SERVED', 'REJECTED'])).toBe('SERVED');
  });

  it('не меняет ожидающий или терминальный раунд', () => {
    expect(deriveRoundProductionStatus('SUBMITTED', ['READY'])).toBe('SUBMITTED');
    expect(deriveRoundProductionStatus('REJECTED', ['SERVED'])).toBe('REJECTED');
  });

  it('строит последовательный путь без прыжков', () => {
    expect(roundProductionPath('ACCEPTED', 'SERVED')).toEqual([
      'IN_PROGRESS',
      'READY',
      'SERVED',
    ]);
    expect(roundProductionPath('IN_PROGRESS', 'SERVED')).toEqual(['READY', 'SERVED']);
    expect(roundProductionPath('READY', 'READY')).toEqual([]);
  });
});
