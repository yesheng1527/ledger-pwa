import { expect, test } from '@playwright/test';

const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
] as const;

for (const viewport of viewports) {
  test.describe(`${viewport.width}x${viewport.height}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(viewport);
    });

    test('exposes labeled landmarks, state, dialog, and icons', async ({ page }) => {
      await page.goto('?fixture=logged-out');
      await expect(page.getByRole('main')).toBeVisible();
      await expect(page.getByRole('img', { name: '海风小账本' })).toHaveCount(1);
      await expect(page.getByRole('textbox', { name: '邮箱' })).toBeVisible();
      await expect(page.getByRole('textbox', { name: '密码', exact: true })).toBeVisible();

      await page.goto('?fixture=logged-in');
      await expect(page.getByRole('main')).toBeVisible();
      await expect(page.getByRole('navigation', { name: '主要导航' })).toBeVisible();
      await expect(page.getByRole('button', { name: '首页' })).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('img')).toHaveCount(0);

      const source = page.getByRole('button', { name: '记账', exact: true });
      await source.click();
      const dialog = page.getByRole('dialog', { name: '记账' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByLabel('金额')).toBeFocused();
      await expect(page.locator('[data-shell-background]')).toHaveAttribute('inert');
      await expect(page.getByRole('main')).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(source).toBeFocused();
      await expect(page.getByRole('main')).toHaveCount(1);
      await expect(page.locator('[data-shell-background]')).not.toHaveAttribute('inert');
    });

    test('removes ambient animation and transitions for reduced motion', async ({ page }) => {
      await page.goto('?fixture=logged-out');

      const ambient = page.locator('[data-ambient-motion]');
      await expect(ambient).not.toHaveCount(0);
      expect.soft(
        await page.locator('html').getAttribute('data-visual-test'),
        'normal test-e2e routes must not activate the screenshot-only visual freeze',
      ).toBeNull();
      const normalTransitionDurations = await ambient.evaluateAll((elements) =>
        elements.map((element) => getComputedStyle(element).transitionDuration),
      );
      for (const duration of normalTransitionDurations) {
        expect.soft(
          duration,
          'ambient elements need a non-zero normal transition so reduced motion tests real behavior',
        ).not.toBe('0s');
      }

      await page.emulateMedia({ reducedMotion: 'reduce' });
      for (const element of await ambient.all()) {
        await expect(element).toHaveCSS('animation-name', 'none');
        await expect(element).toHaveCSS('transition-duration', '0s');
      }
    });
  });
}
