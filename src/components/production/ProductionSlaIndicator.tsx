'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  classifyProductionSla,
  type ProductionSlaThresholds,
  type ProductionSlaSeverity,
} from '@/domains/production/shared/sla';

type Props = ProductionSlaThresholds & {
  since: string;
  mode: 'PREPARATION' | 'HANDOFF';
};

export function ProductionSlaIndicator(props: Props) {
  const t = useTranslations('production');
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const thresholds = {
    warningMinutes: props.warningMinutes,
    criticalMinutes: props.criticalMinutes,
  };
  const severity =
    now === null
      ? props.warningMinutes === null || props.criticalMinutes === null
        ? 'UNCONFIGURED'
        : 'ON_TRACK'
      : classifyProductionSla(now - new Date(props.since).getTime(), thresholds);

  return (
    <p className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs ${severityClass(severity)}`}>
      {t(`slaModes.${props.mode}`)}: {t(`slaStatuses.${severity}`)}
      {props.warningMinutes !== null && props.criticalMinutes !== null
        ? ` · ${t('slaLimits', {
            warning: props.warningMinutes,
            critical: props.criticalMinutes,
          })}`
        : ''}
    </p>
  );
}

function severityClass(severity: ProductionSlaSeverity): string {
  if (severity === 'CRITICAL') {
    return 'bg-[var(--color-clay)]/20 text-[var(--color-clay)]';
  }
  if (severity === 'WARNING') {
    return 'bg-[var(--color-brass)]/20 text-[var(--color-brass)]';
  }
  if (severity === 'ON_TRACK') {
    return 'bg-[var(--color-sage)]/15 text-[var(--color-sage)]';
  }
  return 'bg-[var(--color-ink-850)] text-[var(--color-paper-faint)]';
}
