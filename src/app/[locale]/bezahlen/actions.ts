'use server';

import { cookies, headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  startStripePayment,
  startCashPayment,
  cancelGuestAttempt,
} from '@/domains/payments/server/payment.service';
import type {
  StartCashPaymentResult,
  StartPaymentResult,
} from '@/domains/payments/shared/types';
import { TABLE_TOKEN_COOKIE } from '@/lib/venue';

/**
 * Начало оплаты. Наружу уходит только `client_secret` — данные карты
 * собирает Stripe Payment Element на клиенте и на наш сервер не попадают
 * (docs/payment-model.md §3.15).
 */
const itemSelectionSchema = z.array(z.string().min(1).max(64)).min(1).max(100);

export async function startPaymentAction(selectedItemIds: string[]): Promise<StartPaymentResult> {
  const parsed = itemSelectionSchema.safeParse(selectedItemIds);
  if (!parsed.success) return { ok: false, reason: 'invalid_selection' };
  const cookieStore = await cookies();
  const headerList = await headers();

  const result = await startStripePayment({
    tableToken: cookieStore.get(TABLE_TOKEN_COOKIE)?.value,
    selectedItemIds: parsed.data,
    ip: headerList.get('x-forwarded-for')?.split(',')[0]?.trim(),
  });

  revalidatePath('/[locale]/bezahlen', 'page');
  return result;
}

export async function startCashPaymentAction(
  selectedItemIds: string[],
): Promise<StartCashPaymentResult> {
  const parsed = itemSelectionSchema.safeParse(selectedItemIds);
  if (!parsed.success) return { ok: false, reason: 'invalid_selection' };
  const cookieStore = await cookies();
  const headerList = await headers();
  const result = await startCashPayment({
    tableToken: cookieStore.get(TABLE_TOKEN_COOKIE)?.value,
    selectedItemIds: parsed.data,
    ip: headerList.get('x-forwarded-for')?.split(',')[0]?.trim(),
  });
  revalidatePath('/[locale]/bezahlen', 'page');
  revalidatePath('/[locale]/service', 'page');
  return result;
}

/** Гость передумал: попытка отменяется, стол разблокируется. */
export async function cancelPaymentAction(attemptId: string): Promise<{ ok: true }> {
  const parsed = z.string().min(1).max(64).safeParse(attemptId);
  if (!parsed.success) return { ok: true };

  const cookieStore = await cookies();
  await cancelGuestAttempt({
    attemptId: parsed.data,
    tableToken: cookieStore.get(TABLE_TOKEN_COOKIE)?.value,
  });
  revalidatePath('/[locale]/bezahlen', 'page');
  return { ok: true };
}
