import 'server-only';
import { prisma } from '@/lib/prisma';
import { recordAuditLog } from '@/domains/audit/server/audit.service';

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
