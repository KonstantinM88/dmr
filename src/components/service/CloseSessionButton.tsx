'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';

export function CloseSessionButton(props: {
  sessionId: string;
  action: (sessionId: string) => Promise<{ ok: true }>;
}) {
  const t = useTranslations('service');
  const [pending, startTransition] = useTransition();
  return <button type="button" disabled={pending} onClick={() => startTransition(async () => { await props.action(props.sessionId); })} className="mt-4 w-full rounded-full bg-[var(--color-sage)] px-4 py-2.5 text-sm text-[var(--color-ink-950)] disabled:opacity-50">{pending ? t('closingTable') : t('closeTable')}</button>;
}
