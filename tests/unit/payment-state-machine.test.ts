import { describe, expect, it } from 'vitest';
import {
  ATTEMPT_TRANSITIONS,
  HANDLED_STRIPE_EVENTS,
  PaymentTransitionError,
  assertAttemptTransition,
  attemptOutcomeForEvent,
  canTransitionAttempt,
  isAttemptActive,
  isAttemptTerminal,
  isHandledStripeEvent,
  sessionStatusForAttemptOutcome,
} from '@/domains/payments/server/payment-state-machine';
import { PAYMENT_ATTEMPT_STATUSES } from '@/domains/payments/shared/types';

describe('переходы попытки оплаты', () => {
  it('идёт по пути ожидания webhook', () => {
    expect(canTransitionAttempt('CREATED', 'PENDING')).toBe(true);
    expect(canTransitionAttempt('PENDING', 'SUCCEEDED')).toBe(true);
    expect(canTransitionAttempt('PENDING', 'FAILED')).toBe(true);
    expect(canTransitionAttempt('PENDING', 'CANCELLED')).toBe(true);
  });

  it('принимает ранний webhook, который обогнал локальную запись PENDING', () => {
    expect(canTransitionAttempt('CREATED', 'SUCCEEDED')).toBe(true);
    expect(canTransitionAttempt('CREATED', 'FAILED')).toBe(true);
  });

  it('не воскрешает завершённую попытку', () => {
    for (const status of ['SUCCEEDED', 'FAILED', 'CANCELLED'] as const) {
      expect(ATTEMPT_TRANSITIONS[status]).toHaveLength(0);
      expect(isAttemptTerminal(status)).toBe(true);
    }
    expect(canTransitionAttempt('FAILED', 'SUCCEEDED')).toBe(false);
    expect(canTransitionAttempt('SUCCEEDED', 'FAILED')).toBe(false);
  });

  it('бросает типизированную ошибку', () => {
    expect(() => assertAttemptTransition('SUCCEEDED', 'FAILED')).toThrow(PaymentTransitionError);
  });

  it('различает живые и завершённые попытки', () => {
    expect(isAttemptActive('CREATED')).toBe(true);
    expect(isAttemptActive('PENDING')).toBe(true);
    expect(isAttemptActive('SUCCEEDED')).toBe(false);
  });

  it('описывает все статусы', () => {
    for (const status of PAYMENT_ATTEMPT_STATUSES) {
      expect(ATTEMPT_TRANSITIONS[status]).toBeDefined();
    }
  });
});

describe('статус сессии по исходу оплаты', () => {
  it('полная оплата закрывает счёт, но не сессию', () => {
    expect(sessionStatusForAttemptOutcome({ outcome: 'SUCCEEDED', fullyPaid: true })).toBe('PAID');
  });

  it('частичная оплата даёт PARTIALLY_PAID', () => {
    expect(sessionStatusForAttemptOutcome({ outcome: 'SUCCEEDED', fullyPaid: false })).toBe(
      'PARTIALLY_PAID',
    );
  });

  it('сбой и отмена возвращают сессию в OPEN', () => {
    expect(sessionStatusForAttemptOutcome({ outcome: 'FAILED', fullyPaid: false })).toBe('OPEN');
    expect(sessionStatusForAttemptOutcome({ outcome: 'CANCELLED', fullyPaid: false })).toBe('OPEN');
  });

  it('никогда не возвращает CLOSED: закрытие — отдельное действие', () => {
    for (const outcome of ['SUCCEEDED', 'FAILED', 'CANCELLED'] as const) {
      for (const fullyPaid of [true, false]) {
        expect(sessionStatusForAttemptOutcome({ outcome, fullyPaid })).not.toBe('CLOSED');
      }
    }
  });
});

describe('события Stripe', () => {
  it('распознаёт обрабатываемые типы', () => {
    for (const eventType of HANDLED_STRIPE_EVENTS) {
      expect(isHandledStripeEvent(eventType)).toBe(true);
    }
  });

  it('игнорирует посторонние типы', () => {
    expect(isHandledStripeEvent('charge.refunded')).toBe(false);
    expect(isHandledStripeEvent('customer.created')).toBe(false);
    expect(isHandledStripeEvent('payment_intent.created')).toBe(false);
  });

  it('сопоставляет событие и исход попытки', () => {
    expect(attemptOutcomeForEvent('payment_intent.succeeded')).toBe('SUCCEEDED');
    expect(attemptOutcomeForEvent('payment_intent.payment_failed')).toBe('FAILED');
    expect(attemptOutcomeForEvent('payment_intent.canceled')).toBe('CANCELLED');
  });

  it('исход события всегда допустим из PENDING', () => {
    for (const eventType of HANDLED_STRIPE_EVENTS) {
      expect(canTransitionAttempt('PENDING', attemptOutcomeForEvent(eventType))).toBe(true);
    }
  });
});
