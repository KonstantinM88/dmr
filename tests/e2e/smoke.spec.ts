import { expect, test } from '@playwright/test';

/**
 * Smoke-набор Этапа 1. Требует запущенного приложения с сидированной БД.
 */
test('гость видит меню на немецком', async ({ page }) => {
  await page.goto('/de');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('missing translation');
});

test('корневой путь редиректит на локаль по умолчанию', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/de/);
});

test('health-эндпоинт отвечает без обращения к БД', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect((await response.json()).status).toBe('ok');
});

test('admin-зона требует аутентификации', async ({ page }) => {
  await page.goto('/de/admin');
  await expect(page).toHaveURL(/anmelden/);
});

test('неизвестный QR-токен не раскрывает существование стола', async ({ page }) => {
  await page.goto('/t/definitiv-kein-gueltiger-token-0000');
  await expect(page).toHaveURL(/table=invalid/);
});

test('security headers присутствуют', async ({ request }) => {
  const response = await request.get('/de');
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  expect(response.headers()['x-frame-options']).toBe('DENY');
});
