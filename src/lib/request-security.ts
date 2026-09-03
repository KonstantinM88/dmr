/** Защита cookie-authenticated mutation route от cross-site POST/DELETE. */
export function isSameOriginRequest(requestUrl: string, originHeader: string | null): boolean {
  if (!originHeader) return false;
  try {
    return new URL(requestUrl).origin === new URL(originHeader).origin;
  } catch {
    return false;
  }
}
