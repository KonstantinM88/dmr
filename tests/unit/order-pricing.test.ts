import { describe, expect, it } from 'vitest';
import { computeOrderLine, computeOrderTotal } from '@/domains/orders/shared/pricing';
import { MoneyError } from '@/lib/money';

describe('расчёт строки заказа', () => {
  it('считает цену без модификаторов', () => {
    const line = computeOrderLine({ basePriceCents: 2450, quantity: 2, taxRateBasisPoints: 1900 });
    expect(line.unitPriceCents).toBe(2450);
    expect(line.lineTotalCents).toBe(4900);
    expect(line.taxAmountCents).toBe(782);
  });

  it('добавляет модификаторы к цене единицы, а не к строке', () => {
    const line = computeOrderLine({
      basePriceCents: 1980,
      modifierDeltaCents: [150, 90],
      quantity: 3,
    });
    expect(line.unitPriceCents).toBe(2220);
    expect(line.lineTotalCents).toBe(6660);
  });

  it('учитывает отрицательную скидку модификатора', () => {
    const line = computeOrderLine({
      basePriceCents: 690,
      modifierDeltaCents: [-100],
      quantity: 1,
    });
    expect(line.unitPriceCents).toBe(590);
  });

  it('отклоняет нулевое и дробное количество', () => {
    expect(() => computeOrderLine({ basePriceCents: 500, quantity: 0 })).toThrow(MoneyError);
    expect(() => computeOrderLine({ basePriceCents: 500, quantity: 1.5 })).toThrow(MoneyError);
  });

  it('отклоняет дробную цену', () => {
    expect(() => computeOrderLine({ basePriceCents: 4.99, quantity: 1 })).toThrow(MoneyError);
  });

  it('сумма раунда складывается без потери центов', () => {
    const lines = [
      computeOrderLine({ basePriceCents: 350, quantity: 3 }),
      computeOrderLine({ basePriceCents: 2450, quantity: 1 }),
      computeOrderLine({ basePriceCents: 690, modifierDeltaCents: [50], quantity: 2 }),
    ];
    expect(computeOrderTotal(lines)).toBe(1050 + 2450 + 1480);
  });

  it('налог строки соответствует ставке позиции', () => {
    const reduced = computeOrderLine({ basePriceCents: 350, quantity: 2, taxRateBasisPoints: 700 });
    expect(reduced.lineTotalCents).toBe(700);
    expect(reduced.taxAmountCents).toBe(46);
  });
});
