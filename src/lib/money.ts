/**
 * Денежные расчёты DMR (docs/payment-model.md §2).
 *
 * Решение Этапа 1, фиксируется на весь проект: суммы хранятся и считаются
 * ТОЛЬКО в целых minor units (евроцентах). Никакого float в деньгах.
 * Изменение стратегии впоследствии потребует миграции.
 */

export const DEFAULT_CURRENCY = 'EUR' as const;

export class MoneyError extends Error {}

function assertSafeCents(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new MoneyError(`${label}: сумма должна быть целым числом центов, получено ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label}: сумма выходит за пределы безопасного целого`);
  }
}

export function addCents(...amounts: number[]): number {
  return amounts.reduce((sum, amount) => {
    assertSafeCents(amount, 'addCents');
    return sum + amount;
  }, 0);
}

export function subtractCents(minuend: number, subtrahend: number): number {
  assertSafeCents(minuend, 'subtractCents');
  assertSafeCents(subtrahend, 'subtractCents');
  return minuend - subtrahend;
}

/** Цена позиции × количество. Количество — положительное целое. */
export function multiplyCents(unitPriceCents: number, quantity: number): number {
  assertSafeCents(unitPriceCents, 'multiplyCents');
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new MoneyError(`multiplyCents: количество должно быть целым ≥ 1, получено ${quantity}`);
  }
  return unitPriceCents * quantity;
}

/**
 * НДС, включённый в цену брутто (немецкая розничная модель: цена в меню —
 * конечная цена гостя). rateBasisPoints: 1900 = 19,00 %.
 * Округление half-up до целого цента.
 */
export function taxFromGrossCents(grossCents: number, rateBasisPoints: number): number {
  assertSafeCents(grossCents, 'taxFromGrossCents');
  if (!Number.isInteger(rateBasisPoints) || rateBasisPoints < 0) {
    throw new MoneyError('taxFromGrossCents: ставка должна быть целым числом basis points ≥ 0');
  }
  const numerator = grossCents * rateBasisPoints;
  const denominator = 10_000 + rateBasisPoints;
  return Math.round(numerator / denominator);
}

export function netFromGrossCents(grossCents: number, rateBasisPoints: number): number {
  return subtractCents(grossCents, taxFromGrossCents(grossCents, rateBasisPoints));
}

/** Форматирование для UI. Locale-aware через Intl (docs/localization.md §4). */
export function formatCents(
  cents: number,
  locale: string,
  currency: string = DEFAULT_CURRENCY,
): string {
  assertSafeCents(cents, 'formatCents');
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(cents / 100);
}
