'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

type Props = {
  itemId: string;
  isAvailable: boolean;
  action: (payload: unknown) => Promise<{ ok: boolean }>;
};

export function AvailabilityToggle({ itemId, isAvailable, action }: Props) {
  const t = useTranslations('admin');
  const [available, setAvailable] = useState(isAvailable);
  const [error, setError] = useState(false);
  const [isPending, startTransition] = useTransition();

  const toggle = () => {
    const next = !available;
    setError(false);
    startTransition(async () => {
      const result = await action({ itemId, isAvailable: next });
      if (result.ok) setAvailable(next);
      else setError(true);
    });
  };

  return (
    <div className="text-right">
      <button
        type="button"
        disabled={isPending}
        onClick={toggle}
        aria-pressed={!available}
        className={
          available
            ? 'rounded-full border border-[var(--color-ink-700)] px-3 py-1 text-xs text-[var(--color-paper-dim)] disabled:opacity-50'
            : 'rounded-full border border-[var(--color-clay)] px-3 py-1 text-xs text-[var(--color-clay)] disabled:opacity-50'
        }
      >
        {isPending ? t('availabilityUpdating') : available ? t('markSoldOut') : t('markAvailable')}
      </button>
      {error && <p className="mt-1 text-xs text-[var(--color-clay)]">{t('availabilityFailed')}</p>}
    </div>
  );
}
