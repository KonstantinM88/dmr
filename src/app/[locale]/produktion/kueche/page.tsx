import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getStaffPrincipal } from '@/domains/staff/server/session.service';
import { getProductionQueueDelta } from '@/domains/production/server/production.service';
import { ProductionQueueClient } from '@/components/production/ProductionQueueClient';
import { transitionTicketAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function KitchenQueuePage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const principal = await getStaffPrincipal();
  if (!principal) redirect(`/${locale}/anmelden`);

  if (!principal.permissions.includes('VIEW_KITCHEN_QUEUE')) {
    const tStaff = await getTranslations('staff');
    return <p className="pt-8 text-sm text-[var(--color-clay)]">{tStaff('noPermission')}</p>;
  }

  const snapshot = await getProductionQueueDelta({
    venueId: principal.venueId,
    stationKind: 'KITCHEN',
  });
  const t = await getTranslations('production');

  return (
    <section className="pt-8" aria-labelledby="production-kitchen-heading">
      <h1 id="production-kitchen-heading" className="font-[family-name:var(--font-display)] text-3xl">
        {t('kitchen')}
      </h1>
      <ProductionQueueClient initial={snapshot} action={transitionTicketAction} />
    </section>
  );
}
