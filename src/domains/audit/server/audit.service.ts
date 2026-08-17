import 'server-only';
import { prisma } from '@/lib/prisma';
import { getEnv } from '@/lib/env';
import { hashIp } from '@/lib/hash';
import type { Prisma } from '@/generated/prisma/client';

type AuditActorType = 'STAFF' | 'SYSTEM' | 'GUEST';

export type AuditInput = {
  venueId?: string | null;
  actorType: AuditActorType;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  previousValue?: Prisma.InputJsonValue;
  newValue?: Prisma.InputJsonValue;
  ip?: string;
};

/**
 * Append-only журнал административных действий (docs/data-model.md §8).
 * Операции update/delete для AuditLog отсутствуют намеренно.
 */
export async function recordAuditLog(input: AuditInput): Promise<void> {
  const env = getEnv();

  await prisma.auditLog.create({
    data: {
      venueId: input.venueId ?? null,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      previousValue: input.previousValue,
      newValue: input.newValue,
      ipHash: input.ip ? hashIp(input.ip, env.STAFF_SESSION_SECRET) : null,
    },
  });
}

export type LifecycleInput = {
  entityType: string;
  entityId: string;
  fromState?: string | null;
  toState: string;
  actorType?: AuditActorType;
  actorId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

/**
 * Журнал переходов state machine. С Этапа 2 вызывается ИСКЛЮЧИТЕЛЬНО внутри
 * той же транзакции, что и сам переход (docs/order-state-machines.md).
 * Поэтому принимает необязательный transaction client.
 */
export async function recordLifecycleEvent(
  input: LifecycleInput,
  tx: Pick<typeof prisma, 'lifecycleEvent'> = prisma,
): Promise<void> {
  await tx.lifecycleEvent.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      fromState: input.fromState ?? null,
      toState: input.toState,
      actorType: input.actorType ?? 'SYSTEM',
      actorId: input.actorId ?? null,
      metadata: input.metadata,
    },
  });
}
