import 'server-only';
import Stripe from 'stripe';
import { getEnv, isStripeConfigured } from '@/lib/env';

/**
 * Адаптер Stripe. Единственное место, где приложение знает о провайдере
 * (docs/architecture.md §4).
 *
 * Fail-closed: без ключей клиент не создаётся и оплата недоступна — вместо
 * тихой заглушки вызывающий получает явную ошибку. Данные карты через сервер
 * не проходят: наружу отдаётся только `client_secret`
 * (docs/payment-model.md §3.15).
 */
export class StripeNotConfiguredError extends Error {
  constructor() {
    super('Stripe не сконфигурирован: отсутствуют STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET.');
    this.name = 'StripeNotConfiguredError';
  }
}

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (!isStripeConfigured()) throw new StripeNotConfiguredError();
  if (cached) return cached;

  const env = getEnv();
  cached = new Stripe(env.STRIPE_SECRET_KEY, {
    // Явная фиксация версии API: обновление Stripe не должно менять
    // поведение оплаты без нашего решения.
    apiVersion: '2026-07-29.dahlia',
    typescript: true,
    telemetry: false,
    appInfo: { name: 'DMR', version: '0.1.0' },
  });

  return cached;
}

export function isPaymentsAvailable(): boolean {
  return isStripeConfigured();
}

/**
 * Проверка подписи webhook. Невалидная подпись — отказ, а не предупреждение:
 * без этого любой мог бы объявить счёт оплаченным.
 */
export function constructWebhookEvent(payload: string, signature: string | null): Stripe.Event {
  if (!signature) throw new Error('Отсутствует заголовок подписи Stripe.');

  const env = getEnv();
  return getStripe().webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET);
}

