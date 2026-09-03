import { describe, expect, it } from 'vitest';
import { unseenOperationalSignalIds } from '@/domains/realtime/shared/operational-signals';

describe('operational signals', () => {
  it('возвращает новые уникальные сигналы', () => {
    expect(unseenOperationalSignalIds(['new', 'new', 'ready'], new Set(['ready']))).toEqual(['new']);
  });

  it('не повторяет уже показанные сигналы', () => {
    expect(unseenOperationalSignalIds(['a', 'b'], new Set(['a', 'b']))).toEqual([]);
  });
});
