# 海风小账本 UI 基础、登录门与五栏导航 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有认证与同步运行时之上交付正式登录/密码恢复流程、海边手绘视觉基础、固定五栏导航和中央记账占位层。

**Architecture:** `AppProviders` 继续独占 Supabase、Dexie 与同步引擎，并向 UI 暴露最小认证命令和恢复状态。`AuthGate` 决定加载、登录、恢复、初始化错误或应用框架；`AppShell` 管理四个普通标签和独立的中央记账动作层。设计系统和独立资产为后续五屏页面提供稳定基础，业务页面本阶段只显示正式空状态。

**Tech Stack:** React 19.2.7、TypeScript 7.0.2、Vite 8.1.5、Vitest 4.1.10、Testing Library 16.3.2、CSS Modules、Noto Sans SC Variable 5.2.10、Playwright 1.61.1。

## Global Constraints

- 正式页面不显示公开注册入口，只提供登录、忘记密码和设置新密码。
- 密码和 access token 不得写入 localStorage、sessionStorage、IndexedDB、日志或错误文本。
- 页面不得直接导入 Supabase 运行时代码、Dexie、`LocalLedgerRepository` 或 `SyncEngine`。
- 五栏顺序固定为：首页、流水、记账、统计、我的；中央记账是动作层，不是普通标签。
- 五个业务页面只显示正式空状态，不读取或伪造财务数据。
- 主要颜色固定为纸张 `#FFF9EF`、文字 `#34312E`、珊瑚红 `#F46D58`、海蓝 `#73C5E6`、结余橙 `#E8892E`、支出红 `#E85043`、收入绿 `#2E9B68`。
- 所有触控目标至少 44×44 CSS 像素；适配 320、390、430 CSS 像素宽度和 `env(safe-area-inset-bottom)`。
- 不使用 emoji、系统通用图标、整张设计稿截图或截图裁片作为正式资产。
- SVG 不得包含 `<text>`、外部图片链接或嵌入式 base64 图片；纯装饰插画必须从辅助技术隐藏。
- `prefers-reduced-motion: reduce` 时关闭漂浮、弹性和非必要过渡。
- 不安装 Recharts；统计页开始开发时再引入。

---

## Locked File Structure

```text
docs/superpowers/specs/assets/seabreeze-ledger-visual-reference.png
docs/verification/ui-foundation-auth-shell.md
src/app/App.tsx
src/app/AuthGate.tsx
src/app/AuthGate.test.tsx
src/app/AppShell.tsx
src/app/AppShell.module.css
src/app/AppShell.test.tsx
src/app/navigation.ts
src/app/providers.tsx
src/app/providers.test.tsx
src/assets/registry.ts
src/assets/assets.test.tsx
src/assets/ATTRIBUTION.md
src/assets/illustrations/auth-seaside.svg
src/assets/icons/brand/shell.svg
src/assets/icons/navigation/{home,ledger,entry,statistics,profile}.svg
src/assets/textures/paper.webp
src/design-system/tokens.css
src/design-system/global.css
src/design-system/components/Card.tsx
src/design-system/components/PrimaryButton.tsx
src/design-system/components/TextField.tsx
src/design-system/components/HandDrawnIcon.tsx
src/design-system/components/BottomNavigation.tsx
src/design-system/components/EmptyState.tsx
src/design-system/components/design-system.test.tsx
src/features/auth/AuthPage.tsx
src/features/auth/AuthPage.module.css
src/features/auth/AuthPage.test.tsx
src/features/auth/auth-errors.ts
src/test/e2e-services.ts
e2e/auth-shell.spec.ts
e2e/accessibility.spec.ts
e2e/visual.spec.ts
playwright.config.ts
```

The previously planned `LedgerViewModel` and Recharts dependency are intentionally deferred until real home/statistics data is implemented; this phase would not have a legitimate consumer for either.

---

### Task 1: Expose safe authentication commands and recovery state

**Files:**
- Modify: `src/services/auth-service.ts`
- Modify: `src/services/auth-service.test.ts`
- Modify: `src/app/providers.tsx`
- Modify: `src/app/providers.test.tsx`

**Interfaces:**
- Consumes: `AuthService`, Supabase `AuthChangeEvent`, existing session initialization generation guard.
- Produces: `buildPasswordResetRedirect(origin?, baseUrl?)`, `isPasswordRecoveryPath(pathname?, baseUrl?)`, runtime `authReady`, `passwordRecovery`, `signIn(email, password)`, `requestPasswordReset(email)`, `updatePassword(password)` and `finishPasswordRecovery()`.

- [ ] **Step 1: Write failing password-reset redirect tests**

Add to `src/services/auth-service.test.ts`:

```ts
import { AuthService, buildPasswordResetRedirect } from './auth-service';

it('builds the password recovery URL under the GitHub Pages base path', () => {
  expect(buildPasswordResetRedirect('https://yesheng1527.github.io', '/ledger-pwa/'))
    .toBe('https://yesheng1527.github.io/ledger-pwa/reset-password');
});

it('passes the base-path recovery URL to Supabase', async () => {
  const resetPasswordForEmail = vi.fn().mockResolvedValue({ data: {}, error: null });
  const service = new AuthService({ auth: { resetPasswordForEmail } } as never);

  await service.requestPasswordReset('person@example.com');

  expect(resetPasswordForEmail).toHaveBeenCalledWith('person@example.com', {
    redirectTo: `${location.origin}/ledger-pwa/reset-password`,
  });
});
```

Add a provider helper test:

```ts
import { isPasswordRecoveryPath } from './providers';

expect(isPasswordRecoveryPath('/ledger-pwa/reset-password', '/ledger-pwa/')).toBe(true);
expect(isPasswordRecoveryPath('/reset-password', '/ledger-pwa/')).toBe(false);
```

- [ ] **Step 2: Run the service test and verify RED**

Run: `npm.cmd run test:run -- src/services/auth-service.test.ts`

Expected: FAIL because `buildPasswordResetRedirect` does not exist and the current redirect omits `/ledger-pwa/`.

- [ ] **Step 3: Implement a base-path-safe redirect**

Add to `src/services/auth-service.ts`:

```ts
export function buildPasswordResetRedirect(
  origin = location.origin,
  baseUrl = import.meta.env.BASE_URL,
): string {
  const appBase = new URL(baseUrl, `${origin}/`);
  return new URL('reset-password', appBase).toString();
}
```

Change the reset request to `redirectTo: buildPasswordResetRedirect()`.

- [ ] **Step 4: Write failing provider command and recovery tests**

Extend the injected auth fake in `src/app/providers.test.tsx` with `signIn`, `requestPasswordReset`, and `updatePassword`. Capture the runtime through the existing probe and add:

```tsx
it('exposes auth commands without storing credentials in the runtime', async () => {
  render(<AppProviders services={services}><RuntimeProbe /></AppProviders>);

  await latestRuntime.signIn('person@example.com', 'secret-password');
  await latestRuntime.requestPasswordReset('person@example.com');
  await latestRuntime.updatePassword('new-secret-password');

  expect(auth.signIn).toHaveBeenCalledWith('person@example.com', 'secret-password');
  expect(auth.requestPasswordReset).toHaveBeenCalledWith('person@example.com');
  expect(auth.updatePassword).toHaveBeenCalledWith('new-secret-password');
  expect(JSON.stringify(latestRuntime)).not.toContain('secret-password');
});

it('tracks PASSWORD_RECOVERY and clears it explicitly', async () => {
  render(<AppProviders services={services}><RuntimeProbe /></AppProviders>);

  act(() => auth.emit('PASSWORD_RECOVERY', sessionFor('user-a')));
  await waitFor(() => expect(latestRuntime.passwordRecovery).toBe(true));
  expect(latestRuntime.authReady).toBe(true);

  act(() => latestRuntime.finishPasswordRecovery());
  expect(latestRuntime.passwordRecovery).toBe(false);
});
```

- [ ] **Step 5: Run provider tests and verify RED**

Run: `npm.cmd run test:run -- src/app/providers.test.tsx`

Expected: FAIL because the runtime does not expose auth commands or recovery state.

- [ ] **Step 6: Implement the runtime interface**

Use these exact public additions in `src/app/providers.tsx`:

```ts
export type AppRuntimeValue = {
  session: Session | null;
  authReady: boolean;
  passwordRecovery: boolean;
  initializing: boolean;
  initializationMessage: string | null;
  syncStatus: SyncStatus;
  signIn(email: string, password: string): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  finishPasswordRecovery(): void;
  syncNow(): Promise<void>;
  saveOperation(operation: LedgerOperation): Promise<void>;
};
```

`RuntimeAuthService` must include the three methods. Set `authReady` on the first auth callback, preserve the path-derived recovery state until the event rules below resolve it, and have `finishPasswordRecovery()` clear that state and replace the current history path with `import.meta.env.BASE_URL`. Do not await initialization from the auth callback.

Use service-facing return types that `AuthService` and test fakes can both satisfy, while the public runtime wrappers await and discard their results:

```ts
type RuntimeAuthService = {
  onSessionChange(listener: SessionChangeListener): () => void;
  signIn(email: string, password: string): Promise<unknown>;
  requestPasswordReset(email: string): Promise<unknown>;
  updatePassword(password: string): Promise<unknown>;
};
```

Export `isPasswordRecoveryPath(pathname = location.pathname, baseUrl = import.meta.env.BASE_URL)` from `src/app/providers.tsx`. Initialize `passwordRecovery` from that helper so a valid GitHub Pages callback shows a branded loading state before the SDK emits its auth event. After initialization, only a `PASSWORD_RECOVERY` callback may set the state to `true`; `finishPasswordRecovery()` sets it to `false`. After the first auth event, a recovery path without a session is treated as an expired/invalid link; it must not show an enabled password form.

Use URL parsing rather than substring matching:

```ts
export function isPasswordRecoveryPath(
  pathname = location.pathname,
  baseUrl = import.meta.env.BASE_URL,
): boolean {
  const recoveryPath = new URL('reset-password', new URL(baseUrl, 'https://app.invalid')).pathname;
  return pathname === recoveryPath || pathname === `${recoveryPath}/`;
}
```

In the auth callback, call `setAuthReady(true)`. Set recovery to `true` for `PASSWORD_RECOVERY`, clear it for `SIGNED_OUT`, and otherwise preserve the path-derived value; this prevents a valid recovery URL from flashing the authenticated shell before Supabase emits the recovery event.

- [ ] **Step 7: Verify Task 1 and commit**

Run:

```powershell
npm.cmd run test:run -- src/services/auth-service.test.ts src/app/providers.test.tsx
npm.cmd run typecheck
git diff --check
```

Expected: all commands exit 0.

```powershell
git add src/services/auth-service.ts src/services/auth-service.test.ts src/app/providers.tsx src/app/providers.test.tsx
git commit -m "feat: expose UI authentication runtime"
```

---

### Task 2: Establish the visual foundation and minimal asset registry

**Files:**
- Modify: `package.json`, `package-lock.json`, `src/main.tsx`
- Create: `docs/superpowers/specs/assets/seabreeze-ledger-visual-reference.png`
- Create: `src/design-system/tokens.css`, `src/design-system/global.css`
- Create: `src/design-system/components/Card.tsx`
- Create: `src/design-system/components/PrimaryButton.tsx`
- Create: `src/design-system/components/TextField.tsx`
- Create: `src/design-system/components/HandDrawnIcon.tsx`
- Create: `src/design-system/components/BottomNavigation.tsx`
- Create: `src/design-system/components/EmptyState.tsx`
- Create: `src/design-system/components/design-system.test.tsx`
- Create: `src/assets/registry.ts`, `src/assets/assets.test.tsx`
- Create: `src/assets/ATTRIBUTION.md`
- Create: `src/assets/illustrations/auth-seaside.svg`
- Create: `src/assets/icons/brand/shell.svg`
- Create: `src/assets/icons/navigation/home.svg`
- Create: `src/assets/icons/navigation/ledger.svg`
- Create: `src/assets/icons/navigation/entry.svg`
- Create: `src/assets/icons/navigation/statistics.svg`
- Create: `src/assets/icons/navigation/profile.svg`
- Create: `src/assets/textures/paper.webp`

**Interfaces:**
- Consumes: the first embedded PNG visual board from `C:/Users/29798/Downloads/海风小账本-单文件完整交接文档.html`.
- Produces: `AssetKey`, `assetRegistry`, `HandDrawnIcon`, `Card`, `PrimaryButton`, `TextField`, `BottomNavigation`, and `EmptyState`.

- [ ] **Step 1: Install only the pinned dependencies used in this phase**

Run:

```powershell
npm.cmd install '@fontsource-variable/noto-sans-sc@5.2.10'
npm.cmd install -D '@playwright/test@1.61.1'
```

Add scripts:

```json
"test:e2e": "playwright test",
"test:e2e:update": "playwright test --update-snapshots"
```

Do not add Recharts.

- [ ] **Step 2: Extract the immutable visual reference**

Read the first `data:image/png;base64,...` image from `C:/Users/29798/Downloads/海风小账本-单文件完整交接文档.html`, decode it unchanged to `docs/superpowers/specs/assets/seabreeze-ledger-visual-reference.png`, and record the decoded bytes' SHA-256 in `src/assets/ATTRIBUTION.md`. The attribution file must identify the visual board as a user-supplied reference and every production SVG as a project-local redraw; the paper texture entry records that it was generated for this project. The reference PNG is for review only and must never be imported from `src`.

- [ ] **Step 3: Write failing asset and component tests**

Create `src/assets/assets.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { assetRegistry, type AssetKey } from './registry';

const required: AssetKey[] = [
  'brand:shell',
  'illustration:auth-seaside',
  'nav:home',
  'nav:ledger',
  'nav:entry',
  'nav:statistics',
  'nav:profile',
];

describe('minimal visual asset registry', () => {
  it('contains every shell asset as an independent file', () => {
    expect(Object.keys(assetRegistry).sort()).toEqual([...required].sort());
    for (const key of required) expect(assetRegistry[key]).toMatch(/\.(svg|webp)$/);
  });

  it('does not expose the full reference board to production code', () => {
    expect(Object.values(assetRegistry).join('\n')).not.toContain('visual-reference');
  });
});
```

Create component tests that assert semantic icons require a label, decorative illustrations are hidden, buttons expose busy state, inputs connect errors with `aria-describedby`, and navigation targets contain five labels in the locked order.

- [ ] **Step 4: Run tests and verify RED**

Run: `npm.cmd run test:run -- src/assets src/design-system`

Expected: FAIL because the registry and design-system components do not exist.

- [ ] **Step 5: Create the typed registry and asset rules**

Use this exact registry shape:

```ts
import authSeaside from './illustrations/auth-seaside.svg?url';
import shell from './icons/brand/shell.svg?url';
import home from './icons/navigation/home.svg?url';
import ledger from './icons/navigation/ledger.svg?url';
import entry from './icons/navigation/entry.svg?url';
import statistics from './icons/navigation/statistics.svg?url';
import profile from './icons/navigation/profile.svg?url';

export const assetRegistry = {
  'brand:shell': shell,
  'illustration:auth-seaside': authSeaside,
  'nav:home': home,
  'nav:ledger': ledger,
  'nav:entry': entry,
  'nav:statistics': statistics,
  'nav:profile': profile,
} as const;

export type AssetKey = keyof typeof assetRegistry;
```

Create each SVG with a `viewBox`, rounded strokes and project colors. Use 64×64 artboards for icons and a 390×240 artboard for the auth illustration. The auth illustration must independently draw sky, sea, beach, palm leaves and a small sailboat; it must not contain text. Generate a seamless 512×512 low-contrast paper texture with the image-generation skill, convert it to WebP, and visually confirm it contains no copied UI, phone frame, letters or recognizable objects.

- [ ] **Step 6: Implement tokens and components**

Define the locked colors plus spacing, radii, shadow, 44px control height, safe-area padding and numeric typography in `tokens.css`. Import `@fontsource-variable/noto-sans-sc/index.css`, `tokens.css`, and `global.css` once from `src/main.tsx`, in that order.

`HandDrawnIcon` must use this public contract:

```ts
type HandDrawnIconProps =
  | { asset: AssetKey; decorative: true; label?: never }
  | { asset: AssetKey; decorative?: false; label: string };
```

`BottomNavigation` receives items rather than owning application state:

```ts
type NavigationItem = {
  id: string;
  label: string;
  icon: AssetKey;
  active: boolean;
  central?: boolean;
  onActivate(): void;
};
```

- [ ] **Step 7: Add source-level asset validation**

Extend `src/assets/assets.test.tsx` with `import.meta.glob('./**/*.svg', { query: '?raw', import: 'default', eager: true })` and assert every file has `viewBox`, no `<text>`, no `data:image`, and no external `<image href="http...">`. Scan rendered component text for Unicode emoji presentation characters.

- [ ] **Step 8: Verify Task 2 and commit**

Run:

```powershell
npm.cmd run test:run -- src/assets src/design-system
npm.cmd run typecheck
npm.cmd run build
git diff --check
```

Expected: all commands exit 0; the production bundle contains independent hashed assets but not the reference board.

```powershell
git add package.json package-lock.json src/main.tsx src/design-system src/assets docs/superpowers/specs/assets/seabreeze-ledger-visual-reference.png
git commit -m "feat: add seaside UI foundation"
```

---

### Task 3: Build the login, recovery and authentication gate

**Files:**
- Create: `src/features/auth/auth-errors.ts`
- Create: `src/features/auth/AuthPage.tsx`
- Create: `src/features/auth/AuthPage.module.css`
- Create: `src/features/auth/AuthPage.test.tsx`
- Create: `src/app/AuthGate.tsx`
- Create: `src/app/AuthGate.test.tsx`

**Interfaces:**
- Consumes: `AppRuntimeValue`, `PrimaryButton`, `TextField`, `Card`, `HandDrawnIcon`.
- Produces: `mapAuthError(error)`, `AuthPage`, `AuthGateView`, and `AuthGate`.

- [ ] **Step 1: Write failing auth error and form tests**

Create `auth-errors.ts` tests through `AuthPage.test.tsx` with this table:

```ts
it.each([
  [{ code: 'invalid_credentials' }, '邮箱或密码不正确'],
  [{ code: 'email_not_confirmed' }, '邮箱尚未验证'],
  [{ code: 'over_request_rate_limit' }, '操作太频繁，请稍后再试'],
  [new TypeError('Failed to fetch'), '网络连接失败，请稍后重试'],
  [{ code: 'weak_password' }, '密码至少需要 8 个字符'],
  [new Error('server internals'), '操作失败，请稍后重试'],
])('maps auth errors without exposing raw details', (error, message) => {
  expect(mapAuthError(error)).toBe(message);
});
```

Add form tests for login submission, fixed mapped login failure, forgot-password success (`重置邮件已发送，请检查邮箱`), forgot-password failure, eight-character minimum, mismatched confirmation focus, update-password success, mapped update-password failure, disabled busy submission, focus after every mode switch, and absence of a registration link.

- [ ] **Step 2: Run AuthPage tests and verify RED**

Run: `npm.cmd run test:run -- src/features/auth/AuthPage.test.tsx`

Expected: FAIL because the auth UI files do not exist.

- [ ] **Step 3: Implement the error mapper and AuthPage state machine**

Use a closed UI mode:

```ts
export type AuthPageMode = 'login' | 'forgot-password' | 'reset-password';

export type AuthPageCommands = Pick<
  AppRuntimeValue,
  'signIn' | 'requestPasswordReset' | 'updatePassword' | 'finishPasswordRecovery'
>;
```

The component owns only field values, current mode, busy state, field errors and fixed Chinese status text. It must catch `unknown`, pass it through `mapAuthError`, and never render `String(error)`.

Give the decorative seaside illustration wrapper `data-ambient-motion` and a subtle finite-distance floating animation. In the same CSS module, a `prefers-reduced-motion: reduce` rule must set that element's `animation: none` and `transition: none`.

- [ ] **Step 4: Write failing AuthGate branch tests**

Export a pure `AuthGateView({ runtime, children })` for deterministic tests. Cover:

```tsx
it('shows reset password before the authenticated shell during recovery', () => {
  render(
    <AuthGateView runtime={{ ...runtime, session, authReady: true, passwordRecovery: true }}>
      <span>应用框架</span>
    </AuthGateView>,
  );
  expect(screen.getByRole('heading', { name: '设置新密码' })).toBeInTheDocument();
  expect(screen.queryByText('应用框架')).not.toBeInTheDocument();
});

it('shows the first-login offline explanation instead of the shell', () => {
  render(
    <AuthGateView runtime={{ ...runtime, session, authReady: true, initializationMessage: '首次登录需要联网完成初始化' }}>
      <span>应用框架</span>
    </AuthGateView>,
  );
  expect(screen.getByText('首次登录需要联网完成初始化')).toBeInTheDocument();
});
```

Also cover auth-not-ready loading, an expired recovery path with no session, logged-out login, initializing loading, generic initialization failure with retry, and authenticated shell. The expired-link copy is exactly “重置链接无效或已过期”.

- [ ] **Step 5: Implement AuthGate and wire App**

`AuthGate` reads `useAppRuntime()` and renders `AuthGateView`. It accepts `children: ReactNode` as the authenticated shell; Task 3 tests pass a simple test-only child, while production wiring remains unchanged until Task 4 creates `AppShell`.

Implement the branch order explicitly:

```tsx
if (!runtime.authReady) return <BrandedLoadingState label="正在检查登录状态" />;
if (runtime.passwordRecovery && !runtime.session) return <RecoveryLinkError />;
if (runtime.passwordRecovery) return <AuthPage mode="reset-password" commands={runtime} />;
if (!runtime.session) return <AuthPage mode="login" commands={runtime} />;
if (runtime.initializing) return <BrandedLoadingState label="正在准备个人账本" />;
if (runtime.initializationMessage) {
  return <InitializationErrorState message={runtime.initializationMessage} onRetry={runtime.syncNow} />;
}
return <>{children}</>;
```

- [ ] **Step 6: Verify Task 3 and commit**

Run:

```powershell
npm.cmd run test:run -- src/features/auth src/app/AuthGate.test.tsx
npm.cmd run typecheck
git diff --check
```

Expected: all commands exit 0; no test or component contains a signup control or raw backend error.

```powershell
git add src/features/auth src/app/AuthGate.tsx src/app/AuthGate.test.tsx
git commit -m "feat: add branded authentication gate"
```

---

### Task 4: Build the fixed five-tab shell and entry action layer

**Files:**
- Create: `src/app/navigation.ts`
- Create: `src/app/AppShell.tsx`
- Create: `src/app/AppShell.module.css`
- Create: `src/app/AppShell.test.tsx`
- Modify: `src/app/App.tsx`, `src/app/App.test.tsx`

**Interfaces:**
- Consumes: `BottomNavigation`, `EmptyState`, navigation assets.
- Produces: `RegularTabId`, `navigationItems`, `AppShell`, entry dialog state and tab scroll restoration.

- [ ] **Step 1: Write failing navigation model tests**

Use an action union so the center item cannot become a regular page:

```ts
export type RegularTabId = 'home' | 'transactions' | 'statistics' | 'settings';

export type AppNavigationItem =
  | { kind: 'tab'; id: RegularTabId; label: string; icon: AssetKey }
  | { kind: 'entry'; id: 'entry'; label: '记账'; icon: 'nav:entry' };
```

Test that labels are exactly `['首页', '流水', '记账', '统计', '我的']`, IDs are unique, and only the third item has `kind: 'entry'`.

- [ ] **Step 2: Write failing AppShell interaction tests**

Cover initial home state, switching among four regular tabs, active `aria-current="page"`, per-tab scroll restoration, opening the center entry dialog, moving focus into it, closing by its button and Escape, restoring focus to the center button, and returning to the previously active regular tab.

```tsx
it('returns to the originating regular tab after closing entry', async () => {
  const user = userEvent.setup();
  render(<AppShell />);

  await user.click(screen.getByRole('button', { name: '流水' }));
  await user.click(screen.getByRole('button', { name: '记账' }));
  expect(screen.getByRole('dialog', { name: '记账功能建设中' })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '关闭' }));
  expect(screen.getByRole('button', { name: '流水' })).toHaveAttribute('aria-current', 'page');
});
```

- [ ] **Step 3: Run shell tests and verify RED**

Run: `npm.cmd run test:run -- src/app/AppShell.test.tsx`

Expected: FAIL because the navigation model and shell do not exist.

- [ ] **Step 4: Implement navigation and mounted placeholder panels**

Render a compact shell header with the independent shell mark and the product heading `海风小账本`. Keep all four ordinary panels mounted and toggle `hidden` plus `aria-hidden`; this preserves future component state without inventing a router. Maintain `scrollOffsets: Record<RegularTabId, number>`: immediately before changing regular tabs, store `mainRef.current.scrollTop` under the current tab, then restore the destination tab's saved value in a `useLayoutEffect`. Add a test that sets a non-zero home offset, visits 流水, and returns to the same home offset. Each panel uses `EmptyState` with non-financial copy:

- 首页：“首页内容将在下一阶段接入真实账本数据。”
- 流水：“流水列表将在下一阶段接入筛选和明细。”
- 统计：“统计图表将在真实数据接口完成后开放。”
- 我的：“账户、分类和备份设置将在后续阶段开放。”

The entry dialog copy is “记账功能建设中” and must not simulate a successful save.

- [ ] **Step 5: Implement layout, focus and safe-area behavior**

Use a single main scroll region with bottom padding equal to navigation height plus safe area. The central button is visually raised but remains in DOM order between 流水 and 统计. The entry layer uses `role="dialog"`, `aria-modal="true"`, and an accessible name; on open, focus its close button and mark the background shell inert, and on close restore focus to the center button. Render a backdrop and prevent background pointer/keyboard interaction while open.

- [ ] **Step 6: Wire AppShell into App and verify**

Replace `src/app/App.tsx` with:

```tsx
import { AuthGate } from './AuthGate';
import { AppShell } from './AppShell';

export function App() {
  return (
    <AuthGate>
      <AppShell />
    </AuthGate>
  );
}
```

Update `src/app/App.test.tsx` to mock `AuthGate` as a children passthrough, render `App`, and assert the product heading plus all five navigation labels. `AuthGate.test.tsx` remains responsible for runtime branch behavior, so the composition test does not duplicate a provider fake.

Run:

```powershell
npm.cmd run test:run -- src/app/AppShell.test.tsx src/app/AuthGate.test.tsx src/app/App.test.tsx
npm.cmd run typecheck
git diff --check
```

Expected: all commands exit 0; the service-boundary test continues to pass.

- [ ] **Step 7: Commit Task 4**

```powershell
git add src/app/navigation.ts src/app/AppShell.tsx src/app/AppShell.module.css src/app/AppShell.test.tsx src/app/App.tsx src/app/App.test.tsx
git commit -m "feat: add five-tab application shell"
```

---

### Task 5: Add deterministic browser, accessibility and visual gates

**Files:**
- Create: `src/test/e2e-services.ts`
- Create: `src/test/e2e-services.test.ts`
- Modify: `src/main.tsx`
- Modify: `src/design-system/global.css`
- Create: `playwright.config.ts`
- Create: `e2e/auth-shell.spec.ts`
- Create: `e2e/accessibility.spec.ts`
- Create: `e2e/visual.spec.ts`
- Create: `e2e/snapshots/.gitkeep`
- Create: `docs/verification/ui-foundation-auth-shell.md`

**Interfaces:**
- Consumes: `AppProviderServices`, completed AuthGate and AppShell.
- Produces: `parseE2eFixture`, deterministic `logged-out`, `recovery`, and `logged-in` browser fixtures plus viewport and screenshot gates.

- [ ] **Step 1: Write the test-only runtime service factory**

`src/test/e2e-services.ts` exports:

```ts
export type E2eFixtureName = 'logged-out' | 'recovery' | 'logged-in';
export function parseE2eFixture(value: string | null): E2eFixtureName;
export function createE2eServices(fixture: E2eFixtureName): AppProviderServices;
```

`parseE2eFixture` returns `recovery` or `logged-in` only for those exact values and falls back to `logged-out` for `null` or any unknown string. Unit-test that closed mapping so the query string can never select an untyped fixture.

The fake auth service emits exactly one deterministic event after subscription: `INITIAL_SESSION/null`, `PASSWORD_RECOVERY/session`, or `INITIAL_SESSION/session`. The fake repository returns a fixed personal ledger ID for authenticated fixtures, contains no operations or conflicts, and performs no network access. The fake sync engine always reports idle.

Guard usage in `src/main.tsx` with the compile-time condition `import.meta.env.MODE === 'test-e2e'`. Import `AppProviderServices` as a type only. Read `?fixture=` only inside that branch; production mode always uses default services. The fixture test verifies each emitted event/session pair, offline-free repository behavior, and `parseE2eFixture` fallback.

Use a dynamically imported test module so the production build cannot include the fake runtime:

```tsx
async function renderApplication() {
  let services: AppProviderServices | undefined;
  if (import.meta.env.MODE === 'test-e2e') {
    const fixtureModule = await import('./test/e2e-services');
    services = fixtureModule.createE2eServices(
      fixtureModule.parseE2eFixture(new URLSearchParams(location.search).get('fixture')),
    );
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode><AppProviders services={services}><App /></AppProviders></StrictMode>,
  );
}

void renderApplication();
```

- [ ] **Step 2: Create Playwright config**

Install the pinned browser once with `npm.cmd exec playwright install chromium`. Use Chromium, `locale: 'zh-CN'`, `timezoneId: 'Asia/Shanghai'`, `reducedMotion: 'no-preference'` for normal screenshots, and a web server command `npm.cmd run dev -- --mode test-e2e --host 127.0.0.1`. Set both `baseURL` and the web-server readiness URL to `http://127.0.0.1:5173/ledger-pwa/`, set `reuseExistingServer: false`, and set `snapshotPathTemplate` to `{testDir}/snapshots/{testFilePath}/{arg}{ext}`. Normal `test:e2e` must never update snapshots.

- [ ] **Step 3: Write failing browser and accessibility tests**

For 320×568, 390×844 and 430×932:

- Load `?fixture=logged-out` and assert no horizontal overflow.
- Assert email, password, login and forgot-password controls are visible and at least 44px high.
- Load `?fixture=logged-in` and assert five labels in order, the bottom navigation is not obscured, and the center action opens/closes with focus restoration.
- Call `page.emulateMedia({ reducedMotion: 'reduce' })`; for every `[data-ambient-motion]` element assert computed `animationName === 'none'` and `transitionDuration === '0s'`.
- Inspect roles for main, navigation, current page, dialog and labeled icons.

Run: `npm.cmd run test:e2e -- e2e/auth-shell.spec.ts e2e/accessibility.spec.ts`

Expected: FAIL until fixture wiring and any discovered layout/accessibility gaps are complete.

- [ ] **Step 4: Fix only evidence-backed browser gaps**

For each failing assertion, record the exact viewport and failed measurement before changing CSS or semantics. Do not widen screenshot thresholds, hide content with masks, or lower the 44px requirement.

- [ ] **Step 5: Capture deterministic visual baselines**

Capture at 390×844 after `document.fonts.ready`:

- logged-out login page;
- forgot-password state;
- recovery password state loaded from `/ledger-pwa/reset-password?fixture=recovery`;
- logged-in home shell;
- logged-in entry placeholder dialog.

Also capture login and shell at 320×568 and 430×932. In `test-e2e` mode only, set `document.documentElement.dataset.visualTest = 'true'`; define `html[data-visual-test='true'] * { animation: none !important; transition: none !important; caret-color: transparent !important; }` so pixels are deterministic. Compare the 390px login/shell images side by side with the extracted visual board. Run snapshot update only after the user has visually approved the rendered pages.

- [ ] **Step 6: Record acceptance evidence**

In `docs/verification/ui-foundation-auth-shell.md`, record:

- commit SHA and test date;
- unit, typecheck, build and Playwright command results;
- every accepted screenshot path and viewport;
- paper background, sea illustration, shell mark, coral control and five navigation icon checks;
- absence of emoji, raw Supabase errors, horizontal overflow and safe-area overlap;
- any intentional difference from the reference board.

- [ ] **Step 7: Run the complete gate**

Run:

```powershell
npm.cmd run test:run
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:e2e
rg -n "service_role|SUPABASE_SERVICE_ROLE_KEY|eyJ[A-Za-z0-9_-]+\." src
rg -n "\.rpc\(|createClient\(|getSupabaseClient\(" src -g '!src/services/**'
rg -n "test-e2e|logged-out|createE2eServices" dist/assets
git diff --check
```

Expected: tests, typecheck, build and Playwright exit 0; the two security scans and the production-fixture scan return no matches; diff check is clean.

- [ ] **Step 8: Commit Task 5**

```powershell
git add src/main.tsx src/design-system/global.css src/test/e2e-services.ts src/test/e2e-services.test.ts playwright.config.ts e2e docs/verification/ui-foundation-auth-shell.md
git commit -m "test: verify auth shell across iPhone viewports"
```

---

## Phase Completion Gate

Before declaring this phase complete:

1. Request a whole-range code review from the commit before Task 1 through Task 5 HEAD.
2. Fix every Critical and Important issue with regression tests.
3. Re-run the complete gate from Task 5 Step 7.
4. Confirm the worktree is clean and no `.env*.local` file is tracked.
5. Use `superpowers:finishing-a-development-branch` to merge, push, preserve or discard the branch according to the user's choice.
