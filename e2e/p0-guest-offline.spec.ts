import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const evidence = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../outputs/ledger-pwa-p0-p1-evidence');

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' });

test('guest data is useful, writable and survives an offline reload', async ({ page, context }) => {
  await page.goto('./');
  expect(await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual({ width: 390, height: 844 });
  await page.getByRole('button', { name: '游客体验' }).click();
  await expect(page.getByText('游客演示 · 数据仅保存在本机')).toBeVisible();
  await expect(page.getByText('海边午餐')).toBeVisible();
  await page.screenshot({ path: path.join(evidence, 'p0-guest-home-390x844.png'), fullPage: true });

  expect(await page.evaluate(async () => (await indexedDB.databases()).map((item) => item.name))).toContain('seabreeze-ledger-guest-v1');
  expect(await page.evaluate(async () => (await indexedDB.databases()).map((item) => item.name))).not.toContain('seabreeze-ledger-v2');

  await expect.poll(async () => page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state)).toBe('activated');
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('游客演示 · 数据仅保存在本机')).toBeVisible();
  await page.getByRole('button', { name: /^记账$/ }).click();
  await page.getByRole('textbox', { name: '金额', exact: true }).fill('12.34');
  await page.getByLabel('名称').fill('离线游客测试');
  await page.getByLabel('备注').fill('不会进入正式账号');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('已保存到本机，等待同步')).toBeVisible();
  await expect(page.getByRole('heading', { name: /早上好/ })).toBeVisible();
  await page.getByRole('button', { name: /^流水$/ }).click();
  await expect(page.getByText('离线游客测试')).toBeVisible();
  await page.waitForTimeout(450);
  expect(await page.locator('img').evaluateAll((images) => images
    .filter((image) => image.complete && image.naturalWidth === 0)
    .map((image) => image.getAttribute('src')))).toEqual([]);
  await page.screenshot({ path: path.join(evidence, 'p0-guest-offline-reload-390x844.png'), fullPage: true });
});
