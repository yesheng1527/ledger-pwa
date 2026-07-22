import { expect, test, type Page } from '@playwright/test';

async function readyForScreenshot(page: Page) {
  await expect(page.locator('html')).toHaveAttribute('data-visual-test', 'true');
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

async function expectScreenshot(page: Page, filename: string) {
  await readyForScreenshot(page);
  await expect(page).toHaveScreenshot(filename);
}

async function openLogin(page: Page) {
  await page.goto('?fixture=logged-out&visual=1');
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
}

async function openHome(page: Page) {
  await page.goto('?fixture=logged-in&visual=1');
  await expect(page.getByRole('navigation', { name: '主要导航' })).toBeVisible();
}

test('390x844 login', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openLogin(page);
  await expectScreenshot(page, '390x844-login.png');
});

test('390x844 forgot password', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openLogin(page);
  await page.getByRole('button', { name: '忘记密码', exact: true }).click();
  await expect(page.getByRole('heading', { name: '找回密码' })).toBeVisible();
  await expectScreenshot(page, '390x844-forgot.png');
});

test('390x844 recovery password', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('reset-password?fixture=recovery&visual=1');
  await expect(page.getByRole('heading', { name: '设置新密码' })).toBeVisible();
  await expectScreenshot(page, '390x844-recovery.png');
});

test('390x844 home', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHome(page);
  await expectScreenshot(page, '390x844-home.png');
});

test('390x844 entry dialog', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHome(page);
  await page.getByRole('button', { name: '记账' }).click();
  await expect(page.getByRole('dialog', { name: '记账功能建设中' })).toBeVisible();
  await expectScreenshot(page, '390x844-entry-dialog.png');
});

for (const viewport of [
  { width: 320, height: 568 },
  { width: 430, height: 932 },
] as const) {
  test(`${viewport.width}x${viewport.height} login`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openLogin(page);
    await expectScreenshot(page, `${viewport.width}x${viewport.height}-login.png`);
  });

  test(`${viewport.width}x${viewport.height} home`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openHome(page);
    await expectScreenshot(page, `${viewport.width}x${viewport.height}-home.png`);
  });
}
