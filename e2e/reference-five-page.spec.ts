import { expect, test, type Page } from '@playwright/test';

const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 400, height: 982 },
  { width: 430, height: 932 },
] as const;

async function expectPageFitsViewport(page: Page, viewport: (typeof viewports)[number]) {
  const mainBox = await page.getByRole('main').boundingBox();
  expect(mainBox, 'the active reference page must render').not.toBeNull();
  expect(mainBox!.x).toBeGreaterThanOrEqual(-1);
  expect(mainBox!.y).toBeGreaterThanOrEqual(-1);
  expect(mainBox!.x + mainBox!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(mainBox!.y + mainBox!.height).toBeLessThanOrEqual(viewport.height + 1);

  const overflow = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    documentHeight: document.documentElement.scrollHeight,
    viewportHeight: document.documentElement.clientHeight,
  }));
  expect(overflow.documentWidth).toBe(overflow.viewportWidth);
  expect(overflow.documentHeight).toBe(overflow.viewportHeight);
}

async function expectNavigationPinned(page: Page, viewport: (typeof viewports)[number]) {
  const navigationBox = await page.getByRole('navigation', { name: '主要导航' }).boundingBox();
  expect(navigationBox, 'the bottom navigation must render').not.toBeNull();
  expect(navigationBox!.x).toBeCloseTo(0, 0);
  expect(navigationBox!.width).toBeCloseTo(viewport.width, 0);
  expect(navigationBox!.y + navigationBox!.height).toBeCloseTo(viewport.height, 0);
}

async function expectCenteredDialog(page: Page, name: string) {
  const dialog = page.getByRole('dialog', { name });
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(box, `${name} must render`).not.toBeNull();
  expect(viewport, 'the test viewport must be available').not.toBeNull();
  expect(box!.y).toBeGreaterThan(8);
  expect(box!.y + box!.height).toBeLessThan(viewport!.height - 8);
  expect(Math.abs((box!.y + box!.height / 2) - viewport!.height / 2)).toBeLessThan(3);
}

for (const viewport of viewports) {
  test(`${viewport.width}x${viewport.height} keeps all five reference pages in frame`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('?fixture=logged-in&visual=1');

    await expect(page.getByRole('heading', { name: '早上好，海风~' })).toBeVisible();
    await expect(page.getByLabel('状态栏')).toHaveCount(0);
    await expectPageFitsViewport(page, viewport);
    await expect(page.getByRole('main')).toHaveCSS('transform', 'none');
    await expectNavigationPinned(page, viewport);

    await page.getByRole('button', { name: '流水', exact: true }).click();
    await expect(page.getByRole('heading', { name: '流水' })).toBeVisible();
    await expectPageFitsViewport(page, viewport);
    await expectNavigationPinned(page, viewport);

    await page.getByRole('button', { name: '记账', exact: true }).click();
    await expect(page.getByLabel('金额')).toBeVisible();
    await expectPageFitsViewport(page, viewport);
    await page.getByRole('button', { name: '关闭' }).click();

    await page.getByRole('button', { name: '统计', exact: true }).click();
    await expect(page.getByRole('heading', { name: '统计' })).toBeVisible();
    await expectPageFitsViewport(page, viewport);
    await expectNavigationPinned(page, viewport);

    await page.getByRole('button', { name: '我的', exact: true }).click();
    await expect(page.getByText('海风的小账本')).toBeVisible();
    await expect(page.getByRole('button', { name: '退出登录' })).toBeVisible();
    await expectPageFitsViewport(page, viewport);
    await expectNavigationPinned(page, viewport);
  });
}

test('profile sign-out requires confirmation and returns to login', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('?fixture=logged-in&visual=1');

  await page.getByRole('button', { name: '我的', exact: true }).click();
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page.getByRole('dialog', { name: '退出登录' })).toBeVisible();

  await page.getByRole('button', { name: '取消' }).click();
  await expect(page.getByRole('dialog', { name: '退出登录' })).toHaveCount(0);
  await expect(page.getByText('海风的小账本')).toBeVisible();

  await page.getByRole('button', { name: '退出登录' }).click();
  await page.getByRole('button', { name: '确认退出' }).click();
  await expect(page.getByRole('heading', { name: '登录' })).toBeVisible();
});

test('budget saved in profile updates the home balance card', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('?fixture=logged-in');

  const homeBudget = page.getByRole('group', { name: '本月预算概览' });
  const homeBudgetProgress = page.getByRole('progressbar', { name: '本月剩余预算进度' });
  const homeBudgetProgressFill = homeBudgetProgress.locator('img').last();
  await expect(homeBudget).toContainText('本月预算¥500.00');
  await expect(homeBudget).toContainText('剩余预算¥270.00');
  await expect(homeBudgetProgress).toHaveAttribute('aria-valuenow', '54');
  await expect(homeBudgetProgressFill).toHaveCSS('transition-duration', /0\.72s/);

  await page.getByRole('button', { name: '我的', exact: true }).click();
  await page.getByRole('button', { name: /预算管理/ }).click();
  await page.getByLabel('本月预算').fill('800.00');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('预算管理已保存', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '首页', exact: true }).click();
  await expect(homeBudget).toContainText('本月预算¥800.00');
  await expect(homeBudget).toContainText('剩余预算¥570.00');
  await expect(homeBudgetProgress).toHaveAttribute('aria-valuenow', '71');
});

test('entry and filter controls keep their state and close back to the prior page', async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 982 });
  await page.goto('?fixture=logged-in&visual=1');

  await page.getByRole('button', { name: '流水', exact: true }).click();
  const shoppingFilter = page.getByRole('button', { name: '购物', exact: true });
  await shoppingFilter.click();
  await expect(shoppingFilter).toHaveAttribute('data-active', 'true');

  await page.getByRole('button', { name: '记账', exact: true }).click();
  const incomeTab = page.getByRole('button', { name: '收入', exact: true });
  await incomeTab.click();
  await expect(incomeTab).toHaveAttribute('data-active', 'true');

  const amount = page.getByLabel('金额');
  await amount.fill('125.50');
  await expect(amount).toHaveValue('125.50');

  await page.getByRole('button', { name: '支出', exact: true }).click();
  const shoppingCategory = page.getByRole('button', { name: '购物', exact: true });
  await shoppingCategory.click();
  await expect(shoppingCategory).toHaveAttribute('data-active', 'true');

  await page.getByRole('button', { name: '关闭' }).click();
  await expect(page.getByRole('heading', { name: '流水' })).toBeVisible();
});

test('transaction category filters scroll horizontally on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('?fixture=logged-in&visual=1');

  await page.getByRole('button', { name: '流水', exact: true }).click();
  const categoryFilters = page.getByRole('group', { name: '类目筛选' });
  await expect(categoryFilters).toBeVisible();
  expect(await categoryFilters.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
});

test('transaction date picker supports a selected day and whole-month mode', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('?fixture=logged-in&visual=1');

  await page.getByRole('button', { name: '流水', exact: true }).click();
  await page.getByRole('button', { name: '2024年5月', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '2024年5月' });
  await expect(picker).toBeVisible();
  await page.getByRole('gridcell', { name: '2024年5月22日' }).click();
  await page.getByRole('button', { name: '确定', exact: true }).click();
  await expect(page.getByRole('button', { name: '2024年5月22日', exact: true })).toBeVisible();

  await page.getByRole('button', { name: '2024年5月22日', exact: true }).click();
  await page.getByRole('button', { name: '改为筛选整月', exact: true }).click();
  await page.getByRole('button', { name: '确定', exact: true }).click();
  await expect(page.getByRole('button', { name: '2024年5月', exact: true })).toBeVisible();
  await expectPageFitsViewport(page, { width: 390, height: 844 });
});

test('transaction filter dropdowns keep a fixed viewport and scroll internally', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('?fixture=logged-in&visual=1');

  await page.getByRole('button', { name: '流水', exact: true }).click();
  await page.getByRole('button', { name: '全部账户', exact: true }).click();

  const accountMenu = page.getByRole('listbox', { name: '选择账户' });
  await expect(accountMenu).toBeVisible();
  const scrollState = await accountMenu.evaluate((menu) => ({
    clientHeight: menu.clientHeight,
    scrollHeight: menu.scrollHeight,
    overflowY: getComputedStyle(menu).overflowY,
  }));

  expect(scrollState.clientHeight).toBeLessThanOrEqual(192);
  expect(scrollState.scrollHeight).toBeGreaterThan(scrollState.clientHeight);
  expect(scrollState.overflowY).toBe('auto');
  await expectPageFitsViewport(page, { width: 390, height: 844 });
});

test('statistics month and year ranges open below their trigger', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('?fixture=logged-in&visual=1');

  await page.getByRole('button', { name: '统计', exact: true }).click();
  const monthTrigger = page.getByRole('button', { name: '2024年5月', exact: true });
  await monthTrigger.click();

  const monthMenu = page.getByRole('listbox', { name: '选择统计周期' });
  await expect(monthMenu).toBeVisible();
  await expect(page.getByRole('dialog', { name: '选择统计周期' })).toHaveCount(0);
  await expect(monthMenu).toHaveCSS('overflow-y', 'auto');
  const triggerBox = await monthTrigger.boundingBox();
  const menuBox = await monthMenu.boundingBox();
  expect(triggerBox).not.toBeNull();
  expect(menuBox).not.toBeNull();
  expect(menuBox!.y).toBeGreaterThanOrEqual(triggerBox!.y + triggerBox!.height);
  expect(menuBox!.height).toBeLessThanOrEqual(192);

  await page.getByRole('option', { name: '2024年4月' }).click();
  await expect(monthMenu).toHaveCount(0);
  await page.getByRole('button', { name: '年', exact: true }).click();
  const yearTrigger = page.getByRole('button', { name: '2024年', exact: true });
  await yearTrigger.click();
  await expect(page.getByRole('listbox', { name: '选择统计周期' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: '选择统计周期' })).toHaveCount(0);
  await expectPageFitsViewport(page, { width: 390, height: 844 });
});

test('page interactions produce visible results and respect reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 982 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('?fixture=logged-in&visual=1');

  const homePage = page.getByRole('main');
  await expect(homePage).toHaveCSS('animation-name', 'none');
  await page.getByRole('button', { name: '隐藏金额' }).click();
  await expect(page.getByRole('button', { name: '显示金额' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('¥2,468.00')).toHaveCount(0);

  await page.getByRole('button', { name: '流水', exact: true }).click();
  await page.getByRole('button', { name: /工资.*\+¥6,800\.00/ }).click();
  await expect(page.getByRole('dialog', { name: '流水详情' })).toBeVisible();
  await expectCenteredDialog(page, '流水详情');
  await page.getByRole('button', { name: '关闭流水详情' }).click();
  await page.getByRole('button', { name: '娱乐', exact: true }).click();
  await expect(page.getByText('没有找到符合条件的流水')).toBeVisible();
  await page.getByRole('button', { name: '全部', exact: true }).click();
  await page.getByRole('button', { name: '搜索' }).click();
  await page.getByRole('textbox', { name: '搜索流水' }).fill('工资');
  await expect(page.getByRole('button', { name: /工资/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /早餐/ })).toHaveCount(0);

  await page.getByRole('button', { name: '统计', exact: true }).click();
  await page.getByRole('button', { name: '年', exact: true }).click();
  await expect(page.getByText('¥43,520.00', { exact: true })).toBeVisible();
  await expect(page.locator('polyline').first()).toHaveCSS('stroke-dashoffset', '0px');
  await expect(page.locator('circle').first()).toHaveCSS('opacity', '1');

  await page.getByRole('button', { name: '我的', exact: true }).click();
  await page.getByRole('button', { name: /偏好设置/ }).click();
  await expect(page.getByRole('heading', { name: '偏好设置' })).toBeVisible();
  await page.getByRole('checkbox', { name: '默认隐藏金额' }).check();
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByRole('status')).toContainText('偏好设置已保存');
});

test('document interaction flow supports detail edit, delete undo, custom dates, and focused entry', async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 982 });
  await page.goto('?fixture=logged-in&visual=1');

  await page.getByRole('button', { name: '流水', exact: true }).click();
  const breakfast = page.getByRole('button', { name: /早餐.*-¥23\.00/ });
  await breakfast.click();
  await expect(page.getByRole('dialog', { name: '流水详情' })).toBeVisible();
  await page.getByRole('button', { name: '编辑流水' }).click();
  await page.getByLabel('流水名称').fill('早午餐');
  await page.getByLabel('流水金额').fill('30.50');
  await page.getByLabel('流水备注').fill('周末加餐');
  await page.getByRole('button', { name: '保存修改' }).click();
  await expect(page.getByRole('dialog', { name: '流水详情' })).toContainText('周末加餐');
  await page.getByRole('button', { name: '关闭流水详情' }).click();
  const editedBreakfast = page.getByRole('button', { name: /早午餐.*-¥30\.50/ });
  await expect(editedBreakfast).toBeFocused();

  await editedBreakfast.click();
  await page.getByRole('button', { name: '删除流水' }).click();
  await expect(editedBreakfast).toHaveCount(0);
  await expect(page.getByText('已删除“早午餐”')).toBeVisible();
  await page.getByRole('button', { name: '撤销' }).click();
  await expect(page.getByRole('button', { name: /早午餐.*-¥30\.50/ })).toBeVisible();

  await page.getByRole('button', { name: '娱乐', exact: true }).click();
  await expect(page.getByText('没有找到符合条件的流水')).toBeVisible();
  await page.getByRole('button', { name: '清除筛选' }).click();
  await expect(page.getByRole('button', { name: '全部', exact: true })).toHaveAttribute('data-active', 'true');

  await page.getByRole('button', { name: '统计', exact: true }).click();
  const customPeriod = page.getByRole('button', { name: '自定义', exact: true });
  await customPeriod.click();
  await expectCenteredDialog(page, '自定义统计范围');
  await page.getByLabel('开始日期').fill('2024-05-10');
  await page.getByLabel('结束日期').fill('2024-05-22');
  await page.getByRole('button', { name: '应用' }).click();
  await expect(page.getByRole('button', { name: /5月10日-5月22日/ })).toBeVisible();
  await expect(customPeriod).toBeFocused();

  await page.getByRole('button', { name: '记账', exact: true }).click();
  await expect(page.getByLabel('金额')).toBeFocused();
  await page.getByLabel('金额').fill('0.10');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByRole('button', { name: '已保存' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '统计' })).toBeVisible();
});
