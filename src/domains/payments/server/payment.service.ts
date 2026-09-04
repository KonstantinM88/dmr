import 'server-only';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import { addCents } from '@/lib/money';
import { getStripe, isPaymentsAvailable } from '@/domains/payments/server/stripe.client';
import { isAttemptActive } from '@/domains/payments/server/payment-state-machine';
import {
  loadBillableItems,
  recalculateBill,
} from '@/domains/billing/server/bill.service';
import {
  AllocationError,
  planSelectedItemQuantityAllocations,
  planSelectedItemRemainderAllocations,
  type ItemQuantitySelection,
  type PlannedUnitAllocation,
} from '@/domains/billing/shared/allocation';
import { resolveGuestTableAccess } from '@/domains/tables/server/guest-table-access.service';
import {
  getActiveSessionForTable,
  transitionSessionInTransaction,
} from '@/domains/sessions/server/session.service';
import type { ActiveSession } from '@/domains/sessions/server/session.service';
import { getCurrentParticipant } from '@/domains/sessions/server/participant.service';
import { recordFinancialEvent } from '@/domains/payments/server/financial-audit.service';
import type {
  ConfirmCashPaymentResult,
  StartCashPaymentResult,
  StartPaymentResult,
} from '@/domains/payments/shared/types';
import { Prisma, type PaymentAttempt, type PaymentMethod } from '@/generated/prisma/client';
import { calculateChangeCents } from '@/domains/payments/shared/cash';

const PAYMENT_RATE_LIMIT = 8;
const PAYMENT_RATE_WINDOW_MS = 5 * 60 * 1000;
const ATTEMPT_RESERVATION_MS = 20 * 60 * 1000;
const FINANCIAL_TRANSACTION_OPTIONS = { maxWait: 5_000, timeout: 20_000 } as const;

type AttemptWithPlan = PaymentAttempt & {
  plannedAllocations: Array<{
    orderItemId: string;
    amountCents: number;
    quantity: number;
    expectedRemainingCents: number;
  }>;
};

type PreparedAttempt =
  | { ok: true; attempt: AttemptWithPlan; session: ActiveSession; reused: boolean }
  | {
      ok: false;
      reason:
        | 'no_table'
        | 'no_session'
        | 'nothing_to_pay'
        | 'session_not_payable'
        | 'attempt_in_progress'
        | 'invalid_selection'
        | 'rate_limited';
    };

/** Карточная оплата выбранных позиций. Итог по-прежнему подтверждает webhook. */
export async function startStripePayment(context: {
  tableAccess: string | undefined;
  selectedItemIds: string[];
  ip?: string;
}): Promise<StartPaymentResult> {
  if (!isPaymentsAvailable()) {
    logger.warn('Payment attempt while Stripe is not configured');
    return { ok: false, reason: 'provider_unavailable' };
  }

  const prepared = await prepareGuestAttempt({ ...context, method: 'STRIPE' });
  if (!prepared.ok) return prepared;
  return provisionStripeIntent(prepared.attempt, prepared.session, prepared.reused);
}

/** Запрос расчёта наличными. Платёж появится только после подтверждения staff. */
export async function startCashPayment(context: {
  tableAccess: string | undefined;
  selectedItemIds: string[];
  ip?: string;
}): Promise<StartCashPaymentResult> {
  const prepared = await prepareGuestAttempt({ ...context, method: 'CASH' });
  if (!prepared.ok) return prepared;
  return {
    ok: true,
    attemptId: prepared.attempt.id,
    amountCents: prepared.attempt.amountCents,
    currency: prepared.attempt.currency,
    reused: prepared.reused,
  };
}

/** Официант начинает наличный расчёт без предварительного guest-клика. */
export async function startCashPaymentByStaff(context: {
  sessionId: string;
  selectedItems: ItemQuantitySelection[];
  staffUserId: string;
  venueId: string;
  ip?: string;
}): Promise<StartCashPaymentResult> {
  const prepared = await prepareAttempt({
    selectedItems: context.selectedItems,
    method: 'CASH',
    ip: context.ip,
    actor: {
      type: 'STAFF',
      sessionId: context.sessionId,
      staffUserId: context.staffUserId,
      venueId: context.venueId,
    },
  });
  if (!prepared.ok) return prepared;
  return {
    ok: true,
    attemptId: prepared.attempt.id,
    amountCents: prepared.attempt.amountCents,
    currency: prepared.attempt.currency,
    reused: prepared.reused,
  };
}

async function prepareGuestAttempt(context: {
  tableAccess: string | undefined;
  selectedItemIds: string[];
  method: Extract<PaymentMethod, 'STRIPE' | 'CASH'>;
  ip?: string;
}): Promise<PreparedAttempt> {
  return prepareAttempt({
    selectedItemIds: context.selectedItemIds,
    method: context.method,
    ip: context.ip,
    actor: { type: 'GUEST', tableAccess: context.tableAccess },
  });
}

async function prepareAttempt(context: {
  selectedItemIds?: string[];
  selectedItems?: ItemQuantitySelection[];
  method: Extract<PaymentMethod, 'STRIPE' | 'CASH'>;
  ip?: string;
  actor:
    | { type: 'GUEST'; tableAccess: string | undefined }
    | { type: 'STAFF'; sessionId: string; staffUserId: string; venueId: string };
}): Promise<PreparedAttempt> {
  let session: ActiveSession | null = null;

  if (context.actor.type === 'GUEST') {
    if (!context.actor.tableAccess) return { ok: false, reason: 'no_table' };
    const access = await resolveGuestTableAccess(context.actor.tableAccess);
    if (access.status !== 'valid') return { ok: false, reason: 'no_table' };
    const table = access.table;
    session = await getActiveSessionForTable(table.tableId);
  } else {
    const staffSession = await prisma.diningSession.findFirst({
      where: { id: context.actor.sessionId, venueId: context.actor.venueId },
      include: { table: { select: { label: true } } },
    });
    if (staffSession) {
      session = {
        id: staffSession.id,
        venueId: staffSession.venueId,
        tableId: staffSession.tableId,
        tableLabel: staffSession.table.label,
        status: staffSession.status,
        reorderApprovalMode: staffSession.reorderApprovalMode,
        openedAt: staffSession.openedAt,
      };
    }
  }

  if (!session) return { ok: false, reason: 'no_session' };

  const limit = checkRateLimit(
    `pay:${context.actor.type.toLowerCase()}:${session.tableId}:${context.method}`,
    PAYMENT_RATE_LIMIT,
    PAYMENT_RATE_WINDOW_MS,
  );
  if (!limit.allowed) return { ok: false, reason: 'rate_limited' };

  if (!['OPEN', 'PARTIALLY_PAID', 'PAYMENT_PENDING'].includes(session.status)) {
    return { ok: false, reason: 'session_not_payable' };
  }

  const { billId, totals } = await recalculateBill(session.id);
  if (totals.remainingCents <= 0) return { ok: false, reason: 'nothing_to_pay' };

  const items = await loadBillableItems(session.id);
  let allocations: PlannedUnitAllocation[];
  try {
    const unitItems = items.map((item) => ({
        orderItemId: item.id,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        lineTotalCents: item.lineTotalCents,
        allocatedPaidCents: item.allocatedPaidCents,
        taxRateBasisPoints: item.taxRateBasisPoints,
        taxAmountCents: item.taxAmountCents,
      }));
    allocations = context.selectedItems
      ? planSelectedItemQuantityAllocations(unitItems, context.selectedItems)
      : planSelectedItemRemainderAllocations(unitItems, context.selectedItemIds ?? []);
  } catch (error) {
    if (error instanceof AllocationError) return { ok: false, reason: 'invalid_selection' };
    throw error;
  }
  const amountCents = addCents(...allocations.map((entry) => entry.amountCents));

  const active = await findActiveAttempt(billId);
  if (active) {
    const expired = active.reservedUntil !== null && active.reservedUntil.getTime() <= Date.now();
    if (!expired) {
      if (active.method === context.method && samePlan(active.plannedAllocations, allocations)) {
        return { ok: true, attempt: active, session, reused: true };
      }
      return { ok: false, reason: 'attempt_in_progress' };
    }
    await cancelAttempt(active.id, 'reservation_expired');
  }

  const participant =
    context.actor.type === 'GUEST' ? await getCurrentParticipant(session.id) : null;
  const idempotencyKey = `bill_${billId}_${context.method.toLowerCase()}_${randomUUID()}`;

  try {
    const attempt = await prisma.$transaction(async (tx) => {
      const created = await tx.paymentAttempt.create({
        data: {
          billId,
          method: context.method,
          status: context.method === 'CASH' ? 'PENDING' : 'CREATED',
          amountCents,
          currency: 'EUR',
          idempotencyKey,
          reservedUntil: new Date(Date.now() + ATTEMPT_RESERVATION_MS),
          createdByParticipantId: participant?.id ?? null,
          plannedAllocations: { create: allocations },
        },
        include: { plannedAllocations: true },
      });

      await tx.bill.update({ where: { id: billId }, data: { status: 'PAYMENT_PENDING' } });
      const currentSession = await tx.diningSession.findUniqueOrThrow({
        where: { id: session.id },
        select: { status: true },
      });
      if (currentSession.status === 'OPEN' || currentSession.status === 'PARTIALLY_PAID') {
        await transitionSessionInTransaction(
          session.id,
          'PAYMENT_PENDING',
          {
            actorType: context.actor.type,
            staffUserId:
              context.actor.type === 'STAFF' ? context.actor.staffUserId : undefined,
          },
          tx,
        );
      } else if (currentSession.status !== 'PAYMENT_PENDING') {
        throw new Error('Dining session is no longer payable.');
      }

      await recordFinancialEvent(
        {
          venueId: session.venueId,
          billId,
          action:
            context.actor.type === 'STAFF'
              ? 'CASH_PAYMENT_STARTED_BY_STAFF'
              : context.method === 'CASH'
                ? 'CASH_PAYMENT_REQUESTED'
                : 'PAYMENT_ATTEMPT_CREATED',
          actorType: context.actor.type,
          actorId: context.actor.type === 'STAFF' ? context.actor.staffUserId : null,
          amountCents,
          currency: 'EUR',
          metadata: {
            attemptId: created.id,
            allocations: allocations.map((entry) => ({
              orderItemId: entry.orderItemId,
              quantity: entry.quantity,
              amountCents: entry.amountCents,
            })),
          },
        },
        tx,
      );
      return created;
    }, FINANCIAL_TRANSACTION_OPTIONS);
    return { ok: true, attempt, session, reused: false };
  } catch (error) {
    const winner = await findActiveAttempt(billId);
    if (!winner) throw error;
    if (winner.method === context.method && samePlan(winner.plannedAllocations, allocations)) {
      return { ok: true, attempt: winner, session, reused: true };
    }
    return { ok: false, reason: 'attempt_in_progress' };
  }
}

async function findActiveAttempt(billId: string): Promise<AttemptWithPlan | null> {
  return prisma.paymentAttempt.findFirst({
    where: { billId, status: { in: ['CREATED', 'PENDING'] } },
    orderBy: { createdAt: 'desc' },
    include: { plannedAllocations: true },
  });
}

function samePlan(
  current: Array<{ orderItemId: string; amountCents: number; quantity: number }>,
  requested: PlannedUnitAllocation[],
): boolean {
  const normalize = (
    entries: Array<{ orderItemId: string; amountCents: number; quantity: number }>,
  ) => entries
    .map((entry) => `${entry.orderItemId}:${entry.quantity}:${entry.amountCents}`)
    .sort()
    .join('|');
  return normalize(current) === normalize(requested);
}

async function provisionStripeIntent(
  attempt: AttemptWithPlan,
  session: ActiveSession,
  reused: boolean,
): Promise<StartPaymentResult> {
  try {
    const stripe = getStripe();
    const intent = attempt.providerRef
      ? await stripe.paymentIntents.retrieve(attempt.providerRef)
      : await stripe.paymentIntents.create(
          {
            amount: attempt.amountCents,
            currency: attempt.currency.toLowerCase(),
            automatic_payment_methods: { enabled: true },
            metadata: {
              billId: attempt.billId,
              attemptId: attempt.id,
              sessionId: session.id,
              tableLabel: session.tableLabel,
            },
          },
          { idempotencyKey: attempt.idempotencyKey },
        );

    if (!intent.client_secret || intent.status === 'canceled') {
      await cancelAttempt(attempt.id, 'provider_intent_unusable');
      return { ok: false, reason: 'provider_unavailable' };
    }
    if (intent.status === 'succeeded' || intent.status === 'processing') {
      return { ok: false, reason: 'attempt_in_progress' };
    }

    const promoted = await prisma.paymentAttempt.updateMany({
      where: {
        id: attempt.id,
        status: { in: ['CREATED', 'PENDING'] },
        OR: [{ providerRef: null }, { providerRef: intent.id }],
      },
      data: { status: 'PENDING', providerRef: intent.id },
    });
    if (promoted.count !== 1) return { ok: false, reason: 'attempt_in_progress' };

    return {
      ok: true,
      attemptId: attempt.id,
      clientSecret: intent.client_secret,
      amountCents: attempt.amountCents,
      currency: attempt.currency,
      reused,
    };
  } catch (error) {
    logger.error('Failed to provision payment intent', { error: String(error) });
    return { ok: false, reason: 'provider_unavailable' };
  }
}

/** Подтверждение наличных выполняет только staff с REGISTER_CASH_PAYMENT. */
export async function confirmCashPayment(
  input: { attemptId: string; receivedCents: number },
  actor: { staffUserId: string; venueId: string },
): Promise<ConfirmCashPaymentResult> {
  if (!Number.isSafeInteger(input.receivedCents) || input.receivedCents <= 0) {
    return { ok: false, reason: 'invalid_amount' };
  }

  return prisma.$transaction(async (tx) => {
    const attempt = await tx.paymentAttempt.findFirst({
      where: {
        id: input.attemptId,
        method: 'CASH',
        status: 'PENDING',
        bill: { session: { venueId: actor.venueId } },
      },
      include: {
        plannedAllocations: true,
        bill: { select: { id: true, sessionId: true, currency: true } },
      },
    });
    if (!attempt) return { ok: false, reason: 'not_found' } as const;
    if (input.receivedCents < attempt.amountCents) {
      return { ok: false, reason: 'invalid_amount' } as const;
    }
    const settlementChange = calculateChangeCents(attempt.amountCents, input.receivedCents);

    if (attempt.plannedAllocations.length === 0) {
      return { ok: false, reason: 'attempt_changed' } as const;
    }

    const payment = await tx.payment.create({
      data: {
        billId: attempt.billId,
        attemptId: attempt.id,
        method: 'CASH',
        status: 'SUCCEEDED',
        amountCents: attempt.amountCents,
        currency: attempt.currency,
        allocations: {
          create: attempt.plannedAllocations.map((entry) => ({
            orderItemId: entry.orderItemId,
            amountCents: entry.amountCents,
            quantity: entry.quantity,
          })),
        },
      },
      select: { id: true },
    });

    // Один conditional UPDATE вместо N последовательных round-trip к Neon.
    // Каждая строка обновляется только если её текущий остаток совпадает со
    // snapshot плана; частичное quantity не ослабляет optimistic concurrency.
    const allocationRows = attempt.plannedAllocations.map((plan) =>
      Prisma.sql`(${plan.orderItemId}::text, ${plan.amountCents}::integer, ${plan.quantity}::integer, ${plan.expectedRemainingCents}::integer)`,
    );
    const updatedItemCount = await tx.$executeRaw(Prisma.sql`
      UPDATE "order_items" AS item
      SET
        "allocatedPaidCents" = item."allocatedPaidCents" + plan."amountCents",
        "remainingCents" = item."remainingCents" - plan."amountCents",
        "updatedAt" = CURRENT_TIMESTAMP
      FROM (VALUES ${Prisma.join(allocationRows)})
        AS plan("orderItemId", "amountCents", "quantity", "expectedRemainingCents")
      WHERE item."id" = plan."orderItemId"
        AND item."remainingCents" = plan."expectedRemainingCents"
        AND plan."amountCents" = item."unitPriceCents" * plan."quantity"
        AND plan."amountCents" <= item."remainingCents"
    `);
    if (updatedItemCount !== attempt.plannedAllocations.length) {
      throw new Error('Concurrent cash allocation detected.');
    }

    const completed = await tx.paymentAttempt.updateMany({
      where: { id: attempt.id, status: 'PENDING' },
      data: { status: 'SUCCEEDED', reservedUntil: null },
    });
    if (completed.count !== 1) throw new Error('Cash attempt changed concurrently.');

    await tx.cashSettlement.create({
      data: {
        billId: attempt.billId,
        paymentId: payment.id,
        method: 'CASH',
        amountCents: attempt.amountCents,
        receivedCents: input.receivedCents,
        changeCents: settlementChange,
        currency: attempt.currency,
        staffUserId: actor.staffUserId,
      },
    });

    await recordFinancialEvent(
      {
        venueId: actor.venueId,
        billId: attempt.billId,
        paymentId: payment.id,
        action: 'CASH_PAYMENT_CONFIRMED',
        actorType: 'STAFF',
        actorId: actor.staffUserId,
        amountCents: attempt.amountCents,
        currency: attempt.currency,
        metadata: { attemptId: attempt.id, receivedCents: input.receivedCents },
      },
      tx,
    );

    const { totals } = await recalculateBill(attempt.bill.sessionId, tx);
    const target = totals.remainingCents === 0 ? 'PAID' : 'PARTIALLY_PAID';
    const session = await tx.diningSession.findUniqueOrThrow({
      where: { id: attempt.bill.sessionId },
      select: { status: true },
    });
    if (session.status === 'PAYMENT_PENDING') {
      await transitionSessionInTransaction(
        attempt.bill.sessionId,
        target,
        { actorType: 'STAFF', staffUserId: actor.staffUserId },
        tx,
      );
    }
    return { ok: true, paymentId: payment.id, fullyPaid: totals.remainingCents === 0 } as const;
  }, FINANCIAL_TRANSACTION_OPTIONS);
}

async function cancelAttempt(attemptId: string, reason: string): Promise<void> {
  const attempt = await prisma.paymentAttempt.findUnique({
    where: { id: attemptId },
    include: { bill: { select: { sessionId: true } } },
  });
  if (!attempt || !isAttemptActive(attempt.status)) return;

  if (attempt.method === 'STRIPE' && attempt.providerRef && isPaymentsAvailable()) {
    try {
      await getStripe().paymentIntents.cancel(attempt.providerRef);
    } catch (error) {
      try {
        const current = await getStripe().paymentIntents.retrieve(attempt.providerRef);
        if (current.status !== 'canceled') return;
      } catch (retrieveError) {
        logger.warn('Payment intent cancellation status unknown', {
          error: String(error),
          retrieveError: String(retrieveError),
        });
        return;
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    const cancelled = await tx.paymentAttempt.updateMany({
      where: { id: attemptId, status: { in: ['CREATED', 'PENDING'] } },
      data: { status: 'CANCELLED', failureCode: reason, reservedUntil: null },
    });
    if (cancelled.count !== 1) return;

    const { totals } = await recalculateBill(attempt.bill.sessionId, tx);
    const session = await tx.diningSession.findUnique({
      where: { id: attempt.bill.sessionId },
      select: { status: true },
    });
    if (session?.status === 'PAYMENT_PENDING') {
      await transitionSessionInTransaction(
        attempt.bill.sessionId,
        totals.paidCents > 0 ? 'PARTIALLY_PAID' : 'OPEN',
        { actorType: 'SYSTEM' },
        tx,
      );
    }
  });
}

export async function cancelGuestAttempt(input: {
  attemptId: string;
  tableAccess: string | undefined;
}): Promise<void> {
  if (!input.tableAccess) return;
  const access = await resolveGuestTableAccess(input.tableAccess);
  if (access.status !== 'valid') return;
  const table = access.table;
  const attempt = await prisma.paymentAttempt.findFirst({
    where: { id: input.attemptId, bill: { session: { tableId: table.tableId } } },
    select: { id: true },
  });
  if (attempt) await cancelAttempt(attempt.id, 'guest_cancelled');
}

export async function cancelCashAttemptByStaff(
  attemptId: string,
  actor: { staffUserId: string; venueId: string },
): Promise<void> {
  const attempt = await prisma.paymentAttempt.findFirst({
    where: {
      id: attemptId,
      method: 'CASH',
      status: { in: ['CREATED', 'PENDING'] },
      bill: { session: { venueId: actor.venueId } },
    },
    select: { id: true },
  });
  if (attempt) await cancelAttempt(attempt.id, 'staff_cancelled');
}
