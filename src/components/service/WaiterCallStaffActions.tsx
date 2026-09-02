'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';

export function WaiterCallStaffActions(props: {
  callId: string;
  status: 'OPEN' | 'ACKNOWLEDGED';
  acknowledgeAction: (callId: string) => Promise<{ ok: boolean }>;
  resolveAction: (callId: string) => Promise<{ ok: boolean }>;
}) {
  const t = useTranslations('waiterCall');
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      {props.status === 'OPEN' && (
        <button type="button" disabled={pending} onClick={() => startTransition(async () => { await props.acknowledgeAction(props.callId); })} className="rounded-full border border-[var(--color-brass)] px-3 py-1 text-xs text-[var(--color-brass)] disabled:opacity-50">
          {t('acknowledge')}
        </button>
      )}
      <button type="button" disabled={pending} onClick={() => startTransition(async () => { await props.resolveAction(props.callId); })} className="rounded-full bg-[var(--color-sage)] px-3 py-1 text-xs text-[var(--color-ink-950)] disabled:opacity-50">
        {t('resolved')}
      </button>
    </div>
  );
}
