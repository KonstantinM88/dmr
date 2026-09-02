import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { formatCents } from '@/lib/money';
import type {
  PrintableBillDocument,
  PrintablePaymentPart,
} from '@/domains/payments/shared/printable-document';
import { PrintButton } from '@/components/payment/PrintButton';

function formatDate(value: string, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(value));
}

export async function PrintablePaymentDocument(props: {
  document: PrintableBillDocument;
  locale: string;
  payment?: PrintablePaymentPart;
}) {
  const t = await getTranslations('paymentPrint');
  const selectedPayment = props.payment;
  const lines = selectedPayment?.lines ?? props.document.lines;
  const totalCents = selectedPayment?.amountCents ?? props.document.totalGrossCents;
  const taxBreakdown = selectedPayment?.taxBreakdown ?? props.document.taxBreakdown;
  const documentDate = selectedPayment?.receivedAt ?? props.document.closedAt ?? props.document.openedAt;

  return (
    <article className="print-document py-8">
      <div className="print-hidden mb-6 flex flex-wrap gap-3">
        <Link href={`/service/${props.document.sessionId}`} className="rounded-full border border-[var(--color-ink-700)] px-5 py-2 text-sm">
          {t('backToTable')}
        </Link>
        <PrintButton label={t('print')} />
      </div>

      <p className="eyebrow">{t('internalMarker')}</p>
      <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl">
        {selectedPayment ? t('partialTitle') : t('fullTitle')}
      </h1>
      <p className="mt-2 text-sm text-[var(--color-paper-dim)]">{props.document.venueName}</p>
      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <dt className="text-[var(--color-paper-faint)]">{t('table')}</dt>
        <dd>{props.document.tableLabel}</dd>
        <dt className="text-[var(--color-paper-faint)]">{t('date')}</dt>
        <dd>{formatDate(documentDate, props.locale, props.document.timeZone)}</dd>
        {selectedPayment && (
          <>
            <dt className="text-[var(--color-paper-faint)]">{t('method')}</dt>
            <dd>{t(`methods.${selectedPayment.method}`)}</dd>
          </>
        )}
      </dl>

      <h2 className="eyebrow mt-8 border-b border-[var(--color-ink-700)] pb-2">{t('positions')}</h2>
      <ul className="divide-y divide-[var(--color-ink-800)]">
        {lines.map((line) => (
          <li key={line.orderItemId} className="flex items-baseline gap-3 py-3 text-sm">
            <span className="flex-1">{line.quantity} × {line.name}{line.variantName ? ` · ${line.variantName}` : ''}</span>
            <span className="font-[family-name:var(--font-mono)]">{formatCents(line.amountCents, props.locale, props.document.currency)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5 price-rail font-semibold">
        <span>{t('total')}</span>
        <span className="price-rail__leader" aria-hidden="true" />
        <span className="price-rail__value">{formatCents(totalCents, props.locale, props.document.currency)}</span>
      </div>

      {!selectedPayment && (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <dt className="text-[var(--color-paper-faint)]">{t('paid')}</dt>
          <dd className="text-right font-[family-name:var(--font-mono)]">{formatCents(props.document.paidCents, props.locale, props.document.currency)}</dd>
          <dt className="text-[var(--color-paper-faint)]">{t('remaining')}</dt>
          <dd className="text-right font-[family-name:var(--font-mono)]">{formatCents(props.document.remainingCents, props.locale, props.document.currency)}</dd>
        </dl>
      )}

      {selectedPayment?.receivedCents !== null && selectedPayment?.receivedCents !== undefined && (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <dt className="text-[var(--color-paper-faint)]">{t('received')}</dt>
          <dd className="text-right font-[family-name:var(--font-mono)]">{formatCents(selectedPayment.receivedCents, props.locale, props.document.currency)}</dd>
          <dt className="text-[var(--color-paper-faint)]">{t('change')}</dt>
          <dd className="text-right font-[family-name:var(--font-mono)]">{formatCents(selectedPayment.changeCents ?? 0, props.locale, props.document.currency)}</dd>
        </dl>
      )}

      <h2 className="eyebrow mt-8 border-b border-[var(--color-ink-700)] pb-2">{t('taxTitle')}</h2>
      <ul className="mt-2 space-y-1 text-xs">
        {taxBreakdown.map((row) => (
          <li key={row.rateBasisPoints} className="flex justify-between gap-4">
            <span>{t('taxRow', { rate: row.rateBasisPoints / 100 })}</span>
            <span>{formatCents(row.taxCents, props.locale, props.document.currency)}</span>
          </li>
        ))}
      </ul>

      {!selectedPayment && props.document.payments.length > 0 && (
        <section className="mt-8">
          <h2 className="eyebrow border-b border-[var(--color-ink-700)] pb-2">{t('payments')}</h2>
          <ol className="mt-2 space-y-1 text-xs">
            {props.document.payments.map((payment, index) => (
              <li key={payment.id} className="flex justify-between gap-4">
                <span>{t('paymentPart', { number: index + 1 })} · {t(`methods.${payment.method}`)}</span>
                <span>{formatCents(payment.amountCents, props.locale, props.document.currency)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="mt-10 border-t border-[var(--color-ink-700)] pt-4 text-xs text-[var(--color-paper-faint)]">
        {t('notFiscal')}
      </p>
    </article>
  );
}

