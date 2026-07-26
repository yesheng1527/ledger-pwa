import { expect, test, type Locator, type Page } from '@playwright/test';

const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
] as const;

async function openFixture(page: Page) {
  await page.clock.install({ time: new Date('2026-07-18T20:00:00+08:00') });
  await page.goto('?fixture=logged-in');
  await expect(page.getByRole('heading', { name: '首页' })).toBeVisible();
  await expect(page.getByLabel('总资产')).toBeVisible();
}

async function expectNoDocumentOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    documentClient: document.documentElement.clientWidth,
    documentScroll: document.documentElement.scrollWidth,
    bodyClient: document.body.clientWidth,
    bodyScroll: document.body.scrollWidth,
  }));
  expect(widths.documentScroll, JSON.stringify(widths)).toBe(widths.documentClient);
  expect(widths.bodyScroll, JSON.stringify(widths)).toBe(widths.bodyClient);
}

async function expectTargetAtLeast44(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, 'interactive target needs a rendered box').not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

for (const viewport of viewports) {
  test.describe(`${viewport.width}x${viewport.height} integrated ledger`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(viewport);
      await openFixture(page);
    });

    test('shows the decision metrics, usable quick actions, and non-overlapping shell', async ({ page }) => {
      await expect(page.getByLabel('总资产')).toHaveText('¥3,500.00');
      await expect(page.getByLabel('今日支出')).toHaveText('¥50.00');
      await expect(page.getByLabel('预算剩余')).toHaveText('¥270.00');

      const quickActions = page.getByRole('button', { name: /^快速记账：/ });
      await expect(quickActions).toHaveCount(5);
      for (const target of await quickActions.all()) {
        await expectTargetAtLeast44(target);
      }

      const layout = await page.evaluate(() => {
        const scroll = document.querySelector<HTMLElement>('[data-shell-scroll]')!;
        const navigation = document.querySelector<HTMLElement>('nav')!;
        const scrollStyle = getComputedStyle(scroll);
        const navigationStyle = getComputedStyle(navigation);
        const scrollBox = scroll.getBoundingClientRect();
        const navigationBox = navigation.getBoundingClientRect();
        return {
          scrollContentBottom: scrollBox.bottom - Number.parseFloat(scrollStyle.paddingBottom),
          navigationTop: navigationBox.top,
          navigationBottom: navigationBox.bottom,
          navigationHeight: navigationBox.height,
          navigationPaddingBottom: Number.parseFloat(navigationStyle.paddingBottom),
          scrollPaddingBottom: Number.parseFloat(scrollStyle.paddingBottom),
        };
      });
      expect(layout.scrollPaddingBottom).toBeGreaterThanOrEqual(layout.navigationHeight);
      expect(layout.scrollContentBottom).toBeLessThanOrEqual(layout.navigationTop);
      expect(layout.navigationPaddingBottom).toBeGreaterThan(0);
      expect(layout.navigationBottom).toBeLessThanOrEqual(viewport.height);
      await expectNoDocumentOverflow(page);
    });

    test('combines filters and keeps descending, accessible transaction groups', async ({ page }) => {
      await page.getByRole('button', { name: '流水', exact: true }).click();
      await expect(page.getByRole('heading', { name: '流水' })).toBeVisible();

      const categoryScroller = page.getByRole('group', { name: '分类筛选' });
      const scrollerMetrics = await categoryScroller.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        overflowX: getComputedStyle(element).overflowX,
      }));
      expect(scrollerMetrics.overflowX).toBe('auto');
      expect(scrollerMetrics.scrollWidth).toBeGreaterThan(scrollerMetrics.clientWidth);

      await page.getByLabel('账户').selectOption({ label: '现金' });
      await page.getByLabel('日期').fill('2026-07-18');
      await page.getByRole('button', { name: '餐饮', exact: true }).click();
      await page.getByRole('searchbox', { name: '搜索流水' }).fill('午餐');

      await expect(page.getByRole('button', { name: /午餐.*现金.*负50\.00元/ })).toHaveCount(1);
      await expect(page.locator('[class*="transactionRow"]')).toHaveCount(1);

      await page.getByRole('searchbox', { name: '搜索流水' }).fill('');
      await page.getByRole('button', { name: '全部', exact: true }).click();
      await page.getByLabel('日期').fill('');
      await page.getByLabel('账户').selectOption('');

      const dateKeys = await page.locator('[id^="transactions-"]').evaluateAll((elements) =>
        elements.map((element) => element.id.replace('transactions-', '')),
      );
      expect(dateKeys).toEqual([...dateKeys].sort().reverse());
      await expect(page.getByRole('button', { name: /取现.*储蓄卡 → 现金/ })).toBeVisible();
      await expectNoDocumentOverflow(page);
    });

    test('preserves focus, validates edits, deletes, and restores through undo in reduced motion', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.getByRole('button', { name: '流水', exact: true }).click();
      const row = page.getByRole('button', { name: /午餐.*现金.*负50\.00元/ });
      await expect(row).toBeVisible();

      await row.click();
      await expect(page.getByRole('dialog', { name: '流水详情' })).toBeVisible();
      await expect(page.getByRole('button', { name: '编辑流水' })).toBeFocused();
      await page.getByRole('button', { name: '关闭详情' }).click();
      await expect(row).toBeFocused();

      await row.click();
      await page.getByRole('button', { name: '编辑流水' }).click();
      const amount = page.getByLabel('金额');
      await amount.fill('0');
      await page.getByRole('button', { name: '保存修改' }).click();
      await expect(page.getByRole('alert')).toHaveText('金额必须大于 0');
      await expect(amount).toBeFocused();
      await amount.fill('51.23');
      await page.getByRole('button', { name: '保存修改' }).click();
      await expect(page.getByRole('dialog', { name: '流水详情' })).toContainText('-¥51.23');

      await page.getByRole('button', { name: '删除流水' }).click();
      const toast = page.getByRole('status');
      await expect(toast).toContainText('流水已删除');
      await expect(row).toHaveCount(0);
      await expect(page.locator('[data-shell-background]')).not.toHaveAttribute('inert');
      const transitionMilliseconds = await toast.evaluate((element) => {
        const duration = getComputedStyle(element).transitionDuration;
        return duration.split(',').map((part) => Number.parseFloat(part) * 1000);
      });
      expect(Math.max(...transitionMilliseconds)).toBeLessThanOrEqual(0.01);

      await page.getByRole('button', { name: '撤销删除' }).click();
      await expect(page.getByRole('button', { name: /午餐.*现金.*负51\.23元/ })).toBeVisible();
      await expect(toast).toHaveCount(0);
      await expectNoDocumentOverflow(page);
    });
  });
}
