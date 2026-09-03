'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

type Props = {
  orderItemId: string;
  action: (orderItemId: string) => Promise<{ ok: boolean; reason?: string }>;
};

/** Отметка о подаче позиции (permission MARK_ITEM_SERVED). */
export function ServedButton({ orderItemId, action }: Props) {
  const t = useTranslations('service');
  const [isPending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  return (
    <div className="text-right">
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(async () => {
          setFailed(false);
          const result = await action(orderItemId);
          setFailed(!result.ok);
        })}
        className="rounded-full border border-[var(--color-sage)]/60 px-3 py-1 text-xs text-[var(--color-sage)] disabled:opacity-50"
      >
        {isPending ? t('markingServed') : t('markServed')}
      </button>
      {failed && <p role="alert" className="mt-1 text-xs text-[var(--color-clay)]">{t('markServedFailed')}</p>}
    </div>
  );
}
