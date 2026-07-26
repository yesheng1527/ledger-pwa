# Seabreeze reference-system design QA

## Source and test state

- Reference board: `docs/superpowers/specs/assets/2026-07-26-seabreeze-five-page-reference.png`
- Reference dimensions: 1491 × 1055
- Implementation viewport: 390 × 844
- Runtime state: `fixture=logged-in&visual=1`
- Browser: Codex in-app browser
- Pages: 首页、流水、记账、统计、我的

## Comparison artifacts

- `.superpowers/sdd/seabreeze-remake/compare-home-final.png`
- `.superpowers/sdd/seabreeze-remake/compare-transactions.png`
- `.superpowers/sdd/seabreeze-remake/compare-entry.png`
- `.superpowers/sdd/seabreeze-remake/compare-statistics.png`
- `.superpowers/sdd/seabreeze-remake/compare-profile-final-clean.png`

Each comparison is an 800 × 884 side-by-side image containing the reference crop and the rendered implementation at the same 390 × 844 comparison size.

## QA history

1. First pass found undersized home artwork and financial card, an over-dense entry form, vertically stacked statistics summaries, and a profile hierarchy that did not match the source.
2. Second pass corrected the home hero/card rhythm, compact流水 filters and groups, the entry amount/category/detail hierarchy, statistics summary/chart ordering, and the profile hero/budget/settings stack.
3. Final pass added the functional amount-privacy action, aligned entry safe-area and save-button placement, replaced the monthly comparison chart with reference-style tiles, corrected profile row heights, and verified the provided shoreline navigation texture.
4. Post-review pass cleared hidden search filters on close, neutralized spreadsheet formulas in CSV exports, converted both generated hero scenes to responsive WebP assets, and repeated the Home/Profile reference comparisons after compression.

## Final checks

- Reference and implementation reviewed together in the same comparison inputs.
- All five primary navigation targets and their visible core controls were exercised.
- Fresh browser session: no console errors or warnings.
- Responsive checks at 320 × 568 and 430 × 932: every page matched the viewport width without horizontal overflow; the full-screen Save action remained visible.
- Shared focus-visible and reduced-motion rules remain active.
- Unit/component suite: 27 files, 376 tests passed.
- Type check: passed.
- Production build: passed.
- Locked official phase-one visual gate: passed without updating baselines.

final result: passed
