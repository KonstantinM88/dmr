import { computeOrderLine, computeOrderTotal } from '@/domains/orders/shared/pricing';

export const MIN_ORDER_ITEM_QUANTITY = 1;
export const MAX_ORDER_ITEM_QUANTITY = 50;

export type RoundItemQuantityInput = {
  orderItemId: string;
  quantity: number;
};

type SubmittedRoundItem = {
  id: string;
  quantity: number;
  unitPriceCents: number;
  taxRateBasisPoints: number;
};

export type ResolvedRoundQuantity = {
  orderItemId: string;
  previousQuantity: number;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  taxAmountCents: number;
};

export type ResolveRoundQuantitiesResult =
  | {
      ok: true;
      totalGrossCents: number;
      items: ResolvedRoundQuantity[];
      changes: ResolvedRoundQuantity[];
    }
  | { ok: false; reason: 'invalid_quantities' };

/**
 * Проверяет полный quantity-план решения официанта и пересчитывает суммы
 * только из доверенных snapshot-полей OrderItem. Клиент передаёт ID и новое
 * количество, но не цену, налог или итог.
 */
export function resolveRoundQuantities(
  items: readonly SubmittedRoundItem[],
  input: readonly RoundItemQuantityInput[],
): ResolveRoundQuantitiesResult {
  if (input.length !== items.length) return { ok: false, reason: 'invalid_quantities' };

  const quantities = new Map<string, number>();
  for (const entry of input) {
    if (
      quantities.has(entry.orderItemId) ||
      !Number.isInteger(entry.quantity) ||
      entry.quantity < MIN_ORDER_ITEM_QUANTITY ||
      entry.quantity > MAX_ORDER_ITEM_QUANTITY
    ) {
      return { ok: false, reason: 'invalid_quantities' };
    }
    quantities.set(entry.orderItemId, entry.quantity);
  }

  const resolved: ResolvedRoundQuantity[] = [];
  for (const item of items) {
    const quantity = quantities.get(item.id);
    if (quantity === undefined) return { ok: false, reason: 'invalid_quantities' };

    const totals = computeOrderLine({
      // unitPriceCents уже включает variant и modifier snapshots.
      basePriceCents: item.unitPriceCents,
      quantity,
      taxRateBasisPoints: item.taxRateBasisPoints,
    });
    resolved.push({
      orderItemId: item.id,
      previousQuantity: item.quantity,
      quantity,
      unitPriceCents: item.unitPriceCents,
      lineTotalCents: totals.lineTotalCents,
      taxAmountCents: totals.taxAmountCents,
    });
  }

  const knownIds = new Set(items.map((item) => item.id));
  if ([...quantities.keys()].some((id) => !knownIds.has(id))) {
    return { ok: false, reason: 'invalid_quantities' };
  }

  return {
    ok: true,
    totalGrossCents: computeOrderTotal(
      resolved.map((item) => ({
        unitPriceCents: item.unitPriceCents,
        lineTotalCents: item.lineTotalCents,
        taxAmountCents: item.taxAmountCents,
      })),
    ),
    items: resolved,
    changes: resolved.filter((item) => item.quantity !== item.previousQuantity),
  };
}
