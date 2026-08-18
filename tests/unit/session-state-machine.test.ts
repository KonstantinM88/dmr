import { describe, expect, it } from 'vitest';
import {
  SESSION_TRANSITIONS,
  SessionTransitionError,
  assertSessionTransition,
  canSetApprovalMode,
  canSubmitOrders,
  canTransitionSession,
  canUseAutoAccept,
  isSessionTerminal,
} from '@/domains/sessions/server/session-state-machine';
import { SESSION_STATUSES } from '@/domains/sessions/shared/types';

describe('переходы DiningSession', () => {
  it('разрешает путь оплаты из документации', () => {
    expect(canTransitionSession('OPEN', 'PAYMENT_PENDING')).toBe(true);
    expect(canTransitionSession('PAYMENT_PENDING', 'PARTIALLY_PAID')).toBe(true);
    expect(canTransitionSession('PARTIALLY_PAID', 'PAID')).toBe(true);
    expect(canTransitionSession('PAID', 'CLOSED')).toBe(true);
    expect(canTransitionSession('OPEN', 'CANCELLED')).toBe(true);
  });

  it('возвращает сессию в OPEN при сбое оплаты', () => {
    expect(canTransitionSession('PAYMENT_PENDING', 'OPEN')).toBe(true);
  });

  it('разрешает повторную попытку оплаты остатка', () => {
    expect(canTransitionSession('PARTIALLY_PAID', 'PAYMENT_PENDING')).toBe(true);
  });

  it('запрещает перескок через оплату', () => {
    expect(canTransitionSession('OPEN', 'PAID')).toBe(false);
    expect(canTransitionSession('OPEN', 'CLOSED')).toBe(false);
    expect(canTransitionSession('PAYMENT_PENDING', 'CLOSED')).toBe(false);
  });

  it('не выпускает сессию из терминальных статусов', () => {
    expect(SESSION_TRANSITIONS.CLOSED).toHaveLength(0);
    expect(SESSION_TRANSITIONS.CANCELLED).toHaveLength(0);
    expect(canTransitionSession('CLOSED', 'OPEN')).toBe(false);
    expect(canTransitionSession('CANCELLED', 'OPEN')).toBe(false);
  });

  it('бросает типизированную ошибку на недопустимом переходе', () => {
    expect(() => assertSessionTransition('CLOSED', 'OPEN')).toThrow(SessionTransitionError);
    expect(() => assertSessionTransition('OPEN', 'PAYMENT_PENDING')).not.toThrow();
  });

  it('описывает все статусы без пропусков', () => {
    for (const status of SESSION_STATUSES) {
      expect(SESSION_TRANSITIONS[status]).toBeDefined();
    }
  });
});

describe('приём заказов по статусу сессии', () => {
  it('разрешён только в OPEN и PARTIALLY_PAID', () => {
    expect(canSubmitOrders('OPEN')).toBe(true);
    expect(canSubmitOrders('PARTIALLY_PAID')).toBe(true);
  });

  it('запрещён, пока сессия ждёт оплату', () => {
    expect(canSubmitOrders('PAYMENT_PENDING')).toBe(false);
  });

  it('запрещён в завершённых статусах', () => {
    expect(canSubmitOrders('PAID')).toBe(false);
    expect(canSubmitOrders('CLOSED')).toBe(false);
    expect(canSubmitOrders('CANCELLED')).toBe(false);
  });
});

describe('режим подтверждения дозаказов', () => {
  it('AUTO_ACCEPT запрещён в PAYMENT_PENDING/PAID/CLOSED/CANCELLED', () => {
    for (const status of ['PAYMENT_PENDING', 'PAID', 'CLOSED', 'CANCELLED'] as const) {
      expect(canUseAutoAccept(status)).toBe(false);
      expect(canSetApprovalMode(status, 'AUTO_ACCEPT')).toBe(false);
    }
  });

  it('AUTO_ACCEPT разрешён в активной сессии', () => {
    expect(canSetApprovalMode('OPEN', 'AUTO_ACCEPT')).toBe(true);
    expect(canSetApprovalMode('PARTIALLY_PAID', 'AUTO_ACCEPT')).toBe(true);
  });

  it('возврат к REQUIRE_WAITER доступен в любой незавершённой сессии', () => {
    expect(canSetApprovalMode('OPEN', 'REQUIRE_WAITER')).toBe(true);
    expect(canSetApprovalMode('PAYMENT_PENDING', 'REQUIRE_WAITER')).toBe(true);
    expect(canSetApprovalMode('PARTIALLY_PAID', 'REQUIRE_WAITER')).toBe(true);
  });

  it('в завершённой сессии режим не меняется вовсе', () => {
    expect(canSetApprovalMode('CLOSED', 'REQUIRE_WAITER')).toBe(false);
    expect(canSetApprovalMode('CANCELLED', 'REQUIRE_WAITER')).toBe(false);
    expect(isSessionTerminal('CLOSED')).toBe(true);
    expect(isSessionTerminal('OPEN')).toBe(false);
  });
});
