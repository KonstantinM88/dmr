'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { login, loginSchema } from '@/domains/staff/server/auth.service';
import { revokeCurrentStaffSession } from '@/domains/staff/server/session.service';
import { defaultLocale } from '@/i18n/routing';

export type LoginFormState = {
  error: 'invalid_credentials' | 'locked' | 'rate_limited' | 'invalid_input' | null;
};

/**
 * Server action логина. Единственная точка мутации: вся Zod-валидация
 * внешней границы — здесь (docs/architecture.md §3).
 */
export async function loginAction(
  _prev: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) return { error: 'invalid_input' };

  const headerList = await headers();
  const result = await login(parsed.data, {
    ip: headerList.get('x-forwarded-for')?.split(',')[0]?.trim(),
    userAgent: headerList.get('user-agent') ?? undefined,
  });

  if (!result.ok) return { error: result.reason };

  redirect(`/${defaultLocale}/admin`);
}

export async function logoutAction(): Promise<void> {
  await revokeCurrentStaffSession();
  redirect(`/${defaultLocale}/anmelden`);
}
