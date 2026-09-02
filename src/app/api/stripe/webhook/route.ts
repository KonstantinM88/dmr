import { NextResponse, type NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { logger } from '@/lib/logger';
import { constructWebhookEvent, isPaymentsAvailable } from '@/domains/payments/server/stripe.client';
import { processProviderEvent } from '@/domains/payments/server/webhook.service';

export const dynamic = 'force-dynamic';
/** Подпись проверяется по сырому телу — парсить его до проверки нельзя. */
export const runtime = 'nodejs';

/**
 * Stripe webhook — единственный источник истины об оплате
 * (docs/payment-model.md §3.7).
 *
 * Fail-closed: без настроенного провайдера отвечаем 503, без валидной
 * подписи — 400. Ответ 200 отдаётся и на дубликаты, иначе Stripe будет
 * бесконечно повторять доставку уже обработанного события.
 */
export async function POST(request: NextRequest) {
  if (!isPaymentsAvailable()) {
    return NextResponse.json({ error: 'payments_unavailable' }, { status: 503 });
  }

  const payload = await request.text();
  const signature = request.headers.get('stripe-signature');

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(payload, signature);
  } catch (error) {
    // Тело и подпись в лог не пишем.
    logger.warn('Rejected Stripe webhook with invalid signature', {
      reason: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });
  }

  const intent =
    event.data.object && typeof event.data.object === 'object' && 'id' in event.data.object
      ? (event.data.object as Stripe.PaymentIntent)
      : null;

  try {
    const result = await processProviderEvent({
      providerEventId: event.id,
      eventType: event.type,
      paymentIntentId: intent?.object === 'payment_intent' ? intent.id : null,
      attemptId:
        intent?.object === 'payment_intent' ? (intent.metadata.attemptId ?? null) : null,
      amountReceivedCents:
        intent?.object === 'payment_intent' ? (intent.amount_received ?? null) : null,
      currency: intent?.object === 'payment_intent' ? (intent.currency ?? null) : null,
      failureCode:
        intent?.object === 'payment_intent' ? (intent.last_payment_error?.code ?? null) : null,
      rawPayload: payload,
    });

    return NextResponse.json({ received: true, result: result.status });
  } catch (error) {
    logger.error('Stripe webhook processing failed', {
      eventType: event.type,
      error: String(error),
    });
    // 500 заставит Stripe повторить доставку — это правильное поведение
    // при временном сбое БД.
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 });
  }
}
