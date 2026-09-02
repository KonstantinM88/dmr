import { subtractCents } from '@/lib/money';

export class CashSettlementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CashSettlementError';
  }
}

/** Сдача считается только в целых центах; недоплата не регистрируется. */
export function calculateChangeCents(amountCents: number, receivedCents: number): number {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new CashSettlementError('Сумма расчёта должна быть положительным целым числом центов.');
  }
  if (!Number.isSafeInteger(receivedCents) || receivedCents < amountCents) {
    throw new CashSettlementError('Полученная сумма меньше суммы расчёта.');
  }
  return subtractCents(receivedCents, amountCents);
}
