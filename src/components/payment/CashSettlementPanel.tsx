'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { formatCents } from '@/lib/money';
import type { ConfirmCashPaymentResult } from '@/domains/payments/shared/types';
import {
  getCashTenderSuggestions,
  parseEuroCents,
} from '@/domains/payments/shared/cash-entry';

export function CashSettlementPanel(props: {
  attemptId: string;
  amountCents: number;
  locale: string;
  currency: string;
  selectedLines: Array<{ id: string; label: string; amountCents: number }>;
  confirmAction: (payload: unknown) => Promise<ConfirmCashPaymentResult>;
  cancelAction: (attemptId: string) => Promise<{ ok: true }>;
}) {
  const t = useTranslations('payment');
  const [received, setReceived] = useState((props.amountCents / 100).toFixed(2).replace('.', ','));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const receivedCents = parseEuroCents(received);
  const changeCents = receivedCents !== null && receivedCents >= props.amountCents
    ? receivedCents - props.amountCents
    : null;
  const suggestions = getCashTenderSuggestions(props.amountCents);

  return (
    <section className="mt-6 rounded-[var(--radius-card)] border border-[var(--color-brass-dim)] p-4">
      <h3 className="eyebrow">{t('cashRequestTitle')}</h3>
      <ul className="mt-3 space-y-1 text-sm text-[var(--color-paper-dim)]">
        {props.selectedLines.map((line) => <li key={line.id} className="flex justify-between gap-3"><span>{line.label}</span><span>{formatCents(line.amountCents, props.locale, props.currency)}</span></li>)}
      </ul>
      <p className="mt-3 font-[family-name:var(--font-mono)] text-[var(--color-brass)]">{t('due')}: {formatCents(props.amountCents, props.locale, props.currency)}</p>
      <label className="mt-4 block text-xs text-[var(--color-paper-dim)]">
        {t('received')}
        <input value={received} onChange={(event) => { setReceived(event.target.value); setError(null); }} inputMode="decimal" className="mt-1 w-full rounded-xl border border-[var(--color-ink-700)] bg-[var(--color-ink-900)] px-3 py-2 text-base text-[var(--color-paper)]" />
      </label>
      <div className="mt-2 flex flex-wrap gap-2" aria-label={t('cashSuggestions')}>
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            disabled={pending}
            onClick={() => {
              setReceived((suggestion / 100).toFixed(2).replace('.', ','));
              setError(null);
            }}
            className="rounded-full border border-[var(--color-ink-700)] px-3 py-1 text-xs text-[var(--color-paper-dim)] disabled:opacity-50"
          >
            {suggestion === props.amountCents ? t('cashExact') : formatCents(suggestion, props.locale, props.currency)}
          </button>
        ))}
      </div>
      <div className="mt-4 price-rail" aria-live="polite">
        <span className="text-sm">{t('change')}</span>
        <span className="price-rail__leader" aria-hidden="true" />
        <span className="price-rail__value">
          {changeCents === null ? '—' : formatCents(changeCents, props.locale, props.currency)}
        </span>
      </div>
      {error && <p className="mt-2 text-xs text-[var(--color-clay)]">{error}</p>}
      <button type="button" disabled={pending} onClick={() => startTransition(async () => {
        if (receivedCents === null || receivedCents < props.amountCents) return setError(t('invalidReceived'));
        const result = await props.confirmAction({ attemptId: props.attemptId, receivedCents });
        if (!result.ok) setError(t('cashConfirmFailed'));
      })} className="mt-4 w-full rounded-full bg-[var(--color-brass)] px-4 py-2.5 text-sm text-[var(--color-ink-950)] disabled:opacity-50">
        {pending ? t('processing') : t('confirmCash')}
      </button>
      <button type="button" disabled={pending} onClick={() => startTransition(async () => { await props.cancelAction(props.attemptId); })} className="mt-2 w-full rounded-full border border-[var(--color-ink-700)] px-4 py-2 text-xs disabled:opacity-50">
        {t('cancelRequest')}
      </button>
    </section>
  );
}
