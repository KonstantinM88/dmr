import { describe, expect, it } from 'vitest';
import { formatPriceInput, parseEuroPrice, uniqueReferenceIds } from '@/domains/menu/shared/editor';

describe('menu editor price parsing', () => {
  it.each([
    ['0', 0],
    ['6,9', 690],
    ['24.50', 2450],
    [' 12,05 ', 1205],
  ])('parses %s as integer cents', (input, expected) => {
    expect(parseEuroPrice(input)).toBe(expected);
  });

  it.each(['', '-1', '12.345', '1,2,3', '10000,01', 'EUR 5'])('rejects %s', (input) => {
    expect(parseEuroPrice(input)).toBeNull();
  });

  it('formats cents for an editable EUR input', () => {
    expect(formatPriceInput(690)).toBe('6,90');
  });
});

describe('menu editor reference selection', () => {
  it('removes duplicate allergen ids without changing their order', () => {
    expect(uniqueReferenceIds(['milk', 'gluten', 'milk'])).toEqual(['milk', 'gluten']);
  });
});
