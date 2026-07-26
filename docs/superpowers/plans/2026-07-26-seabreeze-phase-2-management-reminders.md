# 海风小账本阶段二：账户、分类、预算、提醒与本机识别 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在阶段一五页产品上完成账户、分类、总预算、分类预算、固定账单、记账提醒和只在本机运行的截图识别草稿，让“我的”页对应入口从禁用骨架变成真实可用功能。

**Architecture:** 继续复用现有 `account/category/budget/category-budget/reminder` 操作、Repository 原子本地写入、outbox、SyncEngine 和 Supabase RPC；ViewModel 增加管理查询与命令，二级页面不接触数据库。截图识别由独立 `LocalReceiptRecognizer` 端口和懒加载 Web Worker 完成，图片仅以短生命周期 `Blob`/`ImageBitmap` 存在，识别结果只预填阶段一记账控制器。

**Tech Stack:** 阶段一技术栈、Tesseract.js 7.0.0（浏览器端 WebAssembly/Worker，运行时只加载随应用托管的语言文件）、现有 Zod/Playwright/Vitest。

## Global Constraints

- 前置条件：阶段一功能、无障碍、设计 QA 和用户候选图批准已完成；本计划不得回退阶段一官方视觉。
- 规格：`docs/superpowers/specs/2026-07-26-seabreeze-unified-five-page-design.md` 的 5.3、5.4、6、7、8 节。
- 页面继续只能依赖 `LedgerViewModel`、领域纯函数、设计系统和识别端口；不得直接导入 Dexie、Supabase、Repository、SyncEngine 或浏览器存储。
- 所有管理写入使用新的 UUID 幂等操作；先本地原子应用并进入 outbox，再尝试同步。
- 被历史流水引用的账户和分类只允许停用，不实现硬删除；停用后历史流水仍能显示原名称/图标。
- 资产与负债账户明确区分；收入只能进入资产账户；负债账户不能作为转出来源。
- 分类明确区分收入/支出；历史流水的分类类型不能被编辑为另一种类型。
- 同一账本/月只允许一个有效总预算；同一账本/月/分类只允许一个有效分类预算；金额为正安全整数分。
- 固定账单和提醒只生成提醒记录；到期后必须由用户确认并进入可编辑记账草稿，绝不自动创建真实流水。
- 截图识别不调用远程 URL、不上传、不保存原图、不写入 IndexedDB/outbox/备份/同步；确认或取消后立即释放对象 URL、ImageBitmap 和 Worker 任务引用。
- 识别失败、浏览器内存不足或不支持时显示手动记账入口，不阻塞支出/收入/转账核心流程。
- Tesseract.js、worker、wasm 和 `chi_sim`/`eng` 语言数据必须随应用本地托管；禁止 CDN、远程 `langPath` 和运行时下载。
- OCR 原文只在草稿会话内存中使用；正式日志、错误报告和生产包不得包含用户识别文本。
- 新数据库结构如确有必要只能通过新的带版本号、可回滚增量迁移；不得编辑已应用迁移。
- 候选图隔离到 `.superpowers/sdd/seabreeze-phase-2-previews/`；用户批准前不得更新官方快照。

---

## File Map

### Management data boundary

- Modify `src/db/records.ts`, `src/db/local-repository.ts`, `local-repository.test.ts`: `LedgerReadSnapshot.reminders` 和监听覆盖。
- Modify `src/test/ledger-fixture.ts`, `e2e-services.ts`: 管理实体固定夹具与本地操作应用。
- Modify `src/view-model/types.ts`, `ledger-view-model.ts`, `ledger-view-model.test.ts`: 管理快照和命令。
- Create `src/domain/reminder-schedule.ts`, `reminder-schedule.test.ts`: 稳定的提醒周期解析/格式化/下次时间计算。

### Management pages

- Create `src/features/accounts/AccountsPage.tsx`, CSS and tests.
- Create `src/features/categories/CategoriesPage.tsx`, CSS and tests.
- Create `src/features/budgets/BudgetsPage.tsx`, CSS and tests.
- Create `src/features/reminders/RemindersPage.tsx`, CSS and tests.
- Create `src/features/management/ManagementRouter.tsx`, CSS and tests.
- Modify `src/features/profile/ProfilePage.tsx`, CSS and tests.
- Modify `src/features/entry/TransactionEntryPage.tsx`, draft controller and tests: 接收提醒/OCR 预填。
- Modify `src/app/AppShell.tsx`, CSS and tests: 同一视觉语言的二级页栈。

### Local-only recognition

- Modify `package.json`, `package-lock.json`: pin `tesseract.js` to `7.0.0`.
- Create `public/ocr-data/chi_sim.traineddata.gz`, `eng.traineddata.gz`: 固定来源的本地语言数据。
- Create `src/recognition/types.ts`, `local-receipt-recognizer.ts`, tests.
- Create `src/recognition/tesseract-worker.ts`: 唯一可导入 Tesseract.js 的适配器。
- Create `src/domain/receipt-draft.ts`, `receipt-draft.test.ts`: 从 OCR 文本提取金额、日期、商户候选。
- Create `src/features/entry/ReceiptImportPanel.tsx`, CSS and tests.

### Verification

- Create `e2e/seabreeze-phase-2.spec.ts`, `e2e/candidate-seabreeze-phase-2.spec.ts`.
- Create `playwright.seabreeze-phase-2.config.ts`.
- Create `docs/verification/seabreeze-phase-2-ocr-safety.md`.
- Create ignored `.superpowers/sdd/seabreeze-phase-2-report.md` and candidate PNGs.

---

### Task 1: Extend ledger snapshots and isolate phase-two visual evidence

**Files:**
- Modify: `src/db/records.ts`
- Modify: `src/db/local-repository.ts`
- Modify: `src/db/local-repository.test.ts`
- Modify: `src/test/ledger-fixture.ts`
- Create: `docs/verification/seabreeze-phase-2-visual-lock.json`
- Create: `playwright.seabreeze-phase-2.config.ts`
- Create: `e2e/candidate-seabreeze-phase-2.spec.ts`
- Modify: `playwright.config.ts`, `package.json`

**Interfaces:**
- Consumes: phase-one approved official hash inventory and existing `reminders` Dexie table.
- Produces: `LedgerReadSnapshot.reminders`, reminder-aware `watchLedger`, `test:e2e:candidate:phase2` and a phase-two official snapshot lock.

- [ ] **Step 1: Write failing snapshot/listener tests**

Add a reminder to each of two ledgers and assert:

```ts
const snapshot = await repo.readLedgerSnapshot(ledgerId);
expect(snapshot.reminders).toHaveLength(1);
expect(snapshot.reminders.every((item) => item.ledgerId === ledgerId)).toBe(true);
```

Watch one ledger, save `reminder.create`, require exactly one invalidation, unsubscribe, save another reminder and require no further call.

- [ ] **Step 2: Run Repository tests and observe RED**

Run: `npm.cmd run test:run -- src/db/local-repository.test.ts`

Expected: `LedgerReadSnapshot` and reader do not include reminders.

- [ ] **Step 3: Add reminders to the atomic snapshot**

Include `this.db.reminders` in the same Dexie read transaction and return only matching `ledgerId`. Extend `scopeSnapshot()` and the mutable fixture clone. No schema migration is needed because version 1 already defines `reminders`.

- [ ] **Step 4: Lock and isolate phase-two candidates**

Record every approved official PNG SHA-256 in `seabreeze-phase-2-visual-lock.json`. Add a config equivalent to phase one but with:

```ts
testMatch: 'candidate-seabreeze-phase-2.spec.ts',
snapshotPathTemplate: '.superpowers/sdd/seabreeze-phase-2-previews/{arg}{ext}',
```

Default Playwright must ignore the candidate file. Reuse/extend the read-only visual verifier so both phase locks are checkable and neither command can rewrite official files.

- [ ] **Step 5: Add phase-two package commands**

Add:

```json
"verify:visual-gate:phase2": "node scripts/verify-seabreeze-phase-2-visual-gate.mjs",
"test:e2e:candidate:phase2": "playwright test --config playwright.seabreeze-phase-2.config.ts"
```

- [ ] **Step 6: Verify and commit Task 1**

Run:

```powershell
npm.cmd run test:run -- src/db/local-repository.test.ts src/test
npm.cmd run verify:visual-gate:phase1
npm.cmd run verify:visual-gate:phase2
git diff --check
```

```powershell
git add src/db src/test package.json playwright.config.ts playwright.seabreeze-phase-2.config.ts e2e/candidate-seabreeze-phase-2.spec.ts docs/verification/seabreeze-phase-2-visual-lock.json scripts
git commit -m "feat: add reminder snapshots and phase two gate"
```

---

### Task 2: Implement account management commands and page

**Files:**
- Modify: `src/view-model/types.ts`, `ledger-view-model.ts`, `ledger-view-model.test.ts`
- Create: `src/features/accounts/AccountsPage.tsx`, `AccountsPage.module.css`, `AccountsPage.test.tsx`

**Interfaces:**
- Produces:

```ts
export type AccountInput = {
  name: string;
  kind: Account['kind'];
  accountClass: Account['accountClass'];
  openingBalanceCents: number;
};

export interface AccountManagementItem extends AccountInput {
  id: string;
  balanceCents: number;
  sortOrder: number;
  version: number;
  archivedAt: string | null;
  referencedByTransactions: boolean;
}

LedgerViewModel.getAccounts(): Promise<AccountManagementItem[]>;
LedgerViewModel.createAccount(input: AccountInput): Promise<string>;
LedgerViewModel.updateAccount(id: string, baseVersion: number, input: AccountInput): Promise<void>;
LedgerViewModel.archiveAccount(id: string, baseVersion: number): Promise<void>;
```

- [ ] **Step 1: Write failing ViewModel operation tests**

Require trimmed name, valid kind/class pairs (`credit_card` must be liability; cash/debit/wechat/alipay must be asset), signed opening balance, monotonic sort order, version 1 create, version+1 update and UUID operation IDs. Archive must emit `account.archive`; no delete API exists.

- [ ] **Step 2: Run focused ViewModel tests and observe RED**

Run: `npm.cmd run test:run -- src/view-model/ledger-view-model.test.ts`

- [ ] **Step 3: Implement commands through `saveOperation()`**

Use a fresh scoped snapshot for each command. Updates keep immutable `id/ledgerId/currency`, reject stale versions before saving, and never alter existing transactions/entries.

- [ ] **Step 4: Write failing AccountsPage tests**

Cover loading/error/retry, asset/liability grouping, add, edit, archive confirmation, archived history label, invalid name, invalid account type/class and failed-save input retention/focus.

- [ ] **Step 5: Implement the page**

Render account balances from the ViewModel snapshot, not by component arithmetic. Archive confirmation says `停用后历史流水仍会保留此账户名称`; active transaction creation options refresh automatically.

- [ ] **Step 6: Verify and commit Task 2**

Run:

```powershell
npm.cmd run test:run -- src/view-model src/features/accounts
npm.cmd run typecheck
```

```powershell
git add src/view-model src/features/accounts
git commit -m "feat: add account management"
```

---

### Task 3: Implement category management, ordering and icon choice

**Files:**
- Modify: `src/view-model/types.ts`, `ledger-view-model.ts`, `ledger-view-model.test.ts`
- Create: `src/features/categories/CategoriesPage.tsx`, CSS and tests
- Modify: `src/assets/registry.ts`, `assets.test.tsx` only for approved category additions

**Interfaces:**
- Produces:

```ts
export type CategoryInput = {
  name: string;
  kind: 'expense' | 'income';
  iconKey: string;
  sortOrder: number;
};

export interface CategoryManagementItem extends CategoryInput {
  id: string;
  version: number;
  archivedAt: string | null;
  referencedByTransactions: boolean;
}

LedgerViewModel.getCategories(): Promise<CategoryManagementItem[]>;
LedgerViewModel.createCategory(input: CategoryInput): Promise<string>;
LedgerViewModel.updateCategory(id: string, baseVersion: number, input: CategoryInput): Promise<void>;
LedgerViewModel.reorderCategories(kind: Category['kind'], orderedIds: readonly string[]): Promise<void>;
LedgerViewModel.archiveCategory(id: string, baseVersion: number): Promise<void>;
```

- [ ] **Step 1: Write failing category command tests**

Require unique nonblank name within active same-kind categories, registered `category:*` icon, stable integer order, no kind change for categories referenced by transactions, per-item update operations for reorder, stale version rejection and archive-only removal.

- [ ] **Step 2: Run tests and observe RED**

Run: `npm.cmd run test:run -- src/view-model/ledger-view-model.test.ts src/assets/assets.test.tsx`

- [ ] **Step 3: Implement commands**

Validate the full `orderedIds` set before writing; emit sequential `category.update` operations with fresh UUIDs and unchanged category identity. A partial/duplicate set fails before any write.

- [ ] **Step 4: Write failing page tests**

Cover income/expense segments, add/edit, icon picker accessible names, up/down reorder buttons at 44px, archive confirmation, input retention and historical archived label.

- [ ] **Step 5: Implement and verify**

No drag-only interaction: keyboard/screen-reader users must reorder with explicit `上移/下移` actions. Use only registry SVGs.

Run:

```powershell
npm.cmd run test:run -- src/view-model src/features/categories src/assets
npm.cmd run typecheck
```

- [ ] **Step 6: Commit Task 3**

```powershell
git add src/view-model src/features/categories src/assets
git commit -m "feat: add category management"
```

---

### Task 4: Implement total and category budget management

**Files:**
- Modify: `src/view-model/types.ts`, `ledger-view-model.ts`, `ledger-view-model.test.ts`
- Create: `src/features/budgets/BudgetsPage.tsx`, CSS and tests
- Modify: `src/features/home/HomePage.tsx`, `src/features/statistics/StatisticsPage.tsx` and tests

**Interfaces:**
- Produces:

```ts
export type BudgetSaveInput =
  | { kind: 'total'; month: string; amountCents: number }
  | { kind: 'category'; month: string; categoryId: string; amountCents: number };

export interface BudgetManagementSnapshot {
  month: string;
  total: null | {
    id: string;
    amountCents: number;
    usedCents: number;
    remainingCents: number;
    version: number;
  };
  categories: Array<{
    id: string | null;
    categoryId: string;
    categoryName: string;
    amountCents: number | null;
    usedCents: number;
    remainingCents: number | null;
    version: number | null;
  }>;
}

LedgerViewModel.getBudgetManagement(month: string): Promise<BudgetManagementSnapshot>;
LedgerViewModel.saveBudget(input: BudgetSaveInput): Promise<string>;
LedgerViewModel.archiveBudget(kind: 'total' | 'category', id: string, baseVersion: number): Promise<void>;
```

- [ ] **Step 1: Write failing selector/command tests**

Prove one active total per month and one active category budget per `(month, categoryId)`. `saveBudget` updates an existing active record or creates one; it never creates a duplicate. Category must be active expense category. Parse all UI amounts with `parseYuan()`.

- [ ] **Step 2: Run tests and observe RED**

Run: `npm.cmd run test:run -- src/view-model/ledger-view-model.test.ts`

- [ ] **Step 3: Implement ViewModel operations**

Use existing cloud unique constraints and local preflight checks. Race/constraint failures map to `预算已在其他设备更新，请刷新后重试`.

- [ ] **Step 4: Write and implement BudgetsPage tests**

Cover month selection, total amount, category rows, used/remaining/overspent text, create/update/archive, invalid amount, query error/retry and save-focus behavior.

- [ ] **Step 5: Refresh Home/Statistics from the same data**

After local save, subscription refresh updates Home and Statistics progress without page-specific formula duplication.

- [ ] **Step 6: Verify and commit Task 4**

Run:

```powershell
npm.cmd run test:run -- src/view-model src/features/budgets src/features/home src/features/statistics
npm.cmd run typecheck
```

```powershell
git add src/view-model src/features/budgets src/features/home src/features/statistics
git commit -m "feat: add budget management"
```

---

### Task 5: Implement fixed bills and confirmation-based reminders

**Files:**
- Create: `src/domain/reminder-schedule.ts`, `reminder-schedule.test.ts`
- Modify: `src/view-model/types.ts`, `ledger-view-model.ts`, `ledger-view-model.test.ts`
- Create: `src/features/reminders/RemindersPage.tsx`, CSS and tests
- Modify: `src/features/entry/entry-draft.ts`, tests

**Interfaces:**
- Produces:

```ts
export type ReminderSchedule =
  | { kind: 'once'; at: string }
  | { kind: 'daily'; time: string }
  | { kind: 'weekly'; weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6; time: string }
  | { kind: 'monthly'; day: number; time: string };

export type ReminderInput = {
  name: string;
  amountCents: number | null;
  categoryId: string | null;
  accountId: string | null;
  schedule: ReminderSchedule;
};

export interface ReminderManagementItem {
  id: string;
  name: string;
  amountCents: number | null;
  categoryId: string | null;
  accountId: string | null;
  schedule: ReminderSchedule;
  nextDueAt: string;
  version: number;
  archivedAt: string | null;
}

LedgerViewModel.getReminders(): Promise<ReminderManagementItem[]>;
LedgerViewModel.createReminder(input: ReminderInput): Promise<string>;
LedgerViewModel.updateReminder(id: string, baseVersion: number, input: ReminderInput): Promise<void>;
LedgerViewModel.archiveReminder(id: string, baseVersion: number): Promise<void>;
LedgerViewModel.createEntryIntentFromReminder(id: string): Promise<Partial<EntryDraftValues>>;
```

The last method returns draft values only.

- [ ] **Step 1: Write failing pure schedule tests**

Cover leap years, month day 29–31 clamping to last day, daylight-saving-safe local construction, past one-time reminders, recurrence round-trip and deterministic Chinese labels.

- [ ] **Step 2: Run schedule tests and observe RED**

Run: `npm.cmd run test:run -- src/domain/reminder-schedule.test.ts`

- [ ] **Step 3: Implement schedule encoding**

Persist canonical strings:

```text
once:2026-07-28T12:00:00.000+08:00
daily:20:00
weekly:1:20:00
monthly:15:20:00
```

Reject all other strings with safe Chinese copy.

- [ ] **Step 4: Write/implement ViewModel and page tests**

Cover create/edit/archive, active referenced account/category checks, next due time, due list and `确认记账` producing an editable draft. Assert `saveOperation` is not called when confirming a reminder; only the later entry-page Save creates a transaction.

- [ ] **Step 5: Verify and commit Task 5**

Run:

```powershell
npm.cmd run test:run -- src/domain src/view-model src/features/reminders src/features/entry
npm.cmd run typecheck
```

```powershell
git add src/domain/reminder-schedule* src/view-model src/features/reminders src/features/entry
git commit -m "feat: add bills and ledger reminders"
```

---

### Task 6: Add a local-only OCR worker and receipt text parser

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `public/ocr-data/chi_sim.traineddata.gz`, `eng.traineddata.gz`
- Create: `src/recognition/types.ts`, `local-receipt-recognizer.ts`, `tesseract-worker.ts`
- Create: `src/recognition/local-receipt-recognizer.test.ts`
- Create: `src/domain/receipt-draft.ts`, `receipt-draft.test.ts`
- Create: `docs/verification/seabreeze-phase-2-ocr-safety.md`

**Interfaces:**
- Produces:

```ts
export interface ReceiptRecognitionResult {
  text: string;
  confidence: number;
}

export interface LocalReceiptRecognizer {
  recognize(image: Blob, signal: AbortSignal, onProgress: (value: number) => void): Promise<ReceiptRecognitionResult>;
  dispose(): Promise<void>;
}

export interface ReceiptDraftSuggestion {
  amountYuan: string | null;
  occurredAtLocal: string | null;
  note: string;
  confidence: 'high' | 'review' | 'low';
}
```

- [ ] **Step 1: Install pinned local OCR runtime**

Run: `npm.cmd install --save-exact tesseract.js@7.0.0`

Vendor official `chi_sim.traineddata.gz` and `eng.traineddata.gz` under `public/ocr-data/`, record source release/commit, license and SHA-256 in the safety document. Runtime must use `import.meta.env.BASE_URL + 'ocr-data'`, never a CDN.

- [ ] **Step 2: Write failing recognizer lifecycle tests**

Mock the worker factory. Require lazy creation, progress normalization 0–1, abort cancellation, one active recognition at a time, worker termination on dispose, and no persistence/network API calls.

- [ ] **Step 3: Write failing parser tests**

Use synthetic text only. Cover `¥68.00`, `￥ 1,234.56`, `实付68`, invalid/ambiguous multiple amounts, Chinese/ISO dates and merchant-line note selection. Low confidence returns null amount instead of auto-selecting.

- [ ] **Step 4: Run tests and observe RED**

Run: `npm.cmd run test:run -- src/recognition src/domain/receipt-draft.test.ts`

- [ ] **Step 5: Implement the worker adapter and parser**

Only `tesseract-worker.ts` imports `tesseract.js`. Use:

```ts
const worker = await createWorker(['chi_sim', 'eng'], OEM.LSTM_ONLY, {
  langPath: `${import.meta.env.BASE_URL}ocr-data`,
  gzip: true,
  logger: ({ status, progress }) => onProgress(status === 'recognizing text' ? progress : 0),
});
```

Do not log OCR text. On abort/dispose, terminate and clear references. Parser is a pure function with no image access.

- [ ] **Step 6: Verify offline/security/build**

Run:

```powershell
npm.cmd run test:run -- src/recognition src/domain/receipt-draft.test.ts
npm.cmd run typecheck
npm.cmd run build
rg -n "https?://|cdn|fetch\\(|XMLHttpRequest|supabase|indexedDB|localStorage" src/recognition public/ocr-data
```

Expected: tests/type/build pass; scan has no runtime remote/persistence access. License/source links may appear only in the verification document.

- [ ] **Step 7: Commit Task 6**

```powershell
git add package.json package-lock.json public/ocr-data src/recognition src/domain/receipt-draft* docs/verification/seabreeze-phase-2-ocr-safety.md
git commit -m "feat: add local receipt recognition"
```

---

### Task 7: Integrate screenshot recognition as an editable, disposable draft

**Files:**
- Create: `src/features/entry/ReceiptImportPanel.tsx`, CSS and tests
- Modify: `src/features/entry/TransactionEntryPage.tsx`, `entry-draft.ts` and tests
- Modify: `src/app/AppShell.tsx`, tests

**Interfaces:**
- Consumes: `LocalReceiptRecognizer` and `ReceiptDraftSuggestion`.
- Produces: file picker/camera capture that can apply a suggestion to the existing draft only after explicit review.

- [ ] **Step 1: Write failing privacy/lifecycle tests**

Require `accept="image/*"`, file-size/type checks, progress/cancel, explicit `应用到草稿`, and `URL.revokeObjectURL()` plus recognizer disposal on apply/cancel/unmount. Assert no transaction command runs during recognition or suggestion application.

- [ ] **Step 2: Write failing failure/fallback tests**

Unsupported/corrupt/oversized image and OCR failure show safe copy plus `改为手动记账`; current manual draft remains intact.

- [ ] **Step 3: Run tests and observe RED**

Run: `npm.cmd run test:run -- src/features/entry`

- [ ] **Step 4: Implement an ephemeral flow**

Resize with an in-memory canvas/ImageBitmap before OCR, cap the longest edge and immediately close the bitmap. Never store the source/sized image. Applying a suggestion updates only amount/date/note fields; user must choose category/account and press Save.

- [ ] **Step 5: Verify and commit Task 7**

Run:

```powershell
npm.cmd run test:run -- src/features/entry src/recognition
npm.cmd run typecheck
```

```powershell
git add src/features/entry src/app/AppShell.tsx src/app/AppShell.test.tsx
git commit -m "feat: add private screenshot entry drafts"
```

---

### Task 8: Activate management routes, run phase-two QA and produce candidates

**Files:**
- Create: `src/features/management/ManagementRouter.tsx`, CSS and tests
- Modify: `src/features/profile/ProfilePage.tsx`, CSS and tests
- Modify: `src/app/AppShell.tsx`, CSS and tests
- Create: `e2e/seabreeze-phase-2.spec.ts`
- Modify: `e2e/accessibility.spec.ts`
- Modify: `e2e/candidate-seabreeze-phase-2.spec.ts`
- Create ignored: `.superpowers/sdd/seabreeze-phase-2-report.md`

**Interfaces:**
- Consumes: Tasks 1–7.
- Produces: keyboard-accessible secondary page stack, full phase-two browser evidence and isolated visual candidates.

- [ ] **Step 1: Write failing route-stack tests**

Profile buttons open Accounts, Categories, Budgets and Reminders pages; back returns to the same Profile scroll/focus. Opening management pages does not unmount the four regular panels. OCR action opens inside entry flow, not as a fake Profile success.

- [ ] **Step 2: Implement route stack and activate entries**

Use controlled union:

```ts
type ManagementRoute = 'accounts' | 'categories' | 'budgets' | 'reminders' | null;
```

Only completed routes are active. Backup/restore/export/preferences/security remain disabled until phase three.

- [ ] **Step 3: Add browser journeys**

At 320×568, 390×844 and 430×932 cover add/edit/archive account/category, reorder category, set/update total/category budget, create/edit/archive reminder, confirm reminder into editable entry, and mocked OCR suggestion into editable entry. Verify offline local mutation remains visible and later sync is attempted.

- [ ] **Step 4: Run the complete non-visual gate**

Run:

```powershell
npm.cmd run test:run
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:e2e -- e2e/seabreeze-phase-1.spec.ts e2e/seabreeze-phase-2.spec.ts e2e/accessibility.spec.ts
npm.cmd run verify:visual-gate:phase2
rg -n "https?://|fixtureNow|test-e2e|e2e-access-token" dist/assets
rg -n "from ['\"](?:dexie|@supabase|\.\./\.\./db|\.\./\.\./services)" src/features
git diff --check
```

- [ ] **Step 5: Generate candidates and perform design/privacy QA**

Capture Profile active management entries plus Accounts, Categories, Budgets, Reminders and Receipt Import at all target sizes using only the phase-two config. Record hashes, code SHA, exact test counts, OCR lifecycle evidence and all P0/P1/P2 fixes. Report ends `final result: passed`.

- [ ] **Step 6: Review, verify, commit and wait**

Use `superpowers:requesting-code-review`, fix Critical/Important findings, then `superpowers:verification-before-completion`.

```powershell
git add src/features/management src/features/profile src/app e2e/seabreeze-phase-2.spec.ts e2e/accessibility.spec.ts e2e/candidate-seabreeze-phase-2.spec.ts
git commit -m "feat: integrate seabreeze management tools"
```

Ask for explicit candidate approval. Do not update official visual snapshots before approval.
