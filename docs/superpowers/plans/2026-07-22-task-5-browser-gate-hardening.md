# Task 5 Browser Gate Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Task 5 browser gates detect real reduced-motion behavior, cover all authentication states and safe-area fallbacks, and prevent visual-baseline bypasses without changing any approved screenshot pixels.

**Architecture:** Keep deterministic fixture selection in the test-e2e bootstrap, but activate the global screenshot freeze only for URLs with `visual=1`. Browser tests exercise computed styles and geometry directly; visual tests always compare against checked-in Playwright snapshots.

**Tech Stack:** React 19, TypeScript 7, CSS modules, Playwright 1.61, Vitest 4, Vite 8.

## Global Constraints

- Do not run `npm.cmd run test:e2e:update`.
- Do not change any approved UI pixels or replace the nine official PNGs.
- Use RED before implementation and record exact commands and failure output.
- Keep 44px minimum controls and the upper-third auth-card placement at 320x568, 390x844, and 430x932.
- Final evidence must distinguish zero-inset Chromium coverage from a real non-zero iPhone safe-area inset.

---

### Task 1: Prove and repair the reduced-motion gate

**Files:**
- Modify: `e2e/accessibility.spec.ts`
- Modify: `src/main.tsx`
- Modify: `src/features/auth/AuthPage.module.css`
- Modify: `e2e/visual.spec.ts`
- Test: `src/test/e2e-services.test.ts`

**Interfaces:**
- Consumes: `fixture` and `visual` URL search parameters in `test-e2e` mode.
- Produces: normal pages with a non-zero harmless background-position transition and screenshot pages with `data-visual-test="true"`.

- [ ] Add a browser assertion that a normal logged-out page has no `data-visual-test`, that its real `[data-ambient-motion]` element has a non-zero transition duration, and that reduced motion changes the duration to `0s` with `animation-name: none`.
- [ ] Run `npm.cmd run test:e2e -- e2e/accessibility.spec.ts --grep "reduced motion"`; expect RED because every current test-e2e page has `data-visual-test` and transition duration `0s`.
- [ ] In `src/main.tsx`, set `document.documentElement.dataset.visualTest = 'true'` only when `new URLSearchParams(location.search).get('visual') === '1'`.
- [ ] Add `transition: background-position 240ms ease` to the auth main page; keep the existing reduced-motion rule and add no continuous animation.
- [ ] Add `visual=1` to every snapshot route in `e2e/visual.spec.ts` and stop mutating the dataset inside the screenshot readiness helper.
- [ ] Run the focused reduced-motion test and `npm.cmd run test:run -- src/test/e2e-services.test.ts`; expect GREEN.

### Task 2: Close geometry, first-fold, and safe-area coverage gaps

**Files:**
- Modify: `e2e/auth-shell.spec.ts`

**Interfaces:**
- Consumes: logged-out, internal forgot-password navigation, recovery fixture, shell main/navigation geometry.
- Produces: regression coverage for three auth states at three viewports and accurate zero-inset safe-area evidence.

- [ ] Expand the upper-third test to measure login, forgot-password, and recovery card tops at every viewport, asserting each top is at most `viewport.height * 0.33`.
- [ ] Change the 320x568 first-fold loop from `controls.slice(1)` to all four controls.
- [ ] Assert the root safe-area token contains `env(safe-area-inset-bottom)`, navigation bottom padding resolves to at least the token fallback, shell main padding reserves navigation plus fallback space, and the main/nav grid regions do not overlap.
- [ ] Run `npm.cmd run test:e2e -- e2e/auth-shell.spec.ts`; expect all new coverage to pass because this task strengthens assertions around already-approved geometry.

### Task 3: Remove the visual comparison bypass

**Files:**
- Modify: `e2e/visual.spec.ts`

**Interfaces:**
- Consumes: the nine checked-in Playwright baselines.
- Produces: an unconditional `expect(page).toHaveScreenshot(filename)` path.

- [ ] Before removal, run one visual test with `E2E_PREVIEW_DIR` set to the existing `package.json` file; expect RED with `EEXIST`, proving the environment variable controls an alternate write path.
- [ ] Remove `E2E_PREVIEW_DIR`, Node path/fs imports, `page.screenshot`, and the early return; always call `expect(page).toHaveScreenshot(filename)` after fonts are ready.
- [ ] Re-run the same command with `E2E_PREVIEW_DIR` still set; expect GREEN because the variable is ignored and the official baseline is compared.

### Task 4: Correct permanent evidence and verify immutable pixels

**Files:**
- Modify: `docs/verification/ui-foundation-auth-shell.md`
- Append ignored evidence: `.superpowers/sdd/task-5-report.md`

**Interfaces:**
- Consumes: computed browser geometry, official snapshot hashes, and approved preview hashes.
- Produces: accurate safe-area and RED/GREEN review evidence.

- [ ] Replace any broad safe-area claim with: the CSS uses the safe-area token and zero-inset Chromium verifies the fallback and no main/navigation overlap; a real non-zero iPhone inset was not simulated.
- [ ] Compute all nine official SHA-256 hashes and compare them with both the verification document and approved previews; require exact matches.
- [ ] Record RED/GREEN commands, key failures, final commands/results, changed files, commit, and unchanged hashes in the Task 5 report.

### Task 5: Run the complete gate and commit

**Files:**
- Verify all files above; do not modify official snapshots.

**Interfaces:**
- Consumes: the hardened tests and unchanged approved UI/baselines.
- Produces: one clean review-hardening commit.

- [ ] Run `npm.cmd run test:e2e -- e2e/auth-shell.spec.ts e2e/accessibility.spec.ts e2e/visual.spec.ts`.
- [ ] Run `npm.cmd run test:run -- src/test/e2e-services.test.ts`, `npm.cmd run typecheck`, `npm.cmd run build`, and normal `npm.cmd run test:e2e`.
- [ ] Run the secret, service-boundary, production-fixture scans and `git diff --check`; require no matches and exit 0 respectively.
- [ ] Confirm all nine official hashes still match the evidence document and approved previews.
- [ ] Commit tracked changes with `test: harden auth shell browser gates`, append the final SHA to the ignored report, and verify a clean worktree.

## Self-review

- Every review item maps to an explicit test or evidence step.
- No task updates snapshots, changes approved visual values, adds continuous animation, or claims a real non-zero safe-area simulation.
- The plan contains no implementation placeholders and uses the existing fixture, CSS token, and Playwright patterns.
