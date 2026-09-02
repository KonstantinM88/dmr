import { addCents, subtractCents } from '@/lib/money';
import type { TaxBreakdownRow } from '@/domains/billing/shared/types';

/**
 * Чистая арифметика счёта и распределения платежей
 * (docs/payment-model.md §1, §4).
 *
 * Модуль намеренно без Prisma: именно эти правила защищают от двойной
 * оплаты позиции, оплаты сверх остатка и отрицательного остатка, поэтому
 * они полностью покрыты unit-тестами.
 */
export class AllocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AllocationError';
  }
}

export type BillableItem = {
  orderItemId: string;
  lineTotalCents: number;
  allocatedPaidCents: number;
  taxRateBasisPoints: number;
  taxAmountCents: number;
};

export type BillTotals = {
  totalGrossCents: number;
  paidCents: number;
  remainingCents: number;
  taxTotalCents: number;
};

/** Остаток по одной позиции. Никогда не отрицателен. */
export function remainingForItem(item: BillableItem): number {
  const remaining = subtractCents(item.lineTotalCents, item.allocatedPaidCents);
  if (remaining < 0) {
    throw new AllocationError(
      `Позиция ${item.orderItemId} оплачена сверх суммы: остаток ${remaining}`,
    );
  }
  return remaining;
}

/**
 * Итоги счёта. В сумму входят только переданные позиции: вызывающий обязан
 * отфильтровать отклонённые и отменённые (docs/payment-model.md §3.2).
 */
export function computeBillTotals(items: readonly BillableItem[]): BillTotals {
  if (items.length === 0) {
    return { totalGrossCents: 0, paidCents: 0, remainingCents: 0, taxTotalCents: 0 };
  }

  const totalGrossCents = addCents(...items.map((item) => item.lineTotalCents));
  const paidCents = addCents(...items.map((item) => item.allocatedPaidCents));
  const remainingCents = addCents(...items.map((item) => remainingForItem(item)));
  const taxTotalCents = addCents(...items.map((item) => item.taxAmountCents));

  return { totalGrossCents, paidCents, remainingCents, taxTotalCents };
}

export type PlannedAllocation = {
  orderItemId: string;
  amountCents: number;
};

export type UnitBillableItem = BillableItem & {
  unitPriceCents: number;
  quantity: number;
};

export type ItemQuantitySelection = {
  orderItemId: string;
  quantity: number;
};

export type PlannedUnitAllocation = PlannedAllocation & {
  quantity: number;
  expectedRemainingCents: number;
};

/** Остаток строки в штуках; денежный остаток обязан быть кратен unit price. */
export function remainingQuantityForItem(item: UnitBillableItem): number {
  if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) {
    throw new AllocationError('Количество позиции должно быть положительным целым числом.');
  }
  if (!Number.isSafeInteger(item.unitPriceCents) || item.unitPriceCents <= 0) {
    throw new AllocationError('Цена единицы должна быть положительным целым числом центов.');
  }
  if (item.lineTotalCents !== item.unitPriceCents * item.quantity) {
    throw new AllocationError('Итог строки не совпадает с ценой единицы и количеством.');
  }
  if (item.allocatedPaidCents % item.unitPriceCents !== 0) {
    throw new AllocationError('Оплаченная сумма позиции не соответствует целому количеству единиц.');
  }

  const remaining = item.quantity - item.allocatedPaidCents / item.unitPriceCents;
  if (!Number.isSafeInteger(remaining) || remaining < 0) {
    throw new AllocationError('Оплаченное количество превышает количество позиции.');
  }
  return remaining;
}

/**
 * Распределение суммы платежа по позициям в порядке их следования.
 *
 * MVP оплачивает весь остаток целиком, но функция сознательно поддерживает
 * частичную сумму: это фундамент Этапа 5. Переплата запрещена — она означает
 * рассинхронизацию с провайдером и должна расследоваться, а не «съедаться».
 */
export function planAllocations(
  items: readonly BillableItem[],
  amountCents: number,
): PlannedAllocation[] {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new AllocationError('Сумма платежа должна быть целым числом центов больше нуля.');
  }

  const totalRemaining = items.reduce((sum, item) => sum + remainingForItem(item), 0);

  if (amountCents > totalRemaining) {
    throw new AllocationError(
      `Платёж ${amountCents} превышает остаток счёта ${totalRemaining}: распределение отклонено.`,
    );
  }

  const allocations: PlannedAllocation[] = [];
  let rest = amountCents;

  for (const item of items) {
    if (rest === 0) break;
    const remaining = remainingForItem(item);
    if (remaining === 0) continue;

    const amount = Math.min(remaining, rest);
    allocations.push({ orderItemId: item.orderItemId, amountCents: amount });
    rest = subtractCents(rest, amount);
  }

  if (rest !== 0) {
    throw new AllocationError(`Не удалось распределить остаток платежа: ${rest}`);
  }

  return allocations;
}

/**
 * Полное закрытие выбранных строк счёта. Клиент передаёт только ids — суммы
 * всегда берутся из серверного snapshot и текущего остатка позиции.
 */
export function planSelectedItemAllocations(
  items: readonly BillableItem[],
  selectedItemIds: readonly string[],
): PlannedAllocation[] {
  const uniqueIds = new Set(selectedItemIds);
  if (uniqueIds.size === 0) {
    throw new AllocationError('Нужно выбрать хотя бы одну неоплаченную позицию.');
  }
  if (uniqueIds.size !== selectedItemIds.length) {
    throw new AllocationError('Выбор позиций содержит дубликаты.');
  }

  const byId = new Map(items.map((item) => [item.orderItemId, item]));
  const allocations: PlannedAllocation[] = [];

  for (const orderItemId of uniqueIds) {
    const item = byId.get(orderItemId);
    if (!item) throw new AllocationError('Выбранная позиция не принадлежит этому счёту.');
    const amountCents = remainingForItem(item);
    if (amountCents <= 0) throw new AllocationError('Выбранная позиция уже оплачена.');
    allocations.push({ orderItemId, amountCents });
  }

  return allocations;
}

/**
 * Серверный план оплаты выбранного количества. Клиент задаёт только item id
 * и целое quantity; сумма и ожидаемый остаток берутся из snapshot позиции.
 */
export function planSelectedItemQuantityAllocations(
  items: readonly UnitBillableItem[],
  selections: readonly ItemQuantitySelection[],
): PlannedUnitAllocation[] {
  if (selections.length === 0) {
    throw new AllocationError('Нужно выбрать хотя бы одну единицу для оплаты.');
  }

  const uniqueIds = new Set(selections.map((selection) => selection.orderItemId));
  if (uniqueIds.size !== selections.length) {
    throw new AllocationError('Выбор количества содержит повторные позиции.');
  }

  const byId = new Map(items.map((item) => [item.orderItemId, item]));
  return selections.map((selection) => {
    if (!Number.isSafeInteger(selection.quantity) || selection.quantity < 1) {
      throw new AllocationError('Оплачиваемое количество должно быть целым числом не меньше 1.');
    }

    const item = byId.get(selection.orderItemId);
    if (!item) throw new AllocationError('Выбранная позиция не принадлежит этому счёту.');
    const remainingQuantity = remainingQuantityForItem(item);
    if (selection.quantity > remainingQuantity) {
      throw new AllocationError('Выбрано больше единиц, чем осталось оплатить.');
    }

    return {
      orderItemId: item.orderItemId,
      quantity: selection.quantity,
      amountCents: item.unitPriceCents * selection.quantity,
      expectedRemainingCents: remainingForItem(item),
    };
  });
}

/** Старый guest checkbox означает оплату всех оставшихся единиц строки. */
export function planSelectedItemRemainderAllocations(
  items: readonly UnitBillableItem[],
  selectedItemIds: readonly string[],
): PlannedUnitAllocation[] {
  const uniqueIds = new Set(selectedItemIds);
  if (uniqueIds.size !== selectedItemIds.length) {
    throw new AllocationError('Выбор позиций содержит дубликаты.');
  }

  const byId = new Map(items.map((item) => [item.orderItemId, item]));
  const selections = selectedItemIds.map((orderItemId) => {
    const item = byId.get(orderItemId);
    if (!item) throw new AllocationError('Выбранная позиция не принадлежит этому счёту.');
    return { orderItemId, quantity: remainingQuantityForItem(item) };
  });
  return planSelectedItemQuantityAllocations(items, selections);
}

/** Полностью ли закрыт счёт. Источник статуса — эта функция, не флаг в UI. */
export function isFullyPaid(items: readonly BillableItem[]): boolean {
  return items.length > 0 && items.every((item) => remainingForItem(item) === 0);
}

export function isPartiallyPaid(items: readonly BillableItem[]): boolean {
  const paid = items.reduce((sum, item) => sum + item.allocatedPaidCents, 0);
  return paid > 0 && !isFullyPaid(items);
}

/** Разрез по ставкам НДС для бухгалтерии. */
export function computeTaxBreakdown(items: readonly BillableItem[]): TaxBreakdownRow[] {
  const byRate = new Map<number, { grossCents: number; taxCents: number }>();

  for (const item of items) {
    const current = byRate.get(item.taxRateBasisPoints) ?? { grossCents: 0, taxCents: 0 };
    byRate.set(item.taxRateBasisPoints, {
      grossCents: addCents(current.grossCents, item.lineTotalCents),
      taxCents: addCents(current.taxCents, item.taxAmountCents),
    });
  }

  return [...byRate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rateBasisPoints, { grossCents, taxCents }]) => ({
      rateBasisPoints,
      grossCents,
      netCents: subtractCents(grossCents, taxCents),
      taxCents,
    }));
}
