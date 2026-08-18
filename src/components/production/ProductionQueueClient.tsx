'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type {
  ProductionQueueDelta,
  ProductionQueueTicket,
  ProductionTicketStatus,
  TransitionTicketResult,
} from '@/domains/production/shared/types';
import { mergeProductionQueueDelta } from '@/domains/production/shared/queue';

type Props = {
  initial: ProductionQueueDelta;
  action: (payload: unknown) => Promise<TransitionTicketResult>;
};

export function ProductionQueueClient({ initial, action }: Props) {
  const t = useTranslations('production');
  const [tickets, setTickets] = useState(initial.tickets);
  const [connection, setConnection] = useState<'live' | 'reconnecting' | 'offline'>('live');
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyTicketId, setBusyTicketId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const cursorRef = useRef(initial.cursor);
  const requestRunningRef = useRef(false);

  const applyDelta = useCallback((delta: ProductionQueueDelta) => {
    cursorRef.current = delta.cursor;
    setTickets((current) => mergeProductionQueueDelta(current, delta));
  }, []);

  const poll = useCallback(async () => {
    if (requestRunningRef.current) return;
    if (!navigator.onLine) {
      setConnection('offline');
      return;
    }
    requestRunningRef.current = true;
    try {
      const params = new URLSearchParams({
        kind: initial.stationKind,
        cursor: cursorRef.current,
      });
      const response = await fetch(`/api/production/queue?${params}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error(`queue_http_${response.status}`);
      applyDelta((await response.json()) as ProductionQueueDelta);
      setConnection('live');
    } catch {
      setConnection(navigator.onLine ? 'reconnecting' : 'offline');
    } finally {
      requestRunningRef.current = false;
    }
  }, [applyDelta, initial.stationKind]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const schedule = () => {
      if (cancelled) return;
      timer = setTimeout(async () => {
        await poll();
        schedule();
      }, document.hidden ? 10_000 : 3_000);
    };
    const wake = () => void poll();
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    window.addEventListener('offline', wake);
    schedule();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
      window.removeEventListener('offline', wake);
    };
  }, [poll]);

  const move = (ticket: ProductionQueueTicket, to: ProductionTicketStatus) => {
    setActionError(null);
    setBusyTicketId(ticket.id);
    startTransition(async () => {
      const result = await action({
        ticketId: ticket.id,
        stationKind: initial.stationKind,
        to,
      });
      if (!result.ok) setActionError(t(`errors.${result.reason}`));
      await poll();
      setBusyTicketId(null);
    });
  };

  return (
    <div className="pt-5">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-ink-800)] pb-3">
        <p className="text-xs text-[var(--color-paper-faint)]" aria-live="polite">
          {connection === 'live'
            ? t('connectionLive')
            : connection === 'offline'
              ? t('connectionOffline')
              : t('connectionReconnecting')}
        </p>
        <span className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-brass)]">
          {t('ticketCount', { count: tickets.length })}
        </span>
      </div>

      {actionError && (
        <p className="mt-4 rounded-[var(--radius-card)] border border-[var(--color-clay)]/40 bg-[var(--color-clay)]/10 p-3 text-sm text-[var(--color-clay)]">
          {actionError}
        </p>
      )}

      {tickets.length === 0 ? (
        <p className="py-16 text-center text-sm text-[var(--color-paper-dim)]">{t('empty')}</p>
      ) : (
        <ol className="grid gap-4 pt-5 sm:grid-cols-2 xl:grid-cols-3">
          {tickets.map((ticket) => {
            const next = nextTransition(ticket.status);
            const busy = isPending && busyTicketId === ticket.id;
            return (
              <li
                key={ticket.id}
                className="rounded-[var(--radius-card)] border border-[var(--color-ink-700)] bg-[var(--color-ink-900)] p-4"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="eyebrow">{t('tableRound', { table: ticket.tableLabel, round: ticket.roundSequence })}</p>
                  <span className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-brass)]">
                    {t(`statuses.${ticket.status}`)}
                  </span>
                </div>
                <p className="mt-4 font-[family-name:var(--font-display)] text-xl leading-tight">
                  {ticket.quantity} × {ticket.itemName}
                </p>
                {ticket.variantName && (
                  <p className="mt-1 text-sm text-[var(--color-paper-dim)]">{ticket.variantName}</p>
                )}
                {ticket.modifiers.length > 0 && (
                  <p className="mt-2 text-xs text-[var(--color-paper-faint)]">
                    {ticket.modifiers.join(', ')}
                  </p>
                )}
                {ticket.note && (
                  <p className="mt-3 border-l-2 border-[var(--color-brass-dim)] pl-3 text-sm text-[var(--color-paper-dim)]">
                    {ticket.note}
                  </p>
                )}
                <p className="mt-4 text-xs text-[var(--color-paper-faint)]">{ticket.stationName}</p>

                {next ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => move(ticket, next)}
                    className="mt-4 min-h-11 w-full rounded-full border border-[var(--color-brass)] px-4 py-2 text-sm text-[var(--color-brass)] disabled:opacity-50"
                  >
                    {busy ? t('updating') : t(`actions.${next}`)}
                  </button>
                ) : (
                  <p className="mt-4 text-center text-xs text-[var(--color-sage)]">
                    {t('waitingForService')}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function nextTransition(
  status: ProductionTicketStatus,
): 'ACCEPTED' | 'IN_PROGRESS' | 'READY' | null {
  if (status === 'QUEUED') return 'ACCEPTED';
  if (status === 'ACCEPTED') return 'IN_PROGRESS';
  if (status === 'IN_PROGRESS') return 'READY';
  return null;
}
