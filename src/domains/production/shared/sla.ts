export const MIN_SLA_MINUTES = 1;
export const MAX_SLA_MINUTES = 240;

export type ProductionSlaThresholds = {
  warningMinutes: number | null;
  criticalMinutes: number | null;
};

export type ProductionSlaSeverity = 'UNCONFIGURED' | 'ON_TRACK' | 'WARNING' | 'CRITICAL';

/** Pure client/server-safe SLA classification; elapsed time is never accepted from a mutation. */
export function classifyProductionSla(
  elapsedMs: number,
  thresholds: ProductionSlaThresholds,
): ProductionSlaSeverity {
  if (thresholds.warningMinutes === null || thresholds.criticalMinutes === null) {
    return 'UNCONFIGURED';
  }

  const elapsedMinutes = Math.max(0, elapsedMs) / 60_000;
  if (elapsedMinutes >= thresholds.criticalMinutes) return 'CRITICAL';
  if (elapsedMinutes >= thresholds.warningMinutes) return 'WARNING';
  return 'ON_TRACK';
}

export function isCompleteSlaThresholds(thresholds: ProductionSlaThresholds): boolean {
  const bothEmpty = thresholds.warningMinutes === null && thresholds.criticalMinutes === null;
  const bothConfigured =
    thresholds.warningMinutes !== null &&
    thresholds.criticalMinutes !== null &&
    Number.isInteger(thresholds.warningMinutes) &&
    Number.isInteger(thresholds.criticalMinutes) &&
    thresholds.warningMinutes >= MIN_SLA_MINUTES &&
    thresholds.criticalMinutes <= MAX_SLA_MINUTES &&
    thresholds.criticalMinutes >= thresholds.warningMinutes;

  return bothEmpty || bothConfigured;
}
