'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useCart } from '@/components/order/CartProvider';
import { formatCents } from '@/lib/money';
import type { SubmitOrderResult } from '@/domains/orders/shared/types';

type Props = {
  locale: string;
  currency: string;
  canOrder: boolean;
  blockedReason: 'payment_pending' | 'session_closed' | null;
  submitAction: (payload: unknown) => Promise<SubmitOrderResult>;
};

/**
 * Корзина и отправка заказа.
 *
 * `clientRequestId` создаётся один раз на попытку отправки и переиспользуется
 * при повторных нажатиях: сервер вернёт тот же раунд вместо дубликата
 * (docs/order-state-machines.md §6, шаги 5 и 13).
 */
export function CartSheet({ locale, currency, canOrder, blockedReason, submitAction }: Props) {
  const t = useTranslations('cart');
  const tStatus = useTranslations('orderStatus');
  const { lines, restored, setQuantity, removeLine, clear, totalCents, itemCount } = useCart();

  const [isOpen, setIsOpen] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (itemCount === 0 && !isOpen) return null;

  const handleSubmit = () => {
    const clientRequestId = requestId ?? crypto.randomUUID();
    setRequestId(clientRequestId);
    setFeedback(null);

    startTransition(async () => {
      const result = await submitAction({
        clientRequestId,
        locale,
        lines: lines.map((line) => ({
          menuItemId: line.menuItemId,
          menuVariantId: line.menuVariantId,
          modifierOptionIds: line.modifierOptionIds,
          quantity: line.quantity,
          note: line.note,
          expectedUnitPriceCents: line.unitPriceCents,
        })),
      });

      if (result.ok) {
        clear();
        setRequestId(null);
        setIsOpen(false);
        setFeedback(null);
        return;
      }

      // Ключ идемпотентности сбрасывается: следующая отправка — новая попытка.
      setRequestId(null);

      switch (result.reason) {
        case 'price_changed':
          setFeedback(t('priceChanged'));
          break;
        case 'item_unavailable':
          setFeedback(t('itemUnavailable'));
          break;
        case 'payment_pending':
          setFeedback(tStatus('blockedByPayment'));
          break;
        case 'session_closed':
          setFeedback(tStatus('sessionClosed'));
          break;
        case 'rate_limited':
          setFeedback(t('tooManyRequests'));
          break;
        default:
          setFeedback(t('submitFailed'));
      }
    });
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--color-ink-800)] bg-[var(--color-ink-900)]/95 backdrop-blur">
      <div className="mx-auto w-full max-w-4xl px-5 py-3">
        {isOpen && (
          <div className="max-h-[50dvh] overflow-y-auto pb-3">
            <h2 className="eyebrow pb-2">{t('title')}</h2>

            {restored && <p className="pb-2 text-xs text-[var(--color-sage)]">{t('restored')}</p>}

            <ul className="divide-y divide-[var(--color-ink-800)]">
              {lines.map((line) => (
                <li key={line.lineId} className="flex items-baseline gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{line.name}</p>
                    {line.variantName && (
                      <p className="text-xs text-[var(--color-paper-faint)]">{line.variantName}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQuantity(line.lineId, line.quantity - 1)}
                      aria-label={t('decrease')}
                      className="h-7 w-7 rounded-full border border-[var(--color-ink-700)]"
                    >
                      −
                    </button>
                    <span className="w-5 text-center font-[family-name:var(--font-mono)] text-sm">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity(line.lineId, line.quantity + 1)}
                      aria-label={t('increase')}
                      className="h-7 w-7 rounded-full border border-[var(--color-ink-700)]"
                    >
                      +
                    </button>
                  </div>

                  <span className="w-20 text-right font-[family-name:var(--font-mono)] text-sm text-[var(--color-brass)]">
                    {formatCents(line.unitPriceCents * line.quantity, locale, currency)}
                  </span>

                  <button
                    type="button"
                    onClick={() => removeLine(line.lineId)}
                    aria-label={t('remove')}
                    className="text-xs text-[var(--color-paper-faint)]"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {feedback && (
          <p role="alert" className="pb-2 text-sm text-[var(--color-clay)]">
            {feedback}
          </p>
        )}

        {!canOrder && blockedReason && (
          <p className="pb-2 text-sm text-[var(--color-paper-dim)]">
            {blockedReason === 'payment_pending'
              ? tStatus('blockedByPayment')
              : tStatus('sessionClosed')}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsOpen((value) => !value)}
            aria-expanded={isOpen}
            className="flex-1 text-left text-sm text-[var(--color-paper-dim)]"
          >
            {t('lineCount', { count: itemCount })} ·{' '}
            <span className="font-[family-name:var(--font-mono)] text-[var(--color-brass)]">
              {formatCents(totalCents, locale, currency)}
            </span>
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || itemCount === 0 || !canOrder}
            className="rounded-full bg-[var(--color-brass)] px-5 py-2.5 text-sm font-medium text-[var(--color-ink-950)] disabled:opacity-50"
          >
            {isPending ? tStatus('submissionPending') : t('submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
