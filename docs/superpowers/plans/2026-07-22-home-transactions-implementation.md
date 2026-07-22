# 海风小账本首页与流水页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用真实本地账本快照替换首页和流水占位页，完成首页指标、预算、快捷分类、紧凑流水筛选/分组、详情、同类型编辑、8 秒删除撤销及可审查的视觉基线。

**Architecture:** `LocalLedgerRepository` 提供当前账本的一致读取和变化监听；`LedgerViewModel` 是页面唯一的数据与命令边界，集中调用核心指标、posting 和 operation 校验。`AppProviders` 管理 ViewModel 生命周期，页面只渲染显示模型并通过命令保存，生产页面不直接访问 Dexie、Supabase 或同步引擎。

**Tech Stack:** React 19.2.7、TypeScript 7.0.2、Dexie 4.4.4、Vitest 4.1.10、Testing Library、Playwright 1.61.1、CSS Modules、现有 Supabase/SyncEngine 与领域函数。

## Global Constraints

- 设计规格：`docs/superpowers/specs/2026-07-22-home-transactions-design.md`；任何冲突以该规格和已确认核心账务规则为准。
- 全程 TDD：每个行为先运行覆盖它的失败测试并记录 RED，再做最小实现和 GREEN。
- 页面只能依赖 `src/view-model`、`src/domain` 的纯类型/格式化函数和 `src/design-system`；不得直接导入 `src/db`、`src/services`、Dexie、Supabase 或 `SyncEngine`。
- 人民币金额始终保存为安全整数分；用户金额文本只能经 `parseYuan()` 转换，不得使用 `Number(value) * 100`。
- 今日/月度指标必须调用 `calculateMetrics()`；转账、退款和余额校准口径不得在页面复制实现。
- 编辑保持原交易类型；退款账户固定为原支出分录账户；转出与转入账户不得相同。
- 删除立即写 tombstone，现有 8 秒 `notBefore` 为撤销边界；失败不能静默移除或覆盖数据。
- 新 SVG 必须独立、有 `viewBox`、无脚本/远程 URL/emoji，不得嵌入整张参考图。
- 所有交互目标至少 44×44 CSS 像素；320px 只允许分类 chips 容器内部横向滚动，文档不得横向溢出。
- 保持现有登录、忘记密码、恢复密码和未预选中央记账层的批准像素；用户批准候选图前禁止更新正式快照。
- 不新增运行时依赖；不实现新建记账、统计、设置、OCR、PWA 或部署。
- E2E 固定账本只能通过 `mode === 'test-e2e'` 的动态导入进入；最终生产包扫描不得出现 fixture 标识或固定财务数据。
- 本机命令使用 `npm.cmd`；未来 Linux CI 使用对应的 `npm` 命令，不把 `.cmd` 写入跨平台脚本。

---

## File Map

### Data and ViewModel

- Modify `src/db/records.ts`: 定义 `LedgerReadSnapshot`。
- Modify `src/db/local-repository.ts`: 账本范围原子读取和 Dexie `liveQuery` 失效通知。
- Modify `src/db/local-repository.test.ts`: 跨账本隔离和订阅测试。
- Create `src/view-model/types.ts`: 首页、流水、详情、编辑和筛选的稳定 UI 类型。
- Create `src/view-model/ledger-view-model.ts`: 查询、映射、编辑、删除、撤销和订阅。
- Create `src/view-model/ledger-view-model.test.ts`: 固定账本合同测试。
- Create `src/view-model/use-ledger-query.ts`: 带代次保护的异步 React 查询 hook。
- Create `src/view-model/use-ledger-query.test.tsx`: 旧响应、重试和订阅测试。
- Create `src/test/ledger-fixture.ts`: 仅测试使用的有效 UUID 固定账本和可变内存 repository。

### Runtime Integration

- Modify `src/app/providers.tsx`: ViewModel 创建、发布、清理和运行时类型。
- Modify `src/app/providers.test.tsx`: 会话/初始化/ViewModel 生命周期测试。
- Modify `src/app/AuthGate.tsx`, `src/app/AuthGate.test.tsx`: ViewModel 未就绪继续加载。
- Modify `src/test/e2e-services.ts`, `src/test/e2e-services.test.ts`: 固定账本 E2E 数据源和变更通知。

### Visual Assets and Pages

- Create `src/assets/illustrations/home-seaside.svg`, `src/assets/illustrations/empty-ledger.svg`。
- Create `src/assets/icons/categories/{food,transport,shopping,housing,entertainment,daily,study,medical,travel,income,other}.svg`。
- Modify `src/assets/registry.ts`, `src/assets/assets.test.tsx`, `src/assets/ATTRIBUTION.md`。
- Create `src/design-system/components/Amount.tsx`, `src/design-system/components/UndoToast.tsx` and tests in `src/design-system/components/design-system.test.tsx`。
- Create `src/features/home/HomePage.tsx`, `HomePage.module.css`, `HomePage.test.tsx`。
- Create `src/features/transactions/TransactionsPage.tsx`, `TransactionsPage.module.css`, `TransactionsPage.test.tsx`。
- Create `src/features/transactions/TransactionRow.tsx`, `TransactionDetailSheet.tsx`, `TransactionEditForm.tsx`, `TransactionOverlays.tsx`。
- Create `src/features/transactions/TransactionOverlays.test.tsx`: 共享详情、删除、撤销和超时控制器测试。

### Shell and Browser Evidence

- Modify `src/app/App.tsx`, `src/app/App.test.tsx`, `src/app/AppShell.tsx`, `src/app/AppShell.module.css`, `src/app/AppShell.test.tsx`。
- Modify `src/test/e2e-services.ts`, `e2e/accessibility.spec.ts`, `e2e/visual.spec.ts`, `playwright.config.ts`, `package.json`。
- Create `e2e/home-transactions.spec.ts`, `e2e/candidate-home-transactions.spec.ts`, `playwright.candidate.config.ts`。
- Create `docs/verification/home-transactions.md` after visual approval.

---

### Task 1: Add ledger-scoped atomic reads and change notifications

**Files:**
- Modify: `src/db/records.ts`
- Modify: `src/db/local-repository.ts`
- Test: `src/db/local-repository.test.ts`

**Interfaces:**
- Consumes: existing `LedgerDatabase` tables and `ledgerId` indexes.
- Produces:

```ts
export interface LedgerReadSnapshot {
  ledgerId: string;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  entries: LedgerEntryRecord[];
  budgets: Budget[];
  categoryBudgets: CategoryBudget[];
}

LocalLedgerRepository.readLedgerSnapshot(ledgerId: string): Promise<LedgerReadSnapshot>;
LocalLedgerRepository.watchLedger(ledgerId: string, onChange: () => void): () => void;
```

- [ ] **Step 1: Write failing cross-ledger snapshot tests**

Append tests that seed two ledgers and require every returned collection to be scoped:

```ts
it('reads one ledger as a consistent scoped snapshot', async () => {
  const otherLedgerId = '00000000-0000-4000-8000-000000000002';
  const otherAccountId = '00000000-0000-4000-8000-000000000102';
  await db.accounts.put(bank(otherAccountId, otherLedgerId));
  await repo.saveOperation(expenseOperation(21));
  await repo.saveOperation(expenseOperation(22, '2026-07-18T08:00:00.000Z', otherLedgerId, otherAccountId));

  const snapshot = await repo.readLedgerSnapshot(ledgerId);

  expect(snapshot.ledgerId).toBe(ledgerId);
  expect(snapshot.accounts.every((item) => item.ledgerId === ledgerId)).toBe(true);
  expect(snapshot.transactions.every((item) => item.ledgerId === ledgerId)).toBe(true);
  expect(snapshot.entries.every((item) => item.ledgerId === ledgerId)).toBe(true);
  expect(snapshot.transactions).toHaveLength(1);
});
```

Add one record for each of categories, budgets and category budgets so the test covers all six collections, not only transactions.

- [ ] **Step 2: Write the failing subscription test**

```ts
it('notifies only after watched ledger data changes and unsubscribes cleanly', async () => {
  const onChange = vi.fn();
  const readSnapshot = vi.spyOn(repo, 'readLedgerSnapshot');
  const stop = repo.watchLedger(ledgerId, onChange);
  await vi.waitFor(() => expect(readSnapshot).toHaveBeenCalled());
  expect(onChange).not.toHaveBeenCalled();

  await repo.saveOperation(expenseOperation(23));
  await vi.waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));

  stop();
  await repo.saveOperation(expenseOperation(24));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(onChange).toHaveBeenCalledTimes(1);
});
```

The implementation must suppress the initial `liveQuery` emission; callers already perform their own first load.

- [ ] **Step 3: Run the focused test and verify RED**

Run: `npm.cmd run test:run -- src/db/local-repository.test.ts`

Expected: FAIL because `readLedgerSnapshot` and `watchLedger` do not exist.

- [ ] **Step 4: Add the snapshot type and minimal repository implementation**

Add `LedgerReadSnapshot` to `src/db/records.ts`, import `liveQuery` from `dexie`, and add:

```ts
async readLedgerSnapshot(ledgerId: string): Promise<LedgerReadSnapshot> {
  const tables = [
    this.db.accounts,
    this.db.categories,
    this.db.transactions,
    this.db.entries,
    this.db.budgets,
    this.db.categoryBudgets,
  ];
  return this.db.transaction('r', tables, async () => {
    const [accounts, categories, transactions, entries, budgets, categoryBudgets] = await Promise.all([
      this.db.accounts.where('ledgerId').equals(ledgerId).toArray(),
      this.db.categories.where('ledgerId').equals(ledgerId).toArray(),
      this.db.transactions.where('ledgerId').equals(ledgerId).toArray(),
      this.db.entries.where('ledgerId').equals(ledgerId).toArray(),
      this.db.budgets.where('ledgerId').equals(ledgerId).toArray(),
      this.db.categoryBudgets.where('ledgerId').equals(ledgerId).toArray(),
    ]);
    return { ledgerId, accounts, categories, transactions, entries, budgets, categoryBudgets };
  });
}

watchLedger(ledgerId: string, onChange: () => void): () => void {
  let initialEmission = true;
  const subscription = liveQuery(() => this.readLedgerSnapshot(ledgerId)).subscribe({
    next: () => {
      if (initialEmission) initialEmission = false;
      else onChange();
    },
    error: () => onChange(),
  });
  return () => subscription.unsubscribe();
}
```

- [ ] **Step 5: Verify GREEN and the existing repository contract**

Run: `npm.cmd run test:run -- src/db/local-repository.test.ts`

Expected: PASS; existing save/outbox/sync/undo tests remain green.

- [ ] **Step 6: Commit Task 1**

```powershell
git add src/db/records.ts src/db/local-repository.ts src/db/local-repository.test.ts
git commit -m "feat: add ledger read snapshots"
```

---

### Task 2: Implement read-only LedgerViewModel projections

**Files:**
- Create: `src/view-model/types.ts`
- Create: `src/view-model/ledger-view-model.ts`
- Create: `src/view-model/ledger-view-model.test.ts`
- Create: `src/view-model/use-ledger-query.ts`
- Create: `src/view-model/use-ledger-query.test.tsx`
- Create: `src/test/ledger-fixture.ts`

**Interfaces:**
- Consumes: `LedgerReadSnapshot`, `calculateMetrics()`, `formatYuan()`, repository `readLedgerSnapshot/watchLedger`.
- Produces:

```ts
export interface HomeSnapshot {
  totalAssetsCents: number;
  todayExpenseCents: number;
  monthIncomeCents: number;
  monthExpenseCents: number;
  monthBalanceCents: number;
  budget: null | { amountCents: number; usedCents: number; remainingCents: number };
  quickCategories: Array<{ id: string; name: string; iconKey: string }>;
  recentTransactions: TransactionRowModel[];
}

export interface TransactionFilters {
  month: string;
  accountId: string | null;
  date: string | null;
  categoryId: string | null;
  query: string;
}

export interface TransactionRowModel {
  id: string;
  type: Transaction['type'];
  title: string;
  categoryName: string | null;
  categoryIconKey: string;
  occurredAt: string;
  timeLabel: string;
  accountLabel: string;
  amountCents: number;
  amountLabel: string;
  amountTone: 'expense' | 'income' | 'refund' | 'neutral' | 'adjustment';
  version: number;
}

export interface TransactionDateGroup {
  dateKey: string;
  dateLabel: string;
  expenseCents: number;
  incomeCents: number;
  rows: TransactionRowModel[];
}

export interface TransactionListSnapshot {
  groups: TransactionDateGroup[];
  accounts: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string; iconKey: string }>;
}

export interface HomeSyncState {
  label: string;
  tone: 'quiet' | 'warning' | 'error';
  retryable: boolean;
}

export interface TransactionDetail extends TransactionRowModel {
  ledgerId: string;
  categoryId: string | null;
  note: string;
  originalTransactionId: string | null;
  originalTransactionTitle: string | null;
  entries: Array<{ accountId: string; accountName: string; deltaCents: number }>;
  accountOptions: Array<{ id: string; name: string; accountClass: Account['accountClass'] }>;
  categoryOptions: Array<{ id: string; name: string; kind: Category['kind'] }>;
}

export type LedgerQueryState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; retry: () => void };

export interface LedgerViewModelOptions {
  ledgerId: string;
  repository: Pick<LocalLedgerRepository,
    'readLedgerSnapshot' | 'watchLedger' | 'undoTransactionDelete'>;
  saveOperation(operation: LedgerOperation): Promise<void>;
  syncNow(): Promise<void>;
  now(): Date;
  makeUuid(): string;
}

export class LedgerViewModel {
  readonly ledgerId: string;
  constructor(options: LedgerViewModelOptions);
  getHomeSnapshot(input?: { now?: Date }): Promise<HomeSnapshot>;
  getTransactions(filters: TransactionFilters): Promise<TransactionListSnapshot>;
  getTransactionDetail(id: string): Promise<TransactionDetail | null>;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}
```

- [ ] **Step 1: Create the deterministic finance fixture**

Create valid UUID records for one target ledger plus one other-ledger record. The target fixture must encode this exact table so expected metrics are auditable:

| Record | Value |
| --- | --- |
| Bank opening asset | ¥3,000.00 |
| Cash opening asset | ¥200.00 |
| Credit opening liability | ¥500.00 |
| July income | ¥1,000.00 to bank |
| July 17 credit expense | ¥200.00 shopping |
| July 17 refund | ¥20.00 linked to the credit expense |
| July 18 cash expense | ¥50.00 food |
| July 18 transfer | ¥100.00 bank to cash |
| July 18 adjustment | +¥30.00 bank |
| July total budget | ¥500.00 |
| Expected net worth | ¥3,500.00 |
| Expected today expense | ¥50.00 |
| Expected month income / net expense / balance | ¥1,000.00 / ¥230.00 / ¥770.00 |
| Expected budget used / remaining | ¥230.00 / ¥270.00 |

Also include four active expense categories (food, transport, shopping, entertainment), one archived category, one deleted transaction and one June transaction. Fixture timestamps must be created from local `new Date(year, monthIndex, day, hour)` and serialized, so unit tests remain relative to the executing local calendar.

Export this exact testing surface from `src/test/ledger-fixture.ts`:

```ts
export const fixtureNow: Date;
export const fixtureIds: {
  ledger: string;
  bank: string;
  cash: string;
  credit: string;
  foodCategory: string;
  transferTransaction: string;
  foodTransaction: string;
};
export const fixtureTimes: { todayExpense: string };
export const defaultFilters: TransactionFilters;

export interface MutableLedgerFixture {
  snapshot: LedgerReadSnapshot;
  readLedgerSnapshot(ledgerId: string): Promise<LedgerReadSnapshot>;
  watchLedger(ledgerId: string, listener: () => void): () => void;
  saveOperation(operation: LedgerOperation): Promise<void>;
  undoTransactionDelete(transactionId: string, now: string): Promise<void>;
}

export function createMutableLedgerFixture(
  overrides?: Partial<LedgerReadSnapshot>,
): MutableLedgerFixture;
```

In `ledger-view-model.test.ts`, define the two local helpers used below:

```ts
function sequentialUuidFactory() {
  let sequence = 900;
  return () => `00000000-0000-4000-9000-${String(sequence++).padStart(12, '0')}`;
}

function createFixtureViewModelHarness(overrides?: Partial<LedgerReadSnapshot>) {
  const repository = createMutableLedgerFixture(overrides);
  const saveOperation = vi.fn((operation: LedgerOperation) => repository.saveOperation(operation));
  const syncNow = vi.fn(async () => undefined);
  const viewModel = new LedgerViewModel({
    ledgerId: fixtureIds.ledger,
    repository,
    saveOperation,
    syncNow,
    now: () => new Date(fixtureNow),
    makeUuid: sequentialUuidFactory(),
  });
  return { repository, saveOperation, syncNow, viewModel };
}

function createFixtureViewModel(overrides?: Partial<LedgerReadSnapshot>) {
  return createFixtureViewModelHarness(overrides).viewModel;
}
```

- [ ] **Step 2: Write failing home projection tests**

```ts
it('returns all home figures from one consistent snapshot', async () => {
  const viewModel = createFixtureViewModel();
  const snapshot = await viewModel.getHomeSnapshot({ now: fixtureNow });

  expect(snapshot).toMatchObject({
    totalAssetsCents: 350000,
    todayExpenseCents: 5000,
    monthIncomeCents: 100000,
    monthExpenseCents: 23000,
    monthBalanceCents: 77000,
    budget: { amountCents: 50000, usedCents: 23000, remainingCents: 27000 },
  });
  expect(snapshot.quickCategories.map((item) => item.name))
    .toEqual(['餐饮', '交通', '购物', '娱乐']);
  expect(snapshot.recentTransactions).toHaveLength(3);
});

it('returns no fake progress when the month has no active total budget', async () => {
  const viewModel = createFixtureViewModel({ budgets: [] });
  expect((await viewModel.getHomeSnapshot({ now: fixtureNow })).budget).toBeNull();
});
```

- [ ] **Step 3: Write failing filter/group tests**

Cover all filter combinations and transaction semantics:

```ts
it('combines month account date category and trimmed search filters', async () => {
  const result = await createFixtureViewModel().getTransactions({
    month: '2026-07',
    accountId: fixtureIds.cash,
    date: '2026-07-18',
    categoryId: fixtureIds.foodCategory,
    query: ' 午餐 ',
  });
  expect(result.groups.flatMap((group) => group.rows).map((row) => row.title))
    .toEqual(['午餐']);
});

it('groups by local date and excludes transfer adjustment deleted and refund from wrong totals', async () => {
  const result = await createFixtureViewModel().getTransactions(defaultFilters);
  expect(result.groups.map((group) => group.dateKey)).toEqual(['2026-07-18', '2026-07-17', '2026-07-01']);
  expect(result.groups[0]).toMatchObject({ expenseCents: 5000, incomeCents: 0 });
  expect(result.groups[1]).toMatchObject({ expenseCents: 18000, incomeCents: 0 });
});

it('renders transfers with both account names and neutral amount semantics', async () => {
  const rows = (await createFixtureViewModel().getTransactions(defaultFilters))
    .groups.flatMap((group) => group.rows);
  expect(rows.find((row) => row.type === 'transfer')).toMatchObject({
    accountLabel: '储蓄卡 → 现金',
    amountTone: 'neutral',
  });
});

it('returns complete transfer detail and active edit options', async () => {
  const detail = await createFixtureViewModel().getTransactionDetail(fixtureIds.transferTransaction);
  expect(detail).toMatchObject({
    type: 'transfer',
    entries: [
      { accountName: '储蓄卡', deltaCents: -10000 },
      { accountName: '现金', deltaCents: 10000 },
    ],
  });
  expect(detail?.accountOptions.map((item) => item.name)).not.toContain('已归档账户');
});
```

- [ ] **Step 4: Run the ViewModel tests and verify RED**

Run: `npm.cmd run test:run -- src/view-model/ledger-view-model.test.ts`

Expected: FAIL because the ViewModel and types do not exist.

- [ ] **Step 5: Implement local calendar helpers and read projections**

In `ledger-view-model.ts`, keep date arithmetic and mapping private. The month range must be generated with local constructors:

```ts
function localRanges(now: Date) {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return {
    start: monthStart.toISOString(),
    end: monthEnd.toISOString(),
    todayStart: todayStart.toISOString(),
    todayEnd: todayEnd.toISOString(),
  };
}

function localDateKey(value: string): string {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
```

Resolve accounts/categories through maps, exclude `deletedAt !== null`, sort by `occurredAt` descending then `id`, and call `calculateMetrics()` exactly once in `getHomeSnapshot()`. Use only the current month's non-archived total budget. Quick categories must ignore archived/non-expense categories, prefer `food/transport/shopping/entertainment` icon keys, then fill by `sortOrder`, and cap at four. Transaction options must omit archived accounts/categories. Search must trim once and compare note, category and all entry-account names case-insensitively. Account filtering matches any entry, and a date outside `filters.month` returns no rows.

- [ ] **Step 6: Implement subscription and the async query hook**

`LedgerViewModel.subscribe()` starts one repository watch on the first subscriber and stops it after the last. Add `dispose()` for Provider cleanup.

`use-ledger-query.ts` must use a monotonically increasing request id so stale promises cannot win:

```ts
export function useLedgerQuery<T>(
  viewModel: Pick<LedgerViewModel, 'subscribe'>,
  queryKey: string,
  load: () => Promise<T>,
): LedgerQueryState<T> {
  const requestId = useRef(0);
  const reloadRef = useRef<() => void>(() => undefined);
  const [state, setState] = useState<LedgerQueryState<T>>({ status: 'loading' });
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(() => {
    const current = ++requestId.current;
    setState((previous) => previous.status === 'ready' ? previous : { status: 'loading' });
    void loadRef.current().then(
      (data) => { if (requestId.current === current) setState({ status: 'ready', data }); },
      () => {
        if (requestId.current === current) {
          setState({ status: 'error', retry: () => reloadRef.current() });
        }
      },
    );
  }, []);
  reloadRef.current = reload;

  useEffect(() => {
    reload();
    const unsubscribe = viewModel.subscribe(reload);
    return () => {
      requestId.current += 1;
      unsubscribe();
    };
  }, [queryKey, reload, viewModel]);
  return state;
}
```

- [ ] **Step 7: Verify stale-response and retry behavior**

Tests must resolve a second query before the first and assert only the second value renders. Reject once, click the returned retry action, then resolve and assert ready state.

Run: `npm.cmd run test:run -- src/view-model`

Expected: PASS.

- [ ] **Step 8: Run typecheck and commit Task 2**

Run: `npm.cmd run typecheck`

Expected: exit 0.

```powershell
git add src/view-model src/test/ledger-fixture.ts
git commit -m "feat: add ledger UI projections"
```

---

### Task 3: Add safe edit, delete, undo and flush commands

**Files:**
- Modify: `src/view-model/types.ts`
- Modify: `src/view-model/ledger-view-model.ts`
- Modify: `src/view-model/ledger-view-model.test.ts`

**Interfaces:**
- Consumes: `buildPosting()`, `LedgerOperation`, `saveOperation`, repository `undoTransactionDelete`, `syncNow`.
- Produces:

```ts
export type TransactionEditInput =
  | { id: string; baseVersion: number; type: 'expense' | 'income'; amountCents: number; accountId: string; categoryId: string; occurredAt: string; note: string }
  | { id: string; baseVersion: number; type: 'transfer'; amountCents: number; fromAccountId: string; toAccountId: string; occurredAt: string; note: string }
  | { id: string; baseVersion: number; type: 'refund'; amountCents: number; occurredAt: string; note: string }
  | { id: string; baseVersion: number; type: 'adjustment'; deltaCents: number; accountId: string; occurredAt: string; note: string };

updateTransaction(input: TransactionEditInput): Promise<void>;
deleteTransaction(id: string): Promise<{ undoUntil: string }>;
undoTransactionDelete(id: string): Promise<void>;
flushPendingDelete(): Promise<void>;
```

- [ ] **Step 1: Write failing mutation tests**

Add exact assertions for emitted operations:

```ts
it('updates an expense with a new operation id and regenerated posting', async () => {
  const { viewModel, saveOperation } = createFixtureViewModelHarness();
  await viewModel.updateTransaction({
    id: fixtureIds.foodTransaction,
    baseVersion: 1,
    type: 'expense',
    amountCents: 6800,
    accountId: fixtureIds.bank,
    categoryId: fixtureIds.foodCategory,
    occurredAt: fixtureTimes.todayExpense,
    note: '晚餐',
  });
  expect(saveOperation).toHaveBeenCalledWith(expect.objectContaining({
    kind: 'transaction.update',
    transactionId: fixtureIds.foodTransaction,
    baseVersion: 1,
    transaction: expect.objectContaining({ amountCents: 6800, version: 2, note: '晚餐' }),
    entries: [{ accountId: fixtureIds.bank, deltaCents: -6800 }],
  }));
});

it('rejects a stale edit without saving', async () => {
  const { viewModel, saveOperation } = createFixtureViewModelHarness();
  await expect(viewModel.updateTransaction({
    id: fixtureIds.foodTransaction,
    baseVersion: 2,
    type: 'expense',
    amountCents: 5000,
    accountId: fixtureIds.cash,
    categoryId: fixtureIds.foodCategory,
    occurredAt: fixtureTimes.todayExpense,
    note: '午餐',
  })).rejects.toThrow('流水已更新，请刷新后重试');
  expect(saveOperation).not.toHaveBeenCalled();
});
```

Also test same-account transfer rejection, income-to-liability rejection, refund cumulative maximum, fixed refund account, signed adjustment, missing/deleted transaction, delete `undoUntil = deletedAt + 8_000`, undo delegation and flush calling `syncNow()`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm.cmd run test:run -- src/view-model/ledger-view-model.test.ts`

Expected: FAIL because mutation methods do not exist.

- [ ] **Step 3: Implement update operation construction**

Read a fresh snapshot for every command, require `current.version === input.baseVersion`, create one UUID, and assign it to both operation and updated transaction:

```ts
const operationId = this.makeUuid();
const updatedTransaction: Transaction = {
  ...current,
  operationId,
  amountCents: input.type === 'adjustment' ? Math.abs(input.deltaCents) : input.amountCents,
  categoryId: input.type === 'expense' || input.type === 'income' ? input.categoryId : current.categoryId,
  occurredAt: input.occurredAt,
  note: input.note.trim(),
  version: input.baseVersion + 1,
  deletedAt: null,
};
const operation: LedgerOperation = {
  schemaVersion: 1,
  operationId,
  ledgerId: this.ledgerId,
  createdAt: this.now().toISOString(),
  kind: 'transaction.update',
  transactionId: current.id,
  baseVersion: input.baseVersion,
  transaction: updatedTransaction,
  entries: this.buildEditPosting(input, snapshot, current),
};
await this.saveOperation(operation);
```

`buildEditPosting` must switch over all five types and call `buildPosting()`; do not duplicate sign rules. For refund, load the original expense and original entry, exclude the current refund when summing existing refunds, and never read an editable refund account from input.

- [ ] **Step 4: Implement delete, undo and flush**

```ts
async deleteTransaction(id: string) {
  const current = await this.requireActiveTransaction(id);
  const deletedAt = this.now();
  await this.saveOperation({
    schemaVersion: 1,
    operationId: this.makeUuid(),
    ledgerId: this.ledgerId,
    createdAt: deletedAt.toISOString(),
    kind: 'transaction.delete',
    transactionId: current.id,
    baseVersion: current.version,
    deletedAt: deletedAt.toISOString(),
  });
  return { undoUntil: new Date(deletedAt.getTime() + 8_000).toISOString() };
}

async undoTransactionDelete(id: string) {
  await this.repository.undoTransactionDelete(id, this.now().toISOString());
}

async flushPendingDelete() {
  await this.syncNow();
}
```

- [ ] **Step 5: Verify all mutation paths and commit Task 3**

Run: `npm.cmd run test:run -- src/view-model && npm.cmd run typecheck`

Expected: all ViewModel/hook tests pass and typecheck exits 0.

```powershell
git add src/view-model
git commit -m "feat: add ledger view commands"
```

---

### Task 4: Publish and dispose LedgerViewModel with the authenticated runtime

**Files:**
- Modify: `src/app/providers.tsx`
- Modify: `src/app/providers.test.tsx`
- Modify: `src/app/AuthGate.tsx`
- Modify: `src/app/AuthGate.test.tsx`
- Modify: `src/test/e2e-services.ts`
- Modify: `src/test/e2e-services.test.ts`

**Interfaces:**
- Consumes: `LedgerViewModel`, expanded repository read/watch/undo port, existing session initialization generation guard.
- Produces: `AppRuntimeValue.ledgerViewModel: LedgerViewModel | null`; authenticated children render only when it is non-null.

- [ ] **Step 1: Write failing Provider lifecycle tests**

Extend the harness repository with `readLedgerSnapshot`, `watchLedger` and `undoTransactionDelete`. Spy on `LedgerViewModel.prototype.dispose` or inject a `createLedgerViewModel` service factory. Assert:

```ts
it('publishes one view model only after the personal ledger is initialized', async () => {
  render(<AppProviders services={harness.services}><RuntimeProbe /></AppProviders>);
  act(() => harness.auth.emit('SIGNED_IN', sessionFor('owner')));
  expect(latestRuntime.ledgerViewModel).toBeNull();
  await waitFor(() => expect(latestRuntime.ledgerViewModel).not.toBeNull());
  expect(latestRuntime.initializing).toBe(false);
});

it('disposes the old view model on sign-out and user replacement', async () => {
  // initialize owner A, emit SIGNED_OUT, then owner B
  expect(firstViewModel.dispose).toHaveBeenCalledTimes(1);
  expect(secondViewModel.ledgerId).toBe(ledgerB);
});
```

Also assert stale initialization cannot publish its ViewModel after a newer generation wins.

- [ ] **Step 2: Write the failing AuthGate readiness test**

```tsx
it('keeps the branded loading state while the ledger view model is missing', () => {
  render(<AuthGateView runtime={{ ...authenticatedRuntime, initializing: false, ledgerViewModel: null }}>
    <p>private shell</p>
  </AuthGateView>);
  expect(screen.getByRole('status')).toHaveTextContent('正在准备个人账本');
  expect(screen.queryByText('private shell')).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Run focused tests and verify RED**

Run: `npm.cmd run test:run -- src/app/providers.test.tsx src/app/AuthGate.test.tsx`

Expected: FAIL because runtime has no `ledgerViewModel`.

- [ ] **Step 4: Implement one ViewModel per active ledger**

Extend `RuntimeLedgerRepository` with `readLedgerSnapshot`, `watchLedger` and `undoTransactionDelete`. Add state and a ref so cleanup is synchronous and idempotent:

```ts
const [ledgerViewModel, setLedgerViewModel] = useState<LedgerViewModel | null>(null);
const ledgerViewModelRef = useRef<LedgerViewModel | null>(null);

const replaceLedgerViewModel = (next: LedgerViewModel | null) => {
  if (ledgerViewModelRef.current === next) return;
  ledgerViewModelRef.current?.dispose();
  ledgerViewModelRef.current = next;
  setLedgerViewModel(next);
};
```

After `ledgerId` is resolved and the generation is still current, construct with:

```ts
new LedgerViewModel({
  ledgerId,
  repository: resolvedServices.repo,
  saveOperation,
  syncNow,
  now: () => new Date(),
  makeUuid: () => crypto.randomUUID(),
})
```

Clear it before a new initialization, on null session, effect cleanup and sign-out. Publish it in `AppRuntimeValue`.

- [ ] **Step 5: Extend the deterministic E2E repository**

`src/test/ledger-fixture.ts` must expose a mutable in-memory repository whose `saveOperation` applies update/delete operations and calls watchers, while `undoTransactionDelete` restores/cancels the last pending delete. `createE2eServices('logged-in')` returns this repository; logged-out still creates no session.

The test must prove the closed fixture set remains only `logged-out | recovery | logged-in`, fixture records use valid UUIDs, and no service method reaches Supabase.

- [ ] **Step 6: Verify runtime tests and production exclusion**

Run:

```powershell
npm.cmd run test:run -- src/app/providers.test.tsx src/app/AuthGate.test.tsx src/test/e2e-services.test.ts
npm.cmd run typecheck
npm.cmd run build
rg -n "fixtureNow|createMutableLedgerFixture|午餐" dist/assets
```

Expected: tests/typecheck/build pass; `rg` returns no matches (exit 1).

- [ ] **Step 7: Commit Task 4**

```powershell
git add src/app/providers.tsx src/app/providers.test.tsx src/app/AuthGate.tsx src/app/AuthGate.test.tsx src/test
git commit -m "feat: publish the ledger view model"
```

---

### Task 5: Add the home, empty-ledger and category asset set

**Files:**
- Create: `src/assets/illustrations/home-seaside.svg`
- Create: `src/assets/illustrations/empty-ledger.svg`
- Create: `src/assets/icons/categories/food.svg`
- Create: `src/assets/icons/categories/transport.svg`
- Create: `src/assets/icons/categories/shopping.svg`
- Create: `src/assets/icons/categories/housing.svg`
- Create: `src/assets/icons/categories/entertainment.svg`
- Create: `src/assets/icons/categories/daily.svg`
- Create: `src/assets/icons/categories/study.svg`
- Create: `src/assets/icons/categories/medical.svg`
- Create: `src/assets/icons/categories/travel.svg`
- Create: `src/assets/icons/categories/income.svg`
- Create: `src/assets/icons/categories/other.svg`
- Modify: `src/assets/registry.ts`
- Modify: `src/assets/assets.test.tsx`
- Modify: `src/assets/ATTRIBUTION.md`

**Interfaces:**
- Consumes: immutable visual reference and current typed asset registry.
- Produces keys `illustration:home-seaside`, `illustration:empty-ledger`, and `category:{food,transport,shopping,housing,entertainment,daily,study,medical,travel,income,other}`.

- [ ] **Step 1: Write failing asset inventory tests**

```tsx
it.each([
  'illustration:home-seaside',
  'illustration:empty-ledger',
  'category:food',
  'category:transport',
  'category:shopping',
  'category:housing',
  'category:entertainment',
  'category:daily',
  'category:study',
  'category:medical',
  'category:travel',
  'category:income',
  'category:other',
] as const)('registers %s as an independent hashed asset', (key) => {
  expect(assetRegistry[key]).toMatch(/\.(svg)(\?|$)/);
});
```

Extend the source scan to require `viewBox`, reject `<script`, `http:`, `https:`, `data:image`, emoji presentation characters and SVG text elements.

- [ ] **Step 2: Run asset tests and verify RED**

Run: `npm.cmd run test:run -- src/assets/assets.test.tsx`

Expected: FAIL with missing registry keys/files.

- [ ] **Step 3: Draw the two illustrations as independent SVGs**

Use code-native vector shapes matching the approved hand-drawn vocabulary:

- `home-seaside.svg`: cream sky, layered sea strokes, coral sun/cloud accents, palm/hammock and small sailboat; 16:9-ish `viewBox`, no embedded raster.
- `empty-ledger.svg`: small paper/shore/shell composition that remains legible at 160px.

Use the existing ink `#34312E`, coral `#F46D58`, sea `#73C5E6` and cream `#FFF9EF`; keep stroke widths visually consistent with current navigation SVGs.

- [ ] **Step 4: Draw the 11 category SVGs**

Each icon uses its own file and recognizable non-text motif:

| Key | Motif |
| --- | --- |
| food | bowl and chopsticks |
| transport | small bus |
| shopping | shopping bag |
| housing | simple house |
| entertainment | music note and star |
| daily | soap/bottle |
| study | open book |
| medical | medicine case with non-text cross shape |
| travel | suitcase |
| income | coin with upward arrow |
| other | shell/three dots motif without text glyphs |

Keep a transparent background and a square `viewBox="0 0 48 48"`.

- [ ] **Step 5: Register, attribute and verify build outputs**

Import each asset with `?url`, add literal keys to `assetRegistry`, and document that the vectors are project-original redraws based on the supplied reference with no external license dependency.

Run:

```powershell
npm.cmd run test:run -- src/assets/assets.test.tsx
npm.cmd run build
Get-ChildItem dist/assets -Filter *.svg | Measure-Object
```

Expected: asset tests pass; build emits independent hashed SVG files rather than one embedded board image.

- [ ] **Step 6: Commit Task 5**

```powershell
git add src/assets
git commit -m "feat: add home and category artwork"
```

---

### Task 6: Build the real HomePage

**Files:**
- Create: `src/design-system/components/Amount.tsx`
- Modify: `src/design-system/components/design-system.test.tsx`
- Create: `src/features/home/HomePage.tsx`
- Create: `src/features/home/HomePage.module.css`
- Create: `src/features/home/HomePage.test.tsx`

**Interfaces:**
- Consumes: `LedgerViewModel.getHomeSnapshot()`, `useLedgerQuery`, `HomeSnapshot`, asset registry.
- Produces:

```ts
type HomePageProps = {
  viewModel: LedgerViewModel;
  syncState: HomeSyncState;
  onRetrySync(): void;
  onOpenTransaction(id: string): void;
  onStartEntry(intent: { categoryId: string | null }): void;
};
```

- [ ] **Step 1: Write failing Amount tests**

Require tabular numerals, explicit accessible labels, and tone independent of sign formatting:

```tsx
render(<Amount cents={-5000} label="今日支出" tone="expense" />);
expect(screen.getByLabelText('今日支出，负50.00元')).toHaveTextContent('-¥50.00');
expect(screen.getByLabelText('今日支出，负50.00元')).toHaveAttribute('data-tone', 'expense');
```

- [ ] **Step 2: Write failing HomePage hierarchy and interaction tests**

Use a mock ViewModel returning the fixed `HomeSnapshot`. Assert:

```tsx
expect(screen.getByRole('heading', { name: '首页' })).toBeInTheDocument();
expect(screen.getByLabelText(/总资产/)).toHaveTextContent('¥3,500.00');
expect(screen.getByLabelText(/今日支出/)).toHaveTextContent('¥50.00');
expect(screen.getByRole('progressbar', { name: '本月预算' })).toHaveAttribute('aria-valuenow', '23000');
expect(screen.getAllByRole('button', { name: /快速记账/ })).toHaveLength(5);
expect(screen.getAllByRole('button', { name: /查看流水/ })).toHaveLength(3);
```

Click food and assert `onStartEntry({ categoryId: foodId })`; click “更多” and assert null. Click one recent row and assert `onOpenTransaction(id)`.

Add separate tests for loading, query error/retry, no-budget copy, zero-data empty state and negative remaining with visible “已超支”. A quiet `syncState` is secondary text; warning/error states render their authored Chinese label, and `retryable: true` exposes a 44px “重试同步” button wired to `onRetrySync`.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `npm.cmd run test:run -- src/design-system/components/design-system.test.tsx src/features/home/HomePage.test.tsx`

Expected: FAIL because Amount and HomePage do not exist.

- [ ] **Step 4: Implement Amount and HomePage structure**

`Amount` must call `formatYuan(cents)` and generate a Chinese screen-reader label without reading visual punctuation. `HomePage` uses:

```tsx
const query = useLedgerQuery(
  viewModel,
  'home',
  () => viewModel.getHomeSnapshot(),
);
```

Render in fixed order: scene/greeting plus the non-dominant `syncState`, total assets, today/month metrics, budget, quick categories, recent three. If `budget === null`, render “本月尚未设置预算” and no `progressbar`.

- [ ] **Step 5: Implement responsive CSS**

Use existing tokens only. Required concrete rules:

```css
.page { display: grid; gap: var(--space-4); min-width: 0; }
.hero { position: relative; overflow: hidden; border-radius: var(--radius-xl); }
.metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); }
.quickGrid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--space-2); }
.quickButton { min-width: 0; min-height: var(--control-min-size); }
@media (max-width: 22rem) {
  .quickGrid { grid-template-columns: repeat(5, minmax(3.25rem, 1fr)); overflow-x: auto; }
}
```

The hero may position decorative SVG layers, but no text may depend on fragile pixel coordinates.

- [ ] **Step 6: Verify HomePage and commit Task 6**

Run:

```powershell
npm.cmd run test:run -- src/design-system/components/design-system.test.tsx src/features/home/HomePage.test.tsx
npm.cmd run typecheck
```

Expected: PASS.

```powershell
git add src/design-system/components/Amount.tsx src/design-system/components/design-system.test.tsx src/features/home
git commit -m "feat: build the ledger home page"
```

---

### Task 7: Build the compact transaction list and combined filters

**Files:**
- Create: `src/features/transactions/TransactionRow.tsx`
- Create: `src/features/transactions/TransactionsPage.tsx`
- Create: `src/features/transactions/TransactionsPage.module.css`
- Create: `src/features/transactions/TransactionsPage.test.tsx`

**Interfaces:**
- Consumes: `LedgerViewModel.getTransactions(filters)`, `TransactionFilters`, `TransactionListSnapshot`.
- Produces a mounted filter/list page with `onOpenTransaction(id)` callback.

- [ ] **Step 1: Write failing filter-control tests**

```tsx
expect(screen.getByRole('searchbox', { name: '搜索流水' })).toBeInTheDocument();
expect(screen.getByLabelText('月份')).toHaveValue('2026-07');
expect(screen.getByLabelText('账户')).toBeInTheDocument();
expect(screen.getByLabelText('日期')).toBeInTheDocument();
expect(screen.getByRole('group', { name: '分类筛选' })).toBeInTheDocument();
```

Change month/account/date/category/search and assert the next `getTransactions` call receives the complete combined filter object. Changing month from July to August must clear a July date.

The ViewModel tests from Task 2 must separately prove trimmed case-insensitive search, either-side transfer account matching, archived option exclusion and all five filters combining rather than replacing one another.

- [ ] **Step 2: Write failing group/row semantics tests**

Require descending groups, visible daily totals, row accessible names and neutral transfer styling:

```tsx
expect(screen.getAllByRole('heading', { level: 3 }).map((node) => node.textContent))
  .toEqual(['7月18日', '7月17日', '7月1日']);
expect(screen.getByRole('button', { name: /储蓄卡转到现金.*100.00元/ }))
  .toHaveAttribute('data-tone', 'neutral');
expect(screen.getByText('当日支出 ¥50.00')).toBeInTheDocument();
```

Click a row and assert `onOpenTransaction(row.id)`.

- [ ] **Step 3: Run tests and verify RED**

Run: `npm.cmd run test:run -- src/features/transactions/TransactionsPage.test.tsx`

Expected: FAIL because page components do not exist.

- [ ] **Step 4: Implement filters with one query key**

Initialize month from local `new Date()`. Serialize all filters in stable property order:

```ts
const queryKey = JSON.stringify({ month, accountId, date, categoryId, query });
const result = useLedgerQuery(
  viewModel,
  queryKey,
  () => viewModel.getTransactions({ month, accountId, date, categoryId, query }),
);
```

The category group uses buttons with `aria-pressed`; chips scroll inside their own container. Do not debounce unit-visible state, but a 150–250ms search debounce is allowed only if fake-timer tests cover it.

- [ ] **Step 5: Implement compact groups and rows**

`TransactionRow` is a semantic button, not a clickable div. Render icon/title/metadata/amount and build a full accessible name. Keep transfers neutral and include both accounts.

Use an empty-ledger illustration when filters return no groups. Query error shows “流水暂时无法读取” and a retry button; never expose the raw exception.

- [ ] **Step 6: Verify filters and responsive source**

Run:

```powershell
npm.cmd run test:run -- src/features/transactions/TransactionsPage.test.tsx
npm.cmd run typecheck
rg -n "overflow-x:\s*auto" src/features/transactions/TransactionsPage.module.css
```

Expected: tests/typecheck pass; `overflow-x:auto` exists only on the category chip container.

- [ ] **Step 7: Commit Task 7**

```powershell
git add src/features/transactions
git commit -m "feat: add the compact transaction list"
```

---

### Task 8: Add details, same-type editing and recoverable deletion

**Files:**
- Create: `src/features/transactions/TransactionDetailSheet.tsx`
- Create: `src/features/transactions/TransactionEditForm.tsx`
- Create: `src/features/transactions/TransactionOverlays.tsx`
- Create: `src/features/transactions/TransactionOverlays.test.tsx`
- Create: `src/design-system/components/UndoToast.tsx`
- Modify: `src/design-system/components/design-system.test.tsx`
- Modify: `src/features/transactions/TransactionsPage.module.css`

**Interfaces:**
- Consumes: ViewModel detail/update/delete/undo/flush commands and `parseYuan()`.
- Produces:

```ts
type TransactionOverlaysProps = {
  viewModel: LedgerViewModel;
  transactionId: string | null;
  onCloseDetail(): void;
  onDetailOpenChange(open: boolean): void;
  onReload(): void;
};
```

`TransactionOverlays` is the one shared controller rendered by `AppShell`; both Home and Transactions rows set its controlled `transactionId`. It owns the detail/edit mode and one visible eight-second undo state, while `AppShell` owns background `inert` because it owns the shell background.

- [ ] **Step 1: Write failing detail/focus tests**

Open a row and assert the dialog contains type, amount, category, account(s), local time, note and edit/delete buttons. Assert focus enters the dialog, Escape closes it and focus returns to the source row.

```tsx
expect(screen.getByRole('dialog', { name: '流水详情' })).toHaveAttribute('aria-modal', 'true');
expect(screen.getByRole('button', { name: '编辑流水' })).toHaveFocus();
await user.keyboard('{Escape}');
expect(sourceRow).toHaveFocus();
```

- [ ] **Step 2: Write failing edit validation tests**

Cover `parseYuan`, preserved type, stale version, account/category choices, same-account transfer focus, fixed refund account and adjustment sign. A stale save must keep form fields and show “流水已更新，请刷新后重试”. Raw errors must not render.

- [ ] **Step 3: Write failing delete/undo timer tests**

Use fake timers in separate cases so undo and expiration cannot contradict one another:

```tsx
it('undoes within eight seconds and cancels expiration', async () => {
  await user.click(screen.getByRole('button', { name: '删除流水' }));
  expect(viewModel.deleteTransaction).toHaveBeenCalledWith(transactionId);
  await user.click(screen.getByRole('button', { name: '撤销删除' }));
  expect(viewModel.undoTransactionDelete).toHaveBeenCalledWith(transactionId);
  await act(async () => vi.advanceTimersByTimeAsync(8_000));
  expect(viewModel.flushPendingDelete).not.toHaveBeenCalled();
});

it('flushes once when the undo window expires', async () => {
  await user.click(screen.getByRole('button', { name: '删除流水' }));
  expect(viewModel.deleteTransaction).toHaveBeenCalledWith(transactionId);
  expect(screen.getByRole('status')).toHaveTextContent('流水已删除');
  await act(async () => vi.advanceTimersByTimeAsync(8_000));
  expect(viewModel.flushPendingDelete).toHaveBeenCalledTimes(1);
});
```

Add delete failure (dialog and source row remain), undo failure (toast changes to error and exposes reload), and active-window protection: while one deletion still has an undo opportunity, a second detail sheet explains why its delete action is temporarily disabled and must not emit another tombstone.

- [ ] **Step 4: Run focused tests and verify RED**

Run: `npm.cmd run test:run -- src/features/transactions/TransactionOverlays.test.tsx src/design-system/components/design-system.test.tsx`

Expected: FAIL with missing sheet/form/toast behavior.

- [ ] **Step 5: Implement detail and edit modes**

The controller owns `mode: 'detail' | 'edit'`. `TransactionEditForm` initializes from `TransactionDetail`, preserves `type`, converts amount with `parseYuan`, and emits the exact `TransactionEditInput` union. Capture `document.activeElement` when a non-null transaction opens, focus the first dialog action, trap focus, close on Escape, and restore the captured source after closing.

Do not permit refund account input. For adjustment, expose explicit “增加余额/减少余额” choice and derive signed `deltaCents` after parsing the absolute amount.

On successful save, return to detail and allow the ViewModel subscription to refresh. On failure, map known stale/validation messages to authored Chinese copy and focus the responsible field.

- [ ] **Step 6: Implement UndoToast and expiration cleanup**

`UndoToast` accepts:

```ts
type UndoToastProps = {
  message: string;
  undoLabel: string;
  expiresAt: string;
  onUndo(): Promise<void>;
  onExpire(): Promise<void>;
  onReload(): void;
};
```

Use one timeout derived from `expiresAt - Date.now()`, clear it on unmount/replacement, render `role="status" aria-live="polite"`, and keep the undo button at least 44px. Expiration calls `flushPendingDelete()` once.

- [ ] **Step 7: Verify complete transaction behavior and commit Task 8**

Run:

```powershell
npm.cmd run test:run -- src/features/transactions src/design-system/components/design-system.test.tsx
npm.cmd run typecheck
```

Expected: PASS with fake timers restored after each test.

```powershell
git add src/features/transactions src/design-system/components/UndoToast.tsx src/design-system/components/design-system.test.tsx
git commit -m "feat: add transaction detail and undo"
```

---

### Task 9: Integrate the pages and produce approval candidates

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/app/AppShell.tsx`
- Modify: `src/app/AppShell.module.css`
- Modify: `src/app/AppShell.test.tsx`
- Modify: `src/test/e2e-services.ts`
- Modify: `src/test/e2e-services.test.ts`
- Create: `e2e/home-transactions.spec.ts`
- Create: `e2e/candidate-home-transactions.spec.ts`
- Create: `playwright.candidate.config.ts`
- Modify: `playwright.config.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: runtime `ledgerViewModel`, HomePage, TransactionsPage, existing mounted-panel/entry/focus/scroll behavior.
- Produces: functional shell plus isolated, non-official candidate images for user approval.

- [ ] **Step 1: Write failing App/AppShell integration tests**

Change AppShell to require:

```ts
type AppShellProps = {
  viewModel: LedgerViewModel;
  syncState: HomeSyncState;
  onRetrySync(): void;
};
```

Use a mock ViewModel and assert:

- HomePage replaces only the home placeholder.
- TransactionsPage replaces only the transactions placeholder.
- Statistics and Settings placeholders remain unchanged.
- All four panels stay mounted and preserve filters/scroll.
- A home recent row can open the shared detail sheet.
- Quick category opens the existing entry action layer and displays “已预选：餐饮”; opening from the center button without intent preserves the previously approved dialog content.
- Opening the shared detail makes the shell background `inert`; closing restores it and source focus. A visible undo toast alone does not make the background inert.
- Idle/syncing status stays quiet; offline/error/conflict copy is visible and retry calls the runtime `syncNow` callback.

- [ ] **Step 2: Run App tests and verify RED**

Run: `npm.cmd run test:run -- src/app`

Expected: FAIL because AppShell still renders placeholders and App does not pass a ViewModel.

- [ ] **Step 3: Wire authenticated runtime to AppShell**

Use a small container so AppShell remains prop-driven and unit-testable:

```tsx
function AuthenticatedShell() {
  const { ledgerViewModel, syncStatus, syncNow } = useAppRuntime();
  if (!ledgerViewModel) return null;
  return (
    <AppShell
      viewModel={ledgerViewModel}
      syncState={toHomeSyncState(syncStatus)}
      onRetrySync={syncNow}
    />
  );
}

export function App() {
  return <AuthGate><AuthenticatedShell /></AuthGate>;
}
```

Add a pure `toHomeSyncState()` mapping: idle=`已同步`/quiet, syncing=`正在同步`/quiet, offline=`当前离线，可继续记账`/warning/retryable, error uses the authored `SyncStatus.message` fallback `同步失败，稍后重试`/error/retryable, and conflict=`有同步冲突待处理`/error/non-retryable. If `pendingCount > 0` while idle, the quiet label is `N 条待同步`.

In AppShell, keep the four panel elements and existing scroll map. Store optional entry intent separately; clear it only after closing. Store the shared `detailTransactionId`, render one always-mounted `TransactionOverlays`, and make the shell background inert while either entry or detail dialog is open. Do not turn the center action into a fifth tab.

- [ ] **Step 4: Add failing browser behavior tests**

At 320×568, 390×844 and 430×932 verify:

- Home contains total assets, today expense and budget remainder in the page, with all quick targets at least 44px.
- Transactions filters combine and category chips scroll without document overflow.
- Date groups are descending and transfer accessible text names both accounts.
- Detail focus enters/restores; edit validation works; delete shows undo; undo restores the row.
- Normal main/navigation safe-area fallback remains non-overlapping.
- Reduced-motion mode removes nonessential home/toast transitions while preserving every state change.

Run: `npm.cmd run test:e2e -- e2e/home-transactions.spec.ts e2e/accessibility.spec.ts`

Expected: RED before shell/fixture completion, then GREEN after the minimal fixes.

- [ ] **Step 5: Isolate candidate capture from official visual tests**

Add `candidate-home-transactions.spec.ts` with exactly these candidate states:

- 320×568 home and transactions.
- 390×844 home, transactions, transaction detail and delete undo toast.
- 430×932 home and transactions.

`playwright.candidate.config.ts` must:

```ts
export default defineConfig({
  testDir: './e2e',
  testMatch: 'candidate-home-transactions.spec.ts',
  snapshotPathTemplate: '.superpowers/sdd/home-transactions-previews/{arg}{ext}',
  use: { ...devices['Desktop Chrome'], baseURL, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' },
  webServer: { command: 'npm.cmd run dev -- --mode test-e2e --host 127.0.0.1 --port 5173 --strictPort', url: baseURL },
});
```

Every candidate uses `expect(page).toHaveScreenshot(filename)`. Generate only the isolated candidate directory with:

```powershell
npm.cmd run test:e2e:candidate -- --update-snapshots
```

Add the cross-platform package script `"test:e2e:candidate": "playwright test --config playwright.candidate.config.ts"`.

Default `playwright.config.ts` must ignore both `static-recovery.spec.ts` and `candidate-home-transactions.spec.ts`; normal official `visual.spec.ts` remains non-bypassable.

- [ ] **Step 6: Verify Phase A and stop for visual approval**

Run:

```powershell
npm.cmd run test:run
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:e2e -- e2e/home-transactions.spec.ts e2e/accessibility.spec.ts
rg -n "fixtureNow|createMutableLedgerFixture|午餐" dist/assets
git diff --check
```

Expected: unit/type/build/functional browser pass; production scan has no matches; current normal `npm.cmd run test:e2e` is expected to fail only on the three intentionally obsolete home baselines and must not be used as a success gate before approval.

Record candidate paths, code-under-test SHA, expected visual differences and command output in `.superpowers/sdd/home-transactions-report.md`. Commit code with:

```powershell
git add package.json playwright.config.ts playwright.candidate.config.ts e2e src/app src/test
git commit -m "feat: integrate home and transaction pages"
```

Set status `NEEDS_CONTEXT` and ask the user to approve the eight candidate PNGs. Do not run an official snapshot update command before approval.

---

### Task 10: Promote approved visual baselines and record final evidence

**Files:**
- Modify: `e2e/visual.spec.ts`
- Modify after approval: `e2e/snapshots/visual.spec.ts/320x568-home.png`
- Modify after approval: `e2e/snapshots/visual.spec.ts/390x844-home.png`
- Modify after approval: `e2e/snapshots/visual.spec.ts/430x932-home.png`
- Create after approval: `e2e/snapshots/visual.spec.ts/{320x568,390x844,430x932}-transactions.png`
- Create after approval: `e2e/snapshots/visual.spec.ts/390x844-transaction-detail.png`
- Create after approval: `e2e/snapshots/visual.spec.ts/390x844-delete-undo.png`
- Create: `docs/verification/home-transactions.md`

**Interfaces:**
- Consumes: explicit user approval of Task 9 candidate images.
- Produces: 14-image official visual inventory, permanent SHA-256 evidence and a fully green branch.

- [ ] **Step 1: Verify approval provenance before changing snapshots**

Record the approval date, candidate directory, candidate SHA-256 values and exact code-under-test commit in `.superpowers/sdd/home-transactions-report.md`. Recompute hashes immediately before promotion and abort if any candidate changed after approval.

- [ ] **Step 2: Add official visual cases without a preview branch**

Update `visual.spec.ts` to contain the approved home, transactions, detail and delete-toast routes. Every case must still:

1. include `visual=1`;
2. wait for `document.fonts.ready`;
3. call `expect(page).toHaveScreenshot(filename)` unconditionally;
4. use no masks, widened thresholds, environment-variable bypass or `page.screenshot`.

- [ ] **Step 3: Update only the approved official files**

Run the exact visual file after approval:

```powershell
npm.cmd run test:e2e:update -- e2e/visual.spec.ts
```

Immediately compute all official hashes and require:

- Login, forgot, recovery and entry-dialog hashes are byte-identical to `docs/verification/ui-foundation-auth-shell.md`.
- The three replaced home and five new transaction-state hashes match the approved candidate filenames byte-for-byte.

- [ ] **Step 4: Write permanent verification evidence**

`docs/verification/home-transactions.md` must list:

- user approval date;
- approved candidate and implementation SHAs with distinct roles;
- all commands and exact pass counts;
- 14 official snapshot paths, viewports, states and SHA-256 values;
- accepted visual differences from the old placeholders;
- confirmation that auth/entry pixels are unchanged;
- zero-inset Chromium safe-area limitation and future real-iPhone requirement;
- no production fixture/secrets/direct-data-access scan results.

- [ ] **Step 5: Run the complete gate**

Run fresh from the final code-under-test commit:

```powershell
npm.cmd run test:run
npm.cmd run typecheck
npm.cmd run test:e2e
npm.cmd run test:e2e:static
npm.cmd run build
rg -n "service_role|SUPABASE_SERVICE_ROLE_KEY|eyJ[A-Za-z0-9_-]+\." src
rg -n "from ['\"](?:dexie|@supabase|\.\./\.\./db|\.\./\.\./services)" src/features
rg -n "fixtureNow|createMutableLedgerFixture|test-e2e|logged-out" dist/assets
git ls-files -- '.env*.local'
git diff --check
```

Expected:

- all unit tests pass;
- typecheck/build exit 0;
- normal Playwright includes all functional/accessibility/official visual tests and passes;
- static recovery remains 1/1;
- the three `rg` scans return no matches (exit 1);
- no local env file is tracked;
- diff check passes.

- [ ] **Step 6: Commit evidence and request whole-range review**

```powershell
git add e2e/visual.spec.ts e2e/snapshots docs/verification/home-transactions.md
git commit -m "test: verify home and transaction screens"
```

Generate a review package from the Task 1 base through Task 10 HEAD. Use `superpowers:requesting-code-review`; fix all Critical and Important findings with covering RED/GREEN tests, re-review, then use `superpowers:verification-before-completion` for a fresh complete gate.

---

## Final Branch Completion

After whole-range review approval and the fresh final gate:

1. Confirm every official PNG hash still matches permanent evidence.
2. Confirm production `dist` was generated by the normal build after any static test build.
3. Confirm branch status is clean and no candidate/previews directory is tracked.
4. Use `superpowers:finishing-a-development-branch` to offer local merge, PR, keep or discard; do not merge or push without the user's choice.
