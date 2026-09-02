import { describe, expect, it } from 'vitest';
import {
  calculateChangeCents,
  CashSettlementError,
} from '@/domains/payments/shared/cash';

describe('наличный расчёт', () => {
  it('считает точную оплату и сдачу только в центах', () => {
    expect(calculateChangeCents(2_190, 2_190)).toBe(0);
    expect(calculateChangeCents(2_190, 3_000)).toBe(810);
  });

  it('отклоняет недоплату, ноль и дробные значения', () => {
    expect(() => calculateChangeCents(2_190, 2_000)).toThrow(CashSettlementError);
    expect(() => calculateChangeCents(0, 100)).toThrow(CashSettlementError);
    expect(() => calculateChangeCents(100, 100.5)).toThrow(CashSettlementError);
  });
});
