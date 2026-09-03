import { getTranslations, setRequestLocale } from 'next-intl/server';
import Link from 'next/link';
import { requirePermission } from '@/domains/staff/server/rbac';
import { listTables } from '@/domains/tables/server/table.service';
import { TableManager } from '@/components/staff/TableManager';
import { DEFAULT_VENUE_SLUG } from '@/lib/venue';
import { createTableAction, rotateTableTokenAction, setTableActiveAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function AdminTablesPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  await requirePermission('MANAGE_TABLES_QR');

  const t = await getTranslations('tables');
  const tables = await listTables(DEFAULT_VENUE_SLUG);

  return (
    <div>
      <h2 className="pt-8 font-[family-name:var(--font-display)] text-2xl">{t('title')}</h2>
      <p className="mt-2 text-sm text-[var(--color-paper-dim)]">{t('intro')}</p>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href={`/${locale}/admin/tische/druck?tables=1,2`}
          className="rounded-full border border-[var(--color-brass)] px-4 py-2 text-sm text-[var(--color-brass)]"
        >
          {t('printFirstTwo')}
        </Link>
        <Link
          href={`/${locale}/admin/tische/druck`}
          className="rounded-full border border-[var(--color-ink-700)] px-4 py-2 text-sm text-[var(--color-paper-dim)]"
        >
          {t('printAll')}
        </Link>
      </div>

      <TableManager
        tables={tables}
        createAction={createTableAction}
        rotateAction={rotateTableTokenAction}
        setActiveAction={setTableActiveAction}
      />
    </div>
  );
}
