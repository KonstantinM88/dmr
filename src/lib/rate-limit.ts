import 'server-only';

/**
 * In-memory fixed-window rate limiter.
 *
 * Осознанное ограничение Этапа 1: счётчики живут в памяти одного процесса
 * (Hostinger Node.js Web App — один процесс, Redis недоступен, см.
 * docs/hostinger-deployment.md §2). При переходе на несколько инстансов
 * реализацию нужно заменить на общее хранилище — интерфейс сохраняется.
 */
export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  bucket.count += 1;
  const allowed = bucket.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

/** Только для тестов. */
export function resetRateLimits(): void {
  buckets.clear();
  lastSweep = 0;
}
