import Image from 'next/image';
import Link from 'next/link';
import QRCode from 'qrcode';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PrintTableQrsButton } from '@/components/tables/PrintTableQrsButton';
import { requirePermission } from '@/domains/staff/server/rbac';
import {
  buildTableQrUrl,
  listPrintableTableQrTokens,
} from '@/domains/tables/server/table.service';
import { getEnv } from '@/lib/env';
import { DEFAULT_VENUE_SLUG } from '@/lib/venue';

export const dynamic = 'force-dynamic';

function parseRequestedLabels(value?: string): string[] | undefined {
  if (!value) return undefined;

  const labels = [...new Set(value.split(',').map((label) => label.trim()).filter(Boolean))];
  return labels.length > 0 ? labels.slice(0, 50) : undefined;
}

export default async function PrintTableQrsPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tables?: string }>;
}) {
  const [{ locale }, { tables }] = await Promise.all([props.params, props.searchParams]);
  setRequestLocale(locale);

  await requirePermission('MANAGE_TABLES_QR');

  const [t, tCommon] = await Promise.all([
    getTranslations('tables'),
    getTranslations('common'),
  ]);
  const env = getEnv();
  const records = await listPrintableTableQrTokens(
    DEFAULT_VENUE_SLUG,
    parseRequestedLabels(tables),
  );
  const cards = await Promise.all(
    records.map(async (record) => ({
      label: record.label,
      image: await QRCode.toDataURL(buildTableQrUrl(env.NEXT_PUBLIC_SITE_URL, record.token), {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 720,
        color: { dark: '#111111', light: '#ffffff' },
      }),
    })),
  );

  return (
    <main className="qr-print-page py-8">
      <div className="print-hidden flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/${locale}/admin/tische`}
          className="rounded-full border border-[var(--color-ink-700)] px-4 py-2 text-sm text-[var(--color-paper-dim)]"
        >
          {t('printBack')}
        </Link>
        {cards.length > 0 && <PrintTableQrsButton label={t('printAction')} />}
      </div>

      <header className="mt-8 text-center print:mt-0">
        <p className="eyebrow">{tCommon('appName')}</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl">
          {t('printTitle')}
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-[var(--color-paper-dim)] print:text-black">
          {t('printIntro')}
        </p>
      </header>

      {cards.length === 0 ? (
        <p className="mt-10 text-center text-sm text-[var(--color-paper-dim)]">
          {t('printEmpty')}
        </p>
      ) : (
        <div className="qr-print-grid mt-8 grid gap-6 sm:grid-cols-2">
          {cards.map((card) => (
            <article
              key={card.label}
              className="qr-print-card rounded-3xl border border-[var(--color-ink-700)] bg-white p-6 text-center text-[#111]"
            >
              <p className="text-sm font-semibold uppercase tracking-[0.14em]">
                {tCommon('appName')}
              </p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">
                {t('printTable', { label: card.label })}
              </h2>
              <Image
                src={card.image}
                alt={t('printQrAlt', { label: card.label })}
                width={720}
                height={720}
                unoptimized
                className="mx-auto mt-4 h-auto w-full max-w-[19rem]"
                priority
              />
              <p className="mt-2 text-lg font-semibold">{t('printScan')}</p>
              <p className="mt-1 text-sm text-[#555]">{t('printScanHint')}</p>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
