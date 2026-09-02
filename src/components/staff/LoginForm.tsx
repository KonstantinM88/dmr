'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';

type FormState = {
  error: 'invalid_credentials' | 'locked' | 'rate_limited' | 'invalid_input' | null;
};

type Props = {
  locale: string;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
};

const ERROR_KEYS: Record<NonNullable<FormState['error']>, string> = {
  invalid_credentials: 'invalidCredentials',
  invalid_input: 'invalidCredentials',
  locked: 'locked',
  rate_limited: 'rateLimited',
};

export function LoginForm({ locale, action }: Props) {
  const t = useTranslations('staff.login');
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, { error: null });

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />
      <div>
        <label htmlFor="email" className="eyebrow block">
          {t('email')}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="mt-2 w-full rounded-[var(--radius-card)] border border-[var(--color-ink-700)] bg-[var(--color-ink-900)] px-3 py-2.5 text-[var(--color-paper)]"
        />
      </div>

      <div>
        <label htmlFor="password" className="eyebrow block">
          {t('password')}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-2 w-full rounded-[var(--radius-card)] border border-[var(--color-ink-700)] bg-[var(--color-ink-900)] px-3 py-2.5 text-[var(--color-paper)]"
        />
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-[var(--color-clay)]">
          {t(ERROR_KEYS[state.error])}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-[var(--color-brass)] px-5 py-2.5 font-medium text-[var(--color-ink-950)] disabled:opacity-60"
      >
        {pending ? t('submitting') : t('submit')}
      </button>
    </form>
  );
}
