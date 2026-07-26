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
      const authMain = page.getByRole('main');
      const authBackgroundImage = await authMain.evaluate(
        (element) => getComputedStyle(element).backgroundImage,
      );
      expect.soft(authBackgroundImage).toMatch(/auth-seaside(?:-[A-Za-z0-9_-]+)?\.svg/);
      await expect(authMain.locator('img[src*="auth-seaside"]')).toHaveCount(0);

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
    });

    test('logged-in shell preserves navigation order, visibility, and dialog focus', async ({ page }) => {
      await page.goto('?fixture=logged-in');
      const navigation = page.getByRole('navigation', { name: '主要导航' });
      const buttons = navigation.getByRole('button');
      const shellMain = page.getByRole('main');

      await expect(buttons).toHaveText(['首页', '流水', '记账', '统计', '我的']);
      await expect(page.getByRole('button', { name: '首页' })).toHaveAttribute('aria-current', 'page');
      const navigationBottoms: Array<{ name: string; bottom: number }> = [];
      for (const button of await buttons.all()) {
        await expectMinimumHeight(button);
        const box = await button.boundingBox();
        const bottom = box!.y + box!.height;
        navigationBottoms.push({ name: await button.innerText(), bottom });
        expect(bottom, `navigation button bottom was ${bottom}px`).toBeLessThanOrEqual(viewport.height);
      }
      const alignedBottomSpread = Math.max(...navigationBottoms.map(({ bottom }) => bottom))
        - Math.min(...navigationBottoms.map(({ bottom }) => bottom));
      expect(
        alignedBottomSpread,
        `navigation bottoms: ${JSON.stringify(navigationBottoms)}`,
      ).toBeLessThanOrEqual(1);

      const safeAreaLayout = await page.evaluate(() => {
        const main = document.querySelector<HTMLElement>('[data-shell-scroll]')!;
        const navigation = document.querySelector('nav')!;
        const rootStyle = getComputedStyle(document.documentElement);
        const mainStyle = getComputedStyle(main);
        const navigationStyle = getComputedStyle(navigation);
        const mainBox = main.getBoundingClientRect();
        const navigationBox = navigation.getBoundingClientRect();
        const fallbackProbe = document.createElement('div');
        fallbackProbe.style.paddingBottom = 'var(--space-3)';
        document.body.append(fallbackProbe);
        const fallbackPixels = Number.parseFloat(getComputedStyle(fallbackProbe).paddingBottom);
        fallbackProbe.remove();

        return {
          safeAreaToken: rootStyle.getPropertyValue('--safe-area-bottom').trim(),
          fallbackPixels,
          navigationPaddingBottom: Number.parseFloat(navigationStyle.paddingBottom),
          mainPaddingBottom: Number.parseFloat(mainStyle.paddingBottom),
          mainContentBottom: mainBox.bottom - Number.parseFloat(mainStyle.paddingBottom),
          navigationTop: navigationBox.top,
          navigationBottom: navigationBox.bottom,
          navigationHeight: navigationBox.height,
        };
      });
      expect(
        safeAreaLayout.safeAreaToken,
        'zero-inset Chromium should resolve the safe-area environment value to 0px inside the max() token',
      ).toMatch(/^max\(.+,\s*0px\)$/);
      expect(safeAreaLayout.navigationPaddingBottom).toBeCloseTo(
        safeAreaLayout.fallbackPixels,
        5,
      );
      expect(safeAreaLayout.mainPaddingBottom).toBeGreaterThanOrEqual(
        safeAreaLayout.navigationHeight,
      );
      expect(
        safeAreaLayout.mainContentBottom,
        `zero-inset main content bottom ${safeAreaLayout.mainContentBottom}px must not overlap navigation top ${safeAreaLayout.navigationTop}px`,
      ).toBeLessThanOrEqual(safeAreaLayout.navigationTop);
      expect(safeAreaLayout.navigationBottom).toBeLessThanOrEqual(viewport.height);
      await expect(shellMain).toBeVisible();

      const entryButton = page.getByRole('button', { name: '记账', exact: true });
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

test('login, forgot, and recovery cards begin within the upper 33 percent at every phone viewport', async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);

    async function expectCardInUpperThird(mode: 'login' | 'forgot' | 'recovery') {
      const card = page.locator('main form').locator('..');
      const box = await card.boundingBox();
      const maximumTop = viewport.height * 0.33;
      expect.soft(
        box!.y,
        `${viewport.width}x${viewport.height} ${mode} card: top=${box!.y}px maximum=${maximumTop}px ratio=${box!.y / viewport.height}`,
      ).toBeLessThanOrEqual(maximumTop);
    }

    await page.goto('?fixture=logged-out');
    await expectCardInUpperThird('login');

    await page.getByRole('button', { name: '忘记密码', exact: true }).click();
    await expectCardInUpperThird('forgot');

    await page.goto('reset-password?fixture=recovery');
    await expectCardInUpperThird('recovery');
  }
});
