import { describe, expect, it } from 'vitest';
import {
  createGuestTableAccessToken,
  GUEST_TABLE_ACCESS_MAX_AGE_SECONDS,
  isGuestTableAccessInvalidated,
  nextGuestTableAccessIssuedAt,
  verifyGuestTableAccessToken,
} from '@/domains/tables/server/guest-table-access-token';

const tableToken = 'abcdefghijklmnop_1234567890-ABCD';
const secret = 'test-secret-that-is-longer-than-thirty-two-characters';
const issuedAt = new Date('2026-09-04T10:00:00.000Z');

describe('guest table access token', () => {
  it('round-trips a signed QR-entry grant', () => {
    const value = createGuestTableAccessToken(tableToken, issuedAt, secret);

    expect(
      verifyGuestTableAccessToken(value, secret, new Date('2026-09-04T10:05:00.000Z')),
    ).toEqual({ tableToken, issuedAt });
  });

  it('rejects tampering and a different signing secret', () => {
    const value = createGuestTableAccessToken(tableToken, issuedAt, secret);
    const tampered = value.replace(tableToken, `${tableToken.slice(0, -1)}X`);

    expect(verifyGuestTableAccessToken(tampered, secret, issuedAt)).toBeNull();
    expect(verifyGuestTableAccessToken(value, `${secret}-other`, issuedAt)).toBeNull();
  });

  it('rejects a grant after its eight-hour lifetime', () => {
    const value = createGuestTableAccessToken(tableToken, issuedAt, secret);
    const expiredAt = new Date(
      issuedAt.getTime() + GUEST_TABLE_ACCESS_MAX_AGE_SECONDS * 1000 + 1,
    );

    expect(verifyGuestTableAccessToken(value, secret, expiredAt)).toBeNull();
  });

  it('rejects malformed or implausibly future grants', () => {
    expect(verifyGuestTableAccessToken('not-a-grant', secret, issuedAt)).toBeNull();

    const future = new Date(issuedAt.getTime() + 61_000);
    const value = createGuestTableAccessToken(tableToken, future, secret);
    expect(verifyGuestTableAccessToken(value, secret, issuedAt)).toBeNull();
  });

  it('invalidates every grant issued no later than the closed session', () => {
    const closedAt = new Date('2026-09-04T10:30:00.000Z');

    expect(isGuestTableAccessInvalidated(issuedAt, closedAt)).toBe(true);
    expect(isGuestTableAccessInvalidated(closedAt, closedAt)).toBe(true);
    expect(
      isGuestTableAccessInvalidated(new Date(closedAt.getTime() + 1), closedAt),
    ).toBe(false);
  });

  it('issues a fresh rescan after the latest terminal session despite clock skew', () => {
    const closedAt = new Date('2026-09-04T10:30:00.000Z');
    const serverNow = new Date('2026-09-04T10:29:59.000Z');

    expect(nextGuestTableAccessIssuedAt(serverNow, closedAt).getTime()).toBe(
      closedAt.getTime() + 1,
    );
  });
});
