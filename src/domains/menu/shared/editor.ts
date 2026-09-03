export const MENU_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_MENU_PRICE_CENTS = 1_000_000;
export const MAX_MENU_ITEM_ALLERGENS = 14;

/** Удаляет повторы, сохраняя порядок выбранных справочных значений. */
export function uniqueReferenceIds(values: string[]): string[] {
  return [...new Set(values)];
}

/** Строгий разбор EUR без арифметики с плавающей точкой. */
export function parseEuroPrice(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  const match = /^(\d{1,5})(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return null;

  const euros = Number(match[1]);
  const cents = Number((match[2] ?? '').padEnd(2, '0'));
  const total = euros * 100 + cents;
  return total <= MAX_MENU_PRICE_CENTS ? total : null;
}

export function formatPriceInput(cents: number): string {
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`;
}
