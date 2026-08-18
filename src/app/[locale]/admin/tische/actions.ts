'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/domains/staff/server/rbac';
import { getEnv } from '@/lib/env';
import {
  buildTableQrUrl,
  createTable,
  rotateTableToken,
  setTableActive,
} from '@/domains/tables/server/table.service';

/**
 * Управление столами и QR-кодами (permission MANAGE_TABLES_QR).
 *
 * Токен возвращается вызывающему ровно один раз — в ответе на создание или
 * ротацию. В списке столов он больше не показывается: повторно получить его
 * можно только новой ротацией, которая отзывает уже напечатанный QR.
 */
async function clientIp(): Promise<string | undefined> {
  const headerList = await headers();
  return headerList.get('x-forwarded-for')?.split(',')[0]?.trim();
}

const createSchema = z.object({
  label: z.string().min(1).max(24),
  seats: z.number().int().min(1).max(40).nullish(),
});

export async function createTableAction(payload: unknown) {
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, reason: 'invalid_input' as const };

  const principal = await requirePermission('MANAGE_TABLES_QR');
  const env = getEnv();

  const result = await createTable(
    { venueId: principal.venueId, label: parsed.data.label, seats: parsed.data.seats ?? null },
    { staffUserId: principal.id, ip: await clientIp() },
  );

  revalidatePath('/[locale]/admin/tische', 'page');

  if (!result.ok) return result;

  return {
    ok: true as const,
    qrUrl: buildTableQrUrl(env.NEXT_PUBLIC_SITE_URL, result.token),
  };
}

export async function rotateTableTokenAction(tableId: string) {
  const principal = await requirePermission('MANAGE_TABLES_QR');
  const env = getEnv();

  const token = await rotateTableToken(tableId, {
    staffUserId: principal.id,
    venueId: principal.venueId,
    ip: await clientIp(),
  });

  revalidatePath('/[locale]/admin/tische', 'page');

  return { ok: true as const, qrUrl: buildTableQrUrl(env.NEXT_PUBLIC_SITE_URL, token) };
}

export async function setTableActiveAction(payload: { tableId: string; isActive: boolean }) {
  const principal = await requirePermission('MANAGE_TABLES_QR');

  await setTableActive(payload.tableId, payload.isActive, {
    staffUserId: principal.id,
    venueId: principal.venueId,
    ip: await clientIp(),
  });

  revalidatePath('/[locale]/admin/tische', 'page');
  return { ok: true as const };
}
