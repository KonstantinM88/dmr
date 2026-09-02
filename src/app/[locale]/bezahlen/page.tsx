import { cookies } from 'next/headers';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import Link from 'next/link';
import { getEnv } from '@/lib/env';
import { formatCents } from '@/lib/money';
import { TABLE_TOKEN_COOKIE } from '@/lib/venue';
import { resolveTableByToken } from '@/domains/tables/server/table.service';
import { getActiveSessionForTable } from '@/domains/sessions/server/session.service';
import { getBillView } from '@/domains/billing/server/bill.service';
import { isPaymentsAvailable } from '@/domains/payments/server/stripe.client';
import { PaymentPanel } from '@/components/payment/PaymentPanel';
import { PollingRefresh } from '@/components/realtime/PollingRefresh';
import {
  startPaymentAction,
  startCashPaymentAction,
  cancelPaymentAction,
} from './actions';

export const dynamic = 'force-dynamic';

/**
 * Счёт и оплата для гостя.
 *
 * Формулировки намеренно не называют это чеком или Rechnung: до отдельного
 * исследования KassenSichV/TSE приложение не заявляет фискальную готовность
 * (docs/payment-model.md §6, docs/fiscal-compliance.md).
 */
export default async function PaymentPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const t = await getTranslations('payment');
  const tTable = await getTranslations('table');
  const env = getEnv();

  const cookieStore = await cookies();
  const tableToken = cookieStore.get(TABLE_TOKEN_COOKIE)?.value;
  const table = tableToken ? await resolveTableByToken(tableToken) : null;

  if (!table) {
    return (
      <main className="mx-auto w-full max-w-2xl px-5 py-16">
        <p className="text-sm text-[var(--color-paper-dim)]">{tTable('scanRequired')}</p>
      </main>
    );
  }

  const session = await getActiveSessionForTable(table.tableId);
  const bill = session ? await getBillView(session.id) : null;

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pb-24 pt-10">
      <PollingRefresh endpoint="/api/live/guest" visibleIntervalMs={3_000} />
      <header className="border-b border-[var(--color-ink-800)] pb-6">
        <p className="eyebrow">{tTable('label', { label: table.label })}</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl leading-none">
          {t('title')}
        </h1>
      </header>

      {!bill || bill.lines.length === 0 ? (
        <p className="py-12 text-sm text-[var(--color-paper-dim)]">{t('nothingToPay')}</p>
      ) : (
        <>
          <ul className="divide-y divide-[var(--color-ink-800)] pt-4">
            {bill.lines.map((line) => (
              <li key={line.orderItemId} className="price-rail py-3">
                <span className="text-sm text-[var(--color-paper-dim)]">
                  {line.quantity} × {line.name}
                  {line.variantName ? ` · ${line.variantName}` : ''}
                </span>
                <span className="price-rail__leader" aria-hidden="true" />
                {line.remainingCents === 0 && (
                  <span className="text-xs text-[var(--color-sage)]">{t('lineSettled')}</span>
                )}
                <span className="price-rail__value">
                  {formatCents(line.lineTotalCents, locale, bill.currency)}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-6 rounded-[var(--radius-card)] border border-[var(--color-ink-800)] p-4">
            <div className="price-rail">
              <span className="text-sm">{t('total')}</span>
              <span className="price-rail__leader" aria-hidden="true" />
              <span className="price-rail__value">
                {formatCents(bill.totalGrossCents, locale, bill.currency)}
              </span>
            </div>

            {bill.paidCents > 0 && (
              <div className="price-rail pt-2">
                <span className="text-sm text-[var(--color-paper-dim)]">{t('alreadyPaid')}</span>
                <span className="price-rail__leader" aria-hidden="true" />
                <span className="price-rail__value">
                  {formatCents(bill.paidCents, locale, bill.currency)}
                </span>
              </div>
            )}

            <div className="price-rail pt-2">
              <span className="text-sm">{t('remaining')}</span>
              <span className="price-rail__leader" aria-hidden="true" />
              <span className="price-rail__value">
                {formatCents(bill.remainingCents, locale, bill.currency)}
              </span>
            </div>

            <p className="pt-3 text-xs text-[var(--color-paper-faint)]">
              {t('taxIncluded', {
                amount: formatCents(bill.taxTotalCents, locale, bill.currency),
              })}
            </p>
          </div>

          {bill.remainingCents === 0 ? (
            <p className="pt-6 text-sm text-[var(--color-sage)]">{t('paid')}</p>
          ) : (
            <PaymentPanel
              key={bill.activeAttempt ? `${bill.activeAttempt.id}:${bill.activeAttempt.status}` : `idle:${bill.remainingCents}`}
              publishableKey={env.STRIPE_PUBLISHABLE_KEY}
              stripeAvailable={isPaymentsAvailable()}
              locale={locale}
              currency={bill.currency}
              remainingCents={bill.remainingCents}
              lines={bill.lines.filter((line) => line.remainingCents > 0)}
              activeAttempt={bill.activeAttempt}
              returnUrl={`${env.NEXT_PUBLIC_SITE_URL}/${locale}/bezahlen`}
              startAction={startPaymentAction}
              startCashAction={startCashPaymentAction}
              cancelAction={cancelPaymentAction}
            />
          )}

          <p className="pt-8 text-xs leading-relaxed text-[var(--color-paper-faint)]">
            {t('notAReceipt')}
          </p>
        </>
      )}

      <Link
        href={`/${locale}`}
        className="mt-8 inline-block text-sm text-[var(--color-brass)] underline underline-offset-4"
      >
        {t('backToMenu')}
      </Link>
    </main>
  );
}
