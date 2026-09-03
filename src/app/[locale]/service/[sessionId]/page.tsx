import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
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
import { ServiceProductionProgress } from '@/components/service/ServiceProductionProgress';
import { RequestPaymentButton } from '@/components/payment/RequestPaymentButton';
import { CashSettlementPanel } from '@/components/payment/CashSettlementPanel';
import { StaffPaymentStartPanel } from '@/components/payment/StaffPaymentStartPanel';
import { CloseSessionButton } from '@/components/service/CloseSessionButton';
import { WaiterCallStaffActions } from '@/components/service/WaiterCallStaffActions';
import { WaitingDuration } from '@/components/service/WaitingDuration';
import { getActiveWaiterCall } from '@/domains/service-requests/server/waiter-call.service';
import { getBillView } from '@/domains/billing/server/bill.service';
import { getPrintableBillDocument } from '@/domains/payments/server/printable-document.service';
import type { ServiceProductionItem } from '@/domains/sessions/shared/types';
import { getReadyHandoffSlaSettings } from '@/domains/production/server/production-sla.service';
import {
  createManualOrderAction,
  acknowledgeWaiterCallAction,
  cancelCashPaymentAction,
  closeSessionAction,
  confirmCashPaymentAction,
  requestPaymentAction,
  resolveWaiterCallAction,
  decideRoundAction,
  markServedAction,
  setApprovalModeAction,
  startStaffCashPaymentAction,
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
  const tSessionStatus = await getTranslations('sessionStatuses');

  const session = await getSessionDetail(sessionId);
  if (!session) notFound();

  // Счёт пересчитывается на сервере при каждом открытии экрана.
  const canRequestPayment = principal.permissions.includes('REQUEST_PAYMENT');
  const canRegisterCash = principal.permissions.includes('REGISTER_CASH_PAYMENT');
  const bill = canRequestPayment || canRegisterCash
    ? await getBillView(session.id)
    : null;
  const printableBill = bill
    ? await getPrintableBillDocument(session.id, principal.venueId)
    : null;
  const waiterCall = await getActiveWaiterCall(session.id);
  const readyHandoffSla = await getReadyHandoffSlaSettings(principal.venueId);

  const currency = 'EUR';
  const productionItems = session.rounds.flatMap((round) =>
    round.items.flatMap((item): ServiceProductionItem[] => {
      if (
        !item.productionStatus ||
        !item.productionStatusSince ||
        !item.productionQueuedAt ||
        !item.stationKind ||
        item.productionStatus === 'HANDED_OFF' ||
        item.productionStatus === 'CANCELLED'
      ) {
        return [];
      }
      return [{
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        ticketStatus: item.productionStatus,
        stationKind: item.stationKind,
        statusSince: item.productionStatusSince,
        queuedAt: item.productionQueuedAt,
        recommendedPreparationMinutes: item.recommendedPreparationMinutes ?? null,
        criticalPreparationMinutes: item.criticalPreparationMinutes ?? null,
      }];
    }),
  );

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
      <nav className="mb-5">
        <Link
          href="/service"
          className="inline-flex rounded-full border border-[var(--color-brass-dim)] px-4 py-2 text-sm text-[var(--color-brass)]"
        >
          ← {t('backToTables')}
        </Link>
      </nav>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-[family-name:var(--font-display)] text-2xl">
          {t('table', { label: session.tableLabel })}
        </h2>
        <span className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-paper-faint)]">
          {t('sessionStatus')}: {tSessionStatus(session.status)}
        </span>
      </div>

      {waiterCall && (
        <section className="mt-5 rounded-[var(--radius-card)] border border-[var(--color-clay)]/50 bg-[var(--color-clay)]/5 p-4">
          <p className="text-sm text-[var(--color-clay)]">{t('waiterRequested')}</p>
          <WaitingDuration since={waiterCall.requestedAt} prefix={t('waitingFor')} className="mt-1 block font-[family-name:var(--font-mono)] text-xs" />
          <div className="mt-3">
            <WaiterCallStaffActions callId={waiterCall.id} status={waiterCall.status} acknowledgeAction={acknowledgeWaiterCallAction} resolveAction={resolveWaiterCallAction} />
          </div>
        </section>
      )}

      <ServiceProductionProgress
        items={productionItems}
        canMarkServed={principal.permissions.includes('MARK_ITEM_SERVED')}
        action={markServedAction}
        readyHandoffSla={readyHandoffSla}
      />

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

      {bill && bill.remainingCents > 0 && (canRequestPayment || canRegisterCash) && (
        <section className="mt-8 rounded-[var(--radius-card)] border border-[var(--color-ink-800)] p-4">
          <div className="price-rail">
            <span className="text-sm">{t('billTotal')}</span>
            <span className="price-rail__leader" aria-hidden="true" />
            <span className="price-rail__value">
              {formatCents(bill.remainingCents, locale, bill.currency)}
            </span>
          </div>
          {canRequestPayment && (
            <RequestPaymentButton sessionId={session.id} action={requestPaymentAction} />
          )}
          {canRegisterCash && !bill.activeAttempt && (
            <StaffPaymentStartPanel
              sessionId={session.id}
              locale={locale}
              currency={bill.currency}
              lines={bill.lines.filter((line) => line.remainingCents > 0)}
              action={startStaffCashPaymentAction}
            />
          )}
        </section>
      )}

      {bill?.activeAttempt?.method === 'CASH' &&
        canRegisterCash && (
          <CashSettlementPanel
            attemptId={bill.activeAttempt.id}
            amountCents={bill.activeAttempt.amountCents}
            locale={locale}
            currency={bill.currency}
            selectedLines={bill.activeAttempt.allocations.map((allocation) => {
              const line = bill.lines.find(
                (candidate) => candidate.orderItemId === allocation.orderItemId,
              );
              return {
                id: allocation.orderItemId,
                label: `${allocation.quantity} × ${line?.name ?? '—'}`,
                amountCents: allocation.amountCents,
              };
            })}
            confirmAction={confirmCashPaymentAction}
            cancelAction={cancelCashPaymentAction}
          />
        )}

      {printableBill && printableBill.totalGrossCents > 0 && (
        <section className="mt-8 rounded-[var(--radius-card)] border border-[var(--color-ink-800)] p-4">
          <h3 className="eyebrow">{t('printDocuments')}</h3>
          <p className="mt-2 text-xs text-[var(--color-paper-faint)]">{t('printDocumentsHint')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/service/${session.id}/druck`}
              className="rounded-full border border-[var(--color-brass-dim)] px-4 py-2 text-sm text-[var(--color-brass)]"
            >
              {t('printFullOverview')}
            </Link>
            {printableBill.payments.map((payment, index) => (
              <Link
                key={payment.id}
                href={`/service/${session.id}/druck/${payment.id}`}
                className="rounded-full border border-[var(--color-ink-700)] px-4 py-2 text-sm text-[var(--color-paper-dim)]"
              >
                {t('printPaymentPart', { number: index + 1 })}
              </Link>
            ))}
          </div>
        </section>
      )}

      {bill && bill.remainingCents === 0 && session.status === 'PAID' &&
        principal.permissions.includes('MANAGE_DINING_SESSION') && (
          <section className="mt-8 rounded-[var(--radius-card)] border border-[var(--color-sage)]/40 p-4">
            <p className="text-sm text-[var(--color-sage)]">{t('billPaid')}</p>
            <CloseSessionButton sessionId={session.id} action={closeSessionAction} />
          </section>
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
