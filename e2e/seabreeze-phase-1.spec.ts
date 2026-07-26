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
  await expect(page.getByLabel('总资产')).toHaveText('¥3,500.00');
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

async function openEntry(page: Page, type: '支出' | '收入' | '转账' | '退款' | '余额校准') {
  const source = page.getByRole('button', { name: '记账', exact: true });
  await source.click();
  const dialog = page.getByRole('dialog', { name: '记账' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('金额')).toBeFocused();
  await expect(page.locator('[data-shell-background]')).toHaveAttribute('inert');
  if (type !== '支出') {
    await dialog.getByRole('button', { name: type, exact: true }).click();
  }
  await expect(dialog.getByRole('button', { name: type, exact: true }))
    .toHaveAttribute('aria-pressed', 'true');
  return { dialog, source };
}

async function createEntry(
  page: Page,
  type: '支出' | '收入' | '转账' | '退款' | '余额校准',
  amount: string,
  note: string,
) {
  const { dialog, source } = await openEntry(page, type);
  await dialog.getByLabel('金额').fill(amount);
  if (type === '退款') {
    await dialog.getByLabel('原支出').selectOption({ index: 1 });
    await expect(dialog.getByText(/^退款原账户：/)).toBeVisible();
  }
  await dialog.getByLabel('备注').fill(note);
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(source).toBeFocused();
  await expect(page.locator('[data-shell-background]')).not.toHaveAttribute('inert');
}

for (const viewport of viewports) {
  test.describe(`${viewport.width}x${viewport.height} seabreeze phase one`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(viewport);
      await openFixture(page);
    });

    test('navigates four real pages with textual statistics and profile state', async ({ page }) => {
      const navigation = page.getByRole('navigation', { name: '主要导航' });
      const labels = ['首页', '流水', '记账', '统计', '我的'] as const;
      for (const label of labels) {
        await expectTargetAtLeast44(
          navigation.getByRole('button', { name: label, exact: true }),
        );
      }

      await page.getByRole('button', { name: '流水', exact: true }).click();
      await expect(page.getByRole('heading', { name: '流水' })).toBeVisible();
      await expect(page.getByRole('main')).toHaveCount(1);

      await page.getByRole('button', { name: '统计', exact: true }).click();
      await expect(page.getByRole('heading', { name: '统计' })).toBeVisible();
      await expect(page.getByLabel('支出 230.00 元')).toHaveText('¥230.00');
      await expect(page.getByRole('list', { name: '支出分类数据' })).toContainText('餐饮');
      await expect(page.getByRole('table', { name: '收支趋势数据' })).toContainText('¥180.00');
      await expect(page.getByRole('table', { name: '收支趋势数据' })).toContainText('¥50.00');
      await expect(page.getByRole('table', { name: '月度对比数据' })).toBeVisible();
      await expect(page.getByRole('list', { name: '账户分布数据' })).toContainText('储蓄卡');

      await page.getByRole('button', { name: '年', exact: true }).click();
      await expect(page.getByLabel('年份')).toHaveValue('2026');
      await expect(page.getByLabel('支出 230.00 元')).toBeVisible();

      await page.getByRole('button', { name: '自定义', exact: true }).click();
      await page.getByLabel('开始日期').fill('2026-07-17');
      await page.getByLabel('结束日期').fill('2026-07-18');
      await expect(page.getByLabel('支出 230.00 元')).toBeVisible();
      await expect(page.getByRole('table', { name: '收支趋势数据' })).toBeVisible();

      await page.getByRole('button', { name: '我的', exact: true }).click();
      const profile = page.getByRole('main');
      await expect(profile.getByRole('heading', { name: '我的' })).toBeVisible();
      await expect(profile.getByText('e2e', { exact: true })).toBeVisible();
      await expect(profile.getByRole('heading', { name: '同步状态' })).toBeVisible();
      await expect(profile.getByText('已同步', { exact: true })).toBeVisible();
      await expect(profile.getByText('0 笔待同步', { exact: true })).toBeVisible();
      await expect(profile.getByRole('heading', { name: '账本管理' })).toBeVisible();
      await expect(profile).toHaveCount(1);
      await expectNoDocumentOverflow(page);
    });

    test('creates all five transaction types and refreshes home and statistics', async ({ page }) => {
      await createEntry(page, '支出', '12.34', '阶段一支出');
      await createEntry(page, '收入', '100', '阶段一收入');
      await createEntry(page, '转账', '20', '阶段一转账');
      await createEntry(page, '退款', '5', '阶段一退款');
      await createEntry(page, '余额校准', '2', '阶段一校准');

      await expect(page.getByLabel('本月支出')).toHaveText('¥237.34');
      await expect(page.getByLabel('本月收入')).toHaveText('¥1,100.00');
      await expect(page.getByLabel('本月结余')).toHaveText('¥862.66');

      await page.getByRole('button', { name: '流水', exact: true }).click();
      const search = page.getByRole('searchbox', { name: '搜索流水' });
      for (const note of ['阶段一支出', '阶段一收入', '阶段一转账', '阶段一退款', '阶段一校准']) {
        await search.fill(note);
        await expect(page.getByRole('button', { name: new RegExp(note) })).toHaveCount(1);
      }

      await page.getByRole('button', { name: '统计', exact: true }).click();
      await expect(page.getByLabel('支出 237.34 元')).toHaveText('¥237.34');
      await expect(page.getByLabel('收入 1100.00 元')).toHaveText('¥1,100.00');
      await expect(page.getByLabel('结余 862.66 元')).toHaveText('¥862.66');
      await expectNoDocumentOverflow(page);
    });

    test('traps and restores focus while keeping reduced-motion state usable', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const { dialog, source } = await openEntry(page, '支出');
      const close = dialog.getByRole('button', { name: '关闭记账' });
      const save = dialog.getByRole('button', { name: '保存', exact: true });

      await close.focus();
      await page.keyboard.press('Shift+Tab');
      await expect(save).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(close).toBeFocused();
      await expect(save).toBeVisible();
      const transitionMilliseconds = await dialog.evaluate((element) => (
        getComputedStyle(element).transitionDuration
          .split(',')
          .map((part) => Number.parseFloat(part) * 1000)
      ));
      expect(Math.max(...transitionMilliseconds)).toBeLessThanOrEqual(0.01);

      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(source).toBeFocused();
      await expect(page.locator('[data-shell-background]')).not.toHaveAttribute('inert');

      const detailSource = page.getByRole('button', { name: /查看流水：午餐/ });
      await detailSource.click();
      const detail = page.getByRole('dialog', { name: '流水详情' });
      await expect(detail).toBeVisible();
      await expect(page.getByRole('button', { name: '编辑流水' })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(detail).toHaveCount(0);
      await expect(detailSource).toBeFocused();
      await expect(page.getByRole('main')).toHaveCount(1);
      await expectNoDocumentOverflow(page);
    });
  });
}
