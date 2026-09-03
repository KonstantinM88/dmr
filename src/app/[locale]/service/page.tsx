import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requirePermission } from '@/domains/staff/server/rbac';
import { getActiveSessionBoard } from '@/domains/orders/server/order.queries';
import { listActiveTablesForService } from '@/domains/tables/server/table.service';
import { formatCents } from '@/lib/money';
import { DEFAULT_VENUE_SLUG } from '@/lib/venue';
import { OpenSessionButton } from '@/components/service/OpenSessionButton';
import { WaitingDuration } from '@/components/service/WaitingDuration';
import { WaiterCallStaffActions } from '@/components/service/WaiterCallStaffActions';
import { ServiceProductionProgress } from '@/components/service/ServiceProductionProgress';
import { OperationalSignal } from '@/components/realtime/OperationalSignal';
import { getReadyHandoffSlaSettings } from '@/domains/production/server/production-sla.service';
import {
  acknowledgeWaiterCallAction,
  openSessionAction,
  resolveWaiterCallAction,
  markServedAction,
} from './actions';

export const dynamic = 'force-dynamic';

/** Доска столов: активные сессии и свободные столы. */
export default async function ServiceBoardPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const principal = await requirePermission('VIEW_ASSIGNED_TABLES');
  const t = await getTranslations('service');

  const [sessions, readyHandoffSla] = await Promise.all([
    getActiveSessionBoard(DEFAULT_VENUE_SLUG),
    getReadyHandoffSlaSettings(principal.venueId),
  ]);
  const busyTableIds = new Set(sessions.map((session) => session.tableId));

  const tables = await listActiveTablesForService(DEFAULT_VENUE_SLUG);

  const freeTables = tables.filter((table) => !busyTableIds.has(table.id));
  const canOpenSession = principal.permissions.includes('MANAGE_DINING_SESSION');
  const canMarkServed = principal.permissions.includes('MARK_ITEM_SERVED');
  const attentionSessions = sessions.filter(
    (session) =>
      session.pendingRoundCount > 0 ||
      session.productionItems.length > 0 ||
      session.waiterCall ||
      session.activePaymentAttempt?.method === 'CASH',
  );
  const operationalSignalIds = sessions.flatMap((session) => [
    ...session.pendingRounds.map((round) => `round:${round.id}`),
    ...session.productionItems
      .filter((item) => item.ticketStatus === 'READY')
      .map((item) => `ready:${item.id}`),
    ...(session.waiterCall ? [`call:${session.waiterCall.id}`] : []),
    ...(session.activePaymentAttempt?.method === 'CASH'
      ? [`cash:${session.activePaymentAttempt.id}`]
      : []),
  ]);

  return (
    <div className="pt-8">
      <div className="mb-4 flex justify-end">
        <OperationalSignal channel="service-board" signalIds={operationalSignalIds} />
      </div>
      {attentionSessions.length > 0 && (
        <section className="mb-8">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-clay)] pb-2">
            <h2 className="eyebrow text-[var(--color-clay)]">{t('attentionRequired')}</h2>
          </div>
          <ul className="mt-3 space-y-3">
            {attentionSessions.map((session) => (
              <li key={session.id} className="rounded-[var(--radius-card)] border border-[var(--color-clay)]/50 bg-[var(--color-clay)]/5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/service/${session.id}`} className="font-[family-name:var(--font-display)] text-lg text-[var(--color-brass)]">
                      {t('table', { label: session.tableLabel })}
                    </Link>
                    {session.waiterCall && (
                      <>
                        <p className="mt-1 text-sm">{t('waiterRequested')}</p>
                        <WaitingDuration since={session.waiterCall.requestedAt} prefix={t('waitingFor')} className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-clay)]" />
                      </>
                    )}
                    {session.pendingRounds.length > 0 && (
                      <>
                        <p className="mt-1 text-sm">{t('ordersNeedDecision', { count: session.pendingRounds.length })}</p>
                        <WaitingDuration
                          since={session.pendingRounds[0]!.submittedAt}
                          prefix={t('waitingFor')}
                          className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-clay)]"
                        />
                      </>
                    )}
                    {session.activePaymentAttempt?.method === 'CASH' && (
                      <>
                        <p className="mt-1 text-sm">{t('cashRequested')}</p>
                        <WaitingDuration since={session.activePaymentAttempt.createdAt} prefix={t('waitingFor')} className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-clay)]" />
                      </>
                    )}
                    <ServiceProductionProgress
                      items={session.productionItems}
                      canMarkServed={canMarkServed}
                      action={markServedAction}
                      readyHandoffSla={readyHandoffSla}
                    />
                  </div>
                  {session.waiterCall && (
                    <WaiterCallStaffActions
                      callId={session.waiterCall.id}
                      status={session.waiterCall.status}
                      acknowledgeAction={acknowledgeWaiterCallAction}
                      resolveAction={resolveWaiterCallAction}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="eyebrow border-b border-[var(--color-brass-dim)] pb-2">
        {t('activeSessions')}
      </h2>

      {sessions.length === 0 ? (
        <p className="py-6 text-sm text-[var(--color-paper-dim)]">{t('noActiveSessions')}</p>
      ) : (
        <ul className="divide-y divide-[var(--color-ink-800)]">
          {sessions.map((session) => (
            <li key={session.id}>
              <Link
                href={`/service/${session.id}`}
                className="flex flex-wrap items-baseline gap-3 py-4"
              >
                <span className="font-[family-name:var(--font-display)] text-lg">
                  {t('table', { label: session.tableLabel })}
                </span>

                {session.pendingRoundCount > 0 && (
                  <span className="rounded-full bg-[var(--color-clay)]/15 px-2 py-0.5 text-xs text-[var(--color-clay)]">
                    {t('pendingRounds', { count: session.pendingRoundCount })}
                  </span>
                )}

                {session.productionItems.length > 0 && (
                  <span className="rounded-full bg-[var(--color-brass)]/15 px-2 py-0.5 text-xs text-[var(--color-brass)]">
                    {t('productionOpenCount', { count: session.productionItems.length })}
                  </span>
                )}

                {session.reorderApprovalMode === 'AUTO_ACCEPT' && (
                  <span className="rounded-full bg-[var(--color-sage)]/15 px-2 py-0.5 text-xs text-[var(--color-sage)]">
                    {t('autoAcceptOn')}
                  </span>
                )}

                <span className="flex-1 text-xs text-[var(--color-paper-faint)]">
                  {t('participants', { count: session.participantCount })}
                </span>

                <span className="font-[family-name:var(--font-mono)] text-sm text-[var(--color-brass)]">
                  {formatCents(session.totalGrossCents, locale)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <h2 className="eyebrow mt-10 border-b border-[var(--color-brass-dim)] pb-2">
        {t('freeTables')}
      </h2>

      {freeTables.length === 0 ? (
        <p className="py-6 text-sm text-[var(--color-paper-dim)]">{t('noFreeTables')}</p>
      ) : (
        <ul className="flex flex-wrap gap-2 pt-4">
          {freeTables.map((table) => (
            <li key={table.id}>
              {canOpenSession ? (
                <OpenSessionButton
                  tableId={table.id}
                  label={t('table', { label: table.label })}
                  action={openSessionAction}
                />
              ) : (
                <span className="rounded-full border border-[var(--color-ink-700)] px-4 py-1.5 text-sm text-[var(--color-paper-dim)]">
                  {t('table', { label: table.label })}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
