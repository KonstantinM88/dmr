import 'server-only';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@/generated/prisma/client';

/**
 * Append-only журнал финансовых операций (docs/data-model.md §6).
 * Отдельно от общего AuditLog: у бухгалтера свой разрез и свои разрешения.
 * Операций update/delete здесь нет намеренно.
 */
export type FinancialEventInput = {
  venueId?: string | null;
  billId?: string | null;
  paymentId?: string | null;
  action: string;
  actorType?: 'STAFF' | 'SYSTEM' | 'GUEST';
  actorId?: string | null;
  amountCents?: number | null;
  currency?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export async function recordFinancialEvent(
  input: FinancialEventInput,
  tx: Pick<typeof prisma, 'financialAuditEvent'> = prisma,
): Promise<void> {
  await tx.financialAuditEvent.create({
    data: {
      venueId: input.venueId ?? null,
      billId: input.billId ?? null,
      paymentId: input.paymentId ?? null,
      action: input.action,
      actorType: input.actorType ?? 'SYSTEM',
      actorId: input.actorId ?? null,
      amountCents: input.amountCents ?? null,
      currency: input.currency ?? null,
      metadata: input.metadata,
    },
  });
}

