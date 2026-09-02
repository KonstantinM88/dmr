import { describe, expect, it } from 'vitest';
import {
  getCashTenderSuggestions,
  parseEuroCents,
} from '@/domains/payments/shared/cash-entry';

describe('cash tender input', () => {
  it('parses comma and dot decimal amounts as integer cents', () => {
    expect(parseEuroCents('50')).toBe(5_000);
    expect(parseEuroCents('50,00')).toBe(5_000);
    expect(parseEuroCents('35.5')).toBe(3_550);
  });

  it('rejects malformed or over-precise values', () => {
    expect(parseEuroCents('')).toBeNull();
    expect(parseEuroCents('-1')).toBeNull();
    expect(parseEuroCents('35,001')).toBeNull();
    expect(parseEuroCents('cash')).toBeNull();
  });

  it('offers exact payment and suitable larger cash amounts', () => {
    expect(getCashTenderSuggestions(3_500)).toEqual([3_500, 5_000, 10_000, 20_000]);
    expect(getCashTenderSuggestions(0)).toEqual([]);
  });
});
