import { getTranslations } from 'next-intl/server';
import { formatCents } from '@/lib/money';
import type { OrderRoundView } from '@/domains/orders/shared/types';
import type { ReorderApprovalMode } from '@/domains/sessions/shared/types';

type Props = {
  rounds: OrderRoundView[];
  locale: string;
  currency: string;
  approvalMode: ReorderApprovalMode;
};

/**
 * Гостевые статусы заказа (docs/product-spec.md §2.6–2.7).
 * Server Component: статусы приходят из БД, клиент их не вычисляет.
 */
export async function OrderStatusPanel({ rounds, locale, currency, approvalMode }: Props) {
  const t = await getTranslations('orderStatus');
  const tMenu = await getTranslations('menu');

  if (rounds.length === 0) return null;

  const roundStatusKey: Record<OrderRoundView['status'], string> = {
    SUBMITTED: 'awaitingWaiter',
    ACCEPTED: 'accepted',
    PARTIALLY_ACCEPTED: 'partiallyAccepted',
    IN_PROGRESS: 'preparing',
    READY: 'ready',
    SERVED: 'served',
    REJECTED: 'rejected',
    CANCELLED: 'cancelled',
  };

  const itemStatusKey: Record<OrderRoundView['items'][number]['status'], string> = {
    SUBMITTED: 'awaitingWaiter',
    ACCEPTED: 'accepted',
    IN_PREPARATION: 'preparing',
    READY: 'ready',
    SERVED: 'served',
    REJECTED: 'rejected',
    CANCELLED: 'cancelled',
  };
  const activeItems = rounds.flatMap((round) => round.items).filter(
    (item) => !['REJECTED', 'CANCELLED', 'SERVED'].includes(item.status),
  );
  const readyCount = activeItems.filter((item) => item.status === 'READY').length;
  const preparingCount = activeItems.filter((item) => item.status === 'IN_PREPARATION').length;
  const acceptedCount = activeItems.filter((item) => item.status === 'ACCEPTED').length;
  const allAcceptedItemsServed = rounds.some((round) =>
    round.items.some((item) => item.status === 'SERVED'),
  ) && activeItems.length === 0;

  return (
    <section className="pt-8" aria-labelledby="order-status-heading">
      <h2 id="order-status-heading" className="eyebrow border-b border-[var(--color-brass-dim)] pb-2">
        {t('sectionTitle')}
      </h2>

      {readyCount > 0 ? (
        <div role="status" aria-live="polite" className="mt-4 rounded-[var(--radius-card)] border border-[var(--color-sage)]/50 bg-[var(--color-sage)]/5 p-4 text-sm text-[var(--color-sage)]">
          {t('guestReadySignal', { count: readyCount })}
        </div>
      ) : preparingCount > 0 ? (
        <div role="status" className="mt-4 rounded-[var(--radius-card)] border border-[var(--color-brass-dim)] bg-[var(--color-brass)]/5 p-4 text-sm text-[var(--color-brass)]">
          {t('guestPreparingSignal', { count: preparingCount })}
        </div>
      ) : acceptedCount > 0 ? (
        <div role="status" className="mt-4 rounded-[var(--radius-card)] border border-[var(--color-ink-700)] p-4 text-sm text-[var(--color-paper-dim)]">
          {t('guestAcceptedSignal', { count: acceptedCount })}
        </div>
      ) : allAcceptedItemsServed ? (
        <div role="status" aria-live="polite" className="mt-4 rounded-[var(--radius-card)] border border-[var(--color-sage)]/50 bg-[var(--color-sage)]/5 p-4 text-sm text-[var(--color-sage)]">
          {t('guestServedSignal')}
        </div>
      ) : null}

      <p className="pt-3 text-xs text-[var(--color-paper-faint)]">
        {approvalMode === 'AUTO_ACCEPT' ? t('reorderAutoAccept') : t('reorderNeedsWaiter')}
      </p>

      <ol className="pt-2">
        {rounds.map((round) => (
          <li key={round.id} className="border-b border-[var(--color-ink-800)] py-4 last:border-b-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm">
                {t('roundLabel', { sequence: round.sequence })}
                {round.createdByStaff && (
                  <span className="pl-2 text-xs text-[var(--color-paper-faint)]">
                    {t('createdByStaff')}
                  </span>
                )}
              </span>
              <span className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-brass)]">
                {t(roundStatusKey[round.status])}
              </span>
            </div>

            <ul className="pt-2">
              {round.items.map((item) => (
                <li key={item.id} className="price-rail py-1">
                  <span
                    className={
                      item.status === 'REJECTED' || item.status === 'CANCELLED'
                        ? 'text-sm text-[var(--color-paper-faint)] line-through'
                        : 'text-sm text-[var(--color-paper-dim)]'
                    }
                  >
                    {item.quantity} × {item.name}
                    {item.variantName ? ` · ${item.variantName}` : ''}
                    {item.modifiers.length > 0 ? ` · ${item.modifiers.join(', ')}` : ''}
                  </span>
                  <span className="price-rail__leader" aria-hidden="true" />
                  <span className="text-xs text-[var(--color-paper-faint)]">
                    {t(itemStatusKey[item.status])}
                  </span>
                  <span className="price-rail__value">
                    {formatCents(item.lineTotalCents, locale, currency)}
                  </span>
                </li>
              ))}
            </ul>

            <p className="pt-2 text-right font-[family-name:var(--font-mono)] text-xs text-[var(--color-paper-dim)]">
              {tMenu('priceLabel')}: {formatCents(round.totalGrossCents, locale, currency)}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
