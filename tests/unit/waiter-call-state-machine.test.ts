import { describe, expect, it } from 'vitest';
import {
  assertWaiterCallTransition,
  canTransitionWaiterCall,
} from '@/domains/service-requests/server/waiter-call-state-machine';

describe('вызов официанта', () => {
  it('проходит через принятие и завершение', () => {
    expect(canTransitionWaiterCall('OPEN', 'ACKNOWLEDGED')).toBe(true);
    expect(canTransitionWaiterCall('ACKNOWLEDGED', 'RESOLVED')).toBe(true);
  });

  it('разрешает гостю отменить активный вызов', () => {
    expect(canTransitionWaiterCall('OPEN', 'CANCELLED')).toBe(true);
    expect(canTransitionWaiterCall('ACKNOWLEDGED', 'CANCELLED')).toBe(true);
  });

  it('не воскрешает завершённый вызов', () => {
    expect(canTransitionWaiterCall('RESOLVED', 'OPEN')).toBe(false);
    expect(() => assertWaiterCallTransition('CANCELLED', 'ACKNOWLEDGED')).toThrow();
  });
});
