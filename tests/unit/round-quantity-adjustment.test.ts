import { describe, expect, it } from 'vitest';
import { resolveRoundQuantities } from '@/domains/orders/shared/round-quantity';

const items = [
  {
    id: 'soup',
    quantity: 2,
    unitPriceCents: 690,
    taxRateBasisPoints: 700,
  },
  {
    id: 'steak',
    quantity: 1,
    unitPriceCents: 2_190,
    taxRateBasisPoints: 1_900,
  },
] as const;

describe('изменение количества официантом перед подтверждением', () => {
  it('пересчитывает строку, налог и сумму раунда из server-side snapshot цены', () => {
    const result = resolveRoundQuantities(items, [
      { orderItemId: 'soup', quantity: 3 },
      { orderItemId: 'steak', quantity: 2 },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.totalGrossCents).toBe(6_450);
    expect(result.items).toEqual([
      expect.objectContaining({ orderItemId: 'soup', quantity: 3, lineTotalCents: 2_070 }),
      expect.objectContaining({ orderItemId: 'steak', quantity: 2, lineTotalCents: 4_380 }),
    ]);
    expect(result.changes).toHaveLength(2);
  });

  it('не считает неизменённые позиции изменениями', () => {
    const result = resolveRoundQuantities(items, [
      { orderItemId: 'soup', quantity: 2 },
      { orderItemId: 'steak', quantity: 1 },
    ]);

    expect(result).toMatchObject({ ok: true, totalGrossCents: 3_570, changes: [] });
  });

  it.each([
    {
      name: 'пропущена позиция',
      input: [{ orderItemId: 'soup', quantity: 2 }],
    },
    {
      name: 'передан неизвестный ID',
      input: [
        { orderItemId: 'soup', quantity: 2 },
        { orderItemId: 'unknown', quantity: 1 },
      ],
    },
    {
      name: 'ID продублирован',
      input: [
        { orderItemId: 'soup', quantity: 2 },
        { orderItemId: 'soup', quantity: 3 },
      ],
    },
    {
      name: 'количество равно нулю',
      input: [
        { orderItemId: 'soup', quantity: 0 },
        { orderItemId: 'steak', quantity: 1 },
      ],
    },
    {
      name: 'количество превышает лимит',
      input: [
        { orderItemId: 'soup', quantity: 51 },
        { orderItemId: 'steak', quantity: 1 },
      ],
    },
    {
      name: 'количество дробное',
      input: [
        { orderItemId: 'soup', quantity: 1.5 },
        { orderItemId: 'steak', quantity: 1 },
      ],
    },
  ])('отклоняет некорректный план: $name', ({ input }) => {
    expect(resolveRoundQuantities(items, input)).toEqual({
      ok: false,
      reason: 'invalid_quantities',
    });
  });
});
