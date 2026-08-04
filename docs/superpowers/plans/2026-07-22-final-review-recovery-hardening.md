# Final Review Recovery Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make password recovery reachable on GitHub Pages, preserve and exit expired recovery attempts correctly, map real Supabase network errors, and close the five related review gaps without changing approved visual baselines.

**Architecture:** New reset emails target the deployed base URL with `?auth=reset`; providers recognize that query while retaining the legacy path. A dedicated no-fallback static server verifies the built artifact independently of Vite history fallback. UI/error fixes stay within the existing AuthService, provider, gate, and AuthPage boundaries.

**Tech Stack:** React 19, TypeScript 7, Supabase JS/Auth JS 2.110.7, Vitest 4, Vite 8, Playwright 1.61, Node HTTP.

## Global Constraints

- Work as the only implementer; do not delegate.
- Use a failing test before each production change and record RED/GREEN output.
- Do not run `test:e2e:update` or modify any of the nine approved PNGs.
- Do not expand initialization retry behavior unless a new test proves a duplicate-submit defect.
- Static recovery smoke tests must use a server with no SPA/history fallback and run on Windows and Linux.

---

### Task 1: Reachable query reset callback and expired-link exit

**Files:**
- Modify: `src/services/auth-service.test.ts`
- Modify: `src/app/providers.test.tsx`
- Modify: `src/app/AuthGate.test.tsx`
- Create: `e2e/static-recovery.spec.ts`
- Create: `playwright.static.config.ts`
- Create: `scripts/build-static-recovery.mjs`
- Create: `scripts/serve-dist.mjs`
- Modify: `package.json`
- Modify after RED: `src/services/auth-service.ts`, `src/app/providers.tsx`, `src/app/AuthGate.tsx`

**Interfaces:**
- `buildPasswordResetRedirect(origin, baseUrl)` produces `<base>/?auth=reset`.
- `isPasswordRecoveryPath(pathname, baseUrl, search)` recognizes query callback and the legacy base-path reset route.
- `RecoveryLinkError` invokes `runtime.finishPasswordRecovery()` from a Return to login action.

- [x] Change service expectations to the root query URL and add `vi.unstubAllEnvs()` cleanup.
- [x] Add provider/gate tests for query detection, `INITIAL_SESSION/null` preservation, expired UI, Return to login URL cleanup, and explicit `SIGNED_OUT` cleanup; retain legacy-path coverage.
- [x] Add the deterministic build runner, exact-file static server, static Playwright config/spec, and `test:e2e:static` npm script. The spec must prove legacy path 404, query root 200, expired UI, and Return to login.
- [x] Run the related units and static gate; expect RED from old path redirect/detection, cleared recovery state, missing action, and ordinary-login built UI.
- [x] Implement only the query redirect, query-aware detection, recovery-state event rule, and Return to login action.
- [x] Re-run related units and static gate; expect GREEN.

### Task 2: Real Supabase network error and own-key mapping

**Files:**
- Modify test first: `src/features/auth/AuthPage.test.tsx`
- Modify after RED: `src/features/auth/auth-errors.ts`

**Interfaces:**
- Consumes `AuthRetryableFetchError`/`isAuthRetryableFetchError` exported by installed `@supabase/supabase-js`.
- Produces only authored Chinese strings from `mapAuthError(error): string`.

- [x] Replace the synthetic fetch TypeError case with a real `new AuthRetryableFetchError('network down', 0)` and add inherited `toString` code coverage requiring the generic string.
- [x] Run the focused error tests; expect RED because retryable fetch errors currently map generically and inherited keys can return a function.
- [x] Use the official retryable-fetch type guard and `Object.hasOwn` before indexing the message table; retain TypeError compatibility.
- [x] Re-run the focused tests; expect GREEN.

### Task 3: Cross-field reset validation and dynamic viewport source gate

**Files:**
- Modify test first: `src/features/auth/AuthPage.test.tsx`
- Modify after RED: `src/features/auth/AuthPage.tsx`, `src/features/auth/AuthPage.module.css`

**Interfaces:**
- Password-field edits clear stale confirmation mismatch feedback.
- `.page` declares `min-height: 100vh` followed immediately by `min-height: 100dvh`.

- [x] Add a parameterized mismatch-edit test for both password fields and a raw-CSS assertion for ordered `100vh`/`100dvh` declarations.
- [x] Run the focused tests; expect RED for editing the new-password field and missing `100dvh`.
- [x] Let field feedback clearing accept multiple related fields; clear confirmation mismatch when either password changes. Add only the `100dvh` override after `100vh`.
- [x] Re-run focused tests and normal visual comparisons; expect GREEN with unchanged pixels.

### Task 4: Evidence, complete gates, and commits

**Files:**
- Modify: `docs/verification/ui-foundation-auth-shell.md`
- Create/append ignored report: `.superpowers/sdd/final-review-fix-report.md`

**Interfaces:**
- Permanent evidence distinguishes approved visual SHA `2614b3a`, Task 5 hardening SHA `ded8cd8`, and the verified implementation SHA.
- The ignored report records final branch HEAD after evidence commit.

- [x] Run related units, `npm.cmd run test:e2e:static`, full unit, typecheck, build, normal E2E, all scans, and diff check.
- [x] Compare all nine official hashes with existing documentation and approved previews; require exact equality and unchanged Git status.
- [x] Commit implementation/tests first, update permanent evidence with that verified implementation SHA, then create a small evidence commit so the tracked document does not attempt impossible self-referential SHA storage.
- [x] Record both commits and the actual final HEAD in the ignored report; verify a clean worktree and return DONE.

## Self-review

- All three Important and all five Minor findings map to a test or evidence step.
- The static gate explicitly proves no history fallback by returning 404 for the legacy nested path.
- The plan uses the installed Supabase class/type guard rather than matching messages.
- No task changes screenshot routes, official PNGs, or the downgraded initialization retry behavior.
