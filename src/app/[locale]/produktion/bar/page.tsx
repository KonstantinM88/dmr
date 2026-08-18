import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getStaffPrincipal } from '@/domains/staff/server/session.service';
import { getProductionQueueDelta } from '@/domains/production/server/production.service';
import { ProductionQueueClient } from '@/components/production/ProductionQueueClient';
import { transitionTicketAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function BarQueuePage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const principal = await getStaffPrincipal();
  if (!principal) redirect(`/${locale}/anmelden`);

  if (!principal.permissions.includes('VIEW_BAR_QUEUE')) {
    const tStaff = await getTranslations('staff');
    return <p className="pt-8 text-sm text-[var(--color-clay)]">{tStaff('noPermission')}</p>;
  }

  const snapshot = await getProductionQueueDelta({
    venueId: principal.venueId,
    stationKind: 'BAR',
  });
  const t = await getTranslations('production');

  return (
    <section className="pt-8" aria-labelledby="production-bar-heading">
      <h1 id="production-bar-heading" className="font-[family-name:var(--font-display)] text-3xl">
        {t('bar')}
      </h1>
      <ProductionQueueClient initial={snapshot} action={transitionTicketAction} />
    </section>
  );
}
