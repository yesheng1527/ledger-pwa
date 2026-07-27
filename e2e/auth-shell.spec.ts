import { expect, test, type Locator, type Page } from '@playwright/test';

const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
] as const;

async function expectNoHorizontalOverflow(page: Page) {
  const measurements = await page.evaluate(() => ({
    documentClientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  expect(measurements, JSON.stringify(measurements)).toEqual({
    documentClientWidth: measurements.documentScrollWidth,
    documentScrollWidth: measurements.documentScrollWidth,
    bodyClientWidth: measurements.bodyScrollWidth,
    bodyScrollWidth: measurements.bodyScrollWidth,
  });
}

async function expectPageFitsViewport(page: Page) {
  const measurements = await page.evaluate(() => ({
    documentHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
  }));
  expect(measurements.documentHeight).toBe(measurements.viewportHeight);
}

async function expectMinimumHeight(locator: Locator, minimum = 44) {
  const box = await locator.boundingBox();
  expect(box, 'control must have a rendered box').not.toBeNull();
  expect(box!.height, `control height was ${box!.height}px`).toBeGreaterThanOrEqual(minimum);
}

for (const viewport of viewports) {
  test.describe(`${viewport.width}x${viewport.height}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(viewport);
    });

    test('logged-out controls fit and meet the 44px target', async ({ page }) => {
      await page.goto('?fixture=logged-out');
      const authMain = page.getByRole('main');
      await expect.soft(authMain).toHaveCSS(
        'background-image',
        /login-background(?:-[A-Za-z0-9_-]+)?\.webp/,
      );
      await expect(authMain.locator('img[src*="login-background"]')).toHaveCount(0);

      const controls = [
        { name: '邮箱', locator: page.getByRole('textbox', { name: '邮箱' }).locator('..') },
        { name: '密码', locator: page.getByLabel('密码', { exact: true }).locator('..') },
        { name: '登录', locator: page.getByRole('button', { name: '登录', exact: true }) },
        { name: '忘记密码', locator: page.getByRole('button', { name: '忘记密码', exact: true }) },
      ];
      for (const control of controls) {
        await expect(control.locator).toBeVisible();
        await expectMinimumHeight(control.locator);
      }
      if (viewport.width === 320 && viewport.height === 568) {
        const initialViewportHeight = await page.evaluate(() => window.innerHeight);
        for (const control of controls) {
          const box = await control.locator.boundingBox();
          const bottom = box!.y + box!.height;
          expect.soft(
            bottom,
            `${control.name} bounds: top=${box!.y}px bottom=${bottom}px height=${box!.height}px viewport=${initialViewportHeight}px`,
          ).toBeLessThanOrEqual(initialViewportHeight);
        }
      }
      await expectNoHorizontalOverflow(page);
      if (viewport.height >= 844) {
        await expectPageFitsViewport(page);
      }
    });

  });
}

test('login, forgot, and recovery foreground sections stay ordered at every phone viewport', async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);

    async function expectBrandBeforeCard(mode: 'login' | 'forgot' | 'recovery') {
      const brand = page.getByRole('region', { name: '海风小账本' });
      const card = page.locator('main form').locator('..');
      const [brandBox, cardBox] = await Promise.all([brand.boundingBox(), card.boundingBox()]);
      expect(brandBox, `${mode} brand must render`).not.toBeNull();
      expect(cardBox, `${mode} card must render`).not.toBeNull();
      expect.soft(
        brandBox!.y + brandBox!.height,
        `${viewport.width}x${viewport.height} ${mode} brand and card overlap`,
      ).toBeLessThanOrEqual(cardBox!.y);
    }

    await page.goto('?fixture=logged-out');
    await expectBrandBeforeCard('login');

    await page.getByRole('button', { name: '忘记密码', exact: true }).click();
    await expectBrandBeforeCard('forgot');

    await page.goto('reset-password?fixture=recovery');
    await expectBrandBeforeCard('recovery');
    await expectNoHorizontalOverflow(page);
  }
});
