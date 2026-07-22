import { expect, test, type Page } from '@playwright/test';

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

async function expectMinimumHeight(locator: ReturnType<Page['getByRole']>, minimum = 44) {
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

      const controls = [
        { name: '邮箱', locator: page.getByRole('textbox', { name: '邮箱' }) },
        { name: '密码', locator: page.getByRole('textbox', { name: '密码', exact: true }) },
        { name: '登录', locator: page.getByRole('button', { name: '登录', exact: true }) },
        { name: '忘记密码', locator: page.getByRole('button', { name: '忘记密码', exact: true }) },
      ];
      for (const control of controls) {
        await expect(control.locator).toBeVisible();
        await expectMinimumHeight(control.locator);
      }
      if (viewport.width === 320 && viewport.height === 568) {
        const initialViewportHeight = await page.evaluate(() => window.innerHeight);
        for (const control of controls.slice(1)) {
          const box = await control.locator.boundingBox();
          const bottom = box!.y + box!.height;
          expect.soft(
            bottom,
            `${control.name} bounds: top=${box!.y}px bottom=${bottom}px height=${box!.height}px viewport=${initialViewportHeight}px`,
          ).toBeLessThanOrEqual(initialViewportHeight);
        }
      }
      await expectNoHorizontalOverflow(page);
    });

    test('logged-in shell preserves navigation order, visibility, and dialog focus', async ({ page }) => {
      await page.goto('?fixture=logged-in');
      const navigation = page.getByRole('navigation', { name: '主要导航' });
      const buttons = navigation.getByRole('button');

      await expect(buttons).toHaveText(['首页', '流水', '记账', '统计', '我的']);
      await expect(page.getByRole('button', { name: '首页' })).toHaveAttribute('aria-current', 'page');
      for (const button of await buttons.all()) {
        await expectMinimumHeight(button);
        const box = await button.boundingBox();
        expect(box!.y + box!.height, `navigation button bottom was ${box!.y + box!.height}px`).toBeLessThanOrEqual(viewport.height);
      }

      const entryButton = page.getByRole('button', { name: '记账' });
      await entryButton.click();
      const dialog = page.getByRole('dialog', { name: '记账功能建设中' });
      await expect(dialog).toBeVisible();
      await expect(page.getByRole('button', { name: '关闭' })).toBeFocused();
      await page.getByRole('button', { name: '关闭' }).click();
      await expect(dialog).toBeHidden();
      await expect(entryButton).toBeFocused();
      await expectNoHorizontalOverflow(page);
    });
  });
}
