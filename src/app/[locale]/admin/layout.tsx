import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getStaffPrincipal } from '@/domains/staff/server/session.service';
import { logoutAction } from '../(staff)/anmelden/actions';

export const dynamic = 'force-dynamic';

/**
 * Оболочка admin-зоны. Проверка аутентификации здесь — удобство навигации;
 * каждая конкретная операция дополнительно требует своё разрешение через
 * requirePermission (docs/rbac-matrix.md: скрытие UI не является защитой).
 */
export default async function AdminLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  const principal = await getStaffPrincipal();
  if (!principal) redirect(`/${locale}/anmelden`);

  const t = await getTranslations('admin');
  const tStaff = await getTranslations('staff');

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-8">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[var(--color-ink-800)] pb-4">
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
      </header>
      {props.children}
    </div>
  );
}
