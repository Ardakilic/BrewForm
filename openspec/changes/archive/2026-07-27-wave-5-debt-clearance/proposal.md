# Wave 5 — Debt Clearance (2026-07-19 audit)

## Why

The 2026-07-13 plans audit closed the D-series ledger and shipped F01/F04, leaving `D99-debts.md` as
the open deferred ledger. A 15-agent re-verification on 2026-07-19 confirmed **all seven open D99
items remain open** (D99.1, .3, .5, .6, .7, .8, .9 — item-by-item evidence below) and surfaced **new
P1 regressions the ledger does not track**:

- **`deno task test:db` is broken** by a TS2352 type error — and because the root `test` and `ci`
  tasks compose it, the advertised full-suite entry points fail before running a single test.
- **Four "mock-mirror" test files never import production code** (`admin/service.test.ts`,
  `admin/index.test.ts`, `equipment/service.test.ts`, `photo/service.test.ts`): they re-implement
  the module inline and test the copy. The admin module alone carries **1,349 uncovered lines**
  behind green tests.
- **Coverage reality vs the 85% target:** the deno scope (apps/api/src + packages/shared/src)
  measures **72.21% lines** (shared is clean at 99.42%; apps/api is the entire gap at 65.38%).
  apps/web reports 75.31% but is **inflated** — Vitest 4 counts only loaded files, and 14 production
  files (1,093 physical lines, incl. `router.tsx`, all 3 collection pages, and 4 route-action files)
  are invisible; the honest estimate is ~64–68%. No coverage threshold gate exists anywhere (CI only
  uploads an artifact), and no local task provisions the `brewform_test` DB that 129 API tests
  require.
- **Frontend DRY/consistency drift:** 3 pages hand-roll recipe cards instead of using the shared
  `recipe-list/RecipeCard`; the collections section uses a divergent page shell; error-state UI
  diverges 4 ways with an undefined `--error-bg` breaking dark/coffee themes; zero toast
  infrastructure; 9 `globalThis.confirm` sites and 3 hand-rolled modal shells; no
  EmptyState/LoadingState primitives across 19+18 sites.
- **Type-safety/lint regressions:** `deno.json` `rules.exclude` still disables `no-explicit-any` (7
  prod + 119 test diagnostics), `require-await` (44 prod), and `no-empty` (14 prod — all silent
  `catch {}` on user mutations, the D17 failure class); ~40 test files carry no-op file-level
  directives; `taste/service.ts` carries 3 undocumented `any`; RecipeComparePage/RecipeFocusModePage
  hide 10 `any` behind 8 justification-free line ignores.
- **Smaller hygiene debts:** 5 stray `sql` tags outside the accepted-exception registry; 196 missing
  docblocks (nearly all const/type exports); 15 safe dependency bumps pending plus a Deno-version
  drift between local (2.9.2), latest (2.9.3), and CI pins (v2.9.0); AGENTS.md:50 middleware-order
  doc stale vs `main.ts:41-76`.

Wave 5 clears all of it in eleven tracks (T1–T11), with a short explicitly-deferred list. The full
audit inventories are preserved in `./audit/` so the change is executable from a fresh context.

## What Changes

**T1 — Correctness & CI health (first, everything downstream depends on green pipelines):**

- Fix the TS2352 breaking `deno task test:db` — this un-breaks the root `test` and `ci` tasks.
- **D99.9 — comment authz gate.** `createComment` (`comment/service.ts:48-110`) performs no recipe
  visibility/existence check for top-level comments (only the reply branch queries the recipe, and
  only for the author-id rule); commenting on a nonexistent recipe hits an FK error instead of a
  clean 404. `listComments` (`service.ts:187-189`) and its auth-less route
  (`comment/index.ts:123-157`) are equally ungated — anyone can read all comments on a private/draft
  recipe by UUID. The F04 mention side-effect (`service.ts:100-105`) then loads title/slug
  (`comment/model.ts:144-155`) and forwards them to mentioned users in-app and by email — a
  disclosure vector. Fix: gate **both create and list** with the recipe-visibility check, returning
  404 (existence-hiding, matching the GET-surface convention at `recipe/index.ts:251/283/318` and
  `share.ts:76`). Mention side-effects stay behind creation, so gating creation closes the leak.
- Rewrite the 4 mock-mirror test files against the real modules (real imports, scratch DB),
  following the `equipment/model.test.ts` + `bodyLimit.test.ts` patterns.

**T2 — Collections completion (D99.1 + D99.5 + D99.6 + D99.3):**

- **D99.1 — cache.** The collection module has zero cache involvement; `getCollection` re-runs the
  4-level multi-join (`collection/model.ts:9-33`) on every GET. Wire the singleton-import pattern
  (as `equipment/service.ts` — note: `taste`'s "DI" is also singleton-fed via `taste/index.ts:21`;
  `c.get('cache')` is read nowhere). Detail key `['collection-detail', id]` TTL 10m with the
  `service.ts:157-162` visibility re-check replayed on cached hits; list prefix
  `['cache','collections']` TTL 5m with a recipeId-aware key (or cache bypass when
  `listMyCollections`' `recipeId` param is set). The mutation surface is **six** functions, not
  five: `createCollection` (:97) invalidates the list prefix only (fresh UUID); the other five
  (:114, :136, :255, :297, :319) invalidate detail key + list prefix.
- **D99.5 — US-9 read path.** `getCollectionsForRecipe` (`model.ts:287`) is model-only with zero
  production consumers (no service fn, no route, no web API, no page section). Add a
  visibility-filtered service passthrough + route (or loader-fold into the recipe detail loader at
  `RecipeDetailPage.tsx:57-80`) + an "In collections" section on RecipeDetailPage. The model fn
  hard-codes `visibility='public'` (`model.ts:304`); the filter policy is "public + viewer's own
  collections of any visibility" (listing unlisted collections would leak them — see design.md).
- **D99.6 — page tests.** `CollectionCreatePage`, `CollectionEditPage`, `CollectionListPage` have no
  tests AND are invisible to Vitest coverage. Add the three page tests following the
  `CollectionDetailPage.test.tsx` pattern.
- **D99.3 — seed sortOrder.** `seedCollections` (`packages/db/src/seed.ts:826-925`) increments one
  function-scoped counter across all collections of all users (`sortOrder: collectionSortOrder++` at
  :918) — make it per-collection (0..n-1). Note: inserts are `onConflictDoNothing`, so the fix only
  manifests on a fresh DB; add a seed-test assertion.

**T3 — Frontend DRY (primitives-first — extract shared blocks pages compose; no generic pages):**

- **RecipeCard adoption.** 3 pages hand-roll recipe cards (`UserProfilePage:226-243`,
  `EquipmentDetailPage:162-181`, `CoffeeVarietyDetailPage:209-243`) vs the shared
  `components/recipe-list/RecipeCard.tsx`. Extend RecipeCard with optional
  `hideAuthor`/`forkCount`/version-strip props and i18n the hardcoded English `'by '`
  (`RecipeCard.tsx:28`); adopt in the 3 offender pages; delete the stale leftover
  `components/recipe/RecipeCard.styles.ts`.
- **CollectionCard adoption** in `UserProfilePage:253-269` (hand-rolled collection card).
- **PaginationControls adoption** — the shared component is cloned inline in 4–5 pages.
- **Toast + ConfirmDialog primitives** (house-built, dependency-free — see design.md Decision 2);
  migrate the 9 `globalThis.confirm` sites and 3 hand-rolled modal shells.
- **EmptyState/LoadingState primitives** + adoption (19 empty-state and 18 loading-state sites).
- **Visibility-emoji helper** (mapping duplicated ×3).
- **Field/FilterField consolidation** + adoption of the ~45 raw label blocks in 13 files.
- **Catalog/CRUD shared blocks:** `CoffeeVarietiesPage`/`EquipmentCatalogPage` are near-clone
  catalogs (8 duplicated blocks each); `BeanListPage`/`EquipmentListPage`/`SetupListPage` are CRUD
  triplets — extract the shared blocks (header row, filter bar, grid, pagination) as composable
  pieces, keeping each page's own composition.
- **Author-button/accent-pill/breadcrumb-shell dedup** per `audit/frontend-duplication.md`.

**T4 — Visual consistency:**

- **Page-shell normalization:** collections' 5 pages use `container mx-auto px-4` vs the house
  `mx-auto max-w-* px-6 py-8` shell (visibly wider, different gutters) — normalize collections
  first, then sweep.
- **Themed ErrorState component** replacing the 4 divergent error-UI styles; fix the undefined
  `--error-bg` var whose `#fef2f2` fallback breaks dark/coffee themes.
- **Accent buttons → `.btn-primary`** (hand-rolled variants hardcode white text while `.btn-primary`
  uses `var(--bg-primary)`); add a `.btn-danger` class to `globals.css`.
- **Locale-aware date/number formatter util** — 8 `toLocaleDateString` sites ignore the app locale,
  and `BeanSection` renders raw ISO dates on the same recipe page.
- **Single i18n'd BreadcrumbNav** (3 implementations today; the shared one shows untranslated
  'Recipes').
- **Loading-state normalization** (Skeleton vs centered text vs left text vs raw `animate-pulse`,
  including within RecipeListView itself) and **h1 scale normalization**.
- **Form normalization:** Field/Section are used by only 2 of ~12 forms — adopt across ~10 more, add
  `htmlFor` label association and field-level errors (currently only auth pages / admin forms
  respectively).

**T5 — i18n completion (D99.7):**

- All ledger-cited literals confirmed (12/14 at the exact cited line; 2 misattributed — the real
  literals are `useCoffeeVarietyFilter.tsx:172` aria-label and `RecipeNotAvailablePage.tsx:14` SEO
  title, plus `BreadcrumbNav.tsx:32`). A fresh sweep found **~25 additional files**: three fully
  untranslated components (EmailVerificationBanner, PhotoUpload, RecipeQRCode), StarRating's
  hardcoded English pluralization, ErrorBoundary and auth-page error fallbacks, 2 SEO titles + 1
  description, 3 literal placeholders, ~20 literal aria-labels, 8 template-string aria-labels with
  English scaffolding, and 3 list pages concatenating `t(key)+'?'` instead of dedicated
  deleteConfirm keys. All via `t()` with en+tr keys — the existing flat-key parity PBT
  (`packages/shared/src/i18n/i18n.test.ts`) makes missing-tr keys fail CI, so the workflow is safe.
- Includes T3's `RecipeCard` `'by '` and T4's BreadcrumbNav 'Recipes'.

**T6 — Type-safety & lint re-enable (config flip LAST):**

- Fix all 14 `no-empty` prod violations — silent `catch {}` on user mutations get toast feedback
  (depends on T3's Toast primitive) or an explicit justified comment.
- Fix 44 `require-await` prod violations; 7 prod `no-explicit-any` incl. `taste/service.ts`'s 3
  undocumented `any`; RecipeComparePage/RecipeFocusModePage's 10 `any` + 8 justification-free line
  ignores; `api/client.ts:72`'s last `Record<string, unknown>` (the D42 off-by-one); ~10 pages
  casting bodies/responses to `Record`.
- Test-file `any` (119 diagnostics): typed fix where trivial, else line-level ignore WITH a
  justification comment; remove the ~40 no-op file-level test directives.
- **Then** remove `no-explicit-any`, `require-await`, `no-empty` from `deno.json` `rules.exclude` —
  the flip is last so lint stays green at every intermediate commit.

**T7 — Backend hygiene (stray sql tags):**

- 5 stray sites → Drizzle helpers: `coffee-variety/model.ts:46` `count(*)` → `count()`;
  `collection/model.ts:219` `max()` → `max()`; `badge/model.ts:78` `coalesce(max())`;
  `seed.ts:93/404/697` `is null` → `isNull()`. `recipe/model.ts:830` (not-featured toggle): rewrite
  with `not()` if clean, else document as an accepted atomic-toggle exception in the lint-style
  raw-SQL registry.
- Accepted exceptions verified intact and untouched: health `SELECT 1`, equipment correlated EXISTS
  (NOTE at `equipment/model.ts:116-124`), atomic ±1 counters, `count(distinct)`, schema `check()`
  constraints.

**T8 — Coverage ≥85% + gates (after T1–T7 land):**

- Local test-DB provisioning make target mirroring `.github/workflows/pr.yml:63-113` (129 API tests
  currently fail without a hand-provisioned `brewform_test`).
- Admin real tests (+~1,200 covered lines → ~80.4%), recipe module backfill (+~550 → ~84.2%), new
  `auth/model.test.ts` + auth backfill (+~250 → ~85.9%) — the measured path to ≥85% lines on the
  deno scope.
- Web: fix Vitest coverage to include untested files (the 14 invisible prod files) and set
  thresholds at the honest baseline, then ratchet.
- Coverage gate: `deno coverage` has no built-in threshold — add a small parsing script
  (`scripts/coverage-gate.ts`) + CI wiring; Vitest thresholds for web.
- Fix the cross-suite pollution making `seed-idempotency` fail after the API suite.
- Blanket rule: every T1–T7 change ships with tests.

**T9 — Docblocks (D-style completion):**

- Eliminate all 196 missing docblocks per `audit/docblock-inventory.md`, following the captured
  house style: `packages/db/src/schema.ts` 43 (13 pgEnums + 28 pgTables), shared 49 `z.infer`
  aliases + 21 constants, 22 Hono router consts, ~14 log/deps singletons, and the sole undocumented
  true function repo-wide: `seed.ts:927 main()`. Blanket rule for new code.

**T10 — Dependencies (gated TS7 section LAST):**

- Safe batch via `deno update --latest`: hono 4.12.30, hono-openapi 1.3.1, @hono/standard-validator
  0.2.3, @std/expect 1.0.20, vitest+coverage 4.1.10, vite 8.1.5, tailwind 4.3.3, nodemailer 9.0.3,
  fast-check 4.9.0, mjml 5.4.0 (+ re-run email build), react-router 8.2.0, @hono/zod-validator 0.9.0
  (out-of-range but verified type-only).
- Deno 2.9.2→2.9.3 locally AND sync the CI `deno-version` pins (currently v2.9.0 — drifted) in
  pr.yml/ci.yml and the five `denoland/deno:debian-2.9.0` Docker base-image tags; dedupe the
  twice-pinned drizzle-kit.
- Renovate: add customManagers for the `deno.json` catalog pins and the CI `deno-version` input;
  document the jsr-in-package.json blind spot.
- Skip: @hono/standard-validator 0.3.0 (hono-openapi peer still pins ^0.2.0) and @opencode-ai/plugin
  (local tooling, outside workspace).
- **Gated final section — TypeScript 6.0.3→7.0.2 (tsgo, MAJOR):** branch-verify
  `deno run -A npm:typescript/tsc` under TS7 (flag support: `--noEmit`, `-p`, `ignoreDeprecations`),
  diff diagnostics vs 6.0.3 on apps/web, document the compiler skew vs Deno-bundled TS 6.0.3; bump
  only on parity, with an explicit fallback task to defer + ledger if verification fails (design.md
  Decision 1).

**T11 — Docs:**

- Fix AGENTS.md:50's stale middleware-order description to match `main.ts:41-76` (cors → requestId →
  secureHeaders → rateLimit → bodyLimit → cache-injection → crawler → onError → optional /uploads
  handler → routes). Ledger updates happen separately, before the change lands.

**DEFERRED (ledger-only, NOT in wave 5):**

- **D99.8 cursor sargability** — scale-time work; ~20-row table, planner correctly seq-scans, the
  rewrite needs a raw-SQL row-value exception. Stays deferred until cardinality demands it.
- **D99.17 architecture deviations** — recipe `index.ts` imports the model directly (bypasses the
  service layer) and the contact module deviates from 3-layer; both work correctly and the refactor
  risk outweighs wave-5 value.
- **D99.18 test-file naming split** (`*_test.ts` vs `*.test.ts`) — pure churn, no behaviour.
- **Generic CrudListPage/CatalogPage components** — explicitly rejected (design.md Decision 4).

## Capabilities

### New Capabilities

- **comment-authz**: T1's visibility gate on the comment surface — create and list SHALL check
  recipe visibility with the 404 existence-hiding convention; mention/notification side-effects fire
  only after the gate passes. References the recipe-visibility rules inlined at
  `recipe/index.ts:281-284/316-319`.

- **code-documentation**: T9's docblock contract — every exported symbol (functions, components,
  hooks, classes, consts, type aliases, pgEnums/pgTables, router consts) SHALL carry a JSDoc
  docblock in the house style captured in `audit/docblock-inventory.md`; codifies the blanket rule
  for new code.

### Modified Capabilities

- **recipe-collections**: T2 completes the F01 deferrals — collection read caching (detail key +
  list prefix, six-mutation invalidation matrix, visibility re-check on cached hits), the US-9
  "collections containing this recipe" read path (service passthrough + route/loader +
  RecipeDetailPage section), per-collection seed `sortOrder`, and tests for the 3 untested
  collection pages.

- **web-shared-components**: T3/T4 extend the shared-component contract — RecipeCard as the single
  recipe-card rendering (with the new optional props), CollectionCard/PaginationControls adoption,
  new Toast/ConfirmDialog/EmptyState/LoadingState/ErrorState primitives, Field/FilterField
  consolidation, the house page shell, and `.btn-danger`/date-formatter additions to the style
  system.

- **i18n**: T5 extends the completeness requirement to the newly-found surfaces — aria-labels, SEO
  titles/descriptions, placeholders, error fallbacks, pluralization, confirm-dialog keys — all
  user-visible strings through `t()` with en+tr parity enforced by the existing PBT.

- **lint-style**: T6/T7 tighten the spec — `no-explicit-any`, `require-await`, `no-empty` SHALL be
  active repo-wide (removed from `rules.exclude`); test-file suppressions are line-level with
  justification; the raw-SQL exception registry gains the featured-toggle entry (or loses the need
  for it) and the 5 stray sql-tag sites move to Drizzle helpers.

- **model-test-coverage**: T1/T8 tighten the spec — tests SHALL import the production module they
  cover (mock-mirror ban), the deno scope SHALL hold ≥85% line coverage behind a CI gate
  (`scripts/coverage-gate.ts`), web coverage SHALL count untested files with thresholds at the
  honest baseline, and a local make target SHALL provision the test DB.

- **web-api-boundary**: T6 closes the D42 off-by-one — `api/client.ts:72`'s
  `Record<string, unknown>` and the ~10 page-level `Record` casts are replaced with shared types,
  restoring the "zero `Record<string, unknown>` at the boundary" guarantee end-to-end.

- **dependency-management**: T10 — the safe-batch bump set, renovate customManagers for the
  catalog/CI blind spots, drizzle-kit dedupe, and the gated TS7 verification protocol with its defer
  fallback.

- **deno-runtime**: T10 — Deno 2.9.3 locally, in both CI workflows, and in both Dockerfiles' base
  images (fixing the v2.9.0 pin drift), with the runtime/CI version-sync rule codified.

## Impact

**Files changed (by track — representative, not exhaustive; see `tasks.md` for the full lists):**

| Area                                                                                                                                             | Change type                                          | Track    |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- | -------- |
| `packages/db/src/*` (test:db TS2352 site)                                                                                                        | edit — fix cast                                      | T1       |
| `apps/api/src/modules/comment/{service,index}.ts` (+ tests)                                                                                      | edit — visibility gate on create+list                | T1       |
| `apps/api/src/modules/{admin,equipment,photo}/*.test.ts` (4 files)                                                                               | rewrite — real imports, scratch DB                   | T1       |
| `apps/api/src/modules/collection/{service,index}.ts`                                                                                             | edit — cache wiring + US-9 passthrough/route         | T2       |
| `apps/api/src/modules/collection/model.ts`                                                                                                       | edit — US-9 visibility filter (WHERE change at :304) | T2       |
| `apps/web/src/pages/recipes/RecipeDetailPage.tsx` (+ router loader)                                                                              | edit — "In collections" section                      | T2       |
| `apps/web/src/pages/collections/*.test.tsx` (3 new)                                                                                              | new — page tests                                     | T2       |
| `packages/db/src/seed.ts` (+ seed test)                                                                                                          | edit — per-collection sortOrder                      | T2       |
| `apps/web/src/components/**` (RecipeCard ext., Toast, ConfirmDialog, EmptyState, LoadingState, ErrorState, Field/FilterField, visibility helper) | new/edit                                             | T3/T4    |
| `apps/web/src/pages/**` (~25 pages: card/pagination/shell/confirm/date adoption)                                                                 | edit                                                 | T3/T4/T5 |
| `apps/web/src/components/recipe/RecipeCard.styles.ts`                                                                                            | delete — stale leftover                              | T3       |
| `apps/web/src/styles/globals.css`                                                                                                                | edit — `.btn-danger`, `--error-bg`, page shell       | T4       |
| `packages/shared/src/i18n/{en,tr}.json`                                                                                                          | edit — new keys (parity PBT enforced)                | T5       |
| `apps/api/src/modules/taste/service.ts`, `apps/web/src/pages/Recipe{Compare,FocusMode}Page.tsx`, `apps/web/src/api/client.ts`, ~40 test files    | edit — any/ignore cleanup                            | T6       |
| `deno.json` (`rules.exclude`)                                                                                                                    | edit — flip LAST                                     | T6       |
| `apps/api/src/modules/{recipe,coffee-variety,collection,badge}/model.ts`, `packages/db/src/seed.ts`                                              | edit — sql tags → Drizzle helpers                    | T7       |
| `Makefile` (+ scripts/coverage-gate.ts, CI workflows)                                                                                            | new/edit — test-DB provisioning + coverage gate      | T8       |
| `apps/api/src/modules/{admin,recipe,auth}/**` tests                                                                                              | new/edit — backfill to ≥85%                          | T8       |
| 196 docblock sites (schema.ts, shared, routers)                                                                                                  | edit — docblocks only                                | T9       |
| `deno.json`/`package.json` files, `.github/workflows/{pr,ci}.yml`, `renovate.json`                                                               | edit — bumps, pins, customManagers                   | T10      |
| `AGENTS.md:50`                                                                                                                                   | edit — middleware-order doc                          | T11      |

**Schema/migration changes:** none — no DB columns change (seed + query-builder edits only). **API
behaviour change:** comment create/list gains a 404 visibility gate (T1) and a new
collections-for-recipe read surface (T2). Everything else is non-behavioural (types, styles, tests,
docs, deps).

**Risk:** Medium-high in two places, low elsewhere.

- **Highest risk — TS7 (T10):** major compiler swap (tsgo). Mitigated by the gate: branch-verify
  under Deno node-compat, diagnostic diff vs 6.0.3, bump only on parity, explicit defer fallback.
- **High risk — admin test rewrite (T1):** 1,349 uncovered lines get real tests for the first time;
  latent admin-module bugs may surface and need fixing mid-track. Timebox and split fixes into their
  own commits.
- **Medium — lint flip (T6):** mitigated by fix-first-flip-last ordering; every intermediate commit
  stays green.
- **Low — T3/T4 UI consolidation:** mechanical JSX moves with page tests; T5/T7/T9/T11 are near-zero
  risk.

**Verification** (run suites individually — never `make test 2>&1 | tail`, piping masks failures):

- `make check` / `deno task check` — note web is `deno task check:web` (bare `deno check` on web
  yields ~84 pre-existing errors).
- `make lint` (after T6 flip: with all three rules active), `make fmt` after every edit batch (CI
  enforces `fmt --check`).
- `make test-api`, `make test-shared`, web `deno task test` (vitest), `deno task test:db` (fixed in
  T1) — individually.
- `deno task test-coverage` + `scripts/coverage-gate.ts` ≥85% (T8); web vitest `--coverage` with
  thresholds.
- Manual: `make dev` — walk recipe detail (In-collections section, comments on a private recipe →
  404), collections CRUD (cache-hit behaviour, toasts, confirm dialogs), the 3 de-duplicated card
  pages, dark/coffee themes on error states.
