'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

type Props = {
  sessionId: string;
  action: (sessionId: string) => Promise<{ ok: true; billId: string }>;
};

/** Подготовка счёта к оплате (permission REQUEST_PAYMENT). */
export function RequestPaymentButton({ sessionId, action }: Props) {
  const t = useTranslations('service');
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await action(sessionId);
            setDone(true);
          })
        }
        className="rounded-full border border-[var(--color-brass-dim)] px-4 py-1.5 text-sm text-[var(--color-brass)] disabled:opacity-50"
      >
        {t('requestPayment')}
      </button>

      {done && <p className="mt-2 text-xs text-[var(--color-sage)]">{t('paymentRequested')}</p>}
    </div>
  );
}

