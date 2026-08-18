'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type { ReorderApprovalMode } from '@/domains/sessions/shared/types';

type Props = {
  sessionId: string;
  mode: ReorderApprovalMode;
  disabled: boolean;
  action: (payload: unknown) => Promise<{ ok: boolean; reason?: string }>;
};

/**
 * Режим подтверждения дозаказов для ТЕКУЩЕЙ сессии.
 * Это не постоянная настройка стола: при закрытии сессии режим сбрасывается
 * на REQUIRE_WAITER. Каждое переключение аудируется на сервере.
 */
export function ApprovalModeToggle({ sessionId, mode, disabled, action }: Props) {
  const t = useTranslations('service');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const next: ReorderApprovalMode = mode === 'AUTO_ACCEPT' ? 'REQUIRE_WAITER' : 'AUTO_ACCEPT';

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-ink-800)] p-4">
      <p className="text-sm">
        {mode === 'AUTO_ACCEPT' ? t('modeAutoAccept') : t('modeRequireWaiter')}
      </p>
      <p className="mt-1 text-xs text-[var(--color-paper-faint)]">{t('modeHint')}</p>

      {error && (
        <p role="alert" className="mt-2 text-sm text-[var(--color-clay)]">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={disabled || isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await action({ sessionId, mode: next });
            if (!result.ok) setError(t('modeChangeForbidden'));
          });
        }}
        className="mt-3 rounded-full border border-[var(--color-brass-dim)] px-4 py-1.5 text-sm text-[var(--color-brass)] disabled:opacity-50"
      >
        {next === 'AUTO_ACCEPT' ? t('enableAutoAccept') : t('enableRequireWaiter')}
      </button>
    </div>
  );
}
