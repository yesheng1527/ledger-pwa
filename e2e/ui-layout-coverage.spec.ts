import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const evidenceDirectory = path.resolve('.superpowers/sdd/ui-layout-evidence');

async function settleVisuals(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => resolve(), { once: true });
      });
    }));
  });
}

async function capture(page: Page, name: string) {
  await settleVisuals(page);
  await page.screenshot({ path: path.join(evidenceDirectory, `${name}.png`), animations: 'disabled' });
}

async function expectNoViewportOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    documentHeight: document.documentElement.scrollHeight,
    viewportHeight: document.documentElement.clientHeight,
  }));
  expect(dimensions.documentWidth).toBe(dimensions.viewportWidth);
  expect(dimensions.documentHeight).toBe(dimensions.viewportHeight);

  const main = await page.getByRole('main').boundingBox();
  const viewport = page.viewportSize();
  expect(main).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(main!.x).toBeGreaterThanOrEqual(-1);
  expect(main!.y).toBeGreaterThanOrEqual(-1);
  expect(main!.x + main!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(main!.y + main!.height).toBeLessThanOrEqual(viewport!.height + 1);
}

test.beforeAll(async () => {
  await fs.rm(evidenceDirectory, { recursive: true, force: true });
  await fs.mkdir(evidenceDirectory, { recursive: true });
});

test('covers login, registration, password recovery, and responsive auth layouts', async ({ page }) => {
  const authViewports = [
    { width: 320, height: 568, name: 'phone-small' },
    { width: 390, height: 844, name: 'phone-standard' },
    { width: 1440, height: 900, name: 'desktop' },
  ] as const;

  for (const viewport of authViewports) {
    await page.setViewportSize(viewport);
    await page.goto('?fixture=logged-out&visual=1');
    await expect(page.getByRole('region', { name: '海风小账本' })).toBeVisible();
    await expectNoViewportOverflow(page);
    await capture(page, `auth-${viewport.name}-login`);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('?fixture=logged-out&visual=1');
  await page.getByRole('button', { name: '注册账号', exact: true }).click();
  await expect(page.getByRole('heading', { name: '注册账号' })).toBeVisible();
  await expectNoViewportOverflow(page);
  await capture(page, 'auth-phone-standard-register');

  await page.getByRole('button', { name: '返回登录', exact: true }).click();
  await page.getByRole('button', { name: '忘记密码', exact: true }).click();
  await expect(page.getByRole('heading', { name: '找回密码' })).toBeVisible();
  await expectNoViewportOverflow(page);
  await capture(page, 'auth-phone-standard-forgot');

  await page.goto('reset-password?fixture=recovery&visual=1');
  await expect(page.getByRole('heading', { name: '设置新密码' })).toBeVisible();
  await expectNoViewportOverflow(page);
  await capture(page, 'auth-phone-standard-reset');
});

for (const viewport of [
  { width: 320, height: 568, name: 'phone-small' },
  { width: 390, height: 844, name: 'phone-standard' },
  { width: 430, height: 932, name: 'phone-large' },
  { width: 1440, height: 900, name: 'desktop' },
] as const) {
  test(`${viewport.name} keeps every primary page inside the viewport`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('?fixture=logged-in&visual=1');

    const pageNames = { 首页: 'home', 流水: 'transactions', 记账: 'entry', 统计: 'statistics', 我的: 'profile' } as const;
    for (const label of ['首页', '流水', '记账', '统计', '我的'] as const) {
      if (label !== '首页') await page.getByRole('button', { name: label, exact: true }).click();
      await expect(page.getByRole('main')).toBeVisible();
      await expectNoViewportOverflow(page);
      const shouldCapture = viewport.name === 'phone-small' && ['流水', '记账', '统计'].includes(label)
        || viewport.name === 'desktop' && ['首页', '记账'].includes(label);
      if (shouldCapture) await capture(page, `${viewport.name}-${pageNames[label]}`);
      if (label === '记账') {
        if (viewport.name === 'phone-small') {
          const entryScroller = page.locator('div[class*="entryScrollContent"]');
          await entryScroller.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
          const accountRow = page.getByRole('button', { name: /^账户/ });
          const saveButton = page.getByRole('button', { name: '保存', exact: true });
          await expect(accountRow).toBeVisible();
          await expect(saveButton).toBeVisible();
          const [accountBox, saveBox] = await Promise.all([accountRow.boundingBox(), saveButton.boundingBox()]);
          const activeViewport = page.viewportSize();
          expect(accountBox).not.toBeNull();
          expect(saveBox).not.toBeNull();
          expect(activeViewport).not.toBeNull();
          expect(saveBox!.y).toBeGreaterThanOrEqual(0);
          expect(saveBox!.y + saveBox!.height).toBeLessThanOrEqual(activeViewport!.height);
          expect(accountBox!.y + accountBox!.height).toBeLessThanOrEqual(saveBox!.y - 8);
          await capture(page, 'phone-small-entry-scrolled-bottom');
        }
        await page.getByRole('button', { name: '关闭', exact: true }).click();
        await expect(page.getByRole('heading', { name: '流水' })).toBeVisible();
      }
    }
    await capture(page, `${viewport.name}-profile`);
  });
}

test('captures all primary pages, profile subpages, and representative overlays', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('?fixture=logged-in&visual=1');
  await capture(page, '01-home');

  await page.getByRole('button', { name: '查看资产账户' }).click();
  await expect(page.getByRole('dialog', { name: '我的资产账户' })).toBeVisible();
  await capture(page, '02-home-assets-dialog');
  await page.getByRole('button', { name: '关闭我的资产账户' }).click();

  await page.getByRole('button', { name: '流水', exact: true }).click();
  await capture(page, '03-transactions-empty');
  await page.getByRole('button', { name: '2024年5月', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '2024年5月' })).toBeVisible();
  await capture(page, '04-transactions-calendar');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: '记账', exact: true }).click();
  await capture(page, '05-entry');
  await page.getByRole('button', { name: '编辑类目' }).click();
  await expect(page.getByRole('dialog', { name: '类目管理' })).toBeVisible();
  await capture(page, '06-entry-category-manager');
  await page.getByRole('button', { name: '关闭类目管理' }).click();
  await page.getByRole('button', { name: '关闭', exact: true }).click();

  await page.getByRole('button', { name: '统计', exact: true }).click();
  await capture(page, '07-statistics');
  await page.getByRole('button', { name: '自定义', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '自定义统计范围' })).toBeVisible();
  await capture(page, '08-statistics-custom-range');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: '我的', exact: true }).click();
  await capture(page, '09-profile');

  const sections = [
    ['个人资料', /海风的小账本/],
    ['预算管理', /^预算管理/],
    ['账户管理', /^账户管理/],
    ['记账提醒', /^记账提醒/],
    ['备份与恢复', /^备份与恢复/],
    ['背景设置', /^背景设置/],
    ['主题设置', /^主题设置/],
    ['偏好设置', /^偏好设置/],
    ['关于我们', /^关于我们/],
  ] as const;

  for (const [section, trigger] of sections) {
    await page.getByRole('button', { name: trigger }).click();
    await expect(page.getByRole('heading', { name: section })).toBeVisible();
    await expectNoViewportOverflow(page);
    await capture(page, `profile-${section}`);
    await page.getByRole('button', { name: '返回我的页面' }).click();
  }

  await page.getByRole('button', { name: '退出登录' }).click();
  const signOutDialog = page.getByRole('dialog', { name: '退出登录' });
  await expect(signOutDialog).toBeVisible();
  await expect(page.getByRole('button', { name: '关闭退出登录' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(signOutDialog.locator(':focus')).toHaveCount(1);
  await capture(page, '10-profile-sign-out-dialog');
  await page.keyboard.press('Escape');

  expect(consoleErrors).toEqual([]);
});

test('page transition has one real stage and a visible smooth intermediate frame', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => sessionStorage.setItem('seabreeze-splash-seen', 'true'));
  await page.goto('?fixture=logged-in');
  const stage = page.locator('div[class*="pageStage"]');

  await page.getByRole('button', { name: '流水', exact: true }).click();
  await page.waitForTimeout(48);
  const intermediate = await stage.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      count: document.querySelectorAll('div[class*="pageStage"]').length,
      animationDuration: style.animationDuration,
      animationName: style.animationName,
      opacity: Number(style.opacity),
      transform: style.transform,
      backgroundColor: style.backgroundColor,
    };
  });

  expect(intermediate.count).toBe(1);
  expect(intermediate.animationDuration).toBe('0.32s');
  expect(intermediate.animationName).toContain('appPageIn');
  expect(intermediate.opacity).toBeGreaterThanOrEqual(0.97);
  expect(intermediate.transform).not.toBe('none');
  expect(intermediate.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  await capture(page, '11-transition-intermediate');

  await expect(stage).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)', { timeout: 1_000 });
  await expect(stage).toHaveCSS('opacity', '1');
});
