import 'server-only';
import { prisma } from '@/lib/prisma';
import { recordAuditLog } from '@/domains/audit/server/audit.service';
import type { ProductionSlaThresholds } from '@/domains/production/shared/sla';
import { isCompleteSlaThresholds } from '@/domains/production/shared/sla';

export const READY_HANDOFF_SLA_SETTING_KEY = 'production.ready_handoff_sla';

export async function getReadyHandoffSlaSettings(
  venueId: string,
): Promise<ProductionSlaThresholds> {
  const setting = await prisma.venueSetting.findUnique({
    where: { venueId_key: { venueId, key: READY_HANDOFF_SLA_SETTING_KEY } },
    select: { value: true },
  });

  const value = setting?.value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { warningMinutes: null, criticalMinutes: null };
  }

  const record = value as Record<string, unknown>;
  const thresholds = {
    warningMinutes:
      typeof record.warningMinutes === 'number' ? record.warningMinutes : null,
    criticalMinutes:
      typeof record.criticalMinutes === 'number' ? record.criticalMinutes : null,
  };

  return isCompleteSlaThresholds(thresholds)
    ? thresholds
    : { warningMinutes: null, criticalMinutes: null };
}

export async function updateReadyHandoffSlaSettings(
  thresholds: ProductionSlaThresholds,
  actor: { staffUserId: string; venueId: string; ip?: string },
): Promise<{ ok: true } | { ok: false; reason: 'invalid_input' }> {
  if (!isCompleteSlaThresholds(thresholds)) {
    return { ok: false, reason: 'invalid_input' };
  }

  const previous = await getReadyHandoffSlaSettings(actor.venueId);
  if (
    previous.warningMinutes === thresholds.warningMinutes &&
    previous.criticalMinutes === thresholds.criticalMinutes
  ) {
    return { ok: true };
  }

  await prisma.$transaction(async (tx) => {
    await tx.venueSetting.upsert({
      where: {
        venueId_key: { venueId: actor.venueId, key: READY_HANDOFF_SLA_SETTING_KEY },
      },
      create: {
        venueId: actor.venueId,
        key: READY_HANDOFF_SLA_SETTING_KEY,
        value: thresholds,
      },
      update: { value: thresholds },
    });
    await recordAuditLog(
      {
        venueId: actor.venueId,
        actorType: 'STAFF',
        actorId: actor.staffUserId,
        action: 'READY_HANDOFF_SLA_CHANGED',
        entityType: 'VenueSetting',
        entityId: READY_HANDOFF_SLA_SETTING_KEY,
        previousValue: previous,
        newValue: thresholds,
        ip: actor.ip,
      },
      tx,
    );
  });

  return { ok: true };
}
