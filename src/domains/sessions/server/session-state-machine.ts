import type { SessionStatus, ReorderApprovalMode } from '@/domains/sessions/shared/types';

/**
 * Машина состояний DiningSession (docs/order-state-machines.md §1).
 *
 * Модуль намеренно чистый (без Prisma и I/O): его целиком покрывают unit-тесты,
 * а сервисы вызывают `assertSessionTransition` перед записью в БД.
 * UI не предлагает переход, который сервер запретит.
 */
export const SESSION_TRANSITIONS: Record<SessionStatus, readonly SessionStatus[]> = {
  OPEN: ['PAYMENT_PENDING', 'CANCELLED'],
  // Сбой оплаты возвращает сессию в безопасное состояние.
  PAYMENT_PENDING: ['PARTIALLY_PAID', 'PAID', 'OPEN'],
  // Новая попытка оплаты остатка.
  PARTIALLY_PAID: ['PAYMENT_PENDING', 'PAID'],
  // Закрытие — отдельное бизнес-действие, не автоматическое следствие оплаты.
  PAID: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

/** Статусы, в которых сессия считается завершённой. */
export const TERMINAL_SESSION_STATUSES: readonly SessionStatus[] = ['CLOSED', 'CANCELLED'];

/** Статусы, в которых AUTO_ACCEPT запрещён (docs/product-spec.md §4). */
export const AUTO_ACCEPT_FORBIDDEN_STATUSES: readonly SessionStatus[] = [
  'PAYMENT_PENDING',
  'PAID',
  'CLOSED',
  'CANCELLED',
];

export class SessionTransitionError extends Error {
  readonly from: SessionStatus;
  readonly to: SessionStatus;

  constructor(from: SessionStatus, to: SessionStatus) {
    super(`Недопустимый переход сессии: ${from} → ${to}`);
    this.name = 'SessionTransitionError';
    this.from = from;
    this.to = to;
  }
}

export function canTransitionSession(from: SessionStatus, to: SessionStatus): boolean {
  return SESSION_TRANSITIONS[from].includes(to);
}

export function assertSessionTransition(from: SessionStatus, to: SessionStatus): void {
  if (!canTransitionSession(from, to)) throw new SessionTransitionError(from, to);
}

export function isSessionTerminal(status: SessionStatus): boolean {
  return TERMINAL_SESSION_STATUSES.includes(status);
}

/**
 * Новые раунды запрещены, пока сессия ждёт оплату либо завершена
 * (docs/order-state-machines.md §1).
 */
export function canSubmitOrders(status: SessionStatus): boolean {
  return status === 'OPEN' || status === 'PARTIALLY_PAID';
}

export function canUseAutoAccept(status: SessionStatus): boolean {
  return !AUTO_ACCEPT_FORBIDDEN_STATUSES.includes(status);
}

/**
 * Разрешено ли переключить режим подтверждения дозаказов.
 * Возврат к REQUIRE_WAITER доступен официанту в любой активной сессии.
 */
export function canSetApprovalMode(
  status: SessionStatus,
  mode: ReorderApprovalMode,
): boolean {
  if (isSessionTerminal(status)) return false;
  if (mode === 'AUTO_ACCEPT') return canUseAutoAccept(status);
  return true;
}
