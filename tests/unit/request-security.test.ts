import { describe, expect, it } from 'vitest';
import { isSameOriginRequest } from '@/lib/request-security';

describe('same-origin mutation guard', () => {
  it('accepts the exact request origin', () => {
    expect(isSameOriginRequest('http://localhost:3000/api/admin/menu/media', 'http://localhost:3000')).toBe(true);
  });

  it.each([null, 'https://evil.example', 'not-a-url'])('rejects origin %s', (origin) => {
    expect(isSameOriginRequest('http://localhost:3000/api/admin/menu/media', origin)).toBe(false);
  });
});
