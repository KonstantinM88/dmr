import { describe, expect, it } from 'vitest';
import {
  classifyProductionSla,
  isCompleteSlaThresholds,
} from '@/domains/production/shared/sla';

describe('production SLA', () => {
  it('does not invent a severity while thresholds are unconfigured', () => {
    expect(
      classifyProductionSla(90 * 60_000, {
        warningMinutes: null,
        criticalMinutes: null,
      }),
    ).toBe('UNCONFIGURED');
  });

  it('moves through on-track, warning and critical at exact boundaries', () => {
    const thresholds = { warningMinutes: 10, criticalMinutes: 15 };

    expect(classifyProductionSla(9 * 60_000, thresholds)).toBe('ON_TRACK');
    expect(classifyProductionSla(10 * 60_000, thresholds)).toBe('WARNING');
    expect(classifyProductionSla(15 * 60_000, thresholds)).toBe('CRITICAL');
  });

  it('requires either two empty or two valid ordered thresholds', () => {
    expect(isCompleteSlaThresholds({ warningMinutes: null, criticalMinutes: null })).toBe(true);
    expect(isCompleteSlaThresholds({ warningMinutes: 10, criticalMinutes: 20 })).toBe(true);
    expect(isCompleteSlaThresholds({ warningMinutes: 10, criticalMinutes: null })).toBe(false);
    expect(isCompleteSlaThresholds({ warningMinutes: 20, criticalMinutes: 10 })).toBe(false);
    expect(isCompleteSlaThresholds({ warningMinutes: 0, criticalMinutes: 10 })).toBe(false);
    expect(isCompleteSlaThresholds({ warningMinutes: 10, criticalMinutes: 241 })).toBe(false);
  });
});
