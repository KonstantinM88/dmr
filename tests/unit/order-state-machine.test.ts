import { describe, expect, it } from 'vitest';
import {
  ITEM_TRANSITIONS,
  OrderTransitionError,
  ROUND_TRANSITIONS,
  assertItemTransition,
  assertRoundTransition,
  canTransitionItem,
  canTransitionRound,
  decideInitialRoundStatus,
  isRoundAccepted,
  isRoundPending,
  resolveRoundDecision,
} from '@/domains/orders/server/order-state-machine';
import { ORDER_ITEM_STATUSES, ORDER_ROUND_STATUSES } from '@/domains/orders/shared/types';

describe('переходы OrderRound', () => {
  it('разрешает полный и частичный приём', () => {
    expect(canTransitionRound('SUBMITTED', 'ACCEPTED')).toBe(true);
    expect(canTransitionRound('SUBMITTED', 'PARTIALLY_ACCEPTED')).toBe(true);
    expect(canTransitionRound('SUBMITTED', 'REJECTED')).toBe(true);
  });

  it('ведёт принятый раунд по производственному пути', () => {
    expect(canTransitionRound('ACCEPTED', 'IN_PROGRESS')).toBe(true);
    expect(canTransitionRound('IN_PROGRESS', 'READY')).toBe(true);
    expect(canTransitionRound('READY', 'SERVED')).toBe(true);
  });

  it('запрещает отправку в работу без решения официанта', () => {
    expect(canTransitionRound('SUBMITTED', 'IN_PROGRESS')).toBe(false);
    expect(canTransitionRound('SUBMITTED', 'READY')).toBe(false);
    expect(canTransitionRound('SUBMITTED', 'SERVED')).toBe(false);
  });

  it('не воскрешает отклонённый или отменённый раунд', () => {
    expect(ROUND_TRANSITIONS.REJECTED).toHaveLength(0);
    expect(ROUND_TRANSITIONS.CANCELLED).toHaveLength(0);
    expect(ROUND_TRANSITIONS.SERVED).toHaveLength(0);
    expect(canTransitionRound('REJECTED', 'ACCEPTED')).toBe(false);
  });

  it('бросает типизированную ошибку', () => {
    expect(() => assertRoundTransition('SUBMITTED', 'SERVED')).toThrow(OrderTransitionError);
  });

  it('описывает все статусы раунда', () => {
    for (const status of ORDER_ROUND_STATUSES) expect(ROUND_TRANSITIONS[status]).toBeDefined();
  });
});

describe('переходы OrderItem', () => {
  it('идёт по пути приготовления', () => {
    expect(canTransitionItem('SUBMITTED', 'ACCEPTED')).toBe(true);
    expect(canTransitionItem('ACCEPTED', 'IN_PREPARATION')).toBe(true);
    expect(canTransitionItem('IN_PREPARATION', 'READY')).toBe(true);
    expect(canTransitionItem('READY', 'SERVED')).toBe(true);
  });

  it('запрещает подачу неприготовленной позиции', () => {
    expect(canTransitionItem('SUBMITTED', 'SERVED')).toBe(false);
    expect(canTransitionItem('ACCEPTED', 'SERVED')).toBe(false);
  });

  it('запрещает отмену поданной позиции', () => {
    expect(canTransitionItem('SERVED', 'CANCELLED')).toBe(false);
    expect(ITEM_TRANSITIONS.SERVED).toHaveLength(0);
    expect(() => assertItemTransition('SERVED', 'CANCELLED')).toThrow(OrderTransitionError);
  });

  it('описывает все статусы позиции', () => {
    for (const status of ORDER_ITEM_STATUSES) expect(ITEM_TRANSITIONS[status]).toBeDefined();
  });
});

describe('начальный статус раунда', () => {
  it('первый заказ сессии всегда ждёт официанта, даже при AUTO_ACCEPT', () => {
    expect(decideInitialRoundStatus({ isFirstRound: true, approvalMode: 'AUTO_ACCEPT' })).toBe(
      'SUBMITTED',
    );
    expect(decideInitialRoundStatus({ isFirstRound: true, approvalMode: 'REQUIRE_WAITER' })).toBe(
      'SUBMITTED',
    );
  });

  it('дозаказ при AUTO_ACCEPT принимается сразу', () => {
    expect(decideInitialRoundStatus({ isFirstRound: false, approvalMode: 'AUTO_ACCEPT' })).toBe(
      'ACCEPTED',
    );
  });

  it('дозаказ при REQUIRE_WAITER ждёт официанта', () => {
    expect(decideInitialRoundStatus({ isFirstRound: false, approvalMode: 'REQUIRE_WAITER' })).toBe(
      'SUBMITTED',
    );
  });

  it('ручной заказ официанта принят сразу, включая первый раунд', () => {
    expect(
      decideInitialRoundStatus({
        isFirstRound: true,
        approvalMode: 'REQUIRE_WAITER',
        createdByStaff: true,
      }),
    ).toBe('ACCEPTED');
  });
});

describe('решение официанта по раунду', () => {
  it('все позиции приняты — ACCEPTED', () => {
    expect(resolveRoundDecision({ acceptedItemIds: ['a', 'b'], rejectedItemIds: [] })).toBe(
      'ACCEPTED',
    );
  });

  it('часть позиций отклонена — PARTIALLY_ACCEPTED', () => {
    expect(resolveRoundDecision({ acceptedItemIds: ['a'], rejectedItemIds: ['b'] })).toBe(
      'PARTIALLY_ACCEPTED',
    );
  });

  it('ничего не принято — REJECTED', () => {
    expect(resolveRoundDecision({ acceptedItemIds: [], rejectedItemIds: ['a', 'b'] })).toBe(
      'REJECTED',
    );
  });

  it('результат решения — всегда допустимый переход из SUBMITTED', () => {
    for (const decision of [
      { acceptedItemIds: ['a'], rejectedItemIds: [] },
      { acceptedItemIds: ['a'], rejectedItemIds: ['b'] },
      { acceptedItemIds: [], rejectedItemIds: ['b'] },
    ]) {
      expect(canTransitionRound('SUBMITTED', resolveRoundDecision(decision))).toBe(true);
    }
  });
});

describe('вспомогательные предикаты', () => {
  it('различают ожидающие и принятые раунды', () => {
    expect(isRoundPending('SUBMITTED')).toBe(true);
    expect(isRoundPending('ACCEPTED')).toBe(false);
    expect(isRoundAccepted('ACCEPTED')).toBe(true);
    expect(isRoundAccepted('PARTIALLY_ACCEPTED')).toBe(true);
    expect(isRoundAccepted('REJECTED')).toBe(false);
  });
});
