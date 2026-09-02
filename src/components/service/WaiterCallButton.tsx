'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type {
  CallWaiterResult,
  WaiterCallView,
} from '@/domains/service-requests/shared/types';
import { WaitingDuration } from '@/components/service/WaitingDuration';

export function WaiterCallButton(props: {
  initialCall: WaiterCallView | null;
  callAction: () => Promise<CallWaiterResult>;
  cancelAction: (callId: string) => Promise<{ ok: true }>;
}) {
  const t = useTranslations('waiterCall');
  const [call, setCall] = useState(props.initialCall);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (call) {
    return (
      <div className="mt-4 rounded-[var(--radius-card)] border border-[var(--color-brass-dim)] bg-[var(--color-brass)]/5 p-4">
        <p className="text-sm text-[var(--color-brass)]">
          {call.status === 'ACKNOWLEDGED' ? t('acknowledged') : t('waiting')}
        </p>
        <WaitingDuration
          since={call.requestedAt}
          prefix={t('waitTime')}
          className="mt-1 block font-[family-name:var(--font-mono)] text-xs text-[var(--color-paper-dim)]"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await props.cancelAction(call.id);
              setCall(null);
            })
          }
          className="mt-3 text-xs text-[var(--color-paper-dim)] underline underline-offset-4 disabled:opacity-50"
        >
          {t('cancel')}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4">
      {error && <p className="pb-2 text-xs text-[var(--color-clay)]">{error}</p>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await props.callAction();
            if (result.ok) setCall(result.call);
            else setError(t(result.reason === 'rate_limited' ? 'rateLimited' : 'failed'));
          })
        }
        className="rounded-full border border-[var(--color-brass)] px-4 py-2 text-sm text-[var(--color-brass)] disabled:opacity-50"
      >
        {pending ? t('calling') : t('button')}
      </button>
    </div>
  );
}
