import { beforeEach, describe, expect, it } from 'vitest';
import { checkRateLimit, resetRateLimits } from '@/lib/rate-limit';

describe('rate limiting', () => {
  beforeEach(() => resetRateLimits());

  it('пропускает запросы в пределах лимита', () => {
    for (let i = 0; i < 5; i += 1) {
      expect(checkRateLimit('test', 5, 60_000).allowed).toBe(true);
    }
  });

  it('блокирует запрос сверх лимита', () => {
    for (let i = 0; i < 5; i += 1) checkRateLimit('test', 5, 60_000);
    expect(checkRateLimit('test', 5, 60_000).allowed).toBe(false);
  });

  it('считает ключи независимо', () => {
    for (let i = 0; i < 5; i += 1) checkRateLimit('a', 5, 60_000);
    expect(checkRateLimit('b', 5, 60_000).allowed).toBe(true);
  });
});
