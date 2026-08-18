import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getStaffPrincipal } from '@/domains/staff/server/session.service';
import { Link } from '@/i18n/navigation';
import { logoutAction } from '../(staff)/anmelden/actions';

export const dynamic = 'force-dynamic';

export default async function ProductionLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  const principal = await getStaffPrincipal();
  if (!principal) redirect(`/${locale}/anmelden`);

  const canViewKitchen = principal.permissions.includes('VIEW_KITCHEN_QUEUE');
  const canViewBar = principal.permissions.includes('VIEW_BAR_QUEUE');
  const t = await getTranslations('production');
  const tStaff = await getTranslations('staff');

  if (!canViewKitchen && !canViewBar) {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-10">
        <p className="text-sm text-[var(--color-clay)]">{tStaff('noPermission')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8">
      <header className="border-b border-[var(--color-ink-800)] pb-4">
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
        <nav className="mt-4 flex flex-wrap gap-2" aria-label={t('navigation')}>
          {principal.permissions.includes('VIEW_ASSIGNED_TABLES') && (
            <Link
              href="/service"
              className="rounded-full border border-[var(--color-ink-700)] px-4 py-1.5 text-xs text-[var(--color-paper-dim)]"
            >
              {t('service')}
            </Link>
          )}
          {canViewKitchen && (
            <Link
              href="/produktion/kueche"
              className="rounded-full border border-[var(--color-brass-dim)] px-4 py-1.5 text-xs text-[var(--color-brass)]"
            >
              {t('kitchen')}
            </Link>
          )}
          {canViewBar && (
            <Link
              href="/produktion/bar"
              className="rounded-full border border-[var(--color-brass-dim)] px-4 py-1.5 text-xs text-[var(--color-brass)]"
            >
              {t('bar')}
            </Link>
          )}
        </nav>
      </header>
      {props.children}
    </div>
  );
}
