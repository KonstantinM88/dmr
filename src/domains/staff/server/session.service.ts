import 'server-only';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { getEnv } from '@/lib/env';
import { generateOpaqueToken, hashToken, hashIp } from '@/lib/hash';
import type { StaffPrincipal } from '@/domains/staff/shared/types';
import type { Permission, RoleCode } from '@/domains/staff/shared/permissions';

export const STAFF_SESSION_COOKIE = 'dmr_staff_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // одна смена

/**
 * Database-backed отзываемые сессии персонала (docs/rbac-matrix.md §3).
 * В cookie кладётся случайный секрет, в БД — только его SHA-256 хеш.
 */
export async function createStaffSession(
  staffUserId: string,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const env = getEnv();
  const token = generateOpaqueToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.staffSession.create({
    data: {
      staffUserId,
      tokenHash: hashToken(token),
      expiresAt,
      ipHash: meta.ip ? hashIp(meta.ip, env.STAFF_SESSION_SECRET) : null,
      userAgent: meta.userAgent?.slice(0, 255) ?? null,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(STAFF_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });

  return { token, expiresAt };
}

/** Возвращает текущего сотрудника или null. Никогда не бросает на анонимном запросе. */
export async function getStaffPrincipal(): Promise<StaffPrincipal | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(STAFF_SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.staffSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      staffUser: {
        include: {
          roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
        },
      },
    },
  });

  if (!session || session.revokedAt !== null || session.expiresAt <= new Date()) return null;
  if (session.staffUser.status !== 'ACTIVE') return null;

  const roles = session.staffUser.roles.map((link) => link.role.code as RoleCode);
  const permissions = new Set<Permission>();
  for (const link of session.staffUser.roles) {
    for (const rp of link.role.permissions) permissions.add(rp.permission.code as Permission);
  }

  return {
    id: session.staffUser.id,
    venueId: session.staffUser.venueId,
    displayName: session.staffUser.displayName,
    email: session.staffUser.email,
    roles,
    permissions: [...permissions],
  };
}

export async function revokeCurrentStaffSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(STAFF_SESSION_COOKIE)?.value;
  cookieStore.delete(STAFF_SESSION_COOKIE);
  if (!token) return;

  await prisma.staffSession.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Массовый отзыв всех сессий сотрудника (смена пароля, увольнение). */
export async function revokeAllSessionsForStaffUser(staffUserId: string): Promise<number> {
  const result = await prisma.staffSession.updateMany({
    where: { staffUserId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}
