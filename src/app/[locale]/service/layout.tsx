import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getStaffPrincipal } from '@/domains/staff/server/session.service';
import { logoutAction } from '../(staff)/anmelden/actions';
import { PollingRefresh } from '@/components/realtime/PollingRefresh';
import { Link } from '@/i18n/navigation';

export const dynamic = 'force-dynamic';

/**
 * Зона обслуживания столов. Наличие разрешения проверяется здесь для
 * навигации и повторно — в каждом action.
 */
export default async function ServiceLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  const principal = await getStaffPrincipal();
  if (!principal) redirect(`/${locale}/anmelden`);

  const t = await getTranslations('service');
  const tStaff = await getTranslations('staff');

  if (!principal.permissions.includes('VIEW_ASSIGNED_TABLES')) {
    return (
      <div className="mx-auto w-full max-w-4xl px-5 py-10">
        <p className="text-sm text-[var(--color-clay)]">{tStaff('noPermission')}</p>
      </div>
    );
  }

  return (
    <div className="service-shell mx-auto w-full max-w-4xl px-5 py-8">
      <PollingRefresh endpoint="/api/live/service" visibleIntervalMs={4_000} />
      <header className="print-hidden border-b border-[var(--color-ink-800)] pb-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="eyebrow">{t('title')}</p>
            <p className="mt-1 text-sm text-[var(--color-paper-dim)]">
              {tStaff('signedInAs', { name: principal.displayName })}
            </p>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-full border border-[var(--color-ink-700)] px-4 py-1.5 text-sm text-[var(--color-paper-dim)]"
            >
              {tStaff('logout')}
            </button>
          </form>
        </div>
        {(principal.permissions.includes('VIEW_KITCHEN_QUEUE') ||
          principal.permissions.includes('VIEW_BAR_QUEUE')) && (
          <nav className="mt-4 flex flex-wrap gap-2">
            {principal.permissions.includes('VIEW_KITCHEN_QUEUE') && (
              <Link
                href="/produktion/kueche"
                className="rounded-full border border-[var(--color-brass-dim)] px-4 py-1.5 text-xs text-[var(--color-brass)]"
              >
                Küche
              </Link>
            )}
            {principal.permissions.includes('VIEW_BAR_QUEUE') && (
              <Link
                href="/produktion/bar"
                className="rounded-full border border-[var(--color-brass-dim)] px-4 py-1.5 text-xs text-[var(--color-brass)]"
              >
                Bar
              </Link>
            )}
          </nav>
        )}
      </header>
      {props.children}
    </div>
  );
}
