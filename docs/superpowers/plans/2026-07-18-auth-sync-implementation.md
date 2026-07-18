# Supabase Auth and Sync Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 接入 Supabase 邮箱认证、个人账本初始化和顺序幂等同步，使本地 Dexie 账本可以安全上传 outbox、保存冲突并原子拉取云端增量。

**Architecture:** 浏览器只创建一个惰性 Supabase 客户端；`AuthService` 与 `LedgerApi` 隔离供应商 API，`SyncEngine` 只依赖仓库接口和 `LedgerApi`，`AppProviders` 管理会话、活动账本与浏览器触发器。同步保持 single-flight，顺序上传到期操作，失败不丢 outbox，冲突停止后续上传，服务器页面与游标在同一 Dexie 事务中应用。

**Tech Stack:** TypeScript 7、React 19、Supabase JS 2.110.7、Dexie 4.4.4、Vitest 4、Testing Library。

## Global Constraints

- 只使用 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_PUBLISHABLE_KEY`；浏览器代码不得读取或包含 `service_role`。
- Supabase 客户端启用 `persistSession: true`、`autoRefreshToken: true`、`detectSessionInUrl: true`，不得覆盖认证存储。
- `src/services` 之外不得直接调用 Supabase 查询或 RPC。
- 新用户首次登录必须在线完成 `v2_bootstrap_personal_ledger` 后才能初次拉取；已有本地账本的会话可离线打开。
- 同步按 `(createdAt, operationId)` 顺序执行，只上传 `notBefore <= now` 的 pending 操作。
- 失败和冲突不得删除 outbox；错误摘要使用中文且不得包含令牌、SQL 或完整服务器响应。
- 每一页服务器变化与 `change_seq` 游标必须在同一个 Dexie 事务中提交。
- 本阶段不制作登录、冲突处理或同步状态页面，不实现 Service Worker 后台同步和多账本切换。

---

### Task 1: Add repository synchronization primitives

**Files:**
- Modify: `src/db/records.ts`
- Modify: `src/db/local-db.ts`
- Modify: `src/db/local-repository.ts`
- Modify: `src/db/local-repository.test.ts`

**Interfaces:**
- Consumes: `LedgerDatabase`, `LedgerOperation`, current outbox and sync metadata tables.
- Produces: `getPersonalLedgerId(userId)`, `getPendingOperationCount()`, `markOperationFailed(operationId, message)`, `markOperationConflict(operationId, serverRecord)`, tombstone-aware `applyServerChanges()`.

- [ ] **Step 1: Write failing repository tests**

Add tests that prove failed operations remain pending, conflicts persist both versions, the active owner ledger can be restored, and entry tombstones delete replaced entries:

```ts
it('keeps a failed operation pending with a Chinese summary', async () => {
  const operation = expenseOperation(7);
  await repo.saveOperation(operation);
  await repo.markOperationFailed(operation.operationId, '网络连接失败，稍后会自动重试');

  expect(await db.outbox.get(operation.operationId)).toMatchObject({
    status: 'pending',
    lastError: '网络连接失败，稍后会自动重试',
  });
  expect(await repo.getPendingOperationCount()).toBe(1);
});

it('stores a conflict without removing its outbox operation', async () => {
  const operation = expenseOperation(8);
  await repo.saveOperation(operation);
  await repo.markOperationConflict(operation.operationId, { version: 2 });

  expect(await db.outbox.get(operation.operationId)).toMatchObject({ status: 'conflict' });
  expect(await db.conflicts.get(operation.operationId)).toMatchObject({
    entityId: operation.transaction.id,
    operation,
    serverRecord: { version: 2 },
  });
});

it('deletes a replaced server entry and advances the cursor atomically', async () => {
  const operation = expenseOperation(9);
  await repo.saveOperation(operation);
  const entry = (await db.entries.where('transactionId').equals(operation.transaction.id).first())!;

  await repo.applyServerChanges(ledgerId, [{
    entityType: 'entry', entityId: entry.id, version: 2, tombstone: true, record: entry,
  }], '51');

  expect(await db.entries.get(entry.id)).toBeUndefined();
  expect(await repo.getChangeCursor(ledgerId)).toBe('51');
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm.cmd run test:run -- src/db/local-repository.test.ts`

Expected: FAIL because the repository methods and `ServerChange` metadata do not exist.

- [ ] **Step 3: Extend records and repository methods minimally**

Change conflict identity from the transaction-specific name to an entity ID and add change metadata:

```ts
export interface ConflictRecord {
  id: string;
  ledgerId: string;
  entityId: string;
  operation: LedgerOperation;
  serverRecord: unknown;
  createdAt: string;
}

type ChangeMeta = { entityId: string; version: number; tombstone: boolean };
export type ServerChange =
  | (ChangeMeta & { entityType: 'profile'; record: ProfileRecord })
  | (ChangeMeta & { entityType: 'ledger'; record: LedgerRecord })
  | (ChangeMeta & { entityType: 'member'; record: LedgerMemberRecord })
  | (ChangeMeta & { entityType: 'account'; record: Account })
  | (ChangeMeta & { entityType: 'category'; record: Category })
  | (ChangeMeta & { entityType: 'transaction'; record: Transaction })
  | (ChangeMeta & { entityType: 'entry'; record: LedgerEntryRecord })
  | (ChangeMeta & { entityType: 'budget'; record: Budget })
  | (ChangeMeta & { entityType: 'categoryBudget'; record: CategoryBudget })
  | (ChangeMeta & { entityType: 'reminder'; record: Reminder });
```

Keep the unreleased Dexie schema at version 1 but change the conflict index to `entityId`. Add an entity-ID helper and repository methods:

```ts
function operationEntityId(operation: LedgerOperation): string {
  if ('transaction' in operation) return operation.transaction.id;
  if ('transactionId' in operation) return operation.transactionId;
  if ('account' in operation) return operation.account.id;
  if ('accountId' in operation) return operation.accountId;
  if ('category' in operation) return operation.category.id;
  if ('categoryId' in operation) return operation.categoryId;
  if ('budget' in operation) return operation.budget.id;
  if ('budgetId' in operation) return operation.budgetId;
  if ('categoryBudget' in operation) return operation.categoryBudget.id;
  if ('categoryBudgetId' in operation) return operation.categoryBudgetId;
  if ('reminder' in operation) return operation.reminder.id;
  return operation.reminderId;
}

async getPersonalLedgerId(userId: string): Promise<string | null> {
  const memberships = await this.db.members.where('userId').equals(userId).toArray();
  for (const member of memberships.filter((item) => item.role === 'owner')) {
    const ledger = await this.db.ledgers.get(member.ledgerId);
    if (ledger?.ownerUserId === userId) return ledger.id;
  }
  return null;
}

async getPendingOperationCount(): Promise<number> {
  return this.db.outbox.count();
}

async markOperationFailed(operationId: string, message: string): Promise<void> {
  await this.db.outbox.update(operationId, { status: 'pending', lastError: message });
}

async markOperationConflict(operationId: string, serverRecord: unknown): Promise<void> {
  await this.db.transaction('rw', [this.db.outbox, this.db.conflicts], async () => {
    const outbox = await this.db.outbox.get(operationId);
    if (!outbox) return;
    await this.db.outbox.update(operationId, { status: 'conflict', lastError: '存在需要处理的数据冲突' });
    await this.db.conflicts.put({
      id: operationId,
      ledgerId: outbox.ledgerId,
      entityId: operationEntityId(outbox.payload),
      operation: outbox.payload,
      serverRecord,
      createdAt: new Date().toISOString(),
    });
  });
}
```

In `applyServerChanges`, delete an entry when `entityType === 'entry' && tombstone`; continue putting full records for soft-deleted or archived entities, then update the cursor inside the same transaction.

- [ ] **Step 4: Run repository tests and verify GREEN**

Run: `npm.cmd run test:run -- src/db/local-repository.test.ts`

Expected: all repository tests PASS.

- [ ] **Step 5: Commit repository primitives**

```powershell
git add src/db/records.ts src/db/local-db.ts src/db/local-repository.ts src/db/local-repository.test.ts
git commit -m "feat: add repository sync primitives"
```

---

### Task 2: Add the Supabase client, AuthService and LedgerApi

**Files:**
- Create: `src/vite-env.d.ts`
- Create: `src/services/supabase.ts`
- Create: `src/services/auth-service.ts`
- Create: `src/services/auth-service.test.ts`
- Create: `src/services/ledger-api.ts`
- Create: `src/services/ledger-api.test.ts`

**Interfaces:**
- Consumes: `LedgerOperation`, `ServerChange`, Supabase RPCs `v2_bootstrap_personal_ledger`, `v2_apply_operation`, `v2_pull_changes`.
- Produces: `getSupabaseClient()`, `AuthService`, `LedgerApi`, `ApplyOperationResult`, `PullChangesResult`.

- [ ] **Step 1: Write failing AuthService and LedgerApi tests**

Use narrow fake client interfaces rather than mocking the entire Supabase package:

```ts
it('passes email credentials to Supabase without handling tokens itself', async () => {
  const signInWithPassword = vi.fn().mockResolvedValue({ data: { session: null }, error: null });
  const service = new AuthService({ auth: { signInWithPassword } } as never);

  await service.signIn('person@example.com', 'correct-horse-battery-staple');

  expect(signInWithPassword).toHaveBeenCalledWith({
    email: 'person@example.com', password: 'correct-horse-battery-staple',
  });
});

it('maps a pull page from database records to local records', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: {
    nextCursor: 12,
    changes: [{
      changeSeq: 12,
      entityType: 'account',
      entityId: '00000000-0000-4000-8000-000000000101',
      version: 2,
      tombstone: false,
      record: {
        id: '00000000-0000-4000-8000-000000000101', ledger_id: ledgerId,
        name: '储蓄卡', kind: 'debit_card', account_class: 'asset', currency: 'CNY',
        opening_balance_cents: 0, sort_order: 0, version: 2, archived_at: null,
      },
    }],
  }, error: null });
  const api = new LedgerApi({ rpc } as never);

  const page = await api.pullChanges(ledgerId, '0');

  expect(page.nextCursor).toBe('12');
  expect(page.changes[0]).toMatchObject({
    entityType: 'account', tombstone: false,
    record: { ledgerId, accountClass: 'asset', openingBalanceCents: 0 },
  });
});
```

- [ ] **Step 2: Run service tests and verify RED**

Run: `npm.cmd run test:run -- src/services/auth-service.test.ts src/services/ledger-api.test.ts`

Expected: FAIL because the service modules do not exist.

- [ ] **Step 3: Implement the lazy singleton client and AuthService**

Declare Vite environment keys and create one runtime client:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}
```

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let singleton: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (singleton) return singleton;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('缺少 Supabase 连接配置');
  singleton = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return singleton;
}
```

`AuthService` accepts an injected client for tests and otherwise uses `getSupabaseClient()`. Each method checks `error` and throws it; `requestPasswordReset` passes `${location.origin}/reset-password` through `redirectTo`, and `onSessionChange` returns the Supabase unsubscribe function.

- [ ] **Step 4: Implement LedgerApi and complete record mapping**

Define stable results:

```ts
export type ApplyOperationResult =
  | { status: 'applied'; transactionId?: string; entityId?: string; serverVersion: number }
  | { status: 'conflict'; transactionId?: string; server: unknown; local: unknown };

export interface PullChangesResult {
  changes: ServerChange[];
  nextCursor: string;
}
```

`bootstrapPersonalLedger()` validates `data.ledgerId`. `applyOperation()` sends `{ p_operation_id: operation.operationId, p_payload: operation }`. `pullChanges()`先验证 `afterSeq` 是非负十进制整数字符串，再原样发送 `{ p_ledger_id: ledgerId, p_after_seq: afterSeq }`，避免把 PostgreSQL `bigint` 游标转换成可能丢失精度的 JavaScript number。它映射每一种实体类型，把 snake_case 字段转换为 `src/domain/types.ts` 中的准确名称，并在未知实体类型或返回结构无效时抛出 `new Error('服务器返回了无法识别的同步数据')`。

- [ ] **Step 5: Run service tests and typecheck**

Run: `npm.cmd run test:run -- src/services/auth-service.test.ts src/services/ledger-api.test.ts`

Expected: both service test files PASS.

Run: `npm.cmd run typecheck`

Expected: exit code 0.

- [ ] **Step 6: Commit service layer**

```powershell
git add src/vite-env.d.ts src/services
git commit -m "feat: add Supabase auth and ledger services"
```

---

### Task 3: Implement the single-flight SyncEngine

**Files:**
- Create: `src/sync/sync-engine.ts`
- Create: `src/sync/sync-engine.test.ts`

**Interfaces:**
- Consumes: repository synchronization methods from Task 1 and `LedgerApi` methods from Task 2.
- Produces: `SyncEngine.syncNow()`, `SyncEngine.getStatus()`, `SyncEngine.subscribe(listener)`, `SyncStatus`.

- [ ] **Step 1: Write failing synchronization tests**

Create a real test Dexie database, save valid operations through `LocalLedgerRepository`, and use a fake API. Cover success, failure, offline, due-time filtering, conflict, pull and single-flight:

```ts
it('uploads pending operations once and marks them synced', async () => {
  await repo.saveOperation(operation);
  api.applyOperation.mockResolvedValue({ status: 'applied', transactionId: operation.transaction.id, serverVersion: 1 });
  api.pullChanges.mockResolvedValue({ changes: [], nextCursor: '0' });

  await engine.syncNow();

  expect(api.applyOperation).toHaveBeenCalledTimes(1);
  expect(await repo.listPendingOperations()).toEqual([]);
  expect(engine.getStatus()).toMatchObject({ mode: 'idle', pendingCount: 0 });
});

it('keeps failed operations pending with a Chinese error summary', async () => {
  await repo.saveOperation(operation);
  api.applyOperation.mockRejectedValue(new Error('fetch failed'));

  await engine.syncNow();

  expect(await db.outbox.get(operation.operationId)).toMatchObject({
    status: 'pending', lastError: '网络连接失败，稍后会自动重试',
  });
  expect(engine.getStatus()).toMatchObject({ mode: 'error', pendingCount: 1 });
  expect(api.pullChanges).not.toHaveBeenCalled();
});

it('shares one in-flight synchronization between concurrent callers', async () => {
  await repo.saveOperation(operation);
  let release!: () => void;
  api.applyOperation.mockReturnValue(new Promise((resolve) => {
    release = () => resolve({ status: 'applied', transactionId: operation.transaction.id, serverVersion: 1 });
  }));
  api.pullChanges.mockResolvedValue({ changes: [], nextCursor: '0' });

  const first = engine.syncNow();
  const second = engine.syncNow();
  release();
  await Promise.all([first, second]);

  expect(api.applyOperation).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run SyncEngine tests and verify RED**

Run: `npm.cmd run test:run -- src/sync/sync-engine.test.ts`

Expected: FAIL because `SyncEngine` does not exist.

- [ ] **Step 3: Implement status, single-flight and upload flow**

Use dependency interfaces narrow enough for fakes:

```ts
export type SyncStatus = {
  mode: 'idle' | 'syncing' | 'offline' | 'error' | 'conflict';
  pendingCount: number;
  lastSyncedAt: string | null;
  message: string | null;
};

export class SyncEngine {
  private inFlight: Promise<void> | null = null;
  private status: SyncStatus = { mode: 'idle', pendingCount: 0, lastSyncedAt: null, message: null };
  private readonly listeners = new Set<(status: SyncStatus) => void>();

  syncNow(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.run().finally(() => { this.inFlight = null; });
    return this.inFlight;
  }
}
```

`run()` checks `isOnline()`, loads due operations in repository order, uploads sequentially, calls `markOperationSynced` only for `applied`, calls `markOperationConflict` and stops on `conflict`, and maps errors containing `fetch`, `network`, `ECONNRESET` or `Failed to fetch` to the required Chinese network summary.

- [ ] **Step 4: Implement paged pull and atomic cursor application**

After uploads succeed or a conflict is stored, load the repository cursor and pull until an empty page is returned. Reject a page whose non-empty `nextCursor` does not advance. Pass each page unchanged to `repo.applyServerChanges(ledgerId, changes, nextCursor)` so records and cursor commit atomically. Set `lastSyncedAt` only after the pull loop completes.

- [ ] **Step 5: Run SyncEngine tests and verify GREEN**

Run: `npm.cmd run test:run -- src/sync/sync-engine.test.ts`

Expected: all synchronization tests PASS, including single-flight, conflict, offline and cursor cases.

- [ ] **Step 6: Commit SyncEngine**

```powershell
git add src/sync
git commit -m "feat: add idempotent sync engine"
```

---

### Task 4: Wire authentication startup and browser sync triggers

**Files:**
- Create: `src/app/providers.tsx`
- Create: `src/app/providers.test.tsx`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: `AuthService`, `LedgerApi`, `LocalLedgerRepository`, `SyncEngine`, authenticated Supabase `Session`.
- Produces: `AppProviders`, `useAppRuntime()`, runtime `saveOperation(operation)` and `syncNow()` commands.

- [ ] **Step 1: Write failing Provider lifecycle tests**

Inject service factories so tests never read real environment variables. Verify online bootstrap precedes sync, cached offline sessions can open, new offline sessions report initialization error, and browser listeners clean up:

```tsx
it('bootstraps before the first authenticated synchronization', async () => {
  auth.emit(sessionFor('user-a'));
  await waitFor(() => expect(api.bootstrapPersonalLedger).toHaveBeenCalledTimes(1));
  expect(api.bootstrapPersonalLedger.mock.invocationCallOrder[0])
    .toBeLessThan(syncNow.mock.invocationCallOrder[0]);
});

it('requests synchronization when the browser returns online', async () => {
  render(<AppProviders services={services}><RuntimeProbe /></AppProviders>);
  window.dispatchEvent(new Event('online'));
  await waitFor(() => expect(syncNow).toHaveBeenCalled());
});

it('removes global listeners on unmount', () => {
  const removeSpy = vi.spyOn(window, 'removeEventListener');
  const view = render(<AppProviders services={services}><span /></AppProviders>);
  view.unmount();
  expect(removeSpy).toHaveBeenCalledWith('online', expect.any(Function));
});
```

- [ ] **Step 2: Run Provider tests and verify RED**

Run: `npm.cmd run test:run -- src/app/providers.test.tsx`

Expected: FAIL because `AppProviders` and runtime context do not exist.

- [ ] **Step 3: Implement runtime context and authenticated initialization**

Expose a small UI-independent runtime:

```ts
type AppRuntimeValue = {
  session: Session | null;
  initializing: boolean;
  initializationMessage: string | null;
  syncStatus: SyncStatus;
  syncNow(): Promise<void>;
  saveOperation(operation: LedgerOperation): Promise<void>;
};
```

On a session event, first query `repo.getPersonalLedgerId(user.id)`. If online, call `api.bootstrapPersonalLedger()`, create an engine for the returned ledger and sync. If offline and a local ledger exists, create the engine without bootstrap. If offline with no local ledger, set `initializationMessage` to `首次登录需要联网完成初始化` and do not create an engine. Use an initialization generation counter so a late async result from an old session cannot replace the current runtime.

- [ ] **Step 4: Wire save, online and visibility triggers with cleanup**

`saveOperation()` awaits the local repository transaction and then requests `syncNow()` without rolling back the local save if the network fails. Register one `online` listener on `window` and one `visibilitychange` listener on `document`; the latter synchronizes only when `document.visibilityState === 'visible'`. Remove both plus the auth subscription on cleanup so React Strict Mode does not duplicate work.

- [ ] **Step 5: Wrap the application root and verify Provider tests**

Change `src/main.tsx` to:

```tsx
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
);
```

Run: `npm.cmd run test:run -- src/app/providers.test.tsx src/app/App.test.tsx`

Expected: Provider lifecycle tests and the existing App smoke test PASS.

- [ ] **Step 6: Commit Provider wiring**

```powershell
git add src/app/providers.tsx src/app/providers.test.tsx src/main.tsx
git commit -m "feat: wire authenticated sync lifecycle"
```

---

### Task 5: Enforce service boundaries and run the core gate

**Files:**
- Create: `src/services/service-boundary.test.ts`

**Interfaces:**
- Consumes: all `src` source text through Vite raw imports.
- Produces: an automated guard that prevents future direct Supabase access outside `src/services`.

- [ ] **Step 1: Write the boundary test**

```ts
import { describe, expect, it } from 'vitest';

const files = import.meta.glob('../**/*.{ts,tsx}', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

describe('Supabase service boundary', () => {
  it('keeps Supabase runtime calls inside src/services', () => {
    for (const [path, source] of Object.entries(files)) {
      if (path.includes('/services/') || path.endsWith('.test.ts') || path.endsWith('.test.tsx')) continue;
      expect(source, path).not.toMatch(/getSupabaseClient\(|\.rpc\(|createClient\(/);
    }
  });
});
```

- [ ] **Step 2: Run the full unit suite**

Run: `npm.cmd run test:run`

Expected: all unit and component tests PASS with zero skipped tests.

- [ ] **Step 3: Run typecheck and production build**

Run: `npm.cmd run typecheck`

Expected: exit code 0.

Run: `npm.cmd run build`

Expected: Vite reports a successful production build.

- [ ] **Step 4: Scan for client secrets and direct Supabase calls**

Run:

```powershell
rg -n "service_role|SUPABASE_SERVICE_ROLE_KEY|eyJ[A-Za-z0-9_-]+\." src
rg -n "\.rpc\(|createClient\(|getSupabaseClient\(" src -g '!src/services/**'
```

Expected: both scans return no matches.

- [ ] **Step 5: Commit the boundary guard**

```powershell
git add src/services/service-boundary.test.ts
git commit -m "test: enforce Supabase service boundary"
```

- [ ] **Step 6: Confirm a clean worktree**

Run: `git status --short`

Expected: no output. The ignored `.env.integration.local` and any ignored `.env.local` must not appear in the commit.
