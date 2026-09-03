import 'server-only';
import { prisma } from '@/lib/prisma';
import { recordAuditLog } from '@/domains/audit/server/audit.service';
import { getMediaStorage } from '@/domains/media/server/storage.adapter';
import { processMenuMedia } from '@/domains/media/server/media-processor';

type MediaActor = { staffUserId: string; venueId: string; ip?: string };

export async function uploadMenuMedia(
  itemId: string,
  file: File,
  altText: string,
  actor: MediaActor,
) {
  const item = await prisma.menuItem.findFirst({
    where: { id: itemId, venueId: actor.venueId },
    select: { id: true, _count: { select: { media: true } } },
  });
  if (!item) return { ok: false as const, reason: 'not_found' as const };
  if (item._count.media >= 12) return { ok: false as const, reason: 'media_limit' as const };

  const processed = await processMenuMedia(file);
  const storage = getMediaStorage();
  try {
    const asset = await prisma.$transaction(async (tx) => {
      const created = await tx.mediaAsset.create({
        data: {
          itemId: item.id,
          kind: processed.kind,
          status: 'READY',
          url: processed.url,
          posterUrl: processed.posterUrl,
          width: processed.width,
          height: processed.height,
          durationMs: processed.durationMs,
          byteSize: processed.byteSize,
          mimeType: processed.mimeType,
          altText: altText.trim() || null,
          sortOrder: item._count.media,
        },
        select: { id: true },
      });
      await recordAuditLog(
        {
          venueId: actor.venueId,
          actorType: 'STAFF',
          actorId: actor.staffUserId,
          action: 'MENU_MEDIA_UPLOADED',
          entityType: 'MediaAsset',
          entityId: created.id,
          newValue: {
            itemId: item.id,
            kind: processed.kind,
            mimeType: processed.mimeType,
            byteSize: processed.byteSize,
          },
          ip: actor.ip,
        },
        tx,
      );
      return created;
    });
    return { ok: true as const, id: asset.id };
  } catch (error) {
    await Promise.allSettled(processed.storageKeys.map((key) => storage.deleteObject(key)));
    throw error;
  }
}

export async function deleteMenuMedia(mediaId: string, actor: MediaActor) {
  const asset = await prisma.mediaAsset.findFirst({
    where: { id: mediaId, item: { venueId: actor.venueId } },
    select: { id: true, itemId: true, kind: true, url: true, posterUrl: true },
  });
  if (!asset) return { ok: false as const, reason: 'not_found' as const };

  const storage = getMediaStorage();
  const keys = [asset.url, asset.posterUrl]
    .filter((url): url is string => Boolean(url?.startsWith('/uploads/')))
    .map((url) => url.slice('/uploads/'.length));
  await Promise.all(keys.map((key) => storage.deleteObject(key)));

  await prisma.$transaction(async (tx) => {
    await tx.mediaAsset.delete({ where: { id: asset.id } });
    await recordAuditLog(
      {
        venueId: actor.venueId,
        actorType: 'STAFF',
        actorId: actor.staffUserId,
        action: 'MENU_MEDIA_DELETED',
        entityType: 'MediaAsset',
        entityId: asset.id,
        previousValue: { itemId: asset.itemId, kind: asset.kind },
        ip: actor.ip,
      },
      tx,
    );
  });
  return { ok: true as const };
}
