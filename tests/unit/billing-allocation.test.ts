import { describe, expect, it } from 'vitest';
import {
  AllocationError,
  computeBillTotals,
  computeTaxBreakdown,
  isFullyPaid,
  isPartiallyPaid,
  planAllocations,
  planSelectedItemAllocations,
  planSelectedItemQuantityAllocations,
  planSelectedItemRemainderAllocations,
  remainingQuantityForItem,
  remainingForItem,
  type BillableItem,
  type UnitBillableItem,
} from '@/domains/billing/shared/allocation';
import { netFromGrossCents } from '@/lib/money';

const item = (
  id: string,
  lineTotalCents: number,
  allocatedPaidCents = 0,
  taxRateBasisPoints = 1900,
): BillableItem => ({
  orderItemId: id,
  lineTotalCents,
  allocatedPaidCents,
  taxRateBasisPoints,
  taxAmountCents: lineTotalCents - netFromGrossCents(lineTotalCents, taxRateBasisPoints),
});

const snapshotItem = (
  id: string,
  lineTotalCents: number,
  taxAmountCents: number,
): BillableItem => ({
  orderItemId: id,
  lineTotalCents,
  allocatedPaidCents: 0,
  taxRateBasisPoints: 1900,
  taxAmountCents,
});

describe('остаток по позиции', () => {
  it('считает неоплаченную часть', () => {
    expect(remainingForItem(item('a', 2450))).toBe(2450);
    expect(remainingForItem(item('a', 2450, 1000))).toBe(1450);
    expect(remainingForItem(item('a', 2450, 2450))).toBe(0);
  });

  it('бросает ошибку при переплате в данных', () => {
    expect(() => remainingForItem(item('a', 2450, 3000))).toThrow(AllocationError);
  });
});

describe('итоги счёта', () => {
  it('складывает позиции без потери центов', () => {
    const totals = computeBillTotals([item('a', 2450), item('b', 350, 0, 700), item('c', 690)]);
    expect(totals.totalGrossCents).toBe(3490);
    expect(totals.remainingCents).toBe(3490);
    expect(totals.paidCents).toBe(0);
  });

  it('учитывает уже распределённые платежи', () => {
    const totals = computeBillTotals([item('a', 2450, 2450), item('b', 350)]);
    expect(totals.paidCents).toBe(2450);
    expect(totals.remainingCents).toBe(350);
  });

  it('пустой счёт даёт нули, а не ошибку', () => {
    expect(computeBillTotals([])).toEqual({
      totalGrossCents: 0,
      paidCents: 0,
      remainingCents: 0,
      taxTotalCents: 0,
    });
  });

  it('считает НДС по разным ставкам отдельно', () => {
    const totals = computeBillTotals([item('a', 2450, 0, 1900), item('b', 350, 0, 700)]);
    // 24,50 € при 19 % → 3,91 €; 3,50 € при 7 % → 0,23 €
    expect(totals.taxTotalCents).toBe(391 + 23);
  });

  it('использует неизменяемый tax snapshot позиции, а не пересчитывает ставку', () => {
    expect(computeBillTotals([snapshotItem('a', 100, 17)]).taxTotalCents).toBe(17);
  });
});

describe('распределение платежа', () => {
  it('закрывает весь счёт целиком', () => {
    const items = [item('a', 2450), item('b', 350)];
    expect(planAllocations(items, 2800)).toEqual([
      { orderItemId: 'a', amountCents: 2450 },
      { orderItemId: 'b', amountCents: 350 },
    ]);
  });

  it('распределяет частичную сумму по порядку позиций', () => {
    const items = [item('a', 2450), item('b', 350)];
    expect(planAllocations(items, 2500)).toEqual([
      { orderItemId: 'a', amountCents: 2450 },
      { orderItemId: 'b', amountCents: 50 },
    ]);
  });

  it('пропускает уже оплаченные позиции', () => {
    const items = [item('a', 2450, 2450), item('b', 350)];
    expect(planAllocations(items, 350)).toEqual([{ orderItemId: 'b', amountCents: 350 }]);
  });

  it('запрещает переплату сверх остатка', () => {
    expect(() => planAllocations([item('a', 2450)], 2451)).toThrow(AllocationError);
  });

  it('запрещает повторную оплату закрытой позиции', () => {
    expect(() => planAllocations([item('a', 2450, 2450)], 100)).toThrow(AllocationError);
  });

  it('отклоняет нулевую, отрицательную и дробную сумму', () => {
    const items = [item('a', 2450)];
    expect(() => planAllocations(items, 0)).toThrow(AllocationError);
    expect(() => planAllocations(items, -100)).toThrow(AllocationError);
    expect(() => planAllocations(items, 10.5)).toThrow(AllocationError);
  });

  it('сумма распределений всегда равна платежу', () => {
    const items = [item('a', 1980), item('b', 690), item('c', 350)];
    for (const amount of [1, 350, 1980, 2670, 3020]) {
      const allocations = planAllocations(items, amount);
      expect(allocations.reduce((sum, entry) => sum + entry.amountCents, 0)).toBe(amount);
    }
  });
});

describe('оплата выбранных позиций', () => {
  const selectedItems = [item('a', 1_000), item('b', 500, 500), item('c', 800, 500)];

  it('берёт только текущие остатки выбранных строк', () => {
    expect(planSelectedItemAllocations(selectedItems, ['a', 'c'])).toEqual([
      { orderItemId: 'a', amountCents: 1_000 },
      { orderItemId: 'c', amountCents: 300 },
    ]);
  });

  it('не доверяет чужим, повторным и уже оплаченным ids', () => {
    expect(() => planSelectedItemAllocations(selectedItems, ['unknown'])).toThrow(AllocationError);
    expect(() => planSelectedItemAllocations(selectedItems, ['a', 'a'])).toThrow(AllocationError);
    expect(() => planSelectedItemAllocations(selectedItems, ['b'])).toThrow(AllocationError);
    expect(() => planSelectedItemAllocations(selectedItems, [])).toThrow(AllocationError);
  });
});

describe('оплата части количества позиции', () => {
  const unitItem = (
    id: string,
    quantity: number,
    unitPriceCents: number,
    allocatedPaidCents = 0,
  ): UnitBillableItem => ({
    ...item(id, quantity * unitPriceCents, allocatedPaidCents),
    quantity,
    unitPriceCents,
  });

  it('планирует одну из двух единиц только по snapshot-цене', () => {
    expect(planSelectedItemQuantityAllocations(
      [unitItem('beer', 2, 390)],
      [{ orderItemId: 'beer', quantity: 1 }],
    )).toEqual([{
      orderItemId: 'beer',
      quantity: 1,
      amountCents: 390,
      expectedRemainingCents: 780,
    }]);
  });

  it('после оплаты одной единицы разрешает оплатить только оставшуюся', () => {
    const partlyPaid = unitItem('beer', 2, 390, 390);
    expect(remainingQuantityForItem(partlyPaid)).toBe(1);
    expect(planSelectedItemRemainderAllocations([partlyPaid], ['beer'])).toEqual([{
      orderItemId: 'beer',
      quantity: 1,
      amountCents: 390,
      expectedRemainingCents: 390,
    }]);
  });

  it('отклоняет ноль, дробь, превышение остатка, дубликат и чужой item', () => {
    const items = [unitItem('beer', 2, 390)];
    expect(() => planSelectedItemQuantityAllocations(items, [{ orderItemId: 'beer', quantity: 0 }])).toThrow(AllocationError);
    expect(() => planSelectedItemQuantityAllocations(items, [{ orderItemId: 'beer', quantity: 1.5 }])).toThrow(AllocationError);
    expect(() => planSelectedItemQuantityAllocations(items, [{ orderItemId: 'beer', quantity: 3 }])).toThrow(AllocationError);
    expect(() => planSelectedItemQuantityAllocations(items, [
      { orderItemId: 'beer', quantity: 1 },
      { orderItemId: 'beer', quantity: 1 },
    ])).toThrow(AllocationError);
    expect(() => planSelectedItemQuantityAllocations(items, [{ orderItemId: 'other', quantity: 1 }])).toThrow(AllocationError);
  });

  it('отклоняет некратный денежный остаток вместо округления количества', () => {
    expect(() => remainingQuantityForItem(unitItem('beer', 2, 390, 100))).toThrow(AllocationError);
  });
});

describe('статус оплаты счёта', () => {
  it('вычисляется из позиций, а не из флага', () => {
    expect(isFullyPaid([item('a', 2450, 2450), item('b', 350, 350)])).toBe(true);
    expect(isFullyPaid([item('a', 2450, 2450), item('b', 350)])).toBe(false);
    expect(isPartiallyPaid([item('a', 2450, 1000)])).toBe(true);
    expect(isPartiallyPaid([item('a', 2450)])).toBe(false);
  });

  it('пустой счёт не считается оплаченным', () => {
    expect(isFullyPaid([])).toBe(false);
  });
});

describe('налоговый разрез', () => {
  it('группирует по ставке и сходится с брутто', () => {
    const rows = computeTaxBreakdown([
      item('a', 2450, 0, 1900),
      item('b', 1980, 0, 1900),
      item('c', 350, 0, 700),
    ]);

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.netCents + row.taxCents).toBe(row.grossCents);
    }
    expect(rows.find((row) => row.rateBasisPoints === 1900)?.grossCents).toBe(4430);
  });
});
