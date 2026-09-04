'use server';

import { cookies, headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { submitGuestOrder, submitOrderSchema } from '@/domains/orders/server/order.service';
import type { SubmitOrderResult } from '@/domains/orders/shared/types';
import { TABLE_ACCESS_COOKIE } from '@/lib/venue';
import {
  callWaiter,
  cancelGuestWaiterCall,
} from '@/domains/service-requests/server/waiter-call.service';
import type { CallWaiterResult } from '@/domains/service-requests/shared/types';

/**
 * Отправка заказа гостем. Единственная внешняя граница домена заказов для
 * гостевого устройства: вся валидация входа — здесь (docs/architecture.md §3).
 */
export async function submitOrderAction(payload: unknown): Promise<SubmitOrderResult> {
  const parsed = submitOrderSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, reason: 'empty_cart' };

  const cookieStore = await cookies();
  const headerList = await headers();

  const result = await submitGuestOrder(parsed.data, {
    tableAccess: cookieStore.get(TABLE_ACCESS_COOKIE)?.value,
    ip: headerList.get('x-forwarded-for')?.split(',')[0]?.trim(),
  });

  if (result.ok) revalidatePath('/[locale]', 'page');

  return result;
}

export async function callWaiterAction(): Promise<CallWaiterResult> {
  const cookieStore = await cookies();
  const result = await callWaiter({
    tableAccess: cookieStore.get(TABLE_ACCESS_COOKIE)?.value,
  });
  if (result.ok) {
    revalidatePath('/[locale]', 'page');
    revalidatePath('/[locale]/service', 'page');
  }
  return result;
}

export async function cancelWaiterCallAction(callId: string): Promise<{ ok: true }> {
  const parsed = z.string().min(1).max(64).safeParse(callId);
  if (!parsed.success) return { ok: true };
  const cookieStore = await cookies();
  await cancelGuestWaiterCall({
    callId: parsed.data,
    tableAccess: cookieStore.get(TABLE_ACCESS_COOKIE)?.value,
  });
  revalidatePath('/[locale]', 'page');
  revalidatePath('/[locale]/service', 'page');
  return { ok: true };
}
