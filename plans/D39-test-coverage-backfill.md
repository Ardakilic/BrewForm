# D39 — Test Coverage Backfill (Prioritised)

**Severity:** Medium
**Status:** Open (2026-07-04)
**Relationship:** A July 2026 coverage sweep found systematic gaps: several API models with zero tests (including the two that historically held real bugs — vendor held D01's ownership bug, equipment holds D03's raw SQL), and web components shipped by D11 without tests. `utils/sanitize.ts` is intentionally **excluded** here — it is covered by [`D38-security-error-hardening.md`](D38-security-error-hardening.md).

---

## Problem

Bug history correlates directly with the untested surface:

### P2 — highest value (bug-holding or load-bearing)

- `apps/api/src/modules/equipment/model.ts` — **no test**; currently holds D03's raw-SQL `getRecipesUsingEquipment` (and its duplicated count-branch predicates). D03's refactor cannot be done safely without characterisation tests first.
- `apps/api/src/modules/vendor/model.ts` — **no test**; this module held the D01 ownership bug.
- `apps/web/src/components/recipe-list/*` — 8 files (`RecipeListView`, `RecipeCard`, `FilterField`, `ActiveFilterBadge`, `PaginationControls`, `useRecipeFilters`, `constants`, `index`) shipped by D11 **without tests**; they back both `/recipes` and `/recipes/starred`.
- `apps/web/src/components/auth/RequireAuth.tsx` — **no test**; the route guard for every authenticated and admin page.

### P3 — remaining tiers (backfill incrementally)

- API models with no test: badge, bean, comment, follow, photo, preference, qrcode, report, setup.
- API route layers with no `index.test.ts`: preference, bean, setup, report, photo, taste, user, badge, qrcode, vendor.
- API utils without tests: `jobs/cron.ts`, `openapi/index.ts`, `upload/index.ts`, `middleware/requestId.ts`.
- Web pages without tests: all admin pages, auth pages (Forgot/Reset/Verify), `BeanListPage`, `Privacy`/`Terms`, `RecipeComparePage`, `RecipeEditPage`, `SetupListPage`, `NotFoundPage`.
- Web components: `ErrorBoundary`, `OnboardingWizard`, `PhotoUpload`, `RecipeQRCode`, `ScaaRadarChart`, `StarRating`, `StatCards`.
- Web hooks/utils/contexts: `useDebounce`, `utils/recipe-filters.ts`, `utils/sessionId.ts`, `contexts/Auth`/`I18n`/`Theme`.
- Shared schemas untested: bean, comment, follow, photo, setup, vendor (shared `utils/*` are all covered).

---

## Proposed Fix

Backfill in priority order; each tier is a self-contained PR.

### Tier 1 (P2)

1. **`equipment/model.test.ts`**: cover `findMany`/`findManyWithFilters`, `search`, `create`/`update`/`softDelete` (double-delete idempotency per D19's model), `createDeleteRequest`, and — critically — `getRecipesUsingEquipment` in both list and count branches (visibility + `deletedAt` filtering). These become the characterisation net for D03.
2. **`vendor/model.test.ts`**: `create`/`findById`/`search`/`update`/`softDelete`, including `createdBy` persistence (the D01 fix's foundation).
3. **`recipe-list/` component tests** (Vitest + Testing Library): `RecipeCard` renders title/author/badges and links; `FilterField` + `ActiveFilterBadge` render and fire callbacks; `PaginationControls` disables at bounds; `useRecipeFilters` parses/serialises search params; `RecipeListView` renders for `source: 'all'` and `'starred'` with mocked loader data.
4. **`RequireAuth.test.tsx`**: unauthenticated → redirect to login; authenticated → renders children; admin-required routes reject non-admins.

### Tier 2 (P3, API)

5. Model tests for badge/bean/comment/follow/photo/preference/qrcode/report/setup, prioritising soft-delete and ownership paths. Route-layer `index.test.ts` files where module behaviour isn't already locked by service tests.
6. Utils: `upload/index.ts` (filename generation, size/type validation), `middleware/requestId.ts`, `jobs/cron.ts` (schedule registration), `openapi/index.ts` (schema conversion smoke).

### Tier 3 (P3, web + shared)

7. Highest-traffic untested pages first (auth pages, `RecipeEditPage`), then admin pages (coordinate with D40's i18n rewrite of the same files — land i18n first or write tests against `t()` keys), then leaf components/hooks/contexts.
8. Shared schema tests for bean/comment/follow/photo/setup/vendor mirroring the existing `responses/*.test.ts` style.

Follow existing patterns: `apps/api/src/modules/admin/model.test.ts` for DB-backed model tests; `apps/api/src/middleware/bodyLimit.test.ts` for middleware; existing Vitest suites for web.

---

## Files to Change

All new test files, colocated with their subjects (`*.test.ts` / `*.test.tsx`). No production code changes expected; if a test reveals a bug, fix it in a separate commit referencing this plan.

---

## Test Plan

This plan *is* tests. Gates:

- `make test-api` and the web Vitest suite pass with the new files.
- Coverage on Tier-1 targets: line coverage above the project norm for `equipment/model.ts`, `vendor/model.ts`, `components/recipe-list/*`, `RequireAuth.tsx` (no untested exported function remains in those files).
- Tests are deterministic (no reliance on seed-data ordering; DB tests create their own fixtures).

---

## Acceptance Criteria

- [ ] Tier 1 complete: equipment model, vendor model, recipe-list components, and RequireAuth all have dedicated test files.
- [ ] D03 can cite `equipment/model.test.ts` as its regression net.
- [ ] Tier 2/3 tracked as checklist items in the implementing change; each landed tier keeps `make ci` green.
- [ ] No duplicate scope with D38 (`sanitize.ts` stays there).

---

## Effort Estimate

**High overall, but incremental** — Tier 1: ~1–1.5 days. Tier 2: ~1–2 days. Tier 3: ongoing, absorb into feature work touching those files. Tier 1 alone unblocks D03 and is the recommended immediate scope.
