import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const evidence = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../outputs/ledger-pwa-p0-p1-evidence');

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' });

test('guest completes transaction lifecycle, accounts, transfer, and import preview', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '游客体验' }).click();
  await expect(page.getByText('游客演示 · 数据仅保存在本机')).toBeVisible();

  await page.getByRole('button', { name: /^记账$/ }).click();
  await page.getByLabel('金额', { exact: true }).fill('10.00');
  await page.getByLabel('名称').fill('浏览器闭环');
  await page.getByLabel('备注').fill('中文,引号“”与换行');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('记账已保存')).toBeVisible();
  await page.getByRole('button', { name: /^流水$/ }).click();
  await page.getByRole('button', { name: /浏览器闭环.*-¥10\.00/ }).click();
  await page.getByRole('button', { name: '编辑流水' }).click();
  await page.getByLabel('流水金额').fill('11.25');
  await page.getByLabel('流水名称').fill('浏览器闭环已编辑');
  await page.getByRole('button', { name: '保存修改' }).click();
  await expect(page.getByText('流水已更新')).toBeVisible();
  await page.getByRole('button', { name: '复制流水' }).click();
  await expect(page.getByText('流水已复制，时间更新为现在')).toBeVisible();
  await expect(page.getByRole('button', { name: /浏览器闭环已编辑.*-¥11\.25/ })).toHaveCount(2);
  await page.getByRole('button', { name: /浏览器闭环已编辑.*-¥11\.25/ }).first().click();
  await page.getByRole('button', { name: '删除流水' }).click();
  await expect(page.getByRole('dialog', { name: '确认删除' })).toContainText('8 秒内可以撤销');
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await page.getByRole('button', { name: '撤销' }).click();
  await expect(page.getByText('删除已撤销')).toBeVisible();

  await page.getByRole('button', { name: /^我的$/ }).click();
  await page.getByRole('button', { name: /账户管理/ }).click();
  await page.getByRole('button', { name: '添加账户' }).click();
  await page.getByLabel('账户名称').fill('浏览器测试账户');
  await page.getByLabel('初始余额').fill('100.00');
  await page.getByRole('button', { name: '创建账户' }).click();
  await expect(page.getByRole('button', { name: '编辑账户 浏览器测试账户' })).toBeVisible();
  await page.getByRole('button', { name: '返回我的页面' }).click();

  await page.getByRole('button', { name: /^记账$/ }).click();
  await page.getByRole('button', { name: '转账' }).click();
  await page.getByLabel('金额', { exact: true }).fill('5.00');
  await page.getByRole('button', { name: /转出账户/ }).click();
  await page.getByRole('option', { name: /现金/ }).click();
  await page.getByRole('button', { name: /转入账户/ }).click();
  await page.getByRole('option', { name: /浏览器测试账户/ }).click();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('转账已保存，不计入收支统计')).toBeVisible();

  await page.getByRole('button', { name: /^流水$/ }).click();
  await page.getByRole('button', { name: '导入导出流水' }).click();
  const csv = '\uFEFF日期,类型,金额,名称,备注,账户,转入账户,类目,来源,交易单号\n2026-08-08 08:30:00,支出,12.50,"导入早餐,面包","第一行\n第二行",现金,,餐饮,微信,e2e-wx-1';
  await page.getByLabel('选择账单文件').setInputFiles({ name: 'wechat.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByLabel('导入预览')).toContainText('尚未写入账本');
  await page.getByRole('button', { name: '确认导入非重复流水' }).click();
  await expect(page.getByText(/成功导入 1 笔/)).toBeVisible();
  await page.getByRole('button', { name: '关闭导入 / 导出流水' }).click();
  await expect(page.getByRole('button', { name: /^导入早餐,面包 餐饮/ })).toBeVisible();
  await expect(page.getByRole('dialog', { name: '导入 / 导出流水' })).toBeHidden();
  await page.screenshot({ path: path.join(evidence, 'p0-p1-core-390x844.png'), fullPage: true });
});

for (const viewport of [
  { width: 320, height: 568, name: 'mobile-small' },
  { width: 844, height: 390, name: 'mobile-landscape' },
  { width: 1440, height: 900, name: 'desktop' },
]) {
  test(`guest shell remains reachable at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('./');
    await page.getByRole('button', { name: '游客体验' }).click();
    await expect(page.getByRole('button', { name: /^记账$/ })).toBeVisible();
    await page.getByRole('button', { name: /^流水$/ }).click();
    await expect(page.getByRole('heading', { name: '流水' })).toBeVisible();
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(evidence, `layout-${viewport.name}.png`), fullPage: true });
  });
}
