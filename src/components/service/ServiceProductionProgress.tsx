import { getTranslations } from 'next-intl/server';
import type { ServiceProductionItem } from '@/domains/sessions/shared/types';
import { WaitingDuration } from '@/components/service/WaitingDuration';
import { ServedButton } from '@/components/service/ServedButton';
import { ProductionSlaIndicator } from '@/components/production/ProductionSlaIndicator';
import type { ProductionSlaThresholds } from '@/domains/production/shared/sla';

type Props = {
  items: ServiceProductionItem[];
  canMarkServed: boolean;
  action: (orderItemId: string) => Promise<{ ok: boolean; reason?: string }>;
  readyHandoffSla: ProductionSlaThresholds;
};

/** Общая waiter-картина незавершённых позиций кухни и бара. */
export async function ServiceProductionProgress({
  items,
  canMarkServed,
  action,
  readyHandoffSla,
}: Props) {
  const t = await getTranslations('service');
  const production = await getTranslations('production');

  if (items.length === 0) return null;

  return (
    <section
      className="mt-3 rounded-[var(--radius-card)] border border-[var(--color-ink-700)] bg-[var(--color-ink-900)]/60 p-3"
    >
      <div aria-live="polite" className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm text-[var(--color-paper)]">{t('productionControl')}</h3>
        <span className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-paper-faint)]">
          {t('productionOpenCount', { count: items.length })}
        </span>
      </div>
      <ul className="mt-2 divide-y divide-[var(--color-ink-800)]">
        {items.map((item) => {
          const ready = item.ticketStatus === 'READY';
          const station = production(stationTranslationKey(item.stationKind));
          return (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-[var(--color-paper-dim)]">
                  {item.quantity} × {item.name}
                </p>
                <p className={`mt-1 text-xs ${statusColor(item.ticketStatus)}`}>
                  {t(`productionStatuses.${item.ticketStatus}`, { station })}
                </p>
                <WaitingDuration
                  since={item.statusSince}
                  prefix={t('productionStatusDuration')}
                  className="mt-1 block font-[family-name:var(--font-mono)] text-xs text-[var(--color-paper-faint)]"
                />
                <ProductionSlaIndicator
                  since={ready ? item.statusSince : item.queuedAt}
                  mode={ready ? 'HANDOFF' : 'PREPARATION'}
                  warningMinutes={
                    ready ? readyHandoffSla.warningMinutes : item.recommendedPreparationMinutes
                  }
                  criticalMinutes={
                    ready ? readyHandoffSla.criticalMinutes : item.criticalPreparationMinutes
                  }
                />
              </div>
              {ready && canMarkServed && (
                <ServedButton orderItemId={item.id} action={action} />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function stationTranslationKey(kind: ServiceProductionItem['stationKind']): 'kitchen' | 'bar' | 'other' {
  if (kind === 'KITCHEN') return 'kitchen';
  if (kind === 'BAR') return 'bar';
  return 'other';
}

function statusColor(status: ServiceProductionItem['ticketStatus']): string {
  if (status === 'QUEUED') return 'text-[var(--color-clay)]';
  if (status === 'READY') return 'text-[var(--color-sage)]';
  return 'text-[var(--color-brass)]';
}
