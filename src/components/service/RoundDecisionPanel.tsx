'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { formatCents } from '@/lib/money';
import type { OrderRoundView } from '@/domains/orders/shared/types';
import {
  MAX_ORDER_ITEM_QUANTITY,
  MIN_ORDER_ITEM_QUANTITY,
} from '@/domains/orders/shared/round-quantity';

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
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(round.items.map((item) => [item.id, item.quantity])),
  );
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
        itemQuantities: round.items.map((item) => ({
          orderItemId: item.id,
          quantity: mode === 'rejectAll' ? item.quantity : (quantities[item.id] ?? item.quantity),
        })),
        note: note.trim() === '' ? undefined : note.trim(),
      });
      if (!result.ok) setError(t('decisionFailed'));
    });
  };

  return (
    <div className="mt-3 rounded-[var(--radius-card)] border border-[var(--color-ink-800)] p-4">
      <p className="mb-3 text-xs text-[var(--color-paper-faint)]">
        {t('quantityEditHint')}
      </p>
      <ul className="space-y-2">
        {round.items.map((item) => {
          const isAccepted = acceptedIds.includes(item.id);
          const quantity = quantities[item.id] ?? item.quantity;
          return (
            <li
              key={item.id}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2"
            >
              <input
                id={`accept-${item.id}`}
                type="checkbox"
                checked={isAccepted}
                onChange={(event) => {
                  const shouldAccept = event.target.checked;
                  setAcceptedIds((current) =>
                    shouldAccept
                      ? [...current, item.id]
                      : current.filter((id) => id !== item.id),
                  );
                  if (!shouldAccept) {
                    setQuantities((current) => ({ ...current, [item.id]: item.quantity }));
                  }
                }}
                className="h-4 w-4 accent-[var(--color-brass)]"
              />
              <label htmlFor={`accept-${item.id}`} className="min-w-0 text-sm">
                {item.name}
                {item.variantName ? ` · ${item.variantName}` : ''}
                {item.modifiers.length > 0 ? ` · ${item.modifiers.join(', ')}` : ''}
              </label>
              <span className="font-[family-name:var(--font-mono)] text-sm text-[var(--color-brass)]">
                {formatCents(item.unitPriceCents * quantity, locale, currency)}
              </span>
              <div
                className="col-start-2 flex items-center gap-2"
                role="group"
                aria-label={t('quantity')}
              >
                <button
                  type="button"
                  disabled={isPending || !isAccepted || quantity <= MIN_ORDER_ITEM_QUANTITY}
                  onClick={() =>
                    setQuantities((current) => ({ ...current, [item.id]: quantity - 1 }))
                  }
                  aria-label={t('decreaseQuantity', { item: item.name })}
                  className="grid h-8 w-8 place-items-center rounded-full border border-[var(--color-ink-700)] text-base disabled:opacity-35"
                >
                  −
                </button>
                <span
                  className="min-w-6 text-center font-[family-name:var(--font-mono)] text-sm"
                  aria-live="polite"
                >
                  {quantity}
                </span>
                <button
                  type="button"
                  disabled={isPending || !isAccepted || quantity >= MAX_ORDER_ITEM_QUANTITY}
                  onClick={() =>
                    setQuantities((current) => ({ ...current, [item.id]: quantity + 1 }))
                  }
                  aria-label={t('increaseQuantity', { item: item.name })}
                  className="grid h-8 w-8 place-items-center rounded-full border border-[var(--color-ink-700)] text-base disabled:opacity-35"
                >
                  +
                </button>
              </div>
            </li>
          );
        })}
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
