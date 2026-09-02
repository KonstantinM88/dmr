import type { PaymentAttemptStatus } from '@/domains/payments/shared/types';
import type { SessionStatus } from '@/domains/sessions/shared/types';

/**
 * Машина состояний PaymentAttempt (docs/order-state-machines.md §5).
 * Чистый модуль без I/O, полностью покрыт unit-тестами.
 */
export const ATTEMPT_TRANSITIONS: Record<PaymentAttemptStatus, readonly PaymentAttemptStatus[]> = {
  // Webhook может обогнать локальную запись PENDING после создания intent.
  CREATED: ['PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED'],
  // PENDING = ждём webhook. Client redirect статус не меняет.
  PENDING: ['SUCCEEDED', 'FAILED', 'CANCELLED'],
  SUCCEEDED: [],
  FAILED: [],
  CANCELLED: [],
};

export class PaymentTransitionError extends Error {
  constructor(from: PaymentAttemptStatus, to: PaymentAttemptStatus) {
    super(`Недопустимый переход попытки оплаты: ${from} → ${to}`);
    this.name = 'PaymentTransitionError';
  }
}

export function canTransitionAttempt(
  from: PaymentAttemptStatus,
  to: PaymentAttemptStatus,
): boolean {
  return ATTEMPT_TRANSITIONS[from].includes(to);
}

export function assertAttemptTransition(
  from: PaymentAttemptStatus,
  to: PaymentAttemptStatus,
): void {
  if (!canTransitionAttempt(from, to)) throw new PaymentTransitionError(from, to);
}

export function isAttemptTerminal(status: PaymentAttemptStatus): boolean {
  return ATTEMPT_TRANSITIONS[status].length === 0;
}

/** Попытка ещё удерживает счёт: новый PaymentIntent создавать нельзя. */
export function isAttemptActive(status: PaymentAttemptStatus): boolean {
  return status === 'CREATED' || status === 'PENDING';
}

/**
 * Куда переводить сессию по исходу попытки (docs/payment-model.md §3.12–3.14).
 * Сбой возвращает сессию в OPEN, чтобы гость мог повторить оплату или
 * дозаказать; закрытие сессии остаётся отдельным действием персонала.
 */
export function sessionStatusForAttemptOutcome(input: {
  outcome: Extract<PaymentAttemptStatus, 'SUCCEEDED' | 'FAILED' | 'CANCELLED'>;
  fullyPaid: boolean;
}): SessionStatus {
  if (input.outcome !== 'SUCCEEDED') return 'OPEN';
  return input.fullyPaid ? 'PAID' : 'PARTIALLY_PAID';
}

/**
 * Какие типы событий Stripe нас интересуют. Остальные сохраняются как
 * IGNORED: молча выбрасывать события нельзя, они нужны для сверки.
 */
export const HANDLED_STRIPE_EVENTS = [
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.canceled',
] as const;

export type HandledStripeEvent = (typeof HANDLED_STRIPE_EVENTS)[number];

export function isHandledStripeEvent(eventType: string): eventType is HandledStripeEvent {
  return (HANDLED_STRIPE_EVENTS as readonly string[]).includes(eventType);
}

export function attemptOutcomeForEvent(
  eventType: HandledStripeEvent,
): Extract<PaymentAttemptStatus, 'SUCCEEDED' | 'FAILED' | 'CANCELLED'> {
  switch (eventType) {
    case 'payment_intent.succeeded':
      return 'SUCCEEDED';
    case 'payment_intent.payment_failed':
      return 'FAILED';
    case 'payment_intent.canceled':
      return 'CANCELLED';
  }
}
