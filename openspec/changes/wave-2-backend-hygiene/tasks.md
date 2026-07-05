## 1. D39 Tier 1 — `apps/api/src/modules/equipment/model.test.ts` (regression net for D03 — LAND FIRST)

- [x] 1.1 Create `apps/api/src/modules/equipment/model.test.ts` with the header and imports:
- [x] 1.2 Add `describe('findById', { sanitizeOps: false, sanitizeResources: false }, () => { ... })`:
- [x] 1.3 Add `describe('findMany', ...)` — the LOW-LEVEL `findMany(where, page, perPage)` (distinct from `findManyWithFilters`):
- [x] 1.4 Add `describe('findManyWithFilters', ...)` — the HIGHER-LEVEL function taking `{ type?, search?, page, perPage }`:
- [x] 1.5 Add `describe('search', ...)`:
- [x] 1.6 Add `describe('create', ...)`:
- [x] 1.7 Add `describe('update', ...)`:
- [x] 1.8 Add `describe('softDelete', ...)` — the D19 three-`it` pattern:
- [x] 1.9 Add `describe('createDeleteRequest', ...)`:
- [x] 1.10 Add `describe('getRecipesUsingEquipment', ...)` — THE D03 regression net:
- [x] 1.11 Run `make test-specific filter=apps/api/src/modules/equipment/model.test.ts` — all `describe` blocks MUST pass against the pre-refactor (raw-SQL) code. This is the baseline. If any test fails, fix the test (not the code) — the test must match current behaviour. **Verify all 9 exported functions are covered** (D39 acceptance criterion: "no untested exported function remains").

## 2. D39 Tier 1 — `apps/api/src/modules/vendor/model.test.ts`

- [x] 2.1 Create `apps/api/src/modules/vendor/model.test.ts` with the same header pattern as 1.1 but importing `vendors` instead of `equipment`:
- [x] 2.2 Add `describe('findById', ...)` — active, soft-deleted-returns-null, non-existent-returns-null. Fixture: user + vendor (`db.insert(vendors).values({ id, name: 'Test Roaster', createdBy: userId })`).
- [x] 2.3 Add `describe('findMany', ...)` — paginated with total; excludes soft-deleted (insert 3 vendors, one soft-deleted, assert 2 returned). **Assert on `result.vendors` (NOT `result.items`)** — `vendor/model.ts:32` returns `{ vendors: data, total }`, distinct from equipment's `{ items, total }`.
- [x] 2.4 Add `describe('search', ...)` — LIKE match on **name only** (`vendor/model.ts:38` uses `like(vendors.name, ...)` — vendors have no brand/model columns, unlike equipment). Excludes soft-deleted.
- [x] 2.5 Add `describe('create', ...)` — inserts with `createdBy` and returns the row; assert `createdBy === userId`.
- [x] 2.6 Add `describe('update', ...)`:
- [x] 2.7 Add `describe('softDelete', ...)` — D19 three-`it` pattern (active, already-deleted-returns-null, no-timestamp-overwrite).
- [x] 2.8 Run `make test-specific filter=apps/api/src/modules/vendor/model.test.ts` — all pass.

## 3. D39 Tier 1 — Web component tests (`recipe-list/*`)

- [x] 3.1 Create `apps/web/src/components/recipe-list/FilterField.test.tsx` (simplest — no router):
- [x] 3.2 Create `ActiveFilterBadge.test.tsx` — render with `{ label: 'Method', value: 'V60', onRemove: vi.fn() }`, assert label + value rendered, assert the ✕ button has `aria-label="Remove Method filter"`, click ✕ (via `userEvent.setup()`), assert `onRemove` called.
- [x] 3.3 Create `PaginationControls.test.tsx` — test the 6 cases from the spec (Previous hidden on page 1, Next hidden on last page, click Previous calls `onPageChange(page-1)`, click Next calls `onPageChange(page+1)`, `pageLabel` `{page}`/`{total}` substitution, labels rendered verbatim). No router needed (pure props component).
- [x] 3.4 Create `RecipeCard.test.tsx` — render via `createMemoryRouter` + `RouterProvider` (component uses `useNavigate`). Mock the logger via `vi.hoisted`. Test: title rendered and links to `/recipes/${slug}`; author button `stopPropagation` (click the button, assert `navigate` called with `/u/${username}` — can spy on `useNavigate` or assert the rendered `href`); `currentVersion.brewMethod`/`drinkType`/`rating` rendered; `likeCount`/`commentCount`/`forkCount` rendered; missing author → "unknown"; missing `currentVersion` → optional fields absent.
- [x] 3.5 Create `useRecipeFilters.test.tsx` — test the hook via a `TestConsumer` component:
- [x] 3.6 Create `RecipeListView.test.tsx` — render via `createMemoryRouter` + `RouterProvider`. Mock `useTranslation` (or wrap in `I18nProvider`). Test: renders `RecipeCard`s for each recipe in `recipesResponse.data`; loading state (`source: 'all'` → skeleton, `source: 'starred'` → text); empty state when `data: []`; `hasActiveFilters` shows Clear button (pass active filter props); admin visibility filter only when `showAdminVisibilityFilter: true`; pagination hidden when `total <= 12`.
- [x] 3.7 Run `make test-web` — all new web tests pass AND zero pre-existing web tests regress. To iterate on a single file: `deno task --cwd apps/web test src/components/recipe-list/RecipeCard.test.tsx`.

## 4. D39 Tier 1 — `RequireAuth.test.tsx`

- [x] 4.1 Create `apps/web/src/components/auth/RequireAuth.test.tsx`:
- [x] 4.2 Run `make test-web` — `RequireAuth.test.tsx` passes, zero regressions.

## 5. D03 — Rewrite `getRecipesUsingEquipment` with Drizzle `exists()`

- [x] 5.1 Open `apps/api/src/modules/equipment/model.ts`. Add `exists` to the `drizzle-orm` import on L9:
- [x] 5.2 Rewrite `getRecipesUsingEquipment` (L106-142). Extract the shared conditions and replace the raw SQL data branch with `exists()`. The exact rewritten function (per design Decision 1):
- [x] 5.3 Run `make check-api` — must pass with zero type errors (the `exists()` subquery is fully typed).
- [x] 5.4 **Critical verification:** run `make test-specific filter=apps/api/src/modules/equipment/model.test.ts` — the `getRecipesUsingEquipment` tests (written in task 1.9 against the pre-refactor code) MUST pass UNCHANGED against the refactored query. This is the query-equivalence verification. If any test fails, the `exists()` rewrite is not equivalent — debug the SQL difference (check `EXPLAIN ANALYZE` on both if needed) and adjust.

## 6. D34 — Add `z.infer<>` type exports to shared schemas

- [x] 6.1 Open `packages/shared/src/schemas/bean.ts`. Add after the schema definitions:
- [x] 6.2 Open `packages/shared/src/schemas/setup.ts`. Add:
- [x] 6.3 Open `packages/shared/src/schemas/vendor.ts`. Add:
- [x] 6.4 Open `packages/shared/src/schemas/equipment.ts`. Add:
- [x] 6.5 (Optional) Add `// @ts-expect-error` type-rejection tests to `packages/shared/src/schemas/bean.test.ts` and `setup.test.ts` (create if they don't exist — D39 Tier 3 lists them as backfill, but since D34 adds the exports, a co-located type-rejection test confirms the type is restrictive):
- [x] 6.6 Run `make check` (type-checks all workspaces including shared) and `make test-shared` — must pass. The new type exports are additive (no runtime change).

## 7. D34 — Eliminate P2 `any` locations (preference, bean, setup)

- [x] 7.1 Open `apps/api/src/modules/preference/service.ts`. Change L26:
- [x] 7.2 Open `apps/api/src/modules/preference/index.ts`. Change L85:
- [x] 7.3 Open `apps/api/src/modules/bean/service.ts`. Change L34 and L47:
- [x] 7.4 Open `apps/api/src/modules/setup/service.ts`. Change L38:
- [x] 7.5 Run `make check-api` — must pass with zero type errors.

## 8. D34 — Eliminate P2 `any` locations (taste, recipe, badge, notify)

- [x] 8.1 Open `apps/api/src/modules/taste/model.ts`. Add the `TasteNoteNode` interface after the imports (around L5) and type `nodeMap` and `roots`:
- [x] 8.2 Open `apps/api/src/modules/recipe/model.ts`. Remove the `: any` annotations at L466 and L473:
- [x] 8.3 Open `apps/api/src/modules/badge/model.ts`. Add the `BadgeRule` import and type `checks`:
- [x] 8.4 Open `apps/api/src/utils/notify/index.ts`. Add the `NotifyRecipient` interface after the imports and type `loadRecipient`'s return + the L199 filter:
- [x] 8.5 Run `make check-api` — must pass. Run `make lint` — must pass with no new suppressions.
- [x] 8.6 **Grep gate:** run `grep -rn ": any\|as any\|any\[\]" apps/api/src/modules/preference apps/api/src/modules/bean apps/api/src/modules/setup apps/api/src/modules/taste apps/api/src/modules/recipe/model.ts apps/api/src/modules/badge apps/api/src/utils/notify` — zero hits (stretch files in `utils/openapi`, `auth/jwt`, `middleware/errorHandler` are excluded until the P3 stretch).

## 9. D34 P3 stretch — Library-boundary casts (optional)

- [x] 9.1 Open `apps/api/src/utils/openapi/index.ts`. Add a one-line justification comment above the `as any` at L28:
- [x] 9.2 Open `apps/api/src/modules/auth/jwt.ts`. Simplify the casts at L79, L97, L98:
- [x] 9.3 Open `apps/api/src/middleware/errorHandler.ts`. Replace the `as unknown as` casts at L23, L53 with type guards:
- [x] 9.4 Open `apps/api/src/modules/equipment/service.ts`. If the `CacheProvider` interface (`apps/api/src/utils/cache/...`) can be made generic or accept `unknown` without breaking other callers, do it and remove the `eq as unknown as Record<string, unknown>` cast at L42. Otherwise, add a one-line justification comment.
- [x] 9.5 Run `make check-api`, `make lint` — must pass.

## 10. Final verification

- [x] 10.1 Run `make fmt` — applies `deno fmt` to all changed files (lineWidth 100, indentWidth 2, singleQuote, semiColons). CI enforces `deno fmt --check` — this MUST be run before commit/PR.

- [x] 10.2 Run `make check` — zero type errors across all workspaces (api, web, db, shared).

- [x] 10.3 Run `make lint` — zero warnings on all changed files:
  - `apps/api/src/modules/equipment/model.ts`
  - `apps/api/src/modules/equipment/model.test.ts`
  - `apps/api/src/modules/vendor/model.test.ts`
  - `apps/web/src/components/recipe-list/*.test.tsx` (6 files)
  - `apps/web/src/components/auth/RequireAuth.test.tsx`
  - `apps/api/src/modules/preference/service.ts`, `preference/index.ts`
  - `apps/api/src/modules/bean/service.ts`, `setup/service.ts`
  - `apps/api/src/modules/taste/model.ts`, `recipe/model.ts`, `badge/model.ts`
  - `apps/api/src/utils/notify/index.ts`
  - `packages/shared/src/schemas/bean.ts`, `setup.ts`, `vendor.ts`, `equipment.ts`
  - Stretch: `apps/api/src/utils/openapi/index.ts`, `auth/jwt.ts`, `middleware/errorHandler.ts`, `equipment/service.ts`

- [x] 10.4 Run `make test` — all tests pass, including:
  - The new equipment model tests (D39 Tier 1 + D03 regression net).
  - The new vendor model tests (D39 Tier 1).
  - The new web component tests (`recipe-list/*`, `RequireAuth`).
  - Zero regressions in all pre-existing tests.
  - The OpenAPI coverage test (`apps/api/src/routes/openapi.coverage.test.ts`) — unaffected (no routes changed).

- [x] 10.5 Update the `Status` banner in `plans/D03-raw-sql-drizzle.md`, `plans/D34-residual-any-elimination.md`, and `plans/D39-test-coverage-backfill.md` to `Resolved (2026-07-05)` and tick the Wave 2 checkboxes in `plans/ROADMAP.md`. Update the `TECHNICAL_DEBT.md` ledger rows for D03, D34, and D39 (mark D39 Tier 1 complete; Tier 2/3 remain open).

- [x] 10.6 (Optional) Create `pr_description.md` at the project root summarising the three sub-changes (D39 Tier 1, D03, D34), following the Wave 1 PR-description format: `## Problem`, `## Solution` (table), `## What did NOT change`, `## Testing`, `## Risk`.

- [ ] 10.7 Archive the change via `openspec archive wave-2-backend-hygiene` (after the PR merges) and sync the delta specs into `openspec/specs/`.