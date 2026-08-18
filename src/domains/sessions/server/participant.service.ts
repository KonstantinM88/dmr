import 'server-only';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { getEnv } from '@/lib/env';
import { generateOpaqueToken, hashToken } from '@/lib/hash';

export const PARTICIPANT_COOKIE = 'dmr_participant';

export type ParticipantIdentity = {
  id: string;
  sessionId: string;
  seatLabel: string | null;
};

/**
 * Анонимный участник = одно устройство за столом (docs/data-model.md §2).
 * Персональных данных нет; в cookie кладётся случайный секрет, в БД хранится
 * только его SHA-256 хеш. Cookie привязана к конкретной сессии стола:
 * при новой сессии участник создаётся заново.
 */
export async function getCurrentParticipant(
  sessionId: string,
): Promise<ParticipantIdentity | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PARTICIPANT_COOKIE)?.value;
  if (!token) return null;

  const participant = await prisma.sessionParticipant.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, sessionId: true, seatLabel: true },
  });

  if (!participant || participant.sessionId !== sessionId) return null;
  return participant;
}

export async function getOrCreateParticipant(sessionId: string): Promise<ParticipantIdentity> {
  const existing = await getCurrentParticipant(sessionId);
  if (existing) {
    await prisma.sessionParticipant.update({
      where: { id: existing.id },
      data: { lastSeenAt: new Date() },
    });
    return existing;
  }

  const env = getEnv();
  const token = generateOpaqueToken(24);

  const participant = await prisma.sessionParticipant.create({
    data: { sessionId, tokenHash: hashToken(token), lastSeenAt: new Date() },
    select: { id: true, sessionId: true, seatLabel: true },
  });

  const cookieStore = await cookies();
  cookieStore.set(PARTICIPANT_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8,
  });

  return participant;
}

/** Создаёт служебного участника для ручного заказа официанта. */
export async function createStaffProxyParticipant(sessionId: string): Promise<string> {
  const participant = await prisma.sessionParticipant.create({
    data: {
      sessionId,
      tokenHash: hashToken(generateOpaqueToken(24)),
      isStaffProxy: true,
      displayLabel: 'Service',
    },
    select: { id: true },
  });
  return participant.id;
}
