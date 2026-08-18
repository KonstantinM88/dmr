'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { formatCents } from '@/lib/money';
import type { SubmitOrderResult } from '@/domains/orders/shared/types';

export type ManualOrderOption = {
  menuItemId: string;
  name: string;
  priceCents: number;
};

type Props = {
  sessionId: string;
  locale: string;
  currency: string;
  options: ManualOrderOption[];
  action: (payload: unknown) => Promise<SubmitOrderResult>;
};

/**
 * Ручной заказ официанта (permission CREATE_MANUAL_ORDER).
 * Такой раунд принимается сразу: решение сотрудника уже принято.
 */
export function ManualOrderForm({ sessionId, locale, currency, options, action }: Props) {
  const t = useTranslations('service');
  const [selected, setSelected] = useState<Array<{ menuItemId: string; quantity: number }>>([]);
  const [pick, setPick] = useState(options[0]?.menuItemId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (options.length === 0) return null;

  const add = () => {
    if (pick === '') return;
    setSelected((current) => {
      const existing = current.find((line) => line.menuItemId === pick);
      if (existing) {
        return current.map((line) =>
          line.menuItemId === pick ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [...current, { menuItemId: pick, quantity: 1 }];
    });
  };

  const total = selected.reduce((sum, line) => {
    const option = options.find((candidate) => candidate.menuItemId === line.menuItemId);
    return sum + (option ? option.priceCents * line.quantity : 0);
  }, 0);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await action({
        sessionId,
        clientRequestId: crypto.randomUUID(),
        locale,
        lines: selected.map((line) => ({ menuItemId: line.menuItemId, quantity: line.quantity })),
      });
      if (result.ok) setSelected([]);
      else setError(t('manualOrderFailed'));
    });
  };

  return (
    <div className="mt-6 rounded-[var(--radius-card)] border border-[var(--color-ink-800)] p-4">
      <h3 className="eyebrow">{t('manualOrder')}</h3>

      <div className="mt-3 flex flex-wrap gap-2">
        <label htmlFor="manual-pick" className="sr-only">
          {t('manualOrderPick')}
        </label>
        <select
          id="manual-pick"
          value={pick}
          onChange={(event) => setPick(event.target.value)}
          className="min-w-0 flex-1 rounded-[var(--radius-card)] border border-[var(--color-ink-700)] bg-[var(--color-ink-900)] px-3 py-2 text-sm"
        >
          {options.map((option) => (
            <option key={option.menuItemId} value={option.menuItemId}>
              {option.name} · {formatCents(option.priceCents, locale, currency)}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={add}
          className="rounded-full border border-[var(--color-ink-700)] px-4 py-2 text-sm text-[var(--color-paper-dim)]"
        >
          {t('manualOrderAdd')}
        </button>
      </div>

      {selected.length > 0 && (
        <ul className="mt-3 space-y-1">
          {selected.map((line) => {
            const option = options.find((candidate) => candidate.menuItemId === line.menuItemId);
            return (
              <li key={line.menuItemId} className="price-rail text-sm">
                <span>
                  {line.quantity} × {option?.name ?? line.menuItemId}
                </span>
                <span className="price-rail__leader" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() =>
                    setSelected((current) =>
                      current.filter((entry) => entry.menuItemId !== line.menuItemId),
                    )
                  }
                  className="text-xs text-[var(--color-paper-faint)]"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-[var(--color-clay)]">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={isPending || selected.length === 0}
        onClick={submit}
        className="mt-4 rounded-full bg-[var(--color-brass)] px-4 py-2 text-sm font-medium text-[var(--color-ink-950)] disabled:opacity-50"
      >
        {t('manualOrderSubmit')} · {formatCents(total, locale, currency)}
      </button>
    </div>
  );
}
