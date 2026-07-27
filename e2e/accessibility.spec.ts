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

    test('exposes labeled authentication landmarks and controls', async ({ page }) => {
      await page.goto('?fixture=logged-out');
      await expect(page.getByRole('main')).toBeVisible();
      await expect(page.getByRole('region', { name: '海风小账本' })).toBeVisible();
      await expect(page.getByRole('textbox', { name: '邮箱' })).toBeVisible();
      await expect(page.getByLabel('密码', { exact: true })).toBeVisible();
    });

    test('removes ambient animation and transitions for reduced motion', async ({ page }) => {
      await page.goto('?fixture=logged-out');

      const animatedField = page.getByRole('textbox', { name: '邮箱' }).locator('..');
      await expect(animatedField).toBeVisible();
      expect.soft(
        await page.locator('html').getAttribute('data-visual-test'),
        'normal test-e2e routes must not activate the screenshot-only visual freeze',
      ).toBeNull();
      expect.soft(await animatedField.evaluate((element) => getComputedStyle(element).transitionDuration))
        .not.toBe('0s');

      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect(animatedField).toHaveCSS('animation-name', 'none');
      await expect(animatedField).toHaveCSS('transition-duration', '0s');
    });
  });
}
