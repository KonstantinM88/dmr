'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

export type TableRow = {
  id: string;
  label: string;
  seats: number | null;
  isActive: boolean;
  hasActiveToken: boolean;
  tokenHistoryCount: number;
};

type Props = {
  tables: TableRow[];
  createAction: (
    payload: unknown,
  ) => Promise<{ ok: true; qrUrl: string } | { ok: false; reason: string }>;
  rotateAction: (tableId: string) => Promise<{ ok: true; qrUrl: string }>;
  setActiveAction: (payload: { tableId: string; isActive: boolean }) => Promise<{ ok: true }>;
};

/**
 * Столы и QR-коды.
 *
 * Новый QR-адрес показывается один раз после создания или ротации — его нужно
 * сразу распечатать. Ротация отзывает предыдущий код: наклейки на столе
 * перестают работать немедленно.
 */
export function TableManager({ tables, createAction, rotateAction, setActiveAction }: Props) {
  const t = useTranslations('tables');
  const [label, setLabel] = useState('');
  const [issuedUrl, setIssuedUrl] = useState<{ label: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="pt-8">
      <div className="rounded-[var(--radius-card)] border border-[var(--color-ink-800)] p-4">
        <label htmlFor="table-label" className="eyebrow block">
          {t('newTableLabel')}
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="table-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={24}
            className="min-w-0 flex-1 rounded-[var(--radius-card)] border border-[var(--color-ink-700)] bg-[var(--color-ink-900)] px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={isPending || label.trim() === ''}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await createAction({ label: label.trim(), seats: null });
                if (result.ok) {
                  setIssuedUrl({ label: label.trim(), url: result.qrUrl });
                  setLabel('');
                } else {
                  setError(result.reason === 'duplicate_label' ? t('duplicateLabel') : t('failed'));
                }
              });
            }}
            className="rounded-full bg-[var(--color-brass)] px-4 py-2 text-sm font-medium text-[var(--color-ink-950)] disabled:opacity-50"
          >
            {t('create')}
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-2 text-sm text-[var(--color-clay)]">
            {error}
          </p>
        )}
      </div>

      {issuedUrl && (
        <div className="mt-4 rounded-[var(--radius-card)] border border-[var(--color-brass-dim)] p-4">
          <p className="eyebrow">{t('newQrFor', { label: issuedUrl.label })}</p>
          <p className="mt-2 break-all font-[family-name:var(--font-mono)] text-sm text-[var(--color-brass)]">
            {issuedUrl.url}
          </p>
          <p className="mt-2 text-xs text-[var(--color-paper-faint)]">{t('showOnce')}</p>
          <button
            type="button"
            onClick={() => setIssuedUrl(null)}
            className="mt-3 rounded-full border border-[var(--color-ink-700)] px-4 py-1.5 text-xs text-[var(--color-paper-dim)]"
          >
            {t('hide')}
          </button>
        </div>
      )}

      <ul className="mt-8 divide-y divide-[var(--color-ink-800)]">
        {tables.map((table) => (
          <li key={table.id} className="flex flex-wrap items-center gap-3 py-3">
            <span className="font-[family-name:var(--font-display)] text-lg">{table.label}</span>

            {!table.isActive && (
              <span className="rounded-full bg-[var(--color-clay)]/15 px-2 py-0.5 text-xs text-[var(--color-clay)]">
                {t('inactive')}
              </span>
            )}

            {!table.hasActiveToken && (
              <span className="text-xs text-[var(--color-clay)]">{t('noActiveToken')}</span>
            )}

            <span className="flex-1 text-xs text-[var(--color-paper-faint)]">
              {t('tokenHistory', { count: table.tokenHistoryCount })}
            </span>

            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  const result = await rotateAction(table.id);
                  setIssuedUrl({ label: table.label, url: result.qrUrl });
                })
              }
              className="rounded-full border border-[var(--color-brass-dim)] px-3 py-1 text-xs text-[var(--color-brass)] disabled:opacity-50"
            >
              {t('rotate')}
            </button>

            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  await setActiveAction({ tableId: table.id, isActive: !table.isActive });
                })
              }
              className="rounded-full border border-[var(--color-ink-700)] px-3 py-1 text-xs text-[var(--color-paper-dim)] disabled:opacity-50"
            >
              {table.isActive ? t('deactivate') : t('activate')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
