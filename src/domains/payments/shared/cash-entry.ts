const CASH_TENDER_STEPS_CENTS = [500, 1_000, 2_000, 5_000, 10_000, 20_000] as const;

/** Разбор суммы из поля официанта без floating-point арифметики. */
export function parseEuroCents(value: string): number | null {
  const match = value.trim().match(/^(\d{1,7})(?:[,.](\d{0,2}))?$/);
  if (!match) return null;

  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Точная сумма плюс ближайшие удобные суммы, которыми гость может рассчитаться. */
export function getCashTenderSuggestions(amountCents: number): number[] {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return [];

  const suggestions = CASH_TENDER_STEPS_CENTS.filter((value) => value >= amountCents);
  return [...new Set([amountCents, ...suggestions])].slice(0, 4);
}

