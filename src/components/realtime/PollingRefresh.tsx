'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  endpoint: '/api/live/guest' | '/api/live/service';
  visibleIntervalMs: number;
  hiddenIntervalMs?: number;
};

type FeedResponse = { changed: boolean; cursor: string };

/** Polling fallback с cursor, reconnect и снижением частоты в hidden tab. */
export function PollingRefresh({ endpoint, visibleIntervalMs, hiddenIntervalMs = 15_000 }: Props) {
  const router = useRouter();
  const cursorRef = useRef<string | null>(null);
  const requestRunningRef = useRef(false);
  const [connection, setConnection] = useState<'live' | 'offline' | 'reconnecting'>('live');

  const poll = useCallback(async () => {
    if (requestRunningRef.current) return;
    if (!navigator.onLine) {
      setConnection('offline');
      return;
    }
    requestRunningRef.current = true;
    try {
      const suffix = cursorRef.current
        ? `?${new URLSearchParams({ cursor: cursorRef.current })}`
        : '';
      const response = await fetch(`${endpoint}${suffix}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error(`feed_http_${response.status}`);
      const feed = (await response.json()) as FeedResponse;
      cursorRef.current = feed.cursor;
      setConnection('live');
      if (feed.changed) router.refresh();
    } catch {
      setConnection(navigator.onLine ? 'reconnecting' : 'offline');
    } finally {
      requestRunningRef.current = false;
    }
  }, [endpoint, router]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const schedule = () => {
      if (cancelled) return;
      timer = setTimeout(async () => {
        await poll();
        schedule();
      }, document.hidden ? hiddenIntervalMs : visibleIntervalMs);
    };
    const wake = () => void poll();
    schedule();
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    window.addEventListener('offline', wake);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
      window.removeEventListener('offline', wake);
    };
  }, [hiddenIntervalMs, poll, visibleIntervalMs]);

  if (connection === 'live') return null;
  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[var(--color-clay)]/50 bg-[var(--color-ink-950)] px-4 py-2 text-xs text-[var(--color-clay)] shadow-lg"
    >
      {connection === 'offline' ? 'Keine Verbindung' : 'Verbindung wird wiederhergestellt …'}
    </div>
  );
}
