import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGuestTableAccessToken, verifyGuestTableAccessToken } from '@/domains/tables/server/guest-table-access-token';

const mocks = vi.hoisted(() => ({
  findLatestTerminalSession: vi.fn(),
  resolveTableByToken: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    diningSession: { findFirst: mocks.findLatestTerminalSession },
  },
}));

const secret = 'test-secret-that-is-longer-than-thirty-two-characters';
vi.mock('@/lib/env', () => ({
  getEnv: () => ({ STAFF_SESSION_SECRET: secret }),
}));

vi.mock('@/domains/tables/server/table.service', () => ({
  resolveTableByToken: mocks.resolveTableByToken,
}));

import {
  issueGuestTableAccess,
  resolveGuestTableAccess,
} from '@/domains/tables/server/guest-table-access.service';

const tableToken = 'abcdefghijklmnop_1234567890-ABCD';
const table = {
  tableId: 'table-1',
  label: '1',
  venueId: 'venue-1',
  venueSlug: 'restaurant',
  isActive: true,
};

describe('guest table access service', () => {
  beforeEach(() => {
    mocks.resolveTableByToken.mockResolvedValue(table);
    mocks.findLatestTerminalSession.mockResolvedValue(null);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-04T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('issues a signed grant after the latest closed visit', async () => {
    const closedAt = new Date('2026-09-04T10:00:01.000Z');
    mocks.findLatestTerminalSession.mockResolvedValue({ closedAt });

    const access = await issueGuestTableAccess(tableToken);
    expect(access?.table).toEqual(table);

    const payload = verifyGuestTableAccessToken(
      access?.cookieValue ?? '',
      secret,
      new Date(closedAt.getTime() + 1),
    );
    expect(payload?.issuedAt.getTime()).toBe(closedAt.getTime() + 1);
  });

  it('rejects a grant issued before a closed visit', async () => {
    const issuedAt = new Date('2026-09-04T09:00:00.000Z');
    const cookieValue = createGuestTableAccessToken(tableToken, issuedAt, secret);
    mocks.findLatestTerminalSession.mockResolvedValue({
      closedAt: new Date('2026-09-04T09:30:00.000Z'),
    });

    await expect(resolveGuestTableAccess(cookieValue)).resolves.toEqual({
      status: 'expired',
      table,
    });
  });

  it('accepts a fresh rescan made after the last closed visit', async () => {
    const issuedAt = new Date('2026-09-04T09:45:00.000Z');
    const cookieValue = createGuestTableAccessToken(tableToken, issuedAt, secret);
    mocks.findLatestTerminalSession.mockResolvedValue({
      closedAt: new Date('2026-09-04T09:30:00.000Z'),
    });

    await expect(resolveGuestTableAccess(cookieValue)).resolves.toEqual({
      status: 'valid',
      table,
      issuedAt,
    });
  });

  it('rejects unsigned legacy QR cookies before querying the database', async () => {
    await expect(resolveGuestTableAccess(tableToken)).resolves.toEqual({ status: 'invalid' });
    expect(mocks.resolveTableByToken).not.toHaveBeenCalled();
    expect(mocks.findLatestTerminalSession).not.toHaveBeenCalled();
  });
});
