import { expect, test, type Page } from '@playwright/test';

async function openHome(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.clock.install({ time: new Date('2026-07-18T20:00:00+08:00') });
  await page.goto('?fixture=logged-in&visual=1');
  await expect(page.getByRole('heading', { name: '首页' })).toBeVisible();
  await expect(page.getByLabel('总资产')).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

async function openTransactions(page: Page) {
  await page.getByRole('button', { name: '流水', exact: true }).click();
  await expect(page.getByRole('heading', { name: '流水' })).toBeVisible();
  await expect(page.getByRole('button', { name: /午餐.*现金.*负50\.00元/ })).toBeVisible();
}

test('320x568 home candidate', async ({ page }) => {
  await openHome(page, { width: 320, height: 568 });
  await expect(page).toHaveScreenshot('320x568-home.png');
});

test('320x568 transactions candidate', async ({ page }) => {
  await openHome(page, { width: 320, height: 568 });
  await openTransactions(page);
  await expect(page).toHaveScreenshot('320x568-transactions.png');
});

test('390x844 home candidate', async ({ page }) => {
  await openHome(page, { width: 390, height: 844 });
  await expect(page).toHaveScreenshot('390x844-home.png');
});

test('390x844 transactions candidate', async ({ page }) => {
  await openHome(page, { width: 390, height: 844 });
  await openTransactions(page);
  await expect(page).toHaveScreenshot('390x844-transactions.png');
});

test('390x844 transaction detail candidate', async ({ page }) => {
  await openHome(page, { width: 390, height: 844 });
  await openTransactions(page);
  await page.getByRole('button', { name: /午餐.*现金.*负50\.00元/ }).click();
  await expect(page.getByRole('dialog', { name: '流水详情' })).toBeVisible();
  await expect(page).toHaveScreenshot('390x844-transaction-detail.png');
});

test('390x844 delete undo toast candidate', async ({ page }) => {
  await openHome(page, { width: 390, height: 844 });
  await openTransactions(page);
  await page.getByRole('button', { name: /午餐.*现金.*负50\.00元/ }).click();
  await expect(page.getByRole('dialog', { name: '流水详情' })).toBeVisible();
  await page.getByRole('button', { name: '删除流水' }).click();
  await expect(page.getByRole('status')).toContainText('流水已删除');
  await expect(page).toHaveScreenshot('390x844-delete-undo-toast.png');
});

test('430x932 home candidate', async ({ page }) => {
  await openHome(page, { width: 430, height: 932 });
  await expect(page).toHaveScreenshot('430x932-home.png');
});

test('430x932 transactions candidate', async ({ page }) => {
  await openHome(page, { width: 430, height: 932 });
  await openTransactions(page);
  await expect(page).toHaveScreenshot('430x932-transactions.png');
});
