'use client';

import { useTransition } from 'react';

type Props = {
  tableId: string;
  label: string;
  action: (tableId: string) => Promise<{ ok: true; sessionId: string }>;
};

/** Открытие сессии за свободным столом (permission MANAGE_DINING_SESSION). */
export function OpenSessionButton({ tableId, label, action }: Props) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(async () => void (await action(tableId)))}
      className="rounded-full border border-[var(--color-brass-dim)] px-4 py-1.5 text-sm text-[var(--color-brass)] disabled:opacity-50"
    >
      {label}
    </button>
  );
}
