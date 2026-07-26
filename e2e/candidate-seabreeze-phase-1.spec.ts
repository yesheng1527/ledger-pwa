import { expect, test } from '@playwright/test';

test('visual gate probe stays in the isolated phase-one candidate directory', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install({ time: new Date('2026-07-18T20:00:00+08:00') });
  await page.goto('?fixture=logged-in&visual=1');
  await expect(page.getByRole('heading', { name: '首页' })).toBeVisible();
  await expect(page.getByLabel('总资产')).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  await expect(page).toHaveScreenshot('visual-gate-probe.png');
});
