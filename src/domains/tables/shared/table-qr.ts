const TABLE_QR_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

/**
 * Проверяет отсканированный QR до перехода браузера.
 * Разрешены только абсолютные URL доверенного origin и точный /t/<token>.
 */
export function parseTrustedTableQrUrl(
  rawValue: string,
  allowedOrigins: readonly string[],
): string | null {
  let scannedUrl: URL;

  try {
    scannedUrl = new URL(rawValue.trim());
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(scannedUrl.protocol)) return null;
  if (scannedUrl.username || scannedUrl.password) return null;
  if (scannedUrl.search || scannedUrl.hash) return null;

  const trustedOrigins = new Set(
    allowedOrigins.flatMap((origin) => {
      try {
        return [new URL(origin).origin];
      } catch {
        return [];
      }
    }),
  );

  if (!trustedOrigins.has(scannedUrl.origin)) return null;

  const match = scannedUrl.pathname.match(/^\/t\/([^/]+)$/);
  if (!match?.[1] || !TABLE_QR_TOKEN_PATTERN.test(match[1])) return null;

  return `${scannedUrl.origin}${scannedUrl.pathname}`;
}
