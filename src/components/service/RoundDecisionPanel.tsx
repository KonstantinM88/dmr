'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { formatCents } from '@/lib/money';
import type { OrderRoundView } from '@/domains/orders/shared/types';

type DecisionResult = { ok: true; status: string } | { ok: false; reason: string };

type Props = {
  round: OrderRoundView;
  locale: string;
  currency: string;
  action: (payload: unknown) => Promise<DecisionResult>;
};

/**
 * Решение по раунду: приём целиком, частичный приём или отказ.
 * По умолчанию отмечены все позиции — снятие галочки отклоняет позицию.
 */
export function RoundDecisionPanel({ round, locale, currency, action }: Props) {
  const t = useTranslations('service');
  const [acceptedIds, setAcceptedIds] = useState<string[]>(round.items.map((item) => item.id));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const rejectedIds = round.items
    .map((item) => item.id)
    .filter((id) => !acceptedIds.includes(id));

  const submit = (mode: 'decide' | 'rejectAll') => {
    setError(null);
    const accepted = mode === 'rejectAll' ? [] : acceptedIds;
    const rejected =
      mode === 'rejectAll' ? round.items.map((item) => item.id) : rejectedIds;

    startTransition(async () => {
      const result = await action({
        roundId: round.id,
        acceptedItemIds: accepted,
        rejectedItemIds: rejected,
        note: note.trim() === '' ? undefined : note.trim(),
      });
      if (!result.ok) setError(t('decisionFailed'));
    });
  };

  return (
    <div className="mt-3 rounded-[var(--radius-card)] border border-[var(--color-ink-800)] p-4">
      <ul className="space-y-2">
        {round.items.map((item) => (
          <li key={item.id} className="flex items-baseline gap-3">
            <input
              id={`accept-${item.id}`}
              type="checkbox"
              checked={acceptedIds.includes(item.id)}
              onChange={(event) =>
                setAcceptedIds((current) =>
                  event.target.checked
                    ? [...current, item.id]
                    : current.filter((id) => id !== item.id),
                )
              }
              className="h-4 w-4 accent-[var(--color-brass)]"
            />
            <label htmlFor={`accept-${item.id}`} className="flex-1 text-sm">
              {item.quantity} × {item.name}
              {item.variantName ? ` · ${item.variantName}` : ''}
              {item.modifiers.length > 0 ? ` · ${item.modifiers.join(', ')}` : ''}
            </label>
            <span className="font-[family-name:var(--font-mono)] text-sm text-[var(--color-brass)]">
              {formatCents(item.lineTotalCents, locale, currency)}
            </span>
          </li>
        ))}
      </ul>

      <label htmlFor={`note-${round.id}`} className="eyebrow mt-4 block">
        {t('rejectionNote')}
      </label>
      <input
        id={`note-${round.id}`}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={280}
        className="mt-1.5 w-full rounded-[var(--radius-card)] border border-[var(--color-ink-700)] bg-[var(--color-ink-900)] px-3 py-2 text-sm"
      />

      {error && (
        <p role="alert" className="mt-3 text-sm text-[var(--color-clay)]">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isPending || acceptedIds.length === 0}
          onClick={() => submit('decide')}
          className="rounded-full bg-[var(--color-brass)] px-4 py-2 text-sm font-medium text-[var(--color-ink-950)] disabled:opacity-50"
        >
          {rejectedIds.length === 0 ? t('acceptAll') : t('acceptSelected')}
        </button>

        <button
          type="button"
          disabled={isPending}
          onClick={() => submit('rejectAll')}
          className="rounded-full border border-[var(--color-clay)] px-4 py-2 text-sm text-[var(--color-clay)] disabled:opacity-50"
        >
          {t('rejectAll')}
        </button>
      </div>
    </div>
  );
}
