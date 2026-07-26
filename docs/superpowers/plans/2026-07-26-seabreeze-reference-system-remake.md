# 海风小账本参考图整套设计系统重制 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留现有真实账本、离线同步和记账行为的前提下，把首页、流水、记账、统计、我的五页重新制作成与 `2026-07-26-seabreeze-five-page-reference.png` 一致的统一海边手绘设计系统。

**Architecture:** 保留 `LedgerViewModel`、领域模型、仓库和同步层，只替换视觉令牌、独立位图素材、共享 UI 组件和五页排版。页面继续由 `AppShell` 挂载，中央记账入口仍打开全屏任务层，所有关键行为通过现有 ViewModel 完成。

**Tech Stack:** React 19、TypeScript、CSS Modules、Vitest、Testing Library、Vite、Codex in-app Browser。

## Global Constraints

- 唯一视觉标准：`docs/superpowers/specs/assets/2026-07-26-seabreeze-five-page-reference.png`。
- 设计基准为 390×844，同时验证 320×568 与 430×932。
- 页面必须共享同一套颜色、字体、间距、圆角、阴影、卡片、图标和底部导航规范。
- 不把整张参考图或手机页面裁片作为生产背景。
- 不使用 emoji、字符假图标、CSS 拼图、内联 SVG 或占位图替代可见素材。
- 保留首页、流水、详情、编辑、删除撤销、五类记账、真实统计、离线和同步行为。
- 所有新行为先写失败测试，再实现最小改动。
- 官方视觉快照在用户批准候选图前不得更新。

---

### Task 1: Lock the clean baseline and define observable reference contracts

**Files:**
- Modify: `src/app/AppShell.test.tsx`
- Modify: `src/features/home/HomePage.test.tsx`
- Modify: `src/features/transactions/TransactionsPage.test.tsx`
- Modify: `src/features/entry/TransactionEntryPage.test.tsx`
- Modify: `src/features/statistics/StatisticsPage.test.tsx`
- Modify: `src/features/profile/ProfilePage.test.tsx`

**Interfaces:**
- Consumes: existing page props and `LedgerViewModel`.
- Produces: failing behavioral contracts for the five reference screens.

- [ ] **Step 1: Write failing reference hierarchy tests**

```tsx
expect(screen.getByText('早上好，海风～')).toBeInTheDocument();
expect(screen.getByLabelText(/财务总览/)).toBeInTheDocument();
expect(screen.queryByText('已同步')).not.toBeInTheDocument();
expect(screen.getByRole('button', { name: '搜索流水' })).toBeInTheDocument();
expect(screen.getByRole('button', { name: '导出统计' })).toBeInTheDocument();
expect(screen.getByText('海风的小账本')).toBeInTheDocument();
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
npm.cmd run test:run -- src/app/AppShell.test.tsx src/features/home/HomePage.test.tsx src/features/transactions/TransactionsPage.test.tsx src/features/entry/TransactionEntryPage.test.tsx src/features/statistics/StatisticsPage.test.tsx src/features/profile/ProfilePage.test.tsx
```

Expected: failures name missing reference hierarchy and hidden quiet-sync behavior.

- [ ] **Step 3: Keep the failed output as the implementation boundary**

Do not change domain, repository or sync APIs unless a failing behavior test proves that the visual shell cannot consume the existing contract.

### Task 2: Produce and register the independent visual assets

**Files:**
- Create: `src/assets/illustrations/home-seaside-reference.webp`
- Create: `src/assets/illustrations/profile-seaside-reference.webp`
- Create: `src/assets/textures/navigation-shore-reference.png`
- Modify: `src/assets/registry.ts`
- Modify: `src/assets/assets.test.tsx`
- Modify: `src/assets/ATTRIBUTION.md`

**Interfaces:**
- Consumes: asset keys used by `HandDrawnIcon`.
- Produces: `illustration:home-seaside`, `illustration:profile-seaside`, and the navigation shoreline texture.

- [ ] **Step 1: Add failing asset registry tests**

```tsx
expect(assetRegistry['illustration:home-seaside']).toMatch(/home-seaside-reference/);
expect(assetRegistry['illustration:profile-seaside']).toMatch(/profile-seaside-reference/);
```

- [ ] **Step 2: Run the asset tests and verify RED**

Run:

```powershell
npm.cmd run test:run -- src/assets/assets.test.tsx
```

Expected: new reference asset names are not registered.

- [ ] **Step 3: Generate the two hero illustrations**

Use the supplied board as style/composition reference. Generate text-free, warm watercolor assets with the same subject placement and density as each phone panel. Inspect the outputs before copying them into `src/assets/illustrations/`.

- [ ] **Step 4: Copy the user-supplied shoreline**

Copy `codex-clipboard-25317f79-200c-4fc1-b64b-c9c3e268e2ae.png` as `navigation-shore-reference.png`; preserve aspect ratio and do not crop the crab, shells, sandcastle or bucket.

- [ ] **Step 5: Register, attribute and verify GREEN**

Run:

```powershell
npm.cmd run test:run -- src/assets/assets.test.tsx
npm.cmd run build
```

Expected: assets resolve locally and the production build contains no remote image dependencies.

### Task 3: Rebuild the shared design tokens, cards and bottom navigation

**Files:**
- Modify: `src/design-system/tokens.css`
- Modify: `src/design-system/global.css`
- Modify: `src/design-system/components/BottomNavigation.tsx`
- Modify: `src/design-system/components/design-system.test.tsx`
- Modify: `src/app/AppShell.module.css`

**Interfaces:**
- Consumes: five navigation items and shared CSS classes.
- Produces: warm paper canvas, compact cards, 4px spacing system, shoreline navigation and raised center entry action.

- [ ] **Step 1: Add failing navigation semantics tests**

```tsx
expect(screen.getByRole('navigation', { name: '主要导航' })).toBeInTheDocument();
expect(screen.getByRole('button', { name: '首页' })).toHaveAttribute('aria-current', 'page');
expect(screen.getByRole('button', { name: '记账' })).not.toHaveAttribute('aria-current');
```

- [ ] **Step 2: Run focused tests and verify RED where behavior is missing**

Run:

```powershell
npm.cmd run test:run -- src/design-system/components/design-system.test.tsx src/app/AppShell.test.tsx
```

- [ ] **Step 3: Implement the measured system**

Use the approved palette, 4px spacing grid, 12–16px page gutters, 10–14px card padding, 10–14px card radius, warm 1px borders, low-opacity warm shadows, Noto Sans SC/PingFang fallback and 44px minimum targets.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
npm.cmd run test:run -- src/design-system/components/design-system.test.tsx src/app/AppShell.test.tsx
```

### Task 4: Reflow Home and Transactions to the reference structure

**Files:**
- Modify: `src/features/home/HomePage.tsx`
- Modify: `src/features/home/HomePage.module.css`
- Modify: `src/features/transactions/TransactionsPage.tsx`
- Modify: `src/features/transactions/TransactionsPage.module.css`

**Interfaces:**
- Consumes: existing snapshot, quick categories, filters, grouped transactions and callbacks.
- Produces: compact reference-aligned Home and Transactions pages without financial-semantic changes.

- [ ] **Step 1: Implement Home from the failed contracts**

Render the greeting hero, one monthly overview card, five quick-entry cells and exactly three recent rows. Hide quiet sync text; show warning/error sync states only.

- [ ] **Step 2: Run Home tests and verify GREEN**

Run:

```powershell
npm.cmd run test:run -- src/features/home/HomePage.test.tsx src/app/AppShell.test.tsx
```

- [ ] **Step 3: Implement Transactions from the failed contracts**

Render the left title/right search action, compact month/account/calendar row, horizontal category chips and date-grouped transaction cards.

- [ ] **Step 4: Run Transactions tests and verify GREEN**

Run:

```powershell
npm.cmd run test:run -- src/features/transactions/TransactionsPage.test.tsx src/features/transactions/TransactionOverlays.test.tsx
```

### Task 5: Reflow Entry, Statistics and Profile to the reference structure

**Files:**
- Modify: `src/features/entry/TransactionEntryPage.tsx`
- Modify: `src/features/entry/TransactionEntryPage.module.css`
- Modify: `src/features/statistics/StatisticsPage.tsx`
- Modify: `src/features/statistics/StatisticsPage.module.css`
- Modify: `src/features/profile/ProfilePage.tsx`
- Modify: `src/features/profile/ProfilePage.module.css`

**Interfaces:**
- Consumes: existing entry controller, statistical selection and profile snapshot.
- Produces: reference-aligned full-screen entry, dense chart cards and seaside profile.

- [ ] **Step 1: Implement and verify Entry**

Preserve all five transaction types while making 支出/收入 the primary segment, the amount the first focal point, the category grid 5×2, details one grouped card and Save a full-width bottom action.

Run:

```powershell
npm.cmd run test:run -- src/features/entry/entry-draft.test.ts src/features/entry/TransactionEntryPage.test.tsx
```

- [ ] **Step 2: Implement and verify Statistics**

Render the centered title, export action, time selectors, three KPI cards, donut, line trend and monthly comparison cards using real selected data.

Run:

```powershell
npm.cmd run test:run -- src/domain/statistics.test.ts src/features/statistics/StatisticsPage.test.tsx
```

- [ ] **Step 3: Implement and verify Profile**

Render the seaside hero, overlapping brand identity, compact budget summary and two reference management groups. Quiet sync stays hidden; retryable sync appears as an authored row.

Run:

```powershell
npm.cmd run test:run -- src/features/profile/ProfilePage.test.tsx
```

### Task 6: Run browser design QA and fix all P0/P1/P2 differences

**Files:**
- Create: `design-qa.md`
- Modify: only files named by evidence-backed QA findings.

**Interfaces:**
- Consumes: source reference image and browser-rendered 390×844 screens.
- Produces: same-size comparison evidence and `final result: passed`.

- [ ] **Step 1: Capture all five 390×844 screens in the in-app Browser**

Use `?fixture=logged-in&visual=1`, wait for fonts and real fixture data, and exercise the bottom navigation plus entry dialog.

- [ ] **Step 2: Build a combined comparison image**

Place each cropped source phone panel beside the corresponding browser capture at normalized size. Do not judge from separate views.

- [ ] **Step 3: Record and fix P0/P1/P2 issues**

Review fonts, spacing, colors, image quality, copy, safe areas, scrolling and interaction states. After every fix, recapture the same state and compare again.

- [ ] **Step 4: Save the passing report**

`design-qa.md` must include paths, dimensions, viewport, states, comparison history, tested interactions, console errors and exactly:

```text
final result: passed
```

### Task 7: Final verification and handoff

**Files:**
- Modify: verification documentation only when evidence requires it.

**Interfaces:**
- Consumes: final implementation.
- Produces: verified local preview with unchanged official baseline snapshots.

- [ ] **Step 1: Run the full unit, type and build gates**

```powershell
npm.cmd run test:run
npm.cmd run typecheck
npm.cmd run build
npm.cmd run verify:visual-gate:phase1
```

- [ ] **Step 2: Verify responsive browser states**

Check 320×568, 390×844 and 430×932 for overflow, navigation overlap, focus visibility, reduced motion and reachable Save.

- [ ] **Step 3: Keep the verified preview open**

Do not deploy or update official screenshots unless the user separately approves the candidate visuals.
