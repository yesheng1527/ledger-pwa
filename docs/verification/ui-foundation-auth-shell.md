# UI foundation and auth shell verification

- User approval date: 2026-07-22
- Approved code-under-test commit: `2614b3a`
- Browser: Playwright Chromium, `zh-CN`, `Asia/Shanghai`
- Approved phone viewports: 320x568, 390x844, and 430x932 CSS pixels

## Gate results

| Command | Result |
| --- | --- |
| `npm.cmd run test:e2e:update` | Exit 0; run exactly once after approval; 22/22 Playwright tests passed and nine missing baselines were written. |
| `npm.cmd run test:e2e` | Exit 0; 22/22 functional, accessibility, reduced-motion, and visual tests passed against the new baselines. |
| `npm.cmd run test:run` | Exit 0; 17/17 test files and 185/185 unit tests passed. |
| `npm.cmd run typecheck` | Exit 0; TypeScript project references compiled without errors. |
| `npm.cmd run build` | Exit 0; Vite 8.1.5 transformed 172 modules and emitted the production bundle. |
| `rg -n "service_role\|SUPABASE_SERVICE_ROLE_KEY\|eyJ[A-Za-z0-9_-]+\\." src` | No matches. |
| `rg -n "\\.rpc\\(\|createClient\\(\|getSupabaseClient\\(" src -g '!src/services/**'` | No matches. |
| `rg -n "test-e2e\|logged-out\|createE2eServices" dist/assets` | No matches. |
| `git ls-files -- '.env*.local'` | No tracked local environment files. |
| `git diff --check` | Exit 0. |

`test:e2e:update` was not run before the user's visual approval and was not run again after creating these baselines.

## Accepted screenshots

All paths are repository-relative and use the approved UI from `2614b3a`.

| Viewport | State | Accepted baseline | SHA-256 |
| --- | --- | --- | --- |
| 320x568 | Login | `e2e/snapshots/visual.spec.ts/320x568-login.png` | `270d83651c3b14451b8f8b534b42f9246e564f835dede62bdfaa5d38be249789` |
| 320x568 | Home shell | `e2e/snapshots/visual.spec.ts/320x568-home.png` | `669bfb8b33434f956776d88517c04900310f669335276282bed1f984c7865097` |
| 390x844 | Login | `e2e/snapshots/visual.spec.ts/390x844-login.png` | `29cf1b90aa121b05b10951ee4d2c5f22b405a8d5b82b807908f3c2a07ea48ea9` |
| 390x844 | Forgot password | `e2e/snapshots/visual.spec.ts/390x844-forgot.png` | `29db070e205f60a03eab8af608105bf7f5d46d5187dd4081cbbdcb822ef243a8` |
| 390x844 | Password recovery | `e2e/snapshots/visual.spec.ts/390x844-recovery.png` | `7758d0a53bbe56e6228cd50f063f8cd0cb499a6f97d75ccdbd1179a2c8f8ac51` |
| 390x844 | Home shell | `e2e/snapshots/visual.spec.ts/390x844-home.png` | `d2bfcc6bbde64a9a918b15bb3bde1ecf3cd265d374cddae8a36b4d2be12883c3` |
| 390x844 | Entry construction dialog | `e2e/snapshots/visual.spec.ts/390x844-entry-dialog.png` | `68ae1f40240dcf3396987f57bef20674eb39664681c1e118e649c6d60a330776` |
| 430x932 | Login | `e2e/snapshots/visual.spec.ts/430x932-login.png` | `6cb666fc0307da30f548e7c72f9f8e57229e8549806333e07be2901801aabf6e` |
| 430x932 | Home shell | `e2e/snapshots/visual.spec.ts/430x932-home.png` | `83b0678b5a47fe0005f7f5a3ec0a5a26ed3f1d0bd49663b8136d98c5a7fdaa84` |

## Accepted visual and interaction checks

- The warm textured paper background fills both authenticated shell and authentication pages without visible seams.
- The seaside artwork is a full-page authentication background with preserved proportions and a soft paper fade; it is not a stretched standalone image or a captured board fragment.
- The shell mark remains readable over the seaside scene and in the authenticated header.
- Coral is reserved for primary controls: the authentication submit action and the prominent center navigation action.
- The five bottom-navigation icons retain the order Home, Transactions, Entry, Statistics, Profile; all five button bottoms are aligned, while the center action remains round and visually prominent.
- Login, forgot-password, and password-recovery cards share the same upper-third placement. At 320x568 the complete login form remains in the first fold and every control remains at least 44px high.
- Dialog focus moves to Close, closing restores focus to Entry, and reduced-motion mode removes ambient animation and transitions.

## Absence checks

- No emoji presentation characters or system emoji placeholders are used in rendered design-system content; unit tests also validate the SVG asset rules and rendered component text.
- Authentication failures are mapped to authored Chinese messages; raw Supabase errors are not rendered to users.
- Logged-out and logged-in browser gates at all three viewports report no horizontal overflow.
- Navigation controls remain within the viewport, share an aligned bottom edge, and use the safe-area bottom token; no navigation or dialog control overlaps the bottom safe area.
- The production bundle contains neither the deterministic test fixture module nor its fixture/runtime strings.
- No `.env*.local` file is tracked, no service-role/JWT-like secret is present in `src`, and Supabase client/RPC access remains inside `src/services`.

## Intentional differences from the original visual board

- Business content panels remain formal placeholders until their real ledger data work is implemented; decorative fake business data was not added.
- The prominent center Entry action opens an accessible construction dialog instead of an unfinished transaction workflow.
- Authentication uses a purpose-built full-page seaside background and upper-third card layout so login, forgot-password, and recovery work responsively; it does not reproduce a board panel literally.
