import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/hash';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { createStaffSession } from '@/domains/staff/server/session.service';
import { recordAuditLog } from '@/domains/audit/server/audit.service';

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
});

export type LoginInput = z.infer<typeof loginSchema>;

export type LoginResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_credentials' | 'locked' | 'rate_limited' };

const MAX_FAILED_LOGINS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const LOGIN_RATE_LIMIT = 10;
const LOGIN_RATE_WINDOW_MS = 5 * 60 * 1000;

/**
 * Логин сотрудника (docs/security-threat-model.md §2 «Брутфорс staff-логина»).
 * Ответ намеренно одинаков для несуществующего пользователя и неверного
 * пароля — чтобы не раскрывать существование учётной записи.
 */
export async function login(
  input: LoginInput,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<LoginResult> {
  const email = input.email.trim().toLowerCase();

  const limit = checkRateLimit(`login:${meta.ip ?? 'unknown'}`, LOGIN_RATE_LIMIT, LOGIN_RATE_WINDOW_MS);
  if (!limit.allowed) {
    logger.warn('Login rate limit exceeded', { email });
    return { ok: false, reason: 'rate_limited' };
  }

  const user = await prisma.staffUser.findUnique({ where: { email } });

  if (!user || user.status !== 'ACTIVE') {
    logger.warn('Failed staff login', { email, cause: 'unknown_or_inactive_user' });
    return { ok: false, reason: 'invalid_credentials' };
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { ok: false, reason: 'locked' };
  }

  const passwordOk = await verifyPassword(input.password, user.passwordHash);

  if (!passwordOk) {
    const failedLoginCount = user.failedLoginCount + 1;
    const lockedUntil =
      failedLoginCount >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_DURATION_MS) : null;

    await prisma.staffUser.update({
      where: { id: user.id },
      data: { failedLoginCount, lockedUntil },
    });

    await recordAuditLog({
      venueId: user.venueId,
      actorType: 'STAFF',
      actorId: user.id,
      action: 'STAFF_LOGIN_FAILED',
      entityType: 'StaffUser',
      entityId: user.id,
      ip: meta.ip,
    });

    return { ok: false, reason: lockedUntil ? 'locked' : 'invalid_credentials' };
  }

  await prisma.staffUser.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  await createStaffSession(user.id, meta);

  await recordAuditLog({
    venueId: user.venueId,
    actorType: 'STAFF',
    actorId: user.id,
    action: 'STAFF_LOGIN_SUCCEEDED',
    entityType: 'StaffUser',
    entityId: user.id,
    ip: meta.ip,
  });

  return { ok: true };
}
