import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getStaffPrincipal } from '@/domains/staff/server/session.service';
import { LoginForm } from '@/components/staff/LoginForm';
import { loginAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function StaffLoginPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const principal = await getStaffPrincipal();
  if (principal) redirect(`/${locale}/admin`);

  const t = await getTranslations('staff.login');

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5">
      <h1 className="font-[family-name:var(--font-display)] text-2xl">{t('title')}</h1>
      <div className="mt-6">
        <LoginForm locale={locale} action={loginAction} />
      </div>
    </main>
  );
}
