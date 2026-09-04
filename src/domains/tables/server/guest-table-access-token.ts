import { createHmac, timingSafeEqual } from 'node:crypto';

const ACCESS_TOKEN_VERSION = 'v1';
const TABLE_QR_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const SIGNATURE_CONTEXT = 'dmr-guest-table-access-v1';
const CLOCK_SKEW_MS = 60_000;

export const GUEST_TABLE_ACCESS_MAX_AGE_SECONDS = 8 * 60 * 60;

export type GuestTableAccessPayload = {
  tableToken: string;
  issuedAt: Date;
};

/** Новый QR-вход всегда логически следует за уже закрытым посещением. */
export function nextGuestTableAccessIssuedAt(
  now: Date,
  latestTerminalAt: Date | null,
): Date {
  return new Date(Math.max(now.getTime(), (latestTerminalAt?.getTime() ?? 0) + 1));
}

/** Доступ, выданный до/в момент закрытия посещения, больше не авторизует гостя. */
export function isGuestTableAccessInvalidated(
  issuedAt: Date,
  latestTerminalAt: Date | null,
): boolean {
  return latestTerminalAt !== null && latestTerminalAt.getTime() >= issuedAt.getTime();
}

function signatureInput(issuedAtMs: number, tableToken: string): string {
  return `${SIGNATURE_CONTEXT}:${ACCESS_TOKEN_VERSION}:${issuedAtMs}:${tableToken}`;
}

function sign(issuedAtMs: number, tableToken: string, secret: string): Buffer {
  return createHmac('sha256', secret)
    .update(signatureInput(issuedAtMs, tableToken))
    .digest();
}

/**
 * Подписанный пропуск конкретного QR-входа. В отличие от постоянного QR-token
 * этот cookie можно инвалидировать временем закрытия DiningSession.
 */
export function createGuestTableAccessToken(
  tableToken: string,
  issuedAt: Date,
  secret: string,
): string {
  if (!TABLE_QR_TOKEN_PATTERN.test(tableToken)) {
    throw new Error('Некорректный QR-token стола.');
  }

  const issuedAtMs = issuedAt.getTime();
  if (!Number.isSafeInteger(issuedAtMs) || issuedAtMs <= 0) {
    throw new Error('Некорректное время выдачи гостевого доступа.');
  }

  const signature = sign(issuedAtMs, tableToken, secret).toString('base64url');
  return `${ACCESS_TOKEN_VERSION}.${issuedAtMs}.${tableToken}.${signature}`;
}

/** Проверяет подпись, формат и максимальный срок жизни без обращения к БД. */
export function verifyGuestTableAccessToken(
  value: string,
  secret: string,
  now: Date = new Date(),
): GuestTableAccessPayload | null {
  const parts = value.split('.');
  if (parts.length !== 4 || parts[0] !== ACCESS_TOKEN_VERSION) return null;

  const issuedAtRaw = parts[1];
  const tableToken = parts[2];
  const signatureRaw = parts[3];
  if (!issuedAtRaw || !tableToken || !signatureRaw) return null;
  if (!/^\d{13}$/.test(issuedAtRaw) || !TABLE_QR_TOKEN_PATTERN.test(tableToken)) return null;

  const issuedAtMs = Number(issuedAtRaw);
  const nowMs = now.getTime();
  if (!Number.isSafeInteger(issuedAtMs) || !Number.isFinite(nowMs)) return null;
  if (issuedAtMs > nowMs + CLOCK_SKEW_MS) return null;
  if (nowMs - issuedAtMs > GUEST_TABLE_ACCESS_MAX_AGE_SECONDS * 1000) return null;

  let receivedSignature: Buffer;
  try {
    receivedSignature = Buffer.from(signatureRaw, 'base64url');
  } catch {
    return null;
  }

  const expectedSignature = sign(issuedAtMs, tableToken, secret);
  if (
    receivedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(receivedSignature, expectedSignature)
  ) {
    return null;
  }

  return { tableToken, issuedAt: new Date(issuedAtMs) };
}
