import { describe, expect, it } from 'vitest';
import {
  addCents,
  formatCents,
  multiplyCents,
  netFromGrossCents,
  subtractCents,
  taxFromGrossCents,
  MoneyError,
} from '@/lib/money';

describe('денежные расчёты', () => {
  it('складывает центы без потери точности', () => {
    // Классический float-провал: 0.1 + 0.2 !== 0.3
    expect(addCents(10, 20)).toBe(30);
    expect(addCents(1999, 1, 5000)).toBe(7000);
  });

  it('отклоняет дробные суммы', () => {
    expect(() => addCents(10.5)).toThrow(MoneyError);
    expect(() => multiplyCents(199.99, 2)).toThrow(MoneyError);
  });

  it('отклоняет некорректное количество', () => {
    expect(() => multiplyCents(500, 0)).toThrow(MoneyError);
    expect(() => multiplyCents(500, -1)).toThrow(MoneyError);
    expect(() => multiplyCents(500, 1.5)).toThrow(MoneyError);
  });

  it('умножает цену на количество', () => {
    expect(multiplyCents(2450, 3)).toBe(7350);
  });

  it('вычитает без ухода в дробь', () => {
    expect(subtractCents(2450, 990)).toBe(1460);
  });

  it('выделяет НДС из цены брутто 19 %', () => {
    // 24,50 € брутто → 3,91 € НДС (округление half-up)
    expect(taxFromGrossCents(2450, 1900)).toBe(391);
    expect(netFromGrossCents(2450, 1900)).toBe(2059);
  });

  it('выделяет НДС из цены брутто 7 %', () => {
    expect(taxFromGrossCents(350, 700)).toBe(23);
    expect(netFromGrossCents(350, 700)).toBe(327);
  });

  it('нетто и налог всегда дают исходное брутто', () => {
    for (const gross of [1, 99, 350, 690, 1980, 2450, 99_999]) {
      for (const rate of [0, 700, 1900]) {
        expect(netFromGrossCents(gross, rate) + taxFromGrossCents(gross, rate)).toBe(gross);
      }
    }
  });

  it('форматирует сумму по локали', () => {
    const formatted = formatCents(2450, 'de-DE');
    expect(formatted).toContain('24');
    expect(formatted).toContain('50');
    expect(formatted).toContain('€');
  });
});
