# 海风小账本阶段三：备份恢复、导出、偏好、安全与最终验收 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成版本化 JSON 备份、带预览和二次确认的原子恢复、CSV 流水导出、同步/冲突中心、海风偏好、账号安全和退出登录，并对五页完整产品执行最终离线、云同步、可访问性、视觉和数据安全验收。

**Architecture:** 备份/恢复/CSV 的格式化与校验保留为领域纯函数，Repository 提供当前账本范围的原子读取与事务恢复，ViewModel 是页面唯一入口。设备偏好存入账本范围的 `syncMeta` 键并进入 JSON 备份但不伪装为云同步数据；同步中心只显示安全摘要和可执行重试，不直接暴露未知 server payload。最终候选继续隔离，只有用户明确批准后才提升为官方视觉基线。

**Tech Stack:** 阶段一、二技术栈，现有 Zod 4.4.3、Web Crypto API、Blob/File API、Dexie 事务、Supabase RLS/RPC、Vitest/Playwright。

## Global Constraints

- 前置条件：阶段一、二已通过各自功能/无障碍/设计 QA，候选图已获用户批准并形成官方证据。
- 规格：`docs/superpowers/specs/2026-07-26-seabreeze-unified-five-page-design.md` 的 5.5、6、7、8、9 节。
- 页面不得直接访问 Dexie、Supabase、Repository、SyncEngine、localStorage 或文件系统；所有动作通过 ViewModel/注入端口。
- JSON 备份只包含当前用户当前账本范围内的本地数据、待同步操作、冲突草稿、恢复回执、设备偏好和版本信息。
- 备份不得包含密码、访问令牌、刷新令牌、service role/publishable key、Supabase client、原始截图或 OCR 原文。
- 恢复顺序固定为：文件大小/类型 → JSON/Zod 校验 → 完整性哈希 → 账本/版本检查 → 影响预览 → 明确二次确认 → 单事务应用 → 恢复回执。
- 恢复失败必须回滚并保持恢复前账本字节级等价；重复导入同一 `restoreId` 必须幂等并返回已完成回执。
- 恢复只接受当前账本的包，不允许把另一用户/账本的数据静默覆盖到当前账本。
- 恢复不删除云端记录；恢复后由现有 outbox/同步路径继续处理，远端差异进入现有冲突提示。
- CSV 使用 UTF-8 BOM、固定中文表头、RFC 4180 引号规则；只输出可读流水字段，不输出内部版本、operationId、outbox、冲突、凭据或认证信息。
- 偏好变更不得改变财务语义、隐藏状态或破坏对比度；减少动效必须同时遵守系统设置和用户显式设置。
- 退出登录只清理会话/内存运行时，不自动删除本地账本；清除本机数据必须是另一个明确、二次确认且不在本计划默认范围内的动作。
- 账号错误只显示安全中文文案，不输出 Supabase 原始异常。
- 任何新结构只通过新的可回滚增量迁移；本计划优先复用已存在的 `restoreReceipts` 和 `syncMeta` 表。
- 用户批准最终候选前，不更新官方快照、不部署生产、不宣称项目完成。

---

## File Map

### Backup, restore and export domain

- Create `src/domain/canonical-json.ts`, tests: 稳定键序列化与 SHA-256 输入。
- Create `src/domain/backup.ts`, `backup.test.ts`: `LedgerBackupPackageV1` Zod 校验、哈希和安全字段扫描。
- Create `src/domain/restore-preview.ts`, tests: 恢复影响摘要。
- Create `src/domain/csv-export.ts`, tests: 固定 CSV 转换。
- Modify `src/db/records.ts`: 账本范围备份/恢复类型。
- Modify `src/db/local-repository.ts`, tests: `exportLedgerBackupSource()`、`restoreLedgerBackupAtomically()`、偏好和同步摘要。
- Modify `src/view-model/types.ts`, `ledger-view-model.ts`, tests: 备份/恢复/导出/偏好/同步中心命令。

### Product pages and runtime

- Create `src/features/portability/BackupPage.tsx`, `RestorePage.tsx`, `ExportPage.tsx`, shared CSS and tests.
- Create `src/features/preferences/PreferencesPage.tsx`, CSS and tests.
- Create `src/features/sync/SyncCenterPage.tsx`, CSS and tests.
- Create `src/features/security/SecurityPage.tsx`, CSS and tests.
- Modify `src/features/profile/ProfilePage.tsx`, tests: 激活剩余入口。
- Modify `src/features/management/ManagementRouter.tsx`, tests: 二级页路由。
- Modify `src/app/providers.tsx`, tests: 安全身份摘要、`signOut()` 和偏好发布。
- Modify `src/services/auth-service.ts`, tests only as needed; implementation already supports `signOut()`.
- Modify `src/design-system/global.css`, tokens and tests: 偏好令牌/减少动效。

### Final evidence

- Create `docs/verification/seabreeze-phase-3-visual-lock.json`.
- Create `playwright.seabreeze-phase-3.config.ts`.
- Create `e2e/candidate-seabreeze-phase-3.spec.ts`, `e2e/seabreeze-phase-3.spec.ts`.
- Modify `e2e/accessibility.spec.ts`, `e2e/visual.spec.ts` only after approval.
- Create `docs/verification/seabreeze-final.md` after approval.
- Create ignored `.superpowers/sdd/seabreeze-phase-3-report.md` and candidate PNGs.

---

### Task 1: Add current-ledger portability ports and phase-three visual lock

**Files:**
- Modify: `src/db/records.ts`
- Modify: `src/db/local-repository.ts`
- Modify: `src/db/local-repository.test.ts`
- Modify: `src/view-model/types.ts`
- Create: `docs/verification/seabreeze-phase-3-visual-lock.json`
- Create: `playwright.seabreeze-phase-3.config.ts`
- Create: `e2e/candidate-seabreeze-phase-3.spec.ts`
- Modify: `playwright.config.ts`, `package.json`, visual gate script

**Interfaces:**
- Produces:

```ts
export interface LedgerPortabilitySource {
  profile: ProfileRecord;
  ledger: LedgerRecord;
  membership: LedgerMemberRecord;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  entries: LedgerEntryRecord[];
  budgets: Budget[];
  categoryBudgets: CategoryBudget[];
  reminders: Reminder[];
  outbox: OutboxRecord[];
  conflicts: ConflictRecord[];
  restoreReceipts: RestoreReceiptRecord[];
  syncMeta: SyncMetaRecord[];
}

LocalLedgerRepository.exportLedgerBackupSource(
  userId: string,
  ledgerId: string,
): Promise<LedgerPortabilitySource>;
```

- [ ] **Step 1: Write failing user/ledger isolation tests**

Seed two users and ledgers across every table. Require exactly one profile, ledger and membership, and require every ledger-scoped record to match the requested ledger. Reject when the user is not a member.

- [ ] **Step 2: Run Repository tests and observe RED**

Run: `npm.cmd run test:run -- src/db/local-repository.test.ts`

- [ ] **Step 3: Implement one read-only Dexie transaction**

Read all listed tables inside one `db.transaction('r', tables, ...)`; never call unscoped `exportSnapshot()` from the product path. Filter out unrelated users before returning.

- [ ] **Step 4: Lock and isolate final candidates**

Record every approved phase-two official PNG SHA-256. Add phase-three candidate config:

```ts
testMatch: 'candidate-seabreeze-phase-3.spec.ts',
snapshotPathTemplate: '.superpowers/sdd/seabreeze-phase-3-previews/{arg}{ext}',
```

Default Playwright ignores it; the verifier checks all three phase locks and never writes snapshots.

- [ ] **Step 5: Add phase-three package commands**

Add:

```json
"verify:visual-gate:phase3": "node scripts/verify-seabreeze-phase-3-visual-gate.mjs",
"test:e2e:candidate:phase3": "playwright test --config playwright.seabreeze-phase-3.config.ts"
```

- [ ] **Step 6: Verify and commit Task 1**

Run:

```powershell
npm.cmd run test:run -- src/db/local-repository.test.ts
npm.cmd run verify:visual-gate:phase3
git diff --check
```

```powershell
git add src/db src/view-model/types.ts package.json playwright.config.ts playwright.seabreeze-phase-3.config.ts e2e/candidate-seabreeze-phase-3.spec.ts docs/verification/seabreeze-phase-3-visual-lock.json scripts
git commit -m "feat: add scoped portability reads"
```

---

### Task 2: Define and generate a versioned, integrity-checked JSON backup

**Files:**
- Create: `src/domain/canonical-json.ts`, `canonical-json.test.ts`
- Create: `src/domain/backup.ts`, `backup.test.ts`
- Modify: `src/view-model/types.ts`, `ledger-view-model.ts`, `ledger-view-model.test.ts`

**Interfaces:**
- Produces:

```ts
export interface LedgerBackupPackageV1 {
  format: 'seabreeze-ledger-backup';
  schemaVersion: 1;
  restoreId: string;
  sourceLedgerId: string;
  exportedAt: string;
  payload: LedgerPortabilitySource;
  integrity: { algorithm: 'SHA-256'; payloadHash: string };
}

export function createLedgerBackupPackage(
  source: LedgerPortabilitySource,
  restoreId: string,
  exportedAt: string,
): Promise<LedgerBackupPackageV1>;

LedgerViewModel.createJsonBackup(): Promise<{
  filename: string;
  mimeType: 'application/json';
  contents: string;
}>;

// Added to LedgerViewModelOptions so backup never guesses the active owner:
userId: string;
```

- [ ] **Step 1: Write failing canonical JSON tests**

Objects with different insertion order must serialize identically; arrays retain order; unsupported `undefined`, functions, symbols, `NaN`, `Infinity` and cycles throw `备份数据无法序列化`.

- [ ] **Step 2: Write failing package/security tests**

Require deterministic payload hash, valid UUID/ISO timestamps, exact format/version, current ledger only and recursive rejection of keys matching:

```ts
/password|access[_-]?token|refresh[_-]?token|service[_-]?role|supabase[_-]?key|image|screenshot|ocrText/i
```

Outbox payloads and conflict server drafts remain allowed only after their operation/schema validation succeeds.

- [ ] **Step 3: Run tests and observe RED**

Run: `npm.cmd run test:run -- src/domain/canonical-json.test.ts src/domain/backup.test.ts src/view-model/ledger-view-model.test.ts`

- [ ] **Step 4: Implement backup generation**

Canonicalize `payload`, hash UTF-8 bytes with `crypto.subtle.digest('SHA-256', bytes)`, then canonicalize the full package. Filename:

```ts
`海风小账本-${localDateKey(exportedAt)}-${restoreId.slice(0, 8)}.json`
```

The ViewModel receives current `userId` from its options; do not infer a user by scanning tables.

- [ ] **Step 5: Verify and commit Task 2**

Run:

```powershell
npm.cmd run test:run -- src/domain src/view-model
npm.cmd run typecheck
```

```powershell
git add src/domain/canonical-json* src/domain/backup* src/view-model
git commit -m "feat: create complete ledger backups"
```

---

### Task 3: Validate, preview and atomically restore a backup

**Files:**
- Create: `src/domain/restore-preview.ts`, `restore-preview.test.ts`
- Modify: `src/domain/backup.ts`, `backup.test.ts`
- Modify: `src/db/local-repository.ts`, `local-repository.test.ts`
- Modify: `src/view-model/types.ts`, `ledger-view-model.ts`, `ledger-view-model.test.ts`

**Interfaces:**
- Produces:

```ts
export interface RestorePreview {
  restoreId: string;
  sourceLedgerId: string;
  exportedAt: string;
  counts: Record<'accounts' | 'categories' | 'transactions' | 'budgets' | 'categoryBudgets' | 'reminders' | 'pendingOperations' | 'conflicts', number>;
  changes: { insert: number; replace: number; unchanged: number };
  warnings: string[];
}

LedgerViewModel.inspectJsonBackup(fileText: string): Promise<RestorePreview>;
LedgerViewModel.restoreJsonBackup(
  fileText: string,
  confirmation: { restoreId: string; phrase: '确认恢复' },
): Promise<{ status: 'restored' | 'already-restored'; restoredAt: string }>;

export type RestoreReceipt = {
  status: 'restored' | 'already-restored';
  restoredAt: string;
};
```

- [ ] **Step 1: Write failing validation/preview tests**

Cover invalid JSON, oversized text, wrong format/version, unknown fields, hash mismatch, another ledger, another user, malformed operation/conflict, duplicate IDs, orphan entries/category budgets/reminders and preview insert/replace/unchanged counts.

- [ ] **Step 2: Write failing atomicity/idempotency tests**

Snapshot every current-ledger table before restore. Inject a failure after half the table writes and require deep equality with the pre-restore snapshot. Successful restore writes a `RestoreReceiptRecord`; the same `restoreId` returns `already-restored` without writes.

- [ ] **Step 3: Run tests and observe RED**

Run: `npm.cmd run test:run -- src/domain/backup.test.ts src/domain/restore-preview.test.ts src/db/local-repository.test.ts src/view-model/ledger-view-model.test.ts`

- [ ] **Step 4: Implement strict validation before mutation**

Parse with a strict Zod schema, verify SHA-256, require `sourceLedgerId === currentLedgerId`, validate every operation, enforce referential integrity and build the full preview before enabling restore.

- [ ] **Step 5: Implement one atomic restore transaction**

Inside one Dexie `rw` transaction:

1. Check receipt again.
2. Replace only current-ledger records in data/outbox/conflict/syncMeta tables.
3. Preserve current authenticated profile identity and membership ownership.
4. Put validated package data.
5. Put the restore receipt last.

Never call `clearUserData()` or clear another ledger.

- [ ] **Step 6: Verify and commit Task 3**

Run:

```powershell
npm.cmd run test:run -- src/domain src/db/local-repository.test.ts src/view-model
npm.cmd run typecheck
```

```powershell
git add src/domain/backup* src/domain/restore-preview* src/db src/view-model
git commit -m "feat: restore ledger backups atomically"
```

---

### Task 4: Add a safe, readable CSV transaction export

**Files:**
- Create: `src/domain/csv-export.ts`, `csv-export.test.ts`
- Modify: `src/view-model/types.ts`, `ledger-view-model.ts`, `ledger-view-model.test.ts`

**Interfaces:**
- Produces:

```ts
export type CsvExportRange =
  | { kind: 'all' }
  | { kind: 'month'; month: string }
  | { kind: 'custom'; startDate: string; endDate: string };

export function createTransactionCsv(
  snapshot: LedgerReadSnapshot,
  range: CsvExportRange,
): string;

LedgerViewModel.createCsvExport(range: CsvExportRange): Promise<{
  filename: string;
  mimeType: 'text/csv;charset=utf-8';
  contents: string;
}>;
```

- [ ] **Step 1: Write failing CSV contract tests**

Require BOM and this exact header:

```text
日期时间,类型,金额（元）,分类,账户,转入账户,备注,原支出
```

Cover comma, quote, CR/LF formula-injection prefixes (`=`, `+`, `-`, `@`), transfer two-account columns, refund link, adjustment sign, local display time, deleted exclusion, range filters and stable descending order.

- [ ] **Step 2: Run tests and observe RED**

Run: `npm.cmd run test:run -- src/domain/csv-export.test.ts src/view-model/ledger-view-model.test.ts`

- [ ] **Step 3: Implement pure CSV conversion**

Escape each field with doubled quotes and quote all text fields. Prefix formula-like text with a single quote. Format cents with integer division to exactly two decimals; do not use floating arithmetic.

- [ ] **Step 4: Verify sensitive-field absence**

Assert output does not contain operation IDs, versions, outbox status, conflict JSON, tokens or internal ledger/user IDs.

- [ ] **Step 5: Verify and commit Task 4**

Run:

```powershell
npm.cmd run test:run -- src/domain/csv-export.test.ts src/view-model
npm.cmd run typecheck
```

```powershell
git add src/domain/csv-export* src/view-model
git commit -m "feat: export readable transaction csv"
```

---

### Task 5: Build backup, restore and export product pages

**Files:**
- Create: `src/features/portability/BackupPage.tsx`
- Create: `src/features/portability/RestorePage.tsx`
- Create: `src/features/portability/ExportPage.tsx`
- Create: `src/features/portability/Portability.module.css`
- Create: `src/features/portability/portability.test.tsx`
- Modify: `src/features/profile/ProfilePage.tsx`, tests
- Modify: `src/features/management/ManagementRouter.tsx`, tests

**Interfaces:**
- Consumes: Task 2–4 ViewModel methods and an injected browser download port.
- Produces:

```ts
export interface DownloadPort {
  save(input: { filename: string; mimeType: string; contents: string }): Promise<void>;
}
```

- [ ] **Step 1: Write failing backup/export page tests**

Require one explicit generate action, busy state, success filename/size, safe error copy and real download-port call. CSV page covers all/month/custom range and invalid range focus.

- [ ] **Step 2: Write failing restore journey tests**

Require file type/size gate, validation progress, impact counts/warnings, no mutation before confirmation, exact phrase `确认恢复`, disabled confirm on mismatched restore ID, success receipt and input/error preservation.

- [ ] **Step 3: Run tests and observe RED**

Run: `npm.cmd run test:run -- src/features/portability`

- [ ] **Step 4: Implement injected browser download**

The default port creates one Blob/object URL, triggers an `<a download>`, then revokes the URL in `finally`. Components do not import filesystem/browser storage services.

- [ ] **Step 5: Implement RestorePage state machine**

Use:

```ts
type RestoreState =
  | { status: 'idle' }
  | { status: 'inspecting'; fileName: string }
  | { status: 'preview'; fileName: string; fileText: string; preview: RestorePreview }
  | { status: 'restoring'; preview: RestorePreview }
  | { status: 'success'; receipt: RestoreReceipt }
  | { status: 'error'; message: string; retryable: boolean };
```

On successful restore, reload ViewModel subscribers; do not reload the browser before showing receipt.

- [ ] **Step 6: Verify and commit Task 5**

Run:

```powershell
npm.cmd run test:run -- src/features/portability src/features/profile src/features/management
npm.cmd run typecheck
```

```powershell
git add src/features/portability src/features/profile src/features/management
git commit -m "feat: add backup restore and export pages"
```

---

### Task 6: Add durable device preferences and reduced-motion control

**Files:**
- Modify: `src/db/local-repository.ts`, `local-repository.test.ts`
- Modify: `src/view-model/types.ts`, `ledger-view-model.ts`, `ledger-view-model.test.ts`
- Create: `src/features/preferences/PreferencesPage.tsx`, CSS and tests
- Modify: `src/design-system/tokens.css`, `global.css`, tests
- Modify: `src/app/providers.tsx`, tests

**Interfaces:**
- Produces:

```ts
export interface AppPreferences {
  theme: 'seabreeze' | 'seabreeze-contrast';
  paperTexture: boolean;
  motion: 'system' | 'reduce';
}

LocalLedgerRepository.getPreferences(ledgerId: string): Promise<AppPreferences>;
LocalLedgerRepository.savePreferences(ledgerId: string, value: AppPreferences): Promise<void>;
LedgerViewModel.getPreferences(): Promise<AppPreferences>;
LedgerViewModel.savePreferences(value: AppPreferences): Promise<void>;
```

- [ ] **Step 1: Write failing persistence/default tests**

Missing/malformed `syncMeta` returns `{ theme: 'seabreeze', paperTexture: true, motion: 'system' }`. Save uses key `preferences:v1`, current ledger only and one local transaction. The value is included in JSON backup/restore.

- [ ] **Step 2: Write failing page/global tests**

Require current theme, paper texture switch, reduce-motion choice, immediate preview, save failure rollback and 44px controls. `motion='reduce'` must set `data-reduce-motion='true'` and disable nonessential transitions even if the OS setting is no-preference.

- [ ] **Step 3: Run tests and observe RED**

Run: `npm.cmd run test:run -- src/db/local-repository.test.ts src/view-model src/features/preferences src/design-system`

- [ ] **Step 4: Implement preferences**

`seabreeze-contrast` changes token contrast only; it remains the approved visual system and does not create a new layout. Paper-off removes the texture URL but keeps `#fff9ef`. Functional status changes, focus rings and error messages remain visible under reduced motion.

- [ ] **Step 5: Verify and commit Task 6**

Run:

```powershell
npm.cmd run test:run -- src/db src/view-model src/features/preferences src/design-system
npm.cmd run typecheck
```

```powershell
git add src/db src/view-model src/features/preferences src/design-system src/app/providers*
git commit -m "feat: add seabreeze preferences"
```

---

### Task 7: Add sync center, security information and safe sign-out

**Files:**
- Modify: `src/db/local-repository.ts`, tests
- Modify: `src/view-model/types.ts`, `ledger-view-model.ts`, tests
- Create: `src/features/sync/SyncCenterPage.tsx`, CSS and tests
- Create: `src/features/security/SecurityPage.tsx`, CSS and tests
- Modify: `src/app/providers.tsx`, `providers.test.tsx`
- Modify: `src/features/profile/ProfilePage.tsx`, tests
- Modify: `src/features/management/ManagementRouter.tsx`, tests

**Interfaces:**
- Produces:

```ts
export interface SyncCenterSnapshot {
  pendingCount: number;
  conflictCount: number;
  lastSyncedAt: string | null;
  conflicts: Array<{ id: string; entityLabel: string; createdAt: string; safeSummary: string }>;
}

LedgerViewModel.getSyncCenter(): Promise<SyncCenterSnapshot>;
AppRuntimeValue.signOut(): Promise<void>;
```

- [ ] **Step 1: Write failing safe-summary tests**

Repository returns current-ledger outbox/conflict metadata only. ViewModel maps operation kinds to Chinese entity labels and fixed safe summaries; it must not serialize `serverRecord`, raw operation payload, UUIDs or lastError.

- [ ] **Step 2: Write failing SyncCenterPage tests**

Cover idle/pending/offline/error/conflict, retry, pending/conflict count, last sync time, loading/error/retry and no-conflict empty state. Conflicts are informational in this release; page says `为避免覆盖数据，请先导出备份并重试同步` and offers Backup navigation, not an unsafe one-click overwrite.

- [ ] **Step 3: Write failing security/sign-out tests**

Show masked email, account ID suffix only, password reset route and local-data retention notice. Sign-out requires confirmation and calls runtime `signOut()` once; failure keeps the session/page and shows safe copy.

- [ ] **Step 4: Run tests and observe RED**

Run: `npm.cmd run test:run -- src/db src/view-model src/features/sync src/features/security src/app/providers.test.tsx`

- [ ] **Step 5: Expose existing AuthService sign-out safely**

Extend `RuntimeAuthService` and `AppRuntimeValue`, then:

```ts
const signOut = useCallback(async () => {
  await resolvedServices.auth.signOut();
}, [resolvedServices]);
```

Do not call `clearUserData()`. Existing auth state change disposes runtime/VM and returns to login.

- [ ] **Step 6: Verify and commit Task 7**

Run:

```powershell
npm.cmd run test:run -- src/db src/view-model src/features/sync src/features/security src/app
npm.cmd run typecheck
```

```powershell
git add src/db src/view-model src/features/sync src/features/security src/features/profile src/features/management src/app
git commit -m "feat: add sync and account security"
```

---

### Task 8: Complete final browser, offline, restore and cloud-safety gates

**Files:**
- Create: `e2e/seabreeze-phase-3.spec.ts`
- Modify: `e2e/accessibility.spec.ts`
- Modify: `supabase/tests/v2_security.integration.test.ts` if gaps are found
- Modify: `src/test/e2e-services.ts`, tests

**Interfaces:**
- Consumes: complete phase-one through phase-three product.
- Produces: deterministic browser evidence for portability/preferences/security and fresh Supabase RLS/RPC evidence without destructive production changes.

- [ ] **Step 1: Add failing browser round trips**

At target viewports cover:

- create data → JSON backup → mutate → inspect/confirm restore → original values return;
- repeated same restore returns already restored;
- failed injected restore leaves current data unchanged;
- CSV download content/header/escaping;
- preference persistence after page reload;
- sync pending/conflict safe copy and retry;
- sign-out returns login and local data remains available after signing back in;
- no overflow, unique active `main`, focus and 44px.

- [ ] **Step 2: Add offline/reconnect coverage**

Go offline, create a transaction and management change, verify local UI/pending count; reconnect, invoke retry and verify safe synced state. Never rely on a production account in normal Playwright.

- [ ] **Step 3: Re-run cloud security tests in an isolated test ledger**

Perform read-only environment/table/function privilege inspection first. Run integration tests for RLS user isolation, transaction/management idempotency, stale versions, budget uniqueness and forbidden cross-ledger references. Do not print environment values or use service-role credentials in browser code.

- [ ] **Step 4: Run the complete non-visual gate**

Run:

```powershell
npm.cmd run test:run
npm.cmd run test:integration
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:e2e -- e2e/seabreeze-phase-1.spec.ts e2e/seabreeze-phase-2.spec.ts e2e/seabreeze-phase-3.spec.ts e2e/accessibility.spec.ts e2e/home-transactions.spec.ts e2e/auth-shell.spec.ts
npm.cmd run test:e2e:static
npm.cmd run verify:visual-gate:phase3
rg -n "service_role|SUPABASE_SERVICE_ROLE_KEY|eyJ[A-Za-z0-9_-]+\\." src dist
rg -n "fixtureNow|createMutableLedgerFixture|test-e2e|e2e-access-token|ocrText" dist/assets
rg -n "from ['\"](?:dexie|@supabase|\.\./\.\./db|\.\./\.\./services)" src/features
git ls-files -- ".env*.local"
git diff --check
```

Expected: all gates pass; three scans find no production matches; no local env file is tracked.

- [ ] **Step 5: Commit Task 8**

```powershell
git add e2e src/test supabase/tests
git commit -m "test: verify seabreeze portability and safety"
```

---

### Task 9: Run final design QA and generate isolated phase-three candidates

**Files:**
- Modify: `e2e/candidate-seabreeze-phase-3.spec.ts`
- Create ignored: `.superpowers/sdd/seabreeze-phase-3-report.md`
- Create ignored: `.superpowers/sdd/seabreeze-phase-3-previews/*.png`

**Interfaces:**
- Consumes: Task 8 green and immutable five-page reference.
- Produces: final candidate inventory and `final result: passed`; official snapshots remain unchanged.

- [ ] **Step 1: Capture final page and secondary-flow states**

At 320×568, 390×844 and 430×932 capture the five primary pages plus Backup, Restore Preview, Export, Preferences, Sync Center and Security. Include error/empty states where layout differs materially.

- [ ] **Step 2: Generate only isolated candidates**

Run:

```powershell
npm.cmd run verify:visual-gate:phase3
npm.cmd run test:e2e:candidate:phase3 -- --update-snapshots
npm.cmd run test:e2e:candidate:phase3
```

- [ ] **Step 3: Perform final same-size QA**

Compare the five primary pages against the supplied board; compare secondary pages against the approved paper/card/icon language. Fix all P0/P1/P2 layout, spacing, typography, color, icon, focus, safe-area and overlap findings. Re-run functional tests after every visual fix.

- [ ] **Step 4: Record complete evidence**

Report reference/candidate hashes, implementation SHA, exact command/pass counts, restore atomicity proof, no-secret/fixture/direct-access scans, OCR local-only proof, Supabase security results, remaining real-iPhone safe-area requirement and `final result: passed`.

- [ ] **Step 5: Review and fresh verification**

Use `superpowers:requesting-code-review`; fix all Critical/Important findings with tests. Use `superpowers:verification-before-completion` for a fresh Task 8 gate and non-update candidate comparison.

- [ ] **Step 6: Commit candidate test and wait**

```powershell
git add e2e/candidate-seabreeze-phase-3.spec.ts
git commit -m "test: prepare final seabreeze candidates"
```

Ask for explicit user approval. Do not promote snapshots or claim completion yet.

---

### Task 10: Promote approved final baselines and write permanent evidence

**Files:**
- Modify after approval: `e2e/visual.spec.ts`
- Modify/Create after approval: `e2e/snapshots/visual.spec.ts/*.png`
- Create: `docs/verification/seabreeze-final.md`

**Interfaces:**
- Consumes: explicit approval, immutable candidate hashes and exact implementation SHA.
- Produces: approved official visual suite and permanent final evidence.

- [ ] **Step 1: Verify approval provenance**

Record approval date, approved filenames/hashes and code SHA. Recompute candidates; abort if any hash differs.

- [ ] **Step 2: Add unconditional official visual cases**

Every official case must use `visual=1`, freeze deterministic state, wait for fonts and call `expect(page).toHaveScreenshot()` without masks, environment bypass or widened thresholds.

- [ ] **Step 3: Update only approved official files**

Run: `npm.cmd run test:e2e:update -- e2e/visual.spec.ts`

Immediately hash all official files. Unchanged auth files must remain byte-identical to prior evidence; new/replaced files must match approved candidates.

- [ ] **Step 4: Write permanent final verification**

Include:

- approval date and candidate/code SHAs;
- every official path, viewport/state and SHA-256;
- all command pass counts;
- migration inventory;
- backup/restore/CSV/privacy/security evidence;
- accepted reference differences;
- remaining real-iPhone safe-area validation note;
- confirmation that no deployment occurred without a separate request.

- [ ] **Step 5: Run the complete final gate**

Run the full Task 8 command set plus normal `npm.cmd run test:e2e` including official visual cases. Verify clean production `dist`, clean worktree intent and no candidate directory tracked.

- [ ] **Step 6: Whole-range review and commit**

Review from the phase-one base through final HEAD. Fix all Critical/Important findings and re-run fresh verification.

```powershell
git add e2e/visual.spec.ts e2e/snapshots docs/verification/seabreeze-final.md
git commit -m "test: approve complete seabreeze ledger"
```

Use `superpowers:finishing-a-development-branch` to offer merge/PR/keep/discard. Do not merge, push, deploy or discard without the user's explicit choice.
