/** Client-safe типы платежей (Этап 4). Без Prisma и без Stripe SDK. */

export const PAYMENT_ATTEMPT_STATUSES = [
  'CREATED',
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
] as const;

export type PaymentAttemptStatus = (typeof PAYMENT_ATTEMPT_STATUSES)[number];

export const PAYMENT_STATUSES = ['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type StartPaymentResult =
  | {
      ok: true;
      attemptId: string;
      clientSecret: string;
      amountCents: number;
      currency: string;
      /** true, если вернули уже существующую попытку вместо новой. */
      reused: boolean;
    }
  | {
      ok: false;
      reason:
        | 'no_table'
        | 'no_session'
        | 'nothing_to_pay'
        | 'session_not_payable'
        | 'attempt_in_progress'
        | 'invalid_selection'
        | 'provider_unavailable'
        | 'rate_limited';
    };

export type StartCashPaymentResult =
  | {
      ok: true;
      attemptId: string;
      amountCents: number;
      currency: string;
      reused: boolean;
    }
  | {
      ok: false;
      reason:
        | 'no_table'
        | 'no_session'
        | 'nothing_to_pay'
        | 'session_not_payable'
        | 'attempt_in_progress'
        | 'invalid_selection'
        | 'rate_limited';
    };

export type ConfirmCashPaymentResult =
  | { ok: true; paymentId: string; fullyPaid: boolean }
  | { ok: false; reason: 'not_found' | 'invalid_amount' | 'attempt_changed' };

/**
 * Гостевой статус оплаты. Подтверждением считается только состояние,
 * пришедшее с сервера после webhook (docs/payment-model.md §3.6).
 */
export type GuestPaymentView = {
  billId: string;
  status: 'nothing_to_pay' | 'open' | 'pending' | 'paid' | 'failed';
  totalGrossCents: number;
  remainingCents: number;
  currency: string;
};
