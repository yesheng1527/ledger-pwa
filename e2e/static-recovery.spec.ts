import { expect, test } from '@playwright/test';

test('built app reaches the query recovery callback without a history fallback', async ({ page }) => {
  const legacyResponse = await page.request.get('/ledger-pwa/reset-password', {
    failOnStatusCode: false,
  });
  expect(legacyResponse.status()).toBe(404);

  const response = await page.goto('?auth=reset');
  expect(response?.status()).toBe(200);
  await expect(page.getByText('重置链接无效或已过期')).toBeVisible();

  await page.getByRole('button', { name: '返回登录' }).click();
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
  await expect(page).toHaveURL('http://127.0.0.1:4174/ledger-pwa/');
});
