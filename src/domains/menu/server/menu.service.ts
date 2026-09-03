import 'server-only';
import { prisma } from '@/lib/prisma';
import { recordAuditLog } from '@/domains/audit/server/audit.service';
import type { ProductionSlaThresholds } from '@/domains/production/shared/sla';
import { isCompleteSlaThresholds } from '@/domains/production/shared/sla';

export async function setMenuItemAvailability(
  itemId: string,
  isAvailable: boolean,
  actor: { staffUserId: string; venueId: string; ip?: string },
): Promise<{ ok: true } | { ok: false; reason: 'not_found' }> {
  const item = await prisma.menuItem.findFirst({
    where: { id: itemId, venueId: actor.venueId },
    select: { id: true, isAvailable: true },
  });
  if (!item) return { ok: false, reason: 'not_found' };

  if (item.isAvailable !== isAvailable) {
    await prisma.menuItem.update({ where: { id: item.id }, data: { isAvailable } });
    await recordAuditLog({
      venueId: actor.venueId,
      actorType: 'STAFF',
      actorId: actor.staffUserId,
      action: 'MENU_ITEM_AVAILABILITY_CHANGED',
      entityType: 'MenuItem',
      entityId: item.id,
      previousValue: { isAvailable: item.isAvailable },
      newValue: { isAvailable },
      ip: actor.ip,
    });
  }

  return { ok: true };
}

export async function updateMenuItemPreparationSla(
  itemId: string,
  thresholds: ProductionSlaThresholds,
  actor: { staffUserId: string; venueId: string; ip?: string },
): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'invalid_input' }> {
  if (!isCompleteSlaThresholds(thresholds)) {
    return { ok: false, reason: 'invalid_input' };
  }

  const item = await prisma.menuItem.findFirst({
    where: { id: itemId, venueId: actor.venueId },
    select: {
      id: true,
      recommendedPreparationMinutes: true,
      criticalPreparationMinutes: true,
    },
  });
  if (!item) return { ok: false, reason: 'not_found' };

  const previous = {
    warningMinutes: item.recommendedPreparationMinutes,
    criticalMinutes: item.criticalPreparationMinutes,
  };
  if (
    previous.warningMinutes === thresholds.warningMinutes &&
    previous.criticalMinutes === thresholds.criticalMinutes
  ) {
    return { ok: true };
  }

  await prisma.$transaction(async (tx) => {
    await tx.menuItem.update({
      where: { id: item.id },
      data: {
        recommendedPreparationMinutes: thresholds.warningMinutes,
        criticalPreparationMinutes: thresholds.criticalMinutes,
      },
    });
    await recordAuditLog(
      {
        venueId: actor.venueId,
        actorType: 'STAFF',
        actorId: actor.staffUserId,
        action: 'MENU_ITEM_PREPARATION_SLA_CHANGED',
        entityType: 'MenuItem',
        entityId: item.id,
        previousValue: previous,
        newValue: thresholds,
        ip: actor.ip,
      },
      tx,
    );
  });

  return { ok: true };
}
