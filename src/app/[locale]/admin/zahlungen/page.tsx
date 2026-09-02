import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getStaffPrincipal } from '@/domains/staff/server/session.service';
import { getReconciliationReport } from '@/domains/payments/server/reconciliation.queries';
import { listPaidSessionsAwaitingClose } from '@/domains/sessions/server/session.service';
import { formatCents } from '@/lib/money';
import { CloseSessionButton } from '@/components/service/CloseSessionButton';
import { closePaidSessionAction } from './actions';

export const dynamic = 'force-dynamic';

/**
 * Бухгалтерский отчёт остаётся read-only для финансовых данных. Отдельное
 * операционное действие закрывает только уже PAID DiningSession и требует
 * MANAGE_DINING_SESSION; Payment/Bill при этом не переписываются.
 */
export default async function PaymentsReportPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { locale } = await props.params;
  const { days } = await props.searchParams;
  setRequestLocale(locale);

  const principal = await getStaffPrincipal();
  if (!principal) redirect(`/${locale}/anmelden`);

  if (
    !principal.permissions.includes('VIEW_PAYMENTS') &&
    !principal.permissions.includes('VIEW_TAX_REPORTS')
  ) {
    const tStaff = await getTranslations('staff');
    return <p className="pt-8 text-sm text-[var(--color-clay)]">{tStaff('noPermission')}</p>;
  }

  const t = await getTranslations('payments');
  const tMethods = await getTranslations('paymentMethods');
  const tTable = await getTranslations('table');

  const windowDays = Math.min(Math.max(Number(days ?? 7) || 7, 1), 90);
  const to = new Date();
  const from = new Date(to.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const [report, paidSessions] = await Promise.all([
    getReconciliationReport({ venueId: principal.venueId, from, to }),
    listPaidSessionsAwaitingClose(principal.venueId),
  ]);
  const canCloseSessions = principal.permissions.includes('MANAGE_DINING_SESSION');

  return (
    <div className="pt-8">
      <h2 className="font-[family-name:var(--font-display)] text-2xl">{t('title')}</h2>
      <p className="mt-2 text-sm text-[var(--color-paper-dim)]">
        {t('window', { days: windowDays })}
      </p>

      <section className="mt-8 rounded-[var(--radius-card)] border border-[var(--color-sage)]/40 p-4">
        <h3 className="font-[family-name:var(--font-display)] text-lg">
          {t('paidTablesAwaitingClose')}
        </h3>
        <p className="mt-1 text-xs text-[var(--color-paper-dim)]">{t('paidTablesHint')}</p>

        {paidSessions.length === 0 ? (
          <p className="py-4 text-sm text-[var(--color-paper-dim)]">
            {t('noPaidTablesAwaitingClose')}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--color-ink-800)]">
            {paidSessions.map((session) => (
              <li key={session.id} className="py-4">
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="font-[family-name:var(--font-display)] text-lg">
                    {tTable('label', { label: session.tableLabel })}
                  </span>
                  <span className="text-xs text-[var(--color-paper-faint)]">
                    {t('paidAt', { date: session.paidAt.toLocaleString(locale) })}
                  </span>
                  <span className="flex-1" />
                  <span className="font-[family-name:var(--font-mono)] text-sm text-[var(--color-brass)]">
                    {formatCents(session.totalGrossCents, locale, session.currency)}
                  </span>
                </div>

                {canCloseSessions ? (
                  <CloseSessionButton
                    sessionId={session.id}
                    action={closePaidSessionAction}
                  />
                ) : (
                  <p className="mt-2 text-xs text-[var(--color-clay)]">
                    {t('closeRequiresPermission')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {process.env.NODE_ENV === 'development' && (
        <section className="mt-4 rounded-[var(--radius-card)] border border-dashed border-[var(--color-brass-dim)] p-4">
          <p className="text-xs text-[var(--color-paper-dim)]">{t('freshQrHint')}</p>
          <Link
            href="/api/dev/qr-entry"
            prefetch={false}
            className="mt-3 inline-flex rounded-full border border-[var(--color-brass)] px-4 py-2 font-[family-name:var(--font-mono)] text-xs text-[var(--color-brass)]"
          >
            {t('freshQrTest')}
          </Link>
        </section>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-[var(--radius-card)] border border-[var(--color-ink-800)] p-4">
          <p className="eyebrow">{t('totalPaid')}</p>
          <p className="mt-2 font-[family-name:var(--font-mono)] text-xl text-[var(--color-brass)]">
            {formatCents(report.totalPaidCents, locale)}
          </p>
        </div>
        <div className="rounded-[var(--radius-card)] border border-[var(--color-ink-800)] p-4">
          <p className="eyebrow">{t('unmatchedEvents')}</p>
          <p className="mt-2 font-[family-name:var(--font-mono)] text-xl">
            {report.unmatchedEventCount}
          </p>
        </div>
        <div className="rounded-[var(--radius-card)] border border-[var(--color-ink-800)] p-4">
          <p className="eyebrow">{t('failedEvents')}</p>
          <p className="mt-2 font-[family-name:var(--font-mono)] text-xl">
            {report.failedEventCount}
          </p>
        </div>
      </div>

      <h3 className="eyebrow mt-10 border-b border-[var(--color-brass-dim)] pb-2">
        {t('taxBreakdown')}
      </h3>
      {report.taxBreakdown.length === 0 ? (
        <p className="py-4 text-sm text-[var(--color-paper-dim)]">{t('noData')}</p>
      ) : (
        <ul className="divide-y divide-[var(--color-ink-800)]">
          {report.taxBreakdown.map((row) => (
            <li key={row.rateBasisPoints} className="flex items-baseline gap-3 py-3 text-sm">
              <span className="w-16 font-[family-name:var(--font-mono)]">
                {(row.rateBasisPoints / 100).toFixed(0)} %
              </span>
              <span className="flex-1 text-[var(--color-paper-dim)]">
                {t('net')} {formatCents(row.netCents, locale)} · {t('tax')}{' '}
                {formatCents(row.taxCents, locale)}
              </span>
              <span className="font-[family-name:var(--font-mono)] text-[var(--color-brass)]">
                {formatCents(row.grossCents, locale)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h3 className="eyebrow mt-10 border-b border-[var(--color-brass-dim)] pb-2">
        {t('payments')}
      </h3>
      {report.payments.length === 0 ? (
        <p className="py-4 text-sm text-[var(--color-paper-dim)]">{t('noData')}</p>
      ) : (
        <ul className="divide-y divide-[var(--color-ink-800)]">
          {report.payments.map((payment) => (
            <li key={payment.paymentId} className="flex flex-wrap items-baseline gap-3 py-3">
              <span className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-paper-faint)]">
                {new Date(payment.createdAt).toLocaleString(locale)}
              </span>
              <span className="text-sm">{tMethods(payment.method)}</span>

              {!payment.hasProviderEvent && (
                <span className="rounded-full bg-[var(--color-clay)]/15 px-2 py-0.5 text-xs text-[var(--color-clay)]">
                  {t('noProviderEvent')}
                </span>
              )}

              {payment.allocationMismatch && (
                <span className="rounded-full bg-[var(--color-clay)]/15 px-2 py-0.5 text-xs text-[var(--color-clay)]">
                  {t('allocationMismatch')}
                </span>
              )}

              <span className="flex-1" />
              <span className="font-[family-name:var(--font-mono)] text-sm text-[var(--color-brass)]">
                {formatCents(payment.amountCents, locale, payment.currency)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-10 text-xs leading-relaxed text-[var(--color-paper-faint)]">
        {t('fiscalNote')}
      </p>
    </div>
  );
}
