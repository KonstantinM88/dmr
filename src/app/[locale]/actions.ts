'use server';

import { cookies, headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { submitGuestOrder, submitOrderSchema } from '@/domains/orders/server/order.service';
import type { SubmitOrderResult } from '@/domains/orders/shared/types';
import { TABLE_TOKEN_COOKIE } from '@/lib/venue';

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
    tableToken: cookieStore.get(TABLE_TOKEN_COOKIE)?.value,
    ip: headerList.get('x-forwarded-for')?.split(',')[0]?.trim(),
  });

  if (result.ok) revalidatePath('/[locale]', 'page');

  return result;
}
