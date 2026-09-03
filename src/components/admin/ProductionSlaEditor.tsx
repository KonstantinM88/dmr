'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { MAX_SLA_MINUTES, MIN_SLA_MINUTES } from '@/domains/production/shared/sla';

type Props = {
  itemId?: string;
  warningMinutes: number | null;
  criticalMinutes: number | null;
  action: (payload: unknown) => Promise<{ ok: boolean; reason?: string }>;
};

export function ProductionSlaEditor(props: Props) {
  const t = useTranslations('admin');
  const [warning, setWarning] = useState(props.warningMinutes?.toString() ?? '');
  const [critical, setCritical] = useState(props.criticalMinutes?.toString() ?? '');
  const [result, setResult] = useState<'idle' | 'saved' | 'error'>('idle');
  const [isPending, startTransition] = useTransition();

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setResult('idle');
    startTransition(async () => {
      const response = await props.action({
        ...(props.itemId ? { itemId: props.itemId } : {}),
        warningMinutes: parseOptionalMinutes(warning),
        criticalMinutes: parseOptionalMinutes(critical),
      });
      setResult(response.ok ? 'saved' : 'error');
    });
  };

  return (
    <form onSubmit={submit} className="mt-4 border-t border-[var(--color-ink-800)] pt-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-[var(--color-paper-dim)]">
          <span className="mb-1 block">{t('slaRecommended')}</span>
          <input
            type="number"
            min={MIN_SLA_MINUTES}
            max={MAX_SLA_MINUTES}
            step="1"
            inputMode="numeric"
            value={warning}
            onChange={(event) => setWarning(event.target.value)}
            placeholder="—"
            className="min-h-11 w-full rounded-[var(--radius-card)] border border-[var(--color-ink-700)] bg-[var(--color-ink-950)] px-3 text-[var(--color-paper)]"
          />
        </label>
        <label className="text-xs text-[var(--color-paper-dim)]">
          <span className="mb-1 block">{t('slaCritical')}</span>
          <input
            type="number"
            min={MIN_SLA_MINUTES}
            max={MAX_SLA_MINUTES}
            step="1"
            inputMode="numeric"
            value={critical}
            onChange={(event) => setCritical(event.target.value)}
            placeholder="—"
            className="min-h-11 w-full rounded-[var(--radius-card)] border border-[var(--color-ink-700)] bg-[var(--color-ink-950)] px-3 text-[var(--color-paper)]"
          />
        </label>
      </div>
      <p className="mt-2 text-xs text-[var(--color-paper-faint)]">{t('slaInputHint')}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="min-h-10 rounded-full border border-[var(--color-brass)] px-4 text-sm text-[var(--color-brass)] disabled:opacity-50"
        >
          {isPending ? t('slaSaving') : t('slaSave')}
        </button>
        {result === 'saved' && (
          <span role="status" className="text-xs text-[var(--color-sage)]">{t('slaSaved')}</span>
        )}
        {result === 'error' && (
          <span role="alert" className="text-xs text-[var(--color-clay)]">{t('slaInvalid')}</span>
        )}
      </div>
    </form>
  );
}

function parseOptionalMinutes(value: string): number | null {
  if (value.trim() === '') return null;
  return Number(value);
}
