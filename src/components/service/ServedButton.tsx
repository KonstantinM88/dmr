'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';

type Props = {
  orderItemId: string;
  action: (orderItemId: string) => Promise<{ ok: boolean; reason?: string }>;
};

/** Отметка о подаче позиции (permission MARK_ITEM_SERVED). */
export function ServedButton({ orderItemId, action }: Props) {
  const t = useTranslations('service');
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(async () => void (await action(orderItemId)))}
      className="rounded-full border border-[var(--color-ink-700)] px-3 py-1 text-xs text-[var(--color-paper-dim)] disabled:opacity-50"
    >
      {t('markServed')}
    </button>
  );
}
