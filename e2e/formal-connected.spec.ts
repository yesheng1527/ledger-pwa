import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const email = process.env.LEDGER_TEST_EMAIL;
const password = process.env.LEDGER_TEST_PASSWORD;
const evidence = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../outputs/ledger-pwa-p0-p1-evidence');

test.skip(!email || !password, '需要显式提供正式测试账号环境变量');

test('formal account persists lifecycle, transfer, and offline queue through re-login', async ({ page, context }) => {
  const suffix = Date.now().toString(36);
  const transactionName = `正式闭环-${suffix}`;
  const editedName = `${transactionName}-已编辑`;
  const offlineName = `离线同步-${suffix}`;
  const sourceAccount = `转出-${suffix}`;
  const targetAccount = `转入-${suffix}`;

  await page.goto('./');
  await page.getByRole('textbox', { name: '邮箱' }).fill(email!);
  await page.getByLabel('密码', { exact: true }).fill(password!);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: /好，/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('游客演示 · 数据仅保存在本机')).toHaveCount(0);

  await page.getByRole('button', { name: /^记账$/ }).click();
  await page.getByLabel('金额', { exact: true }).fill('21.00');
  await page.getByLabel('名称').fill(transactionName);
  await page.getByLabel('备注').fill('正式账号\n名称备注往返');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('记账已保存')).toBeVisible();

  await page.getByRole('button', { name: /^流水$/ }).click();
  await page.getByRole('button', { name: new RegExp(`^${transactionName} `) }).click();
  await page.getByRole('button', { name: '编辑流水' }).click();
  await page.getByLabel('流水金额').fill('22.50');
  await page.getByLabel('流水名称').fill(editedName);
  await page.getByRole('button', { name: '保存修改' }).click();
  await expect(page.getByText('流水已更新')).toBeVisible();
  await page.getByRole('button', { name: '复制流水' }).click();
  await expect(page.getByRole('button', { name: new RegExp(`^${editedName} `) })).toHaveCount(2);
  await page.getByRole('button', { name: new RegExp(`^${editedName} `) }).first().click();
  await page.getByRole('button', { name: '删除流水' }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await page.getByRole('button', { name: '撤销' }).click();
  await expect(page.getByText('删除已撤销')).toBeVisible();

  await page.getByRole('button', { name: /^我的$/ }).click();
  await page.getByRole('button', { name: /账户管理/ }).click();
  for (const [name, balance] of [[sourceAccount, '100.00'], [targetAccount, '0.00']] as const) {
    await page.getByRole('button', { name: '添加账户', exact: true }).click();
    await page.getByLabel('账户名称').fill(name);
    await page.getByLabel('初始余额').fill(balance);
    await page.getByRole('button', { name: '创建账户' }).click();
    await expect(page.getByRole('button', { name: `编辑账户 ${name}` })).toBeVisible();
  }
  await page.getByRole('button', { name: '返回我的页面' }).click();

  await page.getByRole('button', { name: /^记账$/ }).click();
  await page.getByRole('button', { name: '转账' }).click();
  await page.getByLabel('金额', { exact: true }).fill('5.00');
  await page.getByRole('button', { name: /转出账户/ }).click();
  await page.getByRole('option', { name: new RegExp(sourceAccount) }).click();
  await page.getByRole('button', { name: /转入账户/ }).click();
  await page.getByRole('option', { name: new RegExp(targetAccount) }).click();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('转账已保存，不计入收支统计')).toBeVisible();

  await expect.poll(async () => page.getByRole('status').allTextContents(), { timeout: 20_000 })
    .toEqual(expect.arrayContaining([expect.stringMatching(/已同步/)]));
  await page.reload();
  await expect(page.getByRole('heading', { name: /好，/ })).toBeVisible();
  await page.getByRole('button', { name: /^流水$/ }).click();
  await expect(page.getByRole('button', { name: new RegExp(`^${editedName} `) })).toHaveCount(2);

  await expect.poll(async () => page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state)).toBe('activated');
  await context.setOffline(true);
  await page.getByRole('button', { name: /^记账$/ }).click();
  await page.getByLabel('金额', { exact: true }).fill('9.90');
  await page.getByLabel('名称').fill(offlineName);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('已保存到本机，等待同步')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /离线 · [1-9]\d* 项等待同步/ })).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByRole('status').filter({ hasText: /已同步/ })).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: /^我的$/ }).click();
  await page.getByRole('button', { name: '退出登录' }).click();
  await page.getByRole('button', { name: '确认退出' }).click();
  await expect(page.getByRole('heading', { name: '登录' })).toBeVisible();
  await page.getByRole('textbox', { name: '邮箱' }).fill(email!);
  await page.getByLabel('密码', { exact: true }).fill(password!);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: /好，/ })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /^流水$/ }).click();
  await expect(page.getByText(offlineName)).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(`^${editedName} `) })).toHaveCount(2);
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(evidence, 'formal-connected-relogin-390x844.png'), fullPage: true });
});
