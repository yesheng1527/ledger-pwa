# 海风小账本阶段一：五页视觉骨架、完整记账与真实统计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以五页参考图为唯一视觉方向，完成统一移动端外壳、支出/收入/转账/退款/余额校准五类新增流水、真实统计页和“我的”页第一阶段骨架，同时保留现有首页、流水、详情、编辑、删除撤销、离线写入和同步行为。

**Architecture:** 继续以 `LedgerViewModel` 作为页面唯一数据与命令边界；新增流水使用现有 `buildPosting()`、`LedgerOperation`、Repository 原子写入和 outbox，统计由纯领域选择器从一次 `LedgerReadSnapshot` 生成。四个普通页面继续常驻，中央记账改为独立全屏操作层；视觉候选使用单独 Playwright 配置写入被 Git 忽略的目录，用户批准前不改官方快照。

**Tech Stack:** React 19.2.7、TypeScript 7.0.2、Dexie 4.4.4、Vitest 4.1.10、Testing Library、Playwright 1.61.1、CSS Modules、现有 Supabase RPC/SyncEngine、独立 SVG/WEBP 资产。

## Global Constraints

- 设计规格：`docs/superpowers/specs/2026-07-26-seabreeze-unified-five-page-design.md`；视觉基准：`docs/superpowers/specs/assets/2026-07-26-seabreeze-five-page-reference.png`。
- 参考图只用于测量和并排 QA，不得作为页面背景、裁片或运行时资源导入。
- 全程 TDD：每个行为先运行针对性测试并观察 RED，再做最小实现和 GREEN。
- 页面只能依赖 `src/view-model`、`src/domain` 纯类型/格式化函数、`src/design-system` 与 `src/assets`；不得直接导入 Dexie、Supabase、Repository、服务层或 SyncEngine。
- 人民币金额始终是安全整数分；用户输入只经 `parseYuan()` 转换，不得使用浮点乘法。
- 新增流水继续使用现有 `buildPosting()`、`transaction.create`、UUID 幂等键、本地原子写入、outbox 和同步路径。
- 转账转出账户必须是资产账户，转入/转出不得相同；退款必须关联未删除原支出并固定原账户；余额校准必须显式选择增减方向。
- ViewModel 刷新不得清空正在编辑的记账草稿；保存失败保留全部输入并聚焦责任字段。
- 图表数据只能由领域选择器产生；每张图必须有等价文字摘要，颜色不能是唯一语义。
- 禁止 emoji、字符假图标、CSS 拼图、远程图片和运行时演示财务数据；新图标必须是独立、带 `viewBox`、无脚本/事件属性/远程 URL 的 SVG。
- 页面底色 `#fff9ef`，主要文字 `#34312e`，次要文字 `#756f68`，珊瑚红 `#f46d58`，海蓝 `#8bcfe8`，结余橙 `#e8892e`，支出红 `#e85043`，收入绿 `#2e9b68`。
- 控件圆角 10–14px、卡片圆角 14–20px、点击目标至少 44×44px；字体为 `-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif`。
- 320×568、390×844、430×932 必须无文档级横向溢出；正式页面不复制手机状态栏或设备边框。
- 四个普通面板保持挂载并保存滚动/筛选；中央记账不是第五个常驻面板，全屏打开时隐藏底部导航。
- 不删除或清空本地/云端账目；本阶段不新增数据库表，不读取或输出 `.env` 值。
- 候选图必须隔离到 `.superpowers/sdd/seabreeze-phase-1-previews/`；用户明确批准前不得运行官方快照更新命令或修改 `e2e/snapshots/`。

---

## File Map

### Visual gate and reference audit

- Create `scripts/verify-seabreeze-phase-1-visual-gate.mjs`: 校验候选配置、官方快照锁和禁止更新门禁。
- Create `scripts/verify-seabreeze-phase-1-visual-gate.test.mjs`: 在临时目录验证锁对修改、新增、删除的检测。
- Create `docs/verification/seabreeze-phase-1-visual-lock.json`: 记录阶段开始时官方 PNG 的 SHA-256。
- Create `docs/verification/seabreeze-phase-1-asset-audit.md`: 记录参考图尺寸、页面测量、现有资产保留/重绘决定和安全扫描。
- Create `playwright.seabreeze-phase-1.config.ts`: 只运行阶段一候选截图。
- Create `e2e/candidate-seabreeze-phase-1.spec.ts`: 五页候选状态。
- Modify `playwright.config.ts`, `package.json`: 默认测试忽略候选文件并增加独立命令。

### Design system and artwork

- Modify `src/design-system/tokens.css`, `src/design-system/global.css`: 实测令牌、纸张、字体、安全区和减少动效。
- Modify `src/design-system/components/BottomNavigation.tsx`, `Card.tsx` and `design-system.test.tsx`: 新五栏导航、紧凑卡片和 44px 合同。
- Create `src/design-system/components/PageHeader.tsx`, `SegmentedControl.tsx`, `ProgressBar.tsx`: 共享页面标题、分段控件和预算进度。
- Modify `src/assets/registry.ts`, `src/assets/assets.test.tsx`, `src/assets/ATTRIBUTION.md`: 注册和扫描新独立资产。
- Create `src/assets/illustrations/profile-seaside.svg`.
- Create `src/assets/icons/actions/{search,calendar,reminder,close,more}.svg`.
- Create `src/assets/icons/management/{budget,account,reminder,backup,theme,preferences,about,sync}.svg`.

### Transaction creation

- Modify `src/view-model/types.ts`: `TransactionCreateInput`、记账选项和草稿接口。
- Modify `src/view-model/ledger-view-model.ts`, `ledger-view-model.test.ts`: `getEntryOptions()` 与 `createTransaction()`。
- Create `src/features/entry/entry-draft.ts`, `entry-draft.test.ts`: 默认值、校验、最后账户和错误字段控制器。
- Create `src/features/entry/TransactionEntryPage.tsx`, `TransactionEntryPage.module.css`, `TransactionEntryPage.test.tsx`: 全屏五类型记账页。

### Statistics and page shells

- Create `src/domain/statistics.ts`, `statistics.test.ts`: 月/年/自定义区间真实统计选择器。
- Modify `src/view-model/types.ts`, `ledger-view-model.ts`, `ledger-view-model.test.ts`: `StatisticsRange`、`StatisticsSnapshot`、`getStatistics()`。
- Create `src/features/statistics/StatisticsPage.tsx`, `StatisticsPage.module.css`, `StatisticsPage.test.tsx`.
- Create `src/features/statistics/AccessibleDonutChart.tsx`, `AccessibleTrendChart.tsx`: SVG 图表与同等文字摘要。
- Create `src/features/profile/ProfilePage.tsx`, `ProfilePage.module.css`, `ProfilePage.test.tsx`: 真实账号/同步状态与分阶段入口。
- Modify `src/features/home/HomePage.tsx`, `HomePage.module.css`, `HomePage.test.tsx`: 参考图层级、月份选择、预算、快捷记账和最近三条。
- Modify `src/features/transactions/TransactionsPage.tsx`, `TransactionsPage.module.css`, `TransactionsPage.test.tsx`: 参考图紧凑流水视觉，不改变筛选语义。
- Modify `src/app/AppShell.tsx`, `AppShell.module.css`, `AppShell.test.tsx`, `navigation.ts`: 移除全局顶栏、接入三页、全屏记账和四页常驻。
- Modify `src/test/ledger-fixture.ts`, `src/test/e2e-services.ts`: 增加统计/新增流水候选状态，仍只在 `test-e2e` 动态导入。
- Create `e2e/seabreeze-phase-1.spec.ts`; modify `e2e/accessibility.spec.ts`: 功能、焦点、44px、三视口和减少动效。
- Create `.superpowers/sdd/seabreeze-phase-1-report.md` at execution time; the directory remains ignored.

---

### Task 1: Lock official baselines and isolate phase-one candidates

**Files:**
- Create: `docs/verification/seabreeze-phase-1-visual-lock.json`
- Create: `scripts/verify-seabreeze-phase-1-visual-gate.mjs`
- Create: `scripts/verify-seabreeze-phase-1-visual-gate.test.mjs`
- Create: `playwright.seabreeze-phase-1.config.ts`
- Create: `e2e/candidate-seabreeze-phase-1.spec.ts`
- Modify: `playwright.config.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: current tracked files under `e2e/snapshots/visual.spec.ts/`.
- Produces: `npm.cmd run verify:visual-gate:phase1` and `npm.cmd run test:e2e:candidate:phase1`; all candidate PNGs resolve below `.superpowers/sdd/seabreeze-phase-1-previews/`.

- [x] **Step 1: Record the current official PNG inventory**

Run:

```powershell
Get-ChildItem e2e/snapshots/visual.spec.ts -Filter *.png |
  Sort-Object Name |
  Get-FileHash -Algorithm SHA256 |
  Select-Object Path, Hash
```

Create JSON with this exact shape and the hashes printed by the command:

```json
{
  "schemaVersion": 1,
  "capturedAt": "2026-07-26",
  "approvalState": "locked-before-phase-1-candidates",
  "files": {
    "320x568-home.png": "669bfb8b33434f956776d88517c04900310f669335276282bed1f984c7865097",
    "320x568-login.png": "270d83651c3b14451b8f8b534b42f9246e564f835dede62bdfaa5d38be249789",
    "390x844-entry-dialog.png": "68ae1f40240dcf3396987f57bef20674eb39664681c1e118e649c6d60a330776",
    "390x844-forgot.png": "29db070e205f60a03eab8af608105bf7f5d46d5187dd4081cbbdcb822ef243a8",
    "390x844-home.png": "d2bfcc6bbde64a9a918b15bb3bde1ecf3cd265d374cddae8a36b4d2be12883c3",
    "390x844-login.png": "29cf1b90aa121b05b10951ee4d2c5f22b405a8d5b82b807908f3c2a07ea48ea9",
    "390x844-recovery.png": "7758d0a53bbe56e6228cd50f063f8cd0cb499a6f97d75ccdbd1179a2c8f8ac51",
    "430x932-home.png": "83b0678b5a47fe0005f7f5a3ec0a5a26ed3f1d0bd49663b8136d98c5a7fdaa84",
    "430x932-login.png": "6cb666fc0307da30f548e7c72f9f8e57229e8549806333e07be2901801aabf6e"
  }
}
```

Include every currently tracked PNG, not only home images. The verifier rejects missing, extra or changed official files while `approvalState` remains locked.

- [x] **Step 2: Write failing lock behavior tests**

Use `node:test`, a fresh `mkdtemp()` directory and literal file bytes. The tests import `verifyVisualLock()` from the not-yet-created script and cover:

```js
test('accepts an unchanged official snapshot inventory', async () => {
  const fixture = await createFixture({ 'home.png': 'approved-home' });
  await assert.doesNotReject(() => verifyVisualLock(fixture));
});

test('rejects changed added and missing official snapshots', async (t) => {
  await t.test('changed', async () => {
    const fixture = await createFixture({ 'home.png': 'approved-home' });
    await writeFile(join(fixture.snapshotDir, 'home.png'), 'changed-home');
    await assert.rejects(() => verifyVisualLock(fixture), /hash mismatch/i);
  });
  await t.test('added', async () => {
    const fixture = await createFixture({ 'home.png': 'approved-home' });
    await writeFile(join(fixture.snapshotDir, 'extra.png'), 'extra');
    await assert.rejects(() => verifyVisualLock(fixture), /inventory mismatch/i);
  });
  await t.test('missing', async () => {
    const fixture = await createFixture({ 'home.png': 'approved-home' });
    await unlink(join(fixture.snapshotDir, 'home.png'));
    await assert.rejects(() => verifyVisualLock(fixture), /inventory mismatch/i);
  });
});
```

The helper derives expected SHA-256 independently with literal fixture bytes and writes a temporary lock file.

- [x] **Step 3: Run the behavior tests and observe RED**

Run: `node --test scripts/verify-seabreeze-phase-1-visual-gate.test.mjs`

Expected: FAIL with module-not-found because `verify-seabreeze-phase-1-visual-gate.mjs` does not exist.

- [x] **Step 4: Implement the minimal read-only lock verifier**

Export:

```js
export async function verifyVisualLock({
  lockPath,
  snapshotDir,
}) {
  const lock = JSON.parse(await readFile(lockPath, 'utf8'));
  const actualNames = (await readdir(snapshotDir))
    .filter((name) => name.endsWith('.png'))
    .sort();
  const expectedNames = Object.keys(lock.files).sort();
  assert.deepEqual(actualNames, expectedNames, 'official snapshot inventory mismatch');
  for (const name of actualNames) {
    const actual = createHash('sha256')
      .update(await readFile(join(snapshotDir, name)))
      .digest('hex');
    assert.equal(actual, lock.files[name], `official snapshot hash mismatch: ${name}`);
  }
}
```

When invoked as a CLI, default to the phase-one lock JSON and `e2e/snapshots/visual.spec.ts`. It must never write files.

- [x] **Step 5: Run the behavior tests and observe GREEN**

Run: `node --test scripts/verify-seabreeze-phase-1-visual-gate.test.mjs`

Expected: all unchanged/changed/added/missing cases pass.

- [x] **Step 6: Add the isolated Playwright configuration and a real gate probe**

Use:

```ts
export default defineConfig({
  testDir: './e2e',
  testMatch: 'candidate-seabreeze-phase-1.spec.ts',
  outputDir: '.superpowers/sdd/seabreeze-phase-1-playwright-results',
  snapshotPathTemplate: '.superpowers/sdd/seabreeze-phase-1-previews/{arg}{ext}',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    reducedMotion: 'no-preference',
  },
  webServer: {
    command: 'npm.cmd run dev -- --mode test-e2e --host 127.0.0.1 --port 5173 --strictPort',
    url: baseURL,
    reuseExistingServer: false,
  },
});
```

The candidate spec initially contains one real `visual gate probe` that opens deterministic logged-in Home and calls:

```ts
await expect(page).toHaveScreenshot('visual-gate-probe.png');
```

Add the candidate filename to `playwright.config.ts` `testIgnore`. This probe is historical/temporary evidence only and is replaced by the final Task 11 cases; it can never be promoted.

- [x] **Step 7: Add package commands and verify isolated behavior**

Add:

```json
"verify:visual-gate:phase1": "node scripts/verify-seabreeze-phase-1-visual-gate.mjs",
"test:e2e:candidate:phase1": "playwright test --config playwright.seabreeze-phase-1.config.ts"
```

Run:

```powershell
npm.cmd run verify:visual-gate:phase1
npm.cmd run test:e2e:candidate:phase1 -- --update-snapshots
npm.cmd run test:e2e:candidate:phase1
npm.cmd exec playwright test -- --list
npm.cmd run verify:visual-gate:phase1
git diff --check
```

Expected: lock passes before/after; candidate probe passes from `.superpowers/sdd/seabreeze-phase-1-previews/visual-gate-probe.png`; normal Playwright list does not include `candidate-seabreeze-phase-1.spec.ts`.

- [x] **Step 8: Commit Task 1**

```powershell
git add package.json playwright.config.ts playwright.seabreeze-phase-1.config.ts e2e/candidate-seabreeze-phase-1.spec.ts scripts/verify-seabreeze-phase-1-visual-gate.mjs scripts/verify-seabreeze-phase-1-visual-gate.test.mjs docs/verification/seabreeze-phase-1-visual-lock.json
git commit -m "test: isolate seabreeze phase one candidates"
```

---

### Task 2: Measure the reference and decide the independent asset inventory

**Files:**
- Create: `docs/verification/seabreeze-phase-1-asset-audit.md`
- Modify: `src/assets/assets.test.tsx`

**Interfaces:**
- Consumes: 1491×1055 reference PNG and current `assetRegistry`.
- Produces: a checked asset table with `keep`, `redraw`, or `new` for every phase-one illustration/icon and a stronger SVG security test.

- [x] **Step 1: Write failing SVG safety assertions**

Extend the existing source scan to reject:

```ts
expect(source).not.toMatch(/\son[a-z]+\s*=/i);
expect(source).not.toMatch(/(?:javascript|vbscript)\s*:/i);
expect(source).not.toMatch(/url\s*\(\s*['"]?\s*(?:https?:|data:)/i);
expect(source).not.toMatch(/&#x?[0-9a-f]+;/i);
```

Require each registered SVG source to have one `viewBox`, no `<text>`, no `<foreignObject>`, no embedded raster and no external reference.

- [x] **Step 2: Run asset tests and observe RED or document current GREEN**

Run: `npm.cmd run test:run -- src/assets/assets.test.tsx`

Expected: either RED on an unsafe current asset, which must be fixed before Task 3, or GREEN recorded as the strengthened starting evidence. Do not weaken the assertions.

- [x] **Step 3: Measure the supplied board**

Record in the audit:

- Source path and SHA-256.
- Canvas: 1491×1055.
- Five phone frames from left to right: 首页、流水、记账、统计、我的.
- Shared warm paper background, coral active state, 1px warm borders, 14–20px card radii, compact five-column bottom navigation.
- Reference-only device chrome must be omitted.
- The center entry page uses no bottom navigation.

Use an explicit per-page table with rows for header/hero, summary, cards, controls, navigation and safe-area behavior. Measurements are approximate design targets, never crop coordinates for production assets.

- [x] **Step 4: Audit the current independent assets**

For each current SVG, record filename, `viewBox`, byte size, visual role and decision. The required decisions are:

- Keep and refine: shell brand, 11 category icons, five navigation icons, paper texture.
- Redraw to match the one accepted direction: `home-seaside.svg`.
- Keep only as an empty state: `empty-ledger.svg`.
- New: profile seaside header, search/calendar/reminder/close/more actions, budget/account/reminder/backup/theme/preferences/about/sync management icons.

Explicitly state that the old `.superpowers/sdd/home-transactions-previews` images are historical evidence and cannot be promoted.

- [x] **Step 5: Verify the audit and commit Task 2**

Run:

```powershell
npm.cmd run test:run -- src/assets/assets.test.tsx
rg -n "整张|裁片|emoji|远程|官方基线|1491×1055" docs/verification/seabreeze-phase-1-asset-audit.md
git diff --check
```

Expected: asset tests pass and the audit contains all six safety/measurement decisions.

```powershell
git add src/assets/assets.test.tsx docs/verification/seabreeze-phase-1-asset-audit.md
git commit -m "docs: audit seabreeze visual assets"
```

---

### Task 3: Rebuild the shared visual foundation and artwork

**Files:**
- Modify: `src/design-system/tokens.css`
- Modify: `src/design-system/global.css`
- Modify: `src/design-system/components/BottomNavigation.tsx`
- Modify: `src/design-system/components/Card.tsx`
- Create: `src/design-system/components/PageHeader.tsx`
- Create: `src/design-system/components/SegmentedControl.tsx`
- Create: `src/design-system/components/ProgressBar.tsx`
- Modify: `src/design-system/components/design-system.test.tsx`
- Create/Modify: phase-one SVG files listed in File Map
- Modify: `src/assets/registry.ts`, `src/assets/assets.test.tsx`, `src/assets/ATTRIBUTION.md`

**Interfaces:**
- Consumes: Task 2 audit.
- Produces: `PageHeader`, generic `SegmentedControl<T extends string>`, `ProgressBar`, refined `Card`, and typed independent assets used by all five pages.

- [x] **Step 1: Write failing design-system contract tests**

Assert:

```tsx
render(<SegmentedControl label="统计区间" value="month" options={[
  { value: 'month', label: '月' },
  { value: 'year', label: '年' },
]} onChange={onChange} />);
expect(screen.getByRole('group', { name: '统计区间' })).toBeInTheDocument();
expect(screen.getByRole('button', { name: '月' })).toHaveAttribute('aria-pressed', 'true');
```

Also require `PageHeader` to expose one heading and optional 44px action, `ProgressBar` to supply numeric ARIA values plus Chinese summary, and central bottom-nav action to have no `aria-current`.

- [x] **Step 2: Run focused tests and observe RED**

Run: `npm.cmd run test:run -- src/design-system/components/design-system.test.tsx src/assets/assets.test.tsx`

Expected: missing new components/assets.

- [x] **Step 3: Implement measured tokens and global behavior**

Use:

```css
:root {
  --color-paper: #fff9ef;
  --color-ink: #34312e;
  --color-muted: #756f68;
  --color-coral: #f46d58;
  --color-sea: #8bcfe8;
  --color-balance: #e8892e;
  --color-expense: #e85043;
  --color-income: #2e9b68;
  --radius-control: 0.75rem;
  --radius-card: 1.125rem;
  --control-min-size: 44px;
  --safe-area-top: max(0px, env(safe-area-inset-top));
  --safe-area-bottom: max(0.75rem, env(safe-area-inset-bottom));
}
```

Global font stack must exactly follow the specification. Preserve the local paper texture and reduced-motion rule. Do not add a remote font or background.

- [x] **Step 4: Implement components and independent SVGs**

Every action icon uses `viewBox="0 0 48 48"` with transparent background and consistent ink/coral/sea strokes. `profile-seaside.svg` is a standalone wide header with sea, clouds and gull shapes, no embedded text. `BottomNavigation` keeps semantic buttons and renders the center button raised without turning it into a selected tab.

- [x] **Step 5: Verify component, asset and production output**

Run:

```powershell
npm.cmd run test:run -- src/design-system src/assets
npm.cmd run typecheck
npm.cmd run build
rg -n "<script|https?:|data:image|<text|<foreignObject|\\son[a-z]+\\s*=" src/assets -g "*.svg"
```

Expected: tests/typecheck/build pass; SVG scan returns no matches.

- [x] **Step 6: Commit Task 3**

```powershell
git add src/design-system src/assets
git commit -m "feat: rebuild seabreeze visual foundation"
```

---

### Task 4: Add the five-type transaction creation command

**Files:**
- Modify: `src/view-model/types.ts`
- Modify: `src/view-model/ledger-view-model.ts`
- Modify: `src/view-model/ledger-view-model.test.ts`
- Modify: `src/test/ledger-fixture.ts`

**Interfaces:**
- Consumes: current `LedgerReadSnapshot`, `buildPosting()`, `saveOperation()` and UUID/time factories.
- Produces:

```ts
export type TransactionCreateInput =
  | { type: 'expense' | 'income'; amountCents: number; accountId: string; categoryId: string; occurredAt: string; note: string }
  | { type: 'transfer'; amountCents: number; fromAccountId: string; toAccountId: string; occurredAt: string; note: string }
  | { type: 'refund'; amountCents: number; originalTransactionId: string; occurredAt: string; note: string }
  | { type: 'adjustment'; deltaCents: number; accountId: string; occurredAt: string; note: string };

export interface EntryOptions {
  accounts: Array<{ id: string; name: string; accountClass: 'asset' | 'liability' }>;
  expenseCategories: Array<{ id: string; name: string; iconKey: string }>;
  incomeCategories: Array<{ id: string; name: string; iconKey: string }>;
  refundableExpenses: Array<{ id: string; title: string; accountId: string; remainingCents: number; occurredAt: string }>;
}

LedgerViewModel.getEntryOptions(): Promise<EntryOptions>;
LedgerViewModel.createTransaction(input: TransactionCreateInput): Promise<{ transactionId: string }>;
```

- [x] **Step 1: Write failing option and create-operation tests**

Cover:

- archived accounts/categories excluded;
- liability accounts allowed for expense but not income or transfer source;
- expense/income create one correct posting;
- transfer creates ordered two-entry posting;
- refund inherits original category/account and enforces remaining amount;
- adjustment persists absolute `amountCents` and signed posting;
- note is trimmed; transaction/operation share one generated UUID; version is 1; `deletedAt` is null.

Core assertion:

```ts
expect(saveOperation).toHaveBeenCalledWith({
  schemaVersion: 1,
  operationId,
  ledgerId: fixtureIds.ledger,
  createdAt: fixtureNow.toISOString(),
  kind: 'transaction.create',
  transaction: expect.objectContaining({
    id: operationId,
    operationId,
    type: 'expense',
    amountCents: 6800,
    version: 1,
  }),
  entries: [{ accountId: fixtureIds.cash, deltaCents: -6800 }],
});
```

- [x] **Step 2: Run ViewModel tests and observe RED**

Run: `npm.cmd run test:run -- src/view-model/ledger-view-model.test.ts`

Expected: missing types and methods.

- [x] **Step 3: Implement exhaustive command construction**

Read one fresh scoped snapshot, validate active referenced records, call `buildPosting()` for every branch and construct:

```ts
const operationId = this.makeUuid();
const transaction: Transaction = {
  id: operationId,
  operationId,
  ledgerId: this.ledgerId,
  type: input.type,
  amountCents: input.type === 'adjustment' ? Math.abs(input.deltaCents) : input.amountCents,
  categoryId,
  occurredAt: input.occurredAt,
  note: input.note.trim(),
  originalTransactionId,
  version: 1,
  deletedAt: null,
};
await this.saveOperation({
  schemaVersion: 1,
  operationId,
  ledgerId: this.ledgerId,
  createdAt: this.now().toISOString(),
  kind: 'transaction.create',
  transaction,
  entries,
});
return { transactionId: transaction.id };
```

Do not catch raw Repository errors here; the UI maps them to authored copy.

- [x] **Step 4: Extend the mutable fixture**

The E2E fixture already applies `transaction.create`; expose the new transaction ID and ensure watcher notifications refresh Home/Transactions/Statistics without replacing the controller draft before the successful promise resolves.

- [x] **Step 5: Verify GREEN and commit Task 4**

Run:

```powershell
npm.cmd run test:run -- src/view-model src/test/e2e-services.test.ts
npm.cmd run typecheck
```

Expected: all pass.

```powershell
git add src/view-model src/test/ledger-fixture.ts
git commit -m "feat: add transaction creation commands"
```

---

### Task 5: Build the persistent entry draft controller

**Files:**
- Create: `src/features/entry/entry-draft.ts`
- Create: `src/features/entry/entry-draft.test.ts`

**Interfaces:**
- Consumes: `EntryOptions`, `TransactionCreateInput`, injected local time and last-account preference port.
- Produces:

```ts
export type EntryType = 'expense' | 'income' | 'transfer' | 'refund' | 'adjustment';
export type EntryField = 'amount' | 'category' | 'account' | 'fromAccount' | 'toAccount' | 'originalExpense' | 'occurredAt';

export interface EntryDraftValues {
  type: EntryType;
  amountYuan: string;
  categoryId: string | null;
  accountId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
  originalTransactionId: string | null;
  adjustmentDirection: 'increase' | 'decrease';
  occurredAtLocal: string;
  note: string;
}

export interface EntryDraftState {
  values: EntryDraftValues;
  submitting: boolean;
  error: null | { field: EntryField; message: string };
}

export interface EntryPreferencePort {
  loadLastAccountId(): string | null;
  saveLastAccountId(accountId: string): void;
}

export interface EntryDraftController {
  getState(): EntryDraftState;
  subscribe(listener: () => void): () => void;
  update(patch: Partial<EntryDraftValues>): void;
  changeType(type: EntryType): void;
  validate(): { input: TransactionCreateInput } | { field: EntryField; message: string };
  submit(): Promise<{ transactionId: string }>;
  resetAfterSuccess(): void;
}
```

- [x] **Step 1: Write failing default/retention tests**

Require current local minute, expense default, quick-category intent, last valid account, first compatible category, explicit adjustment direction and draft preservation when ViewModel options refresh.

- [x] **Step 2: Write failing validation/error-focus tests**

Use `parseYuan()` and assert exact Chinese messages:

- empty/invalid amount → `请输入大于 0 的金额`;
- same transfer account → `转出和转入账户不能相同`;
- liability transfer source → `负债账户不能作为转出账户`;
- missing original expense → `请选择原支出`;
- refund too large → `退款金额不能超过原支出剩余可退金额`;
- zero adjustment → `余额校准金额不能为 0`.

Rejected submit must preserve state and expose the responsible `EntryField`.

- [x] **Step 3: Run controller tests and observe RED**

Run: `npm.cmd run test:run -- src/features/entry/entry-draft.test.ts`

Expected: module missing.

- [x] **Step 4: Implement a framework-independent controller**

The controller stores yuan text, never cents. `validate()` converts exactly once via `parseYuan()` and returns the discriminated union. `submit()` sets `submitting=true`, calls `viewModel.createTransaction(input)`, stores the last successful account, and only clears the draft after success.

Map raw errors to one of:

- known validation messages copied above;
- stale referenced record → `账户、分类或原支出已经变化，请重新选择`;
- fallback → `保存失败，请稍后重试`.

- [x] **Step 5: Verify GREEN and commit Task 5**

Run:

```powershell
npm.cmd run test:run -- src/features/entry/entry-draft.test.ts
npm.cmd run typecheck
```

```powershell
git add src/features/entry
git commit -m "feat: add persistent entry drafts"
```

---

### Task 6: Build the full-screen five-type entry page

**Files:**
- Create: `src/features/entry/TransactionEntryPage.tsx`
- Create: `src/features/entry/TransactionEntryPage.module.css`
- Create: `src/features/entry/TransactionEntryPage.test.tsx`

**Interfaces:**
- Consumes: `EntryDraftController`, `EntryOptions`, optional quick-category intent.
- Produces:

```ts
export type TransactionEntryPageProps = {
  controller: EntryDraftController;
  options: EntryOptions;
  onClose(): void;
  onSaved(transactionId: string): void;
};
```

- [x] **Step 1: Write failing page hierarchy and type-switch tests**

Require a dialog-like full-screen layer with heading `记账`, close button, `支出/收入/转账` primary type switch, `退款/余额校准` under `更多类型`, auto-focused decimal amount, category grid, note, local date-time, account fields and one fixed `保存` button.

- [x] **Step 2: Write failing focus/error/keyboard tests**

Assert:

- opening focuses amount;
- validation focuses the named field;
- Escape closes only when not submitting;
- Tab remains in the full-screen layer;
- save failure preserves all inputs;
- successful save calls `onSaved` once;
- all buttons/inputs are at least 44px by class contract.

- [x] **Step 3: Run tests and observe RED**

Run: `npm.cmd run test:run -- src/features/entry`

Expected: page missing.

- [x] **Step 4: Implement the responsive page**

Render semantic buttons with independent asset icons; no emoji. The save area uses:

```css
.saveBar {
  position: sticky;
  bottom: 0;
  padding: var(--space-3) 0 var(--safe-area-bottom);
  background: linear-gradient(transparent, var(--color-paper) 28%);
}
```

At 320×568 the form scrolls but the save button remains reachable; the document itself never scrolls horizontally. Refund account is read-only text from the original expense. Adjustment exposes text-backed radio controls `增加余额` and `减少余额`.

- [x] **Step 5: Verify GREEN and commit Task 6**

Run:

```powershell
npm.cmd run test:run -- src/features/entry
npm.cmd run typecheck
```

```powershell
git add src/features/entry
git commit -m "feat: build full screen transaction entry"
```

---

### Task 7: Add the pure statistics selector and ViewModel query

**Files:**
- Create: `src/domain/statistics.ts`
- Create: `src/domain/statistics.test.ts`
- Modify: `src/view-model/types.ts`
- Modify: `src/view-model/ledger-view-model.ts`
- Modify: `src/view-model/ledger-view-model.test.ts`

**Interfaces:**
- Consumes: one `LedgerReadSnapshot` and existing financial posting semantics.
- Produces:

```ts
export type StatisticsRange =
  | { kind: 'month'; month: string }
  | { kind: 'year'; year: number }
  | { kind: 'custom'; startDate: string; endDate: string };

export interface StatisticsSnapshot {
  rangeLabel: string;
  expenseCents: number;
  incomeCents: number;
  balanceCents: number;
  totalBudget: null | { amountCents: number; usedCents: number; remainingCents: number };
  categoryBudgets: Array<{ categoryId: string; name: string; amountCents: number; usedCents: number }>;
  expenseCategories: Array<{ categoryId: string; name: string; cents: number; percentage: number }>;
  trend: Array<{ key: string; label: string; expenseCents: number; incomeCents: number }>;
  monthlyComparison: Array<{ month: string; expenseCents: number; incomeCents: number; balanceCents: number }>;
  accountDistribution: Array<{ accountId: string; name: string; accountClass: 'asset' | 'liability'; balanceCents: number }>;
}

export function selectStatistics(snapshot: LedgerReadSnapshot, range: StatisticsRange): StatisticsSnapshot;
LedgerViewModel.getStatistics(range: StatisticsRange): Promise<StatisticsSnapshot>;
```

- [x] **Step 1: Write failing financial-semantics tests**

Using the fixed fixture, prove:

- expense/refund net to ¥230.00 in July;
- income is ¥1,000.00 and balance ¥770.00;
- transfer and adjustment do not enter income/expense;
- deleted and other-ledger records are excluded;
- category percentages sum to 100 within rounding tolerance;
- account balances include opening balance plus all non-deleted entries.

- [x] **Step 2: Write failing range/budget/trend tests**

Cover valid month, leap-year year, inclusive custom dates, invalid reversed custom range, daily month trend, monthly year trend, total/category budget matching and a stable zero-data result.

- [x] **Step 3: Run focused tests and observe RED**

Run: `npm.cmd run test:run -- src/domain/statistics.test.ts src/view-model/ledger-view-model.test.ts`

Expected: selector/types/method missing.

- [x] **Step 4: Implement one-pass indexed selection**

Build account/category/entry maps once. Use local-date boundaries converted to ISO, call `calculateMetrics()` for summary semantics, and derive category/trend/account arrays from the same scoped snapshot. Sort category shares by cents descending then ID, trends chronologically and accounts by class/order.

Percentage uses:

```ts
const percentage = totalExpenseCents === 0
  ? 0
  : Math.round(cents / totalExpenseCents * 10_000) / 100;
```

The UI never re-computes totals.

- [x] **Step 5: Verify GREEN and commit Task 7**

Run:

```powershell
npm.cmd run test:run -- src/domain src/view-model
npm.cmd run typecheck
```

```powershell
git add src/domain/statistics.ts src/domain/statistics.test.ts src/view-model
git commit -m "feat: add real ledger statistics"
```

---

### Task 8: Build accessible statistics and profile pages

**Files:**
- Create: `src/features/statistics/AccessibleDonutChart.tsx`
- Create: `src/features/statistics/AccessibleTrendChart.tsx`
- Create: `src/features/statistics/StatisticsPage.tsx`
- Create: `src/features/statistics/StatisticsPage.module.css`
- Create: `src/features/statistics/StatisticsPage.test.tsx`
- Create: `src/features/profile/ProfilePage.tsx`
- Create: `src/features/profile/ProfilePage.module.css`
- Create: `src/features/profile/ProfilePage.test.tsx`

**Interfaces:**
- Consumes: `LedgerViewModel.getStatistics()`, `HomeSyncState`, authenticated display identity passed from App runtime.
- Produces:

```ts
export type StatisticsPageProps = { viewModel: LedgerViewModel };
export type ProfilePageProps = {
  viewModel: LedgerViewModel;
  displayName: string;
  ledgerName: string;
  syncState: HomeSyncState;
  pendingCount: number;
  onRetrySync(): void;
};
```

- [x] **Step 1: Write failing statistics tests**

Require month/year/custom controls, expense/income/balance cards, budget, category share, trend, monthly comparison and asset/liability distribution. Every chart must expose a heading and a visible or screen-reader text list containing the same labels and values.

- [x] **Step 2: Write failing profile tests**

Require seaside header, shell mark, display name, real sync label/pending count, real budget summary and grouped management entries. Unimplemented phase-two/three rows use `aria-disabled="true"` plus visible `后续阶段开放`; they must not navigate or pretend success.

- [x] **Step 3: Run tests and observe RED**

Run: `npm.cmd run test:run -- src/features/statistics src/features/profile`

Expected: modules missing.

- [x] **Step 4: Implement SVG charts without a chart dependency**

The donut chart uses SVG circles/paths with `aria-hidden="true"` plus a semantic list. The trend chart uses a fixed `viewBox`, computed points, distinct markers/line styles for income and expense, and a text table. Zero data renders authored empty copy instead of malformed paths.

- [x] **Step 5: Implement ProfilePage**

Use independent management icons and button rows. Only sync retry is active in phase one. Do not include account tokens, email credentials, raw SyncEngine errors or fake counts.

- [x] **Step 6: Verify GREEN and commit Task 8**

Run:

```powershell
npm.cmd run test:run -- src/features/statistics src/features/profile
npm.cmd run typecheck
```

```powershell
git add src/features/statistics src/features/profile
git commit -m "feat: add statistics and profile pages"
```

---

### Task 9: Reflow Home/Transactions and integrate the full-screen shell

**Files:**
- Modify: `src/features/home/HomePage.tsx`, `HomePage.module.css`, `HomePage.test.tsx`
- Modify: `src/features/transactions/TransactionsPage.tsx`, `TransactionsPage.module.css`, `TransactionsPage.test.tsx`
- Modify: `src/app/App.tsx`, `App.test.tsx`
- Modify: `src/app/AppShell.tsx`, `AppShell.module.css`, `AppShell.test.tsx`, `navigation.ts`
- Modify: `src/app/providers.tsx`, `providers.test.tsx` only if display identity must be exposed

**Interfaces:**
- Consumes: Tasks 3–8 and existing shared transaction overlays.
- Produces: four always-mounted panels plus an independent full-screen entry layer; no repeated global top bar.

- [x] **Step 1: Write failing shell integration tests**

Assert:

- `.header` global brand bar is absent;
- Home, Transactions, Statistics and Profile components stay mounted;
- regular tab switch preserves scroll and transaction filters;
- center entry opens full-screen page and hides/inerts shell/nav;
- quick category seeds entry draft;
- successful entry refreshes all subscribed pages;
- closing restores source focus;
- existing detail/edit/delete/undo controller still opens from Home/Transactions.

- [x] **Step 2: Write failing Home/Transactions visual-structure tests**

Home order: seaside greeting/reminder, month and financial overview, budget, quick entry, recent three, sync status. Transactions order: title/search, month/account/date, horizontal categories, descending compact groups. Keep current query/error/empty behaviors.

- [x] **Step 3: Run tests and observe RED**

Run: `npm.cmd run test:run -- src/app src/features/home src/features/transactions`

Expected: placeholders/global header/current entry dialog violate the new contracts.

- [x] **Step 4: Integrate the new pages**

Replace `panelCopy` placeholders with `StatisticsPage` and `ProfilePage`. Replace `entryOpen` placeholder dialog with a controller created once per open action. Preserve `detailTransactionId`, `detailOpen`, source focus and scroll map.

The shell grid becomes:

```css
.background {
  display: grid;
  height: 100dvh;
  grid-template-rows: minmax(0, 1fr);
  overflow: hidden;
}
.main {
  overflow-y: auto;
  padding: var(--safe-area-top) var(--space-3)
    calc(var(--navigation-height) + var(--safe-area-bottom));
}
```

- [x] **Step 5: Reflow Home and Transactions without changing financial semantics**

Extend `getHomeSnapshot({ month })` if needed so the selected month controls month metrics/budget while total assets remains a true ledger balance. Keep recent transaction open behavior and all five combined transaction filters.

- [x] **Step 6: Verify regression tests and commit Task 9**

Run:

```powershell
npm.cmd run test:run -- src/app src/features
npm.cmd run typecheck
```

```powershell
git add src/app src/features/home src/features/transactions src/view-model
git commit -m "feat: integrate seabreeze five page shell"
```

---

### Task 10: Prove phase-one behavior and accessibility at all target sizes

**Files:**
- Create: `e2e/seabreeze-phase-1.spec.ts`
- Modify: `e2e/accessibility.spec.ts`
- Modify: `src/test/ledger-fixture.ts`, `src/test/e2e-services.ts`, related tests

**Interfaces:**
- Consumes: complete phase-one UI in deterministic E2E mode.
- Produces: browser evidence for 320×568, 390×844 and 430×932 without updating official screenshots.

- [x] **Step 1: Add failing browser journeys**

At all three viewports cover:

- four regular tabs and central action;
- Home true values/quick entry/recent detail;
- combined transaction filters/edit/delete/undo;
- expense, income, transfer, refund and adjustment creation;
- month/year/custom statistics and textual chart summaries;
- Profile real sync status;
- no document overflow and targets ≥44px.

- [x] **Step 2: Add focus and reduced-motion checks**

Verify entry/detail focus enter/trap/Escape/restore, exactly one active `main`, shell `inert` while full-screen entry/detail is open, and reduced-motion removes nonessential animation without hiding save/undo/sync state.

- [x] **Step 3: Run browser tests and observe RED**

Run: `npm.cmd run test:e2e -- e2e/seabreeze-phase-1.spec.ts e2e/accessibility.spec.ts`

Expected: any missing fixture or responsive behavior fails with an exact assertion.

- [x] **Step 4: Make only the minimal fixture/responsive fixes**

Keep the fixture behind `mode === 'test-e2e'` dynamic import. Do not add fixture constants or fake account state to production components.

- [x] **Step 5: Run the non-visual phase gate**

Run:

```powershell
npm.cmd run test:run
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:e2e -- e2e/seabreeze-phase-1.spec.ts e2e/accessibility.spec.ts e2e/home-transactions.spec.ts
npm.cmd run verify:visual-gate:phase1
rg -n "fixtureNow|createMutableLedgerFixture|test-e2e|午餐|e2e-access-token" dist/assets
rg -n "from ['\"](?:dexie|@supabase|\.\./\.\./db|\.\./\.\./services)" src/features
git diff --check
```

Expected: tests/type/build/browser/gate pass; both production scans return no matches.

- [x] **Step 6: Commit Task 10**

```powershell
git add e2e/seabreeze-phase-1.spec.ts e2e/accessibility.spec.ts src/test
git commit -m "test: cover seabreeze phase one journeys"
```

---

### Task 11: Run design QA, generate isolated candidates and wait for approval

**Files:**
- Modify: `e2e/candidate-seabreeze-phase-1.spec.ts`
- Create ignored: `.superpowers/sdd/seabreeze-phase-1-report.md`
- Create ignored: `.superpowers/sdd/seabreeze-phase-1-previews/*.png`

**Interfaces:**
- Consumes: Tasks 1–10 green and the immutable reference image.
- Produces: reviewed candidate PNGs, SHA-256 inventory, code-under-test SHA and `final result: passed`; does not touch official baselines.

- [ ] **Step 1: Enable exact candidate states**

Capture:

- 320×568: Home, Transactions, Expense Entry, Statistics, Profile.
- 390×844: Home, Transactions, Entry expense/transfer/refund, Statistics month/custom, Profile, Transaction Detail, Delete Undo.
- 430×932: Home, Transactions, Income Entry, Statistics, Profile.

Freeze clock to `2026-07-18T20:00:00+08:00`, wait for `document.fonts.ready`, and call `expect(page).toHaveScreenshot()` for every file.

- [ ] **Step 2: Generate only isolated candidates**

Run:

```powershell
npm.cmd run verify:visual-gate:phase1
npm.cmd run test:e2e:candidate:phase1 -- --update-snapshots
npm.cmd run test:e2e:candidate:phase1
```

Expected: candidates are written only below `.superpowers/sdd/seabreeze-phase-1-previews/`; official hashes remain locked.

- [ ] **Step 3: Perform same-size side-by-side QA**

Compare reference page panels against corresponding actual screenshots. Record P0/P1/P2 findings for layout, whitespace, typography, border, radius, color, illustration scale/crop, safe-area and overlap. Fix all P0/P1/P2 with tests; regenerate candidates after each code change.

- [ ] **Step 4: Record final evidence**

The report must contain:

- reference SHA and dimensions;
- code-under-test commit;
- all candidate paths, viewport/state and SHA-256;
- test/type/build/browser command results with exact pass counts;
- production scan results;
- accepted differences such as omitted device status bar;
- `final result: passed`.

- [ ] **Step 5: Run review and fresh verification**

Use `superpowers:requesting-code-review`; fix every Critical/Important finding with RED/GREEN evidence. Then use `superpowers:verification-before-completion` and rerun the full Task 10 gate plus candidate non-update comparison.

- [ ] **Step 6: Commit candidate test/report metadata only**

The ignored PNG/report files stay untracked:

```powershell
git add e2e/candidate-seabreeze-phase-1.spec.ts
git commit -m "test: prepare seabreeze phase one candidates"
```

Set status to `NEEDS_CONTEXT` and ask the user to approve the rendered candidate images. Do not modify `e2e/visual.spec.ts` or `e2e/snapshots/` before explicit approval.

---

## Phase-One Approval Completion

After explicit candidate approval, create a separate promotion task:

1. Record approval date, candidate hashes and exact code SHA.
2. Update `e2e/visual.spec.ts` with unconditional `toHaveScreenshot()` cases.
3. Promote only approved images and prove unchanged auth images are byte-identical.
4. Rerun unit/type/build/full Playwright/static recovery/security scans.
5. Write `docs/verification/seabreeze-phase-1.md`.
6. Commit official evidence; do not deploy unless the user separately requests deployment.
