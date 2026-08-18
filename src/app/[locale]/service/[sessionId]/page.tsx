import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requirePermission } from '@/domains/staff/server/rbac';
import { getSessionDetail } from '@/domains/orders/server/order.queries';
import { getManualOrderOptions } from '@/domains/menu/server/menu.queries';
import { canSetApprovalMode } from '@/domains/sessions/server/session-state-machine';
import { formatCents } from '@/lib/money';
import { DEFAULT_VENUE_SLUG } from '@/lib/venue';
import { RoundDecisionPanel } from '@/components/service/RoundDecisionPanel';
import { ApprovalModeToggle } from '@/components/service/ApprovalModeToggle';
import { ManualOrderForm } from '@/components/service/ManualOrderForm';
import { ServedButton } from '@/components/service/ServedButton';
import {
  createManualOrderAction,
  decideRoundAction,
  markServedAction,
  setApprovalModeAction,
} from '../actions';

export const dynamic = 'force-dynamic';

/** Экран одного стола: раунды, решения, режим дозаказов, ручной заказ. */
export default async function SessionDetailPage(props: {
  params: Promise<{ locale: string; sessionId: string }>;
}) {
  const { locale, sessionId } = await props.params;
  setRequestLocale(locale);

  const principal = await requirePermission('VIEW_ASSIGNED_TABLES');
  const t = await getTranslations('service');
  const tStatus = await getTranslations('orderStatus');

  const session = await getSessionDetail(sessionId);
  if (!session) notFound();

  const currency = 'EUR';

  const manualOrderOptions = principal.permissions.includes('CREATE_MANUAL_ORDER')
    ? await getManualOrderOptions(DEFAULT_VENUE_SLUG, locale)
    : [];

  const roundStatusKey: Record<string, string> = {
    SUBMITTED: 'awaitingWaiter',
    ACCEPTED: 'accepted',
    PARTIALLY_ACCEPTED: 'partiallyAccepted',
    IN_PROGRESS: 'preparing',
    READY: 'ready',
    SERVED: 'served',
    REJECTED: 'rejected',
    CANCELLED: 'cancelled',
  };

  return (
    <div className="pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-[family-name:var(--font-display)] text-2xl">
          {t('table', { label: session.tableLabel })}
        </h2>
        <span className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-paper-faint)]">
          {t('sessionStatus')}: {session.status}
        </span>
      </div>

      {principal.permissions.includes('MANAGE_REORDER_APPROVAL') && (
        <div className="mt-4">
          <ApprovalModeToggle
            sessionId={session.id}
            mode={session.reorderApprovalMode}
            disabled={!canSetApprovalMode(session.status, 'AUTO_ACCEPT') &&
              session.reorderApprovalMode === 'REQUIRE_WAITER'}
            action={setApprovalModeAction}
          />
        </div>
      )}

      <h3 className="eyebrow mt-8 border-b border-[var(--color-brass-dim)] pb-2">
        {t('rounds')}
      </h3>

      {session.rounds.length === 0 ? (
        <p className="py-6 text-sm text-[var(--color-paper-dim)]">{t('noRounds')}</p>
      ) : (
        <ol className="pt-2">
          {session.rounds.map((round) => (
            <li key={round.id} className="border-b border-[var(--color-ink-800)] py-4 last:border-b-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm">
                  {tStatus('roundLabel', { sequence: round.sequence })}
                  {round.isFirstRound && (
                    <span className="pl-2 text-xs text-[var(--color-paper-faint)]">
                      {t('firstRound')}
                    </span>
                  )}
                </span>
                <span className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-brass)]">
                  {tStatus(roundStatusKey[round.status] ?? 'awaitingWaiter')}
                </span>
              </div>

              {round.status === 'SUBMITTED' &&
              principal.permissions.includes('APPROVE_ORDER_ROUND') ? (
                <RoundDecisionPanel
                  round={round}
                  locale={locale}
                  currency={currency}
                  action={decideRoundAction}
                />
              ) : (
                <ul className="pt-2">
                  {round.items.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-baseline gap-3 py-1">
                      <span
                        className={
                          item.status === 'REJECTED'
                            ? 'flex-1 text-sm text-[var(--color-paper-faint)] line-through'
                            : 'flex-1 text-sm text-[var(--color-paper-dim)]'
                        }
                      >
                        {item.quantity} × {item.name}
                        {item.variantName ? ` · ${item.variantName}` : ''}
                      </span>

                      <span className="text-xs text-[var(--color-paper-faint)]">
                        {tStatus(roundStatusKey[item.status] ?? 'accepted')}
                      </span>

                      {principal.permissions.includes('MARK_ITEM_SERVED') &&
                        item.status === 'READY' && (
                          <ServedButton orderItemId={item.id} action={markServedAction} />
                        )}

                      <span className="font-[family-name:var(--font-mono)] text-sm text-[var(--color-brass)]">
                        {formatCents(item.lineTotalCents, locale, currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}

      {principal.permissions.includes('CREATE_MANUAL_ORDER') && (
        <ManualOrderForm
          sessionId={session.id}
          locale={locale}
          currency={currency}
          options={manualOrderOptions}
          action={createManualOrderAction}
        />
      )}
    </div>
  );
}
