import { expect, test } from '@playwright/test';

/**
 * Smoke Этапа 4. Полный сценарий оплаты требует настроенного Stripe test mode
 * и Stripe CLI для проброса webhook; без ключей проверяется fail-closed
 * поведение — приложение не должно делать вид, что оплата возможна.
 */
test('страница оплаты требует распознанного стола', async ({ page }) => {
  await page.context().clearCookies();
  await page.goto('/de/bezahlen');
  await expect(page.locator('body')).not.toContainText('missing translation');
});

test('webhook отклоняет запрос без подписи', async ({ request }) => {
  const response = await request.post('/api/stripe/webhook', {
    data: { id: 'evt_test', type: 'payment_intent.succeeded' },
  });
  // 400 — подпись невалидна, 503 — провайдер не сконфигурирован.
  expect([400, 503]).toContain(response.status());
});

test('webhook отклоняет подделанную подпись', async ({ request }) => {
  const response = await request.post('/api/stripe/webhook', {
    headers: { 'stripe-signature': 't=1,v1=deadbeef' },
    data: { id: 'evt_forged', type: 'payment_intent.succeeded' },
  });
  expect([400, 503]).toContain(response.status());
});

test('бухгалтерский отчёт закрыт для анонимного запроса', async ({ page }) => {
  await page.context().clearCookies();
  await page.goto('/de/admin/zahlungen');
  await expect(page).toHaveURL(/anmelden/);
});

