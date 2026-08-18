import { addCents, multiplyCents, taxFromGrossCents } from '@/lib/money';

/**
 * Расчёт строки заказа. Client-safe: та же функция считает предварительную
 * сумму в корзине и окончательную — на сервере, поэтому гость и счёт не
 * расходятся из-за разной арифметики. Источником цен на сервере всё равно
 * остаётся БД (docs/order-state-machines.md §6, шаги 6–9).
 */
export type OrderLineInput = {
  basePriceCents: number;
  modifierDeltaCents?: readonly number[];
  quantity: number;
  taxRateBasisPoints?: number;
};

export type OrderLineTotals = {
  unitPriceCents: number;
  lineTotalCents: number;
  taxAmountCents: number;
};

export function computeOrderLine(input: OrderLineInput): OrderLineTotals {
  const unitPriceCents = addCents(input.basePriceCents, ...(input.modifierDeltaCents ?? []));
  const lineTotalCents = multiplyCents(unitPriceCents, input.quantity);
  const taxAmountCents = taxFromGrossCents(lineTotalCents, input.taxRateBasisPoints ?? 0);

  return { unitPriceCents, lineTotalCents, taxAmountCents };
}

export function computeOrderTotal(lines: readonly OrderLineTotals[]): number {
  return addCents(...lines.map((line) => line.lineTotalCents));
}
