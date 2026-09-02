'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { formatCents } from '@/lib/money';
import type { BillLineView } from '@/domains/billing/shared/types';
import type { StartCashPaymentResult } from '@/domains/payments/shared/types';

export function StaffPaymentStartPanel(props: {
  sessionId: string;
  locale: string;
  currency: string;
  lines: BillLineView[];
  action: (payload: unknown) => Promise<StartCashPaymentResult>;
}) {
  const t = useTranslations('payment');
  const tService = useTranslations('service');
  const router = useRouter();
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(props.lines.map((line) => [line.orderItemId, line.remainingQuantity])),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedItems = props.lines
    .map((line) => ({ orderItemId: line.orderItemId, quantity: quantities[line.orderItemId] ?? 0 }))
    .filter((selection) => selection.quantity > 0);
  const selectedTotal = props.lines.reduce(
    (sum, line) => sum + line.unitPriceCents * (quantities[line.orderItemId] ?? 0),
    0,
  );

  const setQuantity = (orderItemId: string, quantity: number, maximum: number) => {
    setError(null);
    setQuantities((current) => ({
      ...current,
      [orderItemId]: Math.max(0, Math.min(maximum, quantity)),
    }));
  };

  const showFailure = (reason: Extract<StartCashPaymentResult, { ok: false }>['reason']) => {
    const key =
      reason === 'invalid_selection'
        ? 'selectAtLeastOne'
        : reason === 'attempt_in_progress'
          ? 'anotherPaymentPending'
          : reason === 'rate_limited'
            ? 'tooManyAttempts'
            : reason === 'nothing_to_pay'
              ? 'nothingToPay'
              : 'startFailed';
    setError(t(key));
  };

  return (
    <div className="mt-5 border-t border-[var(--color-ink-800)] pt-5">
      <h3 className="eyebrow">{tService('takePayment')}</h3>
      <p className="mt-2 text-xs text-[var(--color-paper-dim)]">
        {tService('takePaymentHint')}
      </p>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--color-paper-dim)]">{t('chooseItems')}</p>
        <button
          type="button"
          onClick={() => setQuantities(Object.fromEntries(
            props.lines.map((line) => [line.orderItemId, line.remainingQuantity]),
          ))}
          className="text-xs text-[var(--color-brass)] underline underline-offset-4"
        >
          {t('selectAll')}
        </button>
      </div>

      <ul className="mt-3 space-y-2">
        {props.lines.map((line) => (
          <li key={line.orderItemId}>
            <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-ink-800)] p-3">
              <input
                type="checkbox"
                aria-label={t('selectItem', { item: line.name })}
                checked={(quantities[line.orderItemId] ?? 0) > 0}
                onChange={(event) => {
                  setQuantity(
                    line.orderItemId,
                    event.target.checked ? line.remainingQuantity : 0,
                    line.remainingQuantity,
                  );
                }}
                className="size-4 accent-[var(--color-brass)]"
              />
              <span className="flex-1 text-sm text-[var(--color-paper-dim)]">
                {line.remainingQuantity} × {line.name}
              </span>
              <div className="flex items-center gap-2" aria-label={t('paymentQuantity', { item: line.name })}>
                <button
                  type="button"
                  aria-label={t('decreasePaymentQuantity', { item: line.name })}
                  disabled={(quantities[line.orderItemId] ?? 0) <= 0}
                  onClick={() => setQuantity(
                    line.orderItemId,
                    (quantities[line.orderItemId] ?? 0) - 1,
                    line.remainingQuantity,
                  )}
                  className="size-8 rounded-full border border-[var(--color-ink-700)] text-lg disabled:opacity-30"
                >
                  −
                </button>
                <span className="min-w-6 text-center font-[family-name:var(--font-mono)] text-sm">
                  {quantities[line.orderItemId] ?? 0}
                </span>
                <button
                  type="button"
                  aria-label={t('increasePaymentQuantity', { item: line.name })}
                  disabled={(quantities[line.orderItemId] ?? 0) >= line.remainingQuantity}
                  onClick={() => setQuantity(
                    line.orderItemId,
                    (quantities[line.orderItemId] ?? 0) + 1,
                    line.remainingQuantity,
                  )}
                  className="size-8 rounded-full border border-[var(--color-ink-700)] text-lg disabled:opacity-30"
                >
                  +
                </button>
              </div>
              <span className="font-[family-name:var(--font-mono)] text-sm">
                {formatCents(
                  line.unitPriceCents * (quantities[line.orderItemId] ?? 0),
                  props.locale,
                  props.currency,
                )}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {error && <p role="alert" className="mt-3 text-sm text-[var(--color-clay)]">{error}</p>}
      <p className="mt-4 text-sm">
        {t('selectedTotal')}: {formatCents(selectedTotal, props.locale, props.currency)}
      </p>
      <button
        type="button"
        disabled={pending || selectedTotal <= 0}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await props.action({
              sessionId: props.sessionId,
              selectedItems,
            });
            if (!result.ok) return showFailure(result.reason);
            router.refresh();
          });
        }}
        className="mt-4 w-full rounded-full bg-[var(--color-brass)] px-4 py-2.5 text-sm font-medium text-[var(--color-ink-950)] disabled:opacity-50"
      >
        {pending ? tService('startingCashPayment') : tService('startCashPayment')}
      </button>
    </div>
  );
}
