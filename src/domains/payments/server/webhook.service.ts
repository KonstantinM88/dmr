import 'server-only';
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { addCents } from '@/lib/money';
import {
  assertAttemptTransition,
  attemptOutcomeForEvent,
  isAttemptTerminal,
  isHandledStripeEvent,
  sessionStatusForAttemptOutcome,
} from '@/domains/payments/server/payment-state-machine';
import { loadBillableItems, recalculateBill } from '@/domains/billing/server/bill.service';
import { transitionSessionInTransaction } from '@/domains/sessions/server/session.service';
import { recordFinancialEvent } from '@/domains/payments/server/financial-audit.service';

const EVENT_PROCESSING_LEASE_MS = 5 * 60 * 1000;

export type WebhookProcessResult =
  | { status: 'processed' }
  | { status: 'duplicate' }
  | { status: 'ignored' }
  | { status: 'unknown_attempt' }
  | { status: 'mismatch' };

export type NormalizedProviderEvent = {
  providerEventId: string;
  eventType: string;
  paymentIntentId: string | null;
  attemptId: string | null;
  amountReceivedCents: number | null;
  currency: string | null;
  failureCode: string | null;
  rawPayload: string;
};

/**
 * Webhook — единственный источник истины об оплате. Событие сначала
 * атомарно захватывается в обработку. FAILED/зависшее PROCESSING можно
 * безопасно повторить, поэтому временный сбой БД не превращается в
 * навсегда потерянное подтверждение.
 */
export async function processProviderEvent(
  event: NormalizedProviderEvent,
): Promise<WebhookProcessResult> {
  const payloadDigest = createHash('sha256').update(event.rawPayload).digest('hex');
  const claimed = await claimEvent(event, payloadDigest);
  if (!claimed) return { status: 'duplicate' };

  try {
    return await processClaimedEvent(event);
  } catch (error) {
    await markEvent(
      event.providerEventId,
      'FAILED',
      error instanceof Error ? error.name.slice(0, 120) : 'processing_error',
    );
    throw error;
  }
}

async function claimEvent(
  event: NormalizedProviderEvent,
  payloadDigest: string,
): Promise<boolean> {
  try {
    await prisma.paymentProviderEvent.create({
      data: {
        provider: 'stripe',
        providerEventId: event.providerEventId,
        eventType: event.eventType,
        status: 'RECEIVED',
        payloadDigest,
        relatedPaymentIntentId: event.paymentIntentId,
      },
    });
  } catch (error) {
    const existing = await prisma.paymentProviderEvent.findUnique({
      where: { providerEventId: event.providerEventId },
      select: { status: true },
    });
    if (!existing) throw error;
    if (existing.status === 'PROCESSED' || existing.status === 'IGNORED') {
      logger.info('Duplicate Stripe event ignored', { eventType: event.eventType });
      return false;
    }
  }

  const staleBefore = new Date(Date.now() - EVENT_PROCESSING_LEASE_MS);
  const claimed = await prisma.paymentProviderEvent.updateMany({
    where: {
      providerEventId: event.providerEventId,
      OR: [
        { status: { in: ['RECEIVED', 'FAILED'] } },
        { status: 'PROCESSING', updatedAt: { lt: staleBefore } },
      ],
    },
    data: { status: 'PROCESSING', failureReason: null, processedAt: null },
  });

  return claimed.count === 1;
}

async function processClaimedEvent(
  event: NormalizedProviderEvent,
): Promise<WebhookProcessResult> {
  if (!isHandledStripeEvent(event.eventType)) {
    await markEvent(event.providerEventId, 'IGNORED');
    return { status: 'ignored' };
  }

  if (!event.paymentIntentId) {
    await markEvent(event.providerEventId, 'FAILED', 'missing_payment_intent');
    return { status: 'unknown_attempt' };
  }

  let attempt = await prisma.paymentAttempt.findUnique({
    where: { providerRef: event.paymentIntentId },
    include: {
      bill: { select: { id: true, sessionId: true } },
      plannedAllocations: true,
    },
  });

  // Webhook может обогнать локальную запись providerRef. Подписанный Stripe
  // metadata.attemptId позволяет восстановить связь с уже созданной попыткой.
  if (!attempt && event.attemptId) {
    const recovered = await prisma.paymentAttempt.updateMany({
      where: {
        id: event.attemptId,
        providerRef: null,
        status: { in: ['CREATED', 'PENDING'] },
      },
      data: { providerRef: event.paymentIntentId },
    });
    if (recovered.count === 1) {
      attempt = await prisma.paymentAttempt.findUnique({
        where: { id: event.attemptId },
        include: {
          bill: { select: { id: true, sessionId: true } },
          plannedAllocations: true,
        },
      });
    }
  }

  if (!attempt) {
    await markEvent(event.providerEventId, 'FAILED', 'unknown_attempt');
    logger.warn('Stripe event for unknown attempt', { eventType: event.eventType });
    return { status: 'unknown_attempt' };
  }

  const outcome = attemptOutcomeForEvent(event.eventType);
  if (attempt.status === outcome) {
    await markEvent(event.providerEventId, 'PROCESSED');
    return { status: 'duplicate' };
  }
  if (isAttemptTerminal(attempt.status)) {
    await markEvent(event.providerEventId, 'FAILED', 'terminal_outcome_conflict');
    return { status: 'mismatch' };
  }
  assertAttemptTransition(attempt.status, outcome);

  if (outcome !== 'SUCCEEDED') {
    await handleFailure(attempt.id, attempt.bill.id, attempt.bill.sessionId, event, outcome);
    await markEvent(event.providerEventId, 'PROCESSED');
    return { status: 'processed' };
  }

  if (
    event.amountReceivedCents !== attempt.amountCents ||
    event.currency?.toUpperCase() !== attempt.currency.toUpperCase()
  ) {
    await recordFinancialEvent({
      billId: attempt.bill.id,
      action: 'PAYMENT_AMOUNT_MISMATCH',
      actorType: 'SYSTEM',
      amountCents: event.amountReceivedCents,
      currency: event.currency?.toUpperCase() ?? null,
      metadata: { attemptId: attempt.id, providerEventId: event.providerEventId },
    });
    await markEvent(event.providerEventId, 'FAILED', 'amount_or_currency_mismatch');
    return { status: 'mismatch' };
  }

  await handleSuccess({
    attemptId: attempt.id,
    billId: attempt.bill.id,
    sessionId: attempt.bill.sessionId,
    amountCents: event.amountReceivedCents,
    currency: attempt.currency,
    providerEventId: event.providerEventId,
    paymentIntentId: event.paymentIntentId,
  });
  await markEvent(event.providerEventId, 'PROCESSED');
  return { status: 'processed' };
}

async function handleSuccess(input: {
  attemptId: string;
  billId: string;
  sessionId: string;
  amountCents: number;
  currency: string;
  providerEventId: string;
  paymentIntentId: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.payment.findUnique({ where: { attemptId: input.attemptId } });
    if (existing) return;

    const items = await loadBillableItems(input.sessionId, tx);
    const attempt = await tx.paymentAttempt.findUniqueOrThrow({
      where: { id: input.attemptId },
      include: { plannedAllocations: true },
    });
    const allocations = attempt.plannedAllocations.map((allocation) => ({
      orderItemId: allocation.orderItemId,
      amountCents: allocation.amountCents,
      quantity: allocation.quantity,
      expectedRemainingCents: allocation.expectedRemainingCents,
    }));
    if (
      allocations.length === 0 ||
      addCents(...allocations.map((allocation) => allocation.amountCents)) !== input.amountCents
    ) {
      throw new Error('Payment allocation plan does not match attempt amount.');
    }
    for (const allocation of allocations) {
      const item = items.find((candidate) => candidate.id === allocation.orderItemId);
      const currentRemaining = item
        ? item.lineTotalCents - item.allocatedPaidCents
        : null;
      if (
        !item ||
        currentRemaining !== allocation.expectedRemainingCents ||
        allocation.amountCents !== item.unitPriceCents * allocation.quantity ||
        allocation.amountCents > currentRemaining
      ) {
        throw new Error('Payment allocation plan no longer matches item remainder.');
      }
    }

    const payment = await tx.payment.create({
      data: {
        billId: input.billId,
        attemptId: input.attemptId,
        method: 'STRIPE',
        status: 'SUCCEEDED',
        amountCents: input.amountCents,
        currency: input.currency,
        providerRef: input.paymentIntentId,
        providerEventId: input.providerEventId,
        allocations: {
          create: allocations.map((allocation) => ({
            orderItemId: allocation.orderItemId,
            amountCents: allocation.amountCents,
            quantity: allocation.quantity,
          })),
        },
      },
      select: { id: true },
    });

    for (const allocation of allocations) {
      const item = items.find((candidate) => candidate.id === allocation.orderItemId);
      if (!item) throw new Error('Allocation item disappeared during payment transaction.');
      const allocatedPaidCents = item.allocatedPaidCents + allocation.amountCents;
      const updated = await tx.orderItem.updateMany({
        where: { id: item.id, allocatedPaidCents: item.allocatedPaidCents },
        data: {
          allocatedPaidCents,
          remainingCents: item.lineTotalCents - allocatedPaidCents,
        },
      });
      if (updated.count !== 1) throw new Error('Concurrent payment allocation detected.');
    }

    const updatedAttempt = await tx.paymentAttempt.updateMany({
      where: { id: input.attemptId, status: { in: ['CREATED', 'PENDING'] } },
      data: { status: 'SUCCEEDED', providerRef: input.paymentIntentId, reservedUntil: null },
    });
    if (updatedAttempt.count !== 1) throw new Error('Payment attempt changed concurrently.');

    await recordFinancialEvent(
      {
        billId: input.billId,
        paymentId: payment.id,
        action: 'PAYMENT_SUCCEEDED',
        actorType: 'SYSTEM',
        amountCents: input.amountCents,
        currency: input.currency,
        metadata: { providerEventId: input.providerEventId },
      },
      tx,
    );

    const { totals: refreshed } = await recalculateBill(input.sessionId, tx);
    const target = sessionStatusForAttemptOutcome({
      outcome: 'SUCCEEDED',
      fullyPaid: refreshed.remainingCents === 0,
    });
    const session = await tx.diningSession.findUniqueOrThrow({
      where: { id: input.sessionId },
      select: { status: true },
    });
    if (session.status !== target) {
      await transitionSessionInTransaction(
        input.sessionId,
        target,
        { actorType: 'SYSTEM' },
        tx,
      );
    }
  });
}

async function handleFailure(
  attemptId: string,
  billId: string,
  sessionId: string,
  event: NormalizedProviderEvent,
  outcome: 'FAILED' | 'CANCELLED',
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const updated = await tx.paymentAttempt.updateMany({
      where: { id: attemptId, status: { in: ['CREATED', 'PENDING'] } },
      data: { status: outcome, failureCode: event.failureCode, reservedUntil: null },
    });
    if (updated.count !== 1) throw new Error('Payment attempt changed concurrently.');

    await recordFinancialEvent(
      {
        billId,
        action: outcome === 'FAILED' ? 'PAYMENT_FAILED' : 'PAYMENT_CANCELLED',
        actorType: 'SYSTEM',
        metadata: { attemptId, providerEventId: event.providerEventId },
      },
      tx,
    );

    const { totals } = await recalculateBill(sessionId, tx);
    const session = await tx.diningSession.findUniqueOrThrow({
      where: { id: sessionId },
      select: { status: true },
    });
    if (session.status === 'PAYMENT_PENDING') {
      await transitionSessionInTransaction(
        sessionId,
        totals.paidCents > 0
          ? 'PARTIALLY_PAID'
          : sessionStatusForAttemptOutcome({ outcome, fullyPaid: false }),
        { actorType: 'SYSTEM' },
        tx,
      );
    }
  });
}

async function markEvent(
  providerEventId: string,
  status: 'PROCESSED' | 'IGNORED' | 'FAILED',
  failureReason?: string,
): Promise<void> {
  await prisma.paymentProviderEvent.update({
    where: { providerEventId },
    data: {
      status,
      processedAt: new Date(),
      failureReason: failureReason ?? null,
    },
  });
}
