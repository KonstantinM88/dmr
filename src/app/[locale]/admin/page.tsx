import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { getStaffPrincipal } from '@/domains/staff/server/session.service';

export const dynamic = 'force-dynamic';

export default async function AdminHomePage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  // Layout и page могут рендериться параллельно. Поэтому page самостоятельно
  // делает тихий redirect, а не выбрасывает AuthenticationRequiredError до
  // того, как redirect из layout успеет остановить анонимный запрос.
  const principal = await getStaffPrincipal();
  if (!principal) redirect(`/${locale}/anmelden`);
  const t = await getTranslations('admin');
  const tRoles = await getTranslations('roles');

  const sections = [
    { href: '/admin/speisekarte', label: t('menu'), permission: 'MANAGE_MENU' as const },
    { href: '/admin/tische', label: t('tables'), permission: 'MANAGE_TABLES_QR' as const },
    { href: '/service', label: t('service'), permission: 'VIEW_ASSIGNED_TABLES' as const },
    { href: '/admin/zahlungen', label: t('payments'), permission: 'VIEW_PAYMENTS' as const },
    { href: '/produktion/kueche', label: t('kitchen'), permission: 'VIEW_KITCHEN_QUEUE' as const },
    { href: '/produktion/bar', label: t('bar'), permission: 'VIEW_BAR_QUEUE' as const },
  ];

  return (
    <div className="pt-8">
      <ul className="flex flex-wrap gap-2">
        {principal.roles.map((role) => (
          <li
            key={role}
            className="rounded-full bg-[var(--color-ink-850)] px-3 py-1 font-[family-name:var(--font-mono)] text-xs text-[var(--color-brass)]"
          >
            {tRoles(role)}
          </li>
        ))}
      </ul>

      <nav className="mt-8 grid gap-3 sm:grid-cols-2">
        {sections
          .filter((section) => principal.permissions.includes(section.permission))
          .map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="rounded-[var(--radius-card)] border border-[var(--color-ink-800)] p-5 transition-colors hover:border-[var(--color-brass-dim)]"
            >
              <span className="font-[family-name:var(--font-display)] text-lg">{section.label}</span>
            </Link>
          ))}
      </nav>
    </div>
  );
}
