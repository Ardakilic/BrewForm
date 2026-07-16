# Wave 4 — Independent Fillers (D42 + D43 + D35 + D39 Tier 2/3)

## Why

Wave 4 of the debt roadmap closes out the four remaining open debt items. Unlike Waves 1–3, these
four items have **no sequencing dependency on each other** — they touch disjoint areas (web type
boundary, DB schema, lint hygiene, test backfill). They are bundled into one change because each is
individually small-to-medium and a single PR keeps the ROADMAP honest by landing all four ledger
items together. The `ROADMAP.md` marks them as "anytime" fillers; this change formalizes that.

The research for Wave 4 surfaced significant **drift from the original plans** — particularly D35
(2 missed files, vestigial directives) and D42 (web app not type-checked in CI, missing shared
schema types, divergent recipe-detail shape). This proposal resolves each drift with an explicit
decision in `design.md` and codifies the resolution in the specs.

- **D42 — Typed web API boundary.** `apps/web/src/api/index.ts` has 28 lines containing
  `Record<string, unknown>` at the web↔API boundary (some lines have 2 occurrences — a param and
  a return type — totaling ~32 individual usages across 24 API functions). The D25 response Zod schemas (with inferred `*Output` types)
  exist but are **not re-exported through the `schemas/index.ts` barrel** — the web app cannot reach
  them via `@brewform/shared/schemas`. Wave 2 added request type exports for 4 domains (bean/setup/
  vendor/equipment) but skipped recipe, user-profile, preferences, taste, follow, and comment.
  Additionally, `apps/web/src/api/types.ts` (185 lines) holds 14+ hand-duplicated shadow interfaces
  that drift from the shared schemas (e.g. `RecipeDetailResponse` lacks the shared
  `RecipeDetailOutput`'s `versions[]`/`forkedFrom` and adds per-request fields like `userLiked`/
  `avgRating` that the shared schema doesn't model). **Critical gap:** the web app is **not
  type-checked in CI** today — `make check-web` runs only `deno lint src/`; there is no `tsc` or
  `deno check` invocation. D42 must add a web type-check gate as a prerequisite, or its
  type-safety guarantees are unverifiable.

- **D43 — Join table timestamps.** Three recipe join tables (`recipe_taste_note`, `recipe_equipment`,
  `recipe_version_photo`) lack `createdAt`. The four social join tables already have it (verified,
  identical pattern). This is the cleanest item — no drift, no API exposure change, no seed change.
  The next migration (`0008`) adds the column with `DEFAULT now() NOT NULL`, backfilling existing
  rows. `forkRecipe` intentionally does not copy `createdAt` (forked attachments get fresh
  timestamps — correct behaviour, no special handling).

- **D35 — Untracked lint suppressions.** The plan listed 7 production files with
  `deno-lint-ignore` directives; the actual count is **9** — the plan missed
  `coffee-variety/model.ts` and `coffee-variety/service.ts` (both vestigial `require-await`
  directives documented in D09's baseline). Research revealed that **6 of the 9 directives are
  vestigial** (they suppress `no-explicit-any` / `require-await`, both of which are in `deno.json`'s
  `rules.exclude` — the rules are off, so the directives mask nothing today). Only 3 directives
  suppress real violations: the `as any` cast in `openapi/index.ts` (justification already added by
  D34 P3 — just narrow file-level → line-level) and the two unused `const log` declarations in
  `cors.ts`/`requestId.ts` (delete the dead code). The logger types already use
  `Record<string, unknown>` — the plan's "replace `any` with `unknown`" premise was wrong for 4
  shared files.

- **D39 Tier 2/3 — Test coverage backfill.** Tier 1 is done (Wave 2). Wave 3 (D40) **pre-empted
  most Tier 3 web pages** by adding tr-locale spot-check tests for 22 converted pages. The genuine
  gaps remaining: 9 API model tests + 9 API route tests + 4 API util tests (Tier 2); 4 web pages +
  6 web components + 5 web hooks/utils/contexts + 6 shared input schema tests (Tier 3). One path
  fix: `cron.ts` is at `utils/jobs/cron.ts`, not `jobs/cron.ts` (plan error). `NotFoundPage` is
  already covered by D37's `ErrorPage` consolidation — do not re-create.

| Concern | Current state | Wave 4 fix |
|---|---|---|
| Web type-check in CI | `make check-web` = `deno lint src/` only; no `tsc`/`deno check` | Add `tsc --noEmit -p apps/web/tsconfig.json` to `make check-web` (uses existing tsconfig with path aliases) |
| `Record<string, unknown>` in `api/index.ts` | 28 lines (some with 2 occurrences) | Replace with `z.infer`-derived types from `@brewform/shared/schemas` |
| Response `*Output` types reachability | Defined in per-domain files but NOT re-exported through `schemas/index.ts` | Add `export type { ... } from './responses/...'` re-exports to barrel |
| Missing request types | Wave 2 covered 4 domains; recipe/user-profile/preferences/taste/follow/comment missing | Add `export type X = z.infer<typeof XSchema>` for the missing 10+ request schemas |
| `RecipeListItem` shared type | No shared equivalent; `FeedRecipeOutput` has wrong shape (full row, no user-state) | Add `RecipeListItemOutputSchema` to shared `responses/recipe.ts` matching the API's real list return |
| `RecipeDetailOutput` per-request fields | Lacks `userLiked`/`userFavourited`/`avgRating`/`userRating`/`favouriteCount` that the API returns | Extend `RecipeDetailOutputSchema` to include the per-request overlay fields |
| Shadow types in `api/types.ts` | 185 lines, 14+ hand-duplicated interfaces | Delete; replace all 25+ import sites with shared types |
| Per-page shadow types | 20+ local `interface Bean`/`Setup`/`EquipmentItem`/`UserProfile`/etc. | Delete; import shared `*Output` types (fix fallout: `BeanListPage` uses `productName` but `BeanOutputSchema` uses `name` — latent bug) |
| 3 join tables lack `createdAt` | `recipe_taste_note` (:241), `recipe_equipment` (:263), `recipe_version_photo` (:330) | Add `createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()` to each; generate migration `0008` |
| 9 lint suppression directives in production | 6 vestigial (rules excluded), 3 real | Delete 6 vestigial; narrow `openapi/index.ts` to line-level; delete dead `const log` in 2 middleware files |
| 2 missed `coffee-variety` directives | Not in D35's list but block the acceptance gate | Delete both (vestigial) |
| 22 Tier 2 API test gaps | 9 model + 9 route + 4 util tests missing | Backfill following `equipment/model.test.ts` + `bodyLimit.test.ts` patterns |
| 16 Tier 3 web/shared test gaps | 4 pages + 6 components + 5 hooks/utils/contexts + 6 shared schemas | Backfill following `model-test-coverage` spec conventions |

## What Changes

**D42 — Typed web API boundary (largest scope):**

- **Prerequisite:** Add a web type-check to CI. Change `apps/web/deno.json` `"check"` task to run
  `tsc --noEmit -p tsconfig.json` (in addition to or instead of `deno lint src/`). Wire into
  `make check-web` via `deno task check:web`. Use the existing `apps/web/tsconfig.json` (strict
  mode, `@brewform/shared/*` path aliases already configured). `typescript` is already a dev-dep.

- **Shared schema type exports:** Re-export all response `*Output` types through
  `packages/shared/src/schemas/index.ts` (mirror how request types are re-exported at lines 16/41/
  44/46). Add missing request type exports: `RecipeCreate`, `RecipeUpdate`, `RecipeFork`,
  `RecipeRate`, `RecipeNotes`, `UserProfileUpdate`, `UserPreferences` (request, nested),
  `TasteNoteCreate`, `TasteNoteUpdate`, `Follow`, `CommentCreate`.

- **New shared schemas:** Add `RecipeListItemOutputSchema` to `packages/shared/src/schemas/
  responses/recipe.ts` matching the API's real list-endpoint return shape (slim projection with
  `userLiked`/`userFavourited`/`avgRating` per-request fields). Extend `RecipeDetailOutputSchema`
  to include the per-request overlay fields (`userLiked`, `userFavourited`, `avgRating`,
  `userRating`, `favouriteCount`) that `recipe/model.ts findById` returns. Derive these from the
  actual service return shape (per AGENTS.md OpenAPI rule: "derive output schemas from the ACTUAL
  `service.ts` return shape").

- **Replace `Record<string, unknown>` in `apps/web/src/api/index.ts`:** domain by domain, in order:
  recipes → users/profile → follow → setups/beans/equipment → taste hierarchy. All 28 lines (and
  ~32 individual usages) must be eliminated. Response generics use `*Output` types (data payload —
  `api.get<T>` unwraps the envelope and returns `.data as T`). Request payloads use the
  corresponding `*Create`/`*Update` request types.

- **Delete `apps/web/src/api/types.ts`** (185 lines): replace all 25+ import sites with shared
  types. For `PaginatedResponse<T>`, export a shared type matching `paginatedEnvelope()`'s shape
  (`{ success: true; data: T[]; meta: { requestId: string; pagination: PaginationMeta } }`) — the
  web's current hand-written version is missing `success` and `meta.requestId`.

- **Delete per-page shadow types:** `BeanListPage.Bean`, `SetupListPage.Setup`,
  `EquipmentListPage.EquipmentItem`, `EquipmentDetailPage.EquipmentDetail`/`RecipeEntry`,
  `UserProfilePage.UserProfile`/`FollowRecord`, `TasteNotesPage.TasteCategory`,
  `CoffeeVarietiesPage.CoffeeVarietyItem`, `CoffeeVarietyDetailPage.VarietyDetail`/`RecipeEntry`,
  all 15 admin-page local interfaces, `RecipeVersionsPage.VersionSummary`,
  `SettingsPage.Preferences`. Import shared `*Output` types instead. **Fix fallout honestly:**
  `BeanListPage.tsx:11` uses `productName` but `BeanOutputSchema` uses `name` — this is a latent
  bug; fix the page to use `name` (or fix the schema if the API genuinely returns `productName`).

- **Remove 5 real `as` casts:** `SetupListPage.tsx:38` (`data as Setup[]`), `EquipmentListPage.tsx:40`
  (`data as EquipmentItem[]`), `TasteNotesPage.tsx:234` (`(data ?? []) as TasteCategory[]`),
  `OnboardingWizard.tsx:26,36` (`as Record<string, unknown>`), `SettingsPage.tsx:75`
  (`as Record<string, unknown>`). These become unnecessary once the API functions return typed
  payloads.

- **No runtime change:** compile-time typing only; do not add client-side `parse()` calls.

**D43 — Join table timestamps (cleanest):**

- `packages/db/src/schema.ts`: add `createdAt: timestamp('created_at', { withTimezone: true })
  .notNull().defaultNow()` to `recipeTasteNotes` (:241), `recipeEquipment` (:263),
  `recipeVersionPhotos` (:330). Add a docblock line noting the column exists for audit purposes.

- Generate migration `0008` via `make db-generate` (Drizzle Kit 0.31). Expected SQL: three
  `ALTER TABLE ... ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL`
  statements. **Never manually edit the generated SQL** (per AGENTS.md).

- Apply via `make db-migrate`. Existing rows backfilled with migration time (acceptable — true
  attachment times are unrecoverable).

- **No indexes** (no current query sorts these tables by insertion time; add with first consuming
  query per `db-indexes` spec precedent).

- **No API response shape change.** The three join-row Zod schemas in `responses/recipe.ts`
  (`RecipeVersionPhotoSchema`, `RecipeDetailTasteNoteSchema`, `RecipeDetailEquipmentSchema`) are
  non-strict `z.object` and omit `createdAt` — they strip the unknown key, so no response-schema
  change and no OpenAPI coverage test breakage.

- **No seed change.** All three seed inserts omit `createdAt`; `DEFAULT now()` handles it.
  `forkRecipe` re-inserts only natural-key + value columns → forked rows get fresh timestamps
  (correct behaviour).

- **New test:** Add a column-existence assertion to `packages/db/src/schema-indexes.test.ts` (or a
  new `schema-columns.test.ts`) using the `getTableConfig(table).columns` pattern, asserting
  `createdAt` exists on the three tables with `notNull` + `default`. Extend the recipe
  `model.create.test.ts` to assert join rows have `createdAt` populated after
  `createRecipeWithRelations`.

**D35 — Lint suppressions (biggest drift correction):**

- **Delete 6 vestigial file-level directives** (mask nothing — rules are in `deno.json`
  `rules.exclude`): `packages/shared/src/schemas/compatibility.ts:1`,
  `packages/shared/src/schemas/report.ts:1`, `packages/shared/src/logger/index.ts:1`,
  `packages/shared/src/logger/types.ts:1`, `apps/api/src/modules/coffee-variety/model.ts:1`,
  `apps/api/src/modules/coffee-variety/service.ts:1`. No code change — just delete line 1.

- **Narrow `openapi/index.ts`:** Remove the file-level `// deno-lint-ignore-file no-explicit-any`
  on line 1. Add a line-level `// deno-lint-ignore no-explicit-any` immediately above the `as any`
  cast on line 29. The justification comment on line 28 (added by D34 P3) stays as-is.

- **Delete dead code in middleware:** `apps/api/src/middleware/cors.ts` and
  `apps/api/src/middleware/requestId.ts` — remove the `import { createLogger }` line, the
  `const log = createLogger(...)` line, and the `// deno-lint-ignore no-unused-vars` directive.
  The loggers are genuinely never called.

- **Update `lint-style` spec:** Add a requirement that production source SHALL have zero
  `deno-lint-ignore-file` directives (tightens the current spec which is silent on this).

**D39 Tier 2/3 — Test coverage backfill:**

- **Tier 2 API (22 new test files):** 9 model tests (`badge`, `bean`, `comment`, `follow`, `photo`,
  `preference`, `qrcode`, `report`, `setup`), 9 route tests (`preference`, `bean`, `setup`, `photo`,
  `taste`, `user`, `badge`, `qrcode`, `vendor`), 4 util tests (`utils/jobs/cron.ts`,
  `utils/openapi/index.ts`, `utils/upload/index.ts`, `middleware/requestId.ts`). Follow the
  `equipment/model.test.ts` pattern (lint-ignore header, `test-setup.ts` first import, inline
  `crypto.randomUUID()` fixtures, `afterEach` hard-delete, `{ sanitizeOps: false, sanitizeResources:
  false }` on DB describes) and `bodyLimit.test.ts` pattern (stub Hono app + `app.request()`).

- **Tier 3 web (15 new test files):** 4 pages (`ForgotPasswordPage`, `ResetPasswordPage`,
  `BeanListPage`, `SetupListPage`), 6 components (`OnboardingWizard`, `PhotoUpload`,
  `RecipeQRCode`, `ScaaRadarChart`, `StarRating`, `StatCards` component), 5 hooks/utils/contexts
  (`useDebounce`, `utils/recipe-filters.ts`, `utils/sessionId.ts`, `I18nContext`, `ThemeContext`).
  Follow `model-test-coverage` spec conventions (Vitest + testing-library, `vi.hoisted` logger
  mock, `createMemoryRouter` + `RouterProvider`).

- **Tier 3 shared (6 new test files):** `bean.test.ts`, `comment.test.ts`, `follow.test.ts`,
  `photo.test.ts`, `setup.test.ts`, `vendor.test.ts` — top-level input schema tests, mirroring the
  existing `responses/*.test.ts` style and the 13 existing top-level schema tests.

- **Do NOT re-create:** `NotFoundPage` (covered by D37's `ErrorPage` consolidation),
  `ErrorBoundary`/`BanDialog` (Wave 3), `AuthContext` (D38), the 22 Wave 3 tr-locale spot-check
  pages.

- **Path fix:** `cron.ts` is at `apps/api/src/utils/jobs/cron.ts`, NOT `apps/api/src/jobs/cron.ts`.

- **Update `model-test-coverage` spec:** Add requirements for the Tier 2 API model/route/util test
  conventions and Tier 3 web/shared test conventions (the current spec only contracts Tier 1).

## Capabilities

### New Capabilities

- **web-api-boundary**: D42's typed web API boundary — shared response/request types re-exported
  through the barrel; web API client uses `z.infer`-derived types; shadow types deleted; web
  type-check added to CI. References `api-type-safety` (the Wave 2 foundation for shared schema
  type exports) and `model-test-coverage` (test conventions for the type-level regression test).

- **join-table-audit**: D43's `createdAt` on the three remaining join tables — schema columns,
  migration `0008`, column-existence test. References `db-indexes` (the precedent for "add indexes
  with the first consuming query, not preemptively").

### Modified Capabilities

- **lint-style**: D35 tightens the existing spec — adds a requirement that production source SHALL
  have zero `deno-lint-ignore-file` directives (the current spec is silent on production
  file-level directives; it only addresses test-file directives and production `as any` casts).
  Adds the 2 missed `coffee-variety` files to the audited baseline.

- **model-test-coverage**: D39 Tier 2/3 extends the existing spec — adds requirements for API
  model/route/util test conventions (Tier 2) and web/shared test conventions (Tier 3). The current
  spec only contracts Tier 1 (recipe-list components, RequireAuth). References `lint-style` (test
  file lint conventions) and `web-page-logging` (logging invariants tests must preserve).

## Impact

**Files changed (80+):**

| File | Change type | Debt item |
|---|---|---|
| `apps/web/deno.json` | edit — add `tsc --noEmit` to check task | D42 |
| `apps/web/tsconfig.json` | edit (if needed) — ensure strict + aliases | D42 |
| `Makefile` | edit — `check-web` runs new check task | D42 |
| `packages/shared/src/schemas/index.ts` | edit — re-export response types + add missing request types | D42 |
| `packages/shared/src/schemas/responses/recipe.ts` | edit — add `RecipeListItemOutputSchema`, extend `RecipeDetailOutputSchema` | D42 |
| `packages/shared/src/schemas/recipe.ts` | edit — add `RecipeCreate`/`Update`/`Fork`/`Rate`/`Notes` type exports | D42 |
| `packages/shared/src/schemas/user.ts` | edit — add `UserProfileUpdate` type export | D42 |
| `packages/shared/src/schemas/preferences.ts` | edit — add `UserPreferences` request type export | D42 |
| `packages/shared/src/schemas/taste.ts` | edit — add `TasteNoteCreate`/`Update` type exports | D42 |
| `packages/shared/src/schemas/follow.ts` | edit — add `Follow` type export | D42 |
| `packages/shared/src/schemas/comment.ts` | edit — add `CommentCreate` type export | D42 |
| `apps/web/src/api/index.ts` | edit — replace 23 `Record<string, unknown>` with shared types | D42 |
| `apps/web/src/api/types.ts` | delete (185 lines) | D42 |
| `apps/web/src/pages/**/*.tsx` (20+ files) | edit — delete shadow types, import shared, fix fallout | D42 |
| `packages/db/src/schema.ts` | edit — add `createdAt` to 3 tables | D43 |
| `packages/db/drizzle/0008_*.sql` (+ `meta/`) | new — generated migration | D43 |
| `packages/db/src/schema-indexes.test.ts` (or new `schema-columns.test.ts`) | edit/new — column-existence assertion | D43 |
| `apps/api/src/modules/recipe/model.create.test.ts` | edit — assert `createdAt` populated | D43 |
| 6 shared/api files (lint directives) | edit — delete vestigial directives | D35 |
| `apps/api/src/utils/openapi/index.ts` | edit — narrow file-level → line-level directive | D35 |
| `apps/api/src/middleware/cors.ts` | edit — delete dead `const log` + import + directive | D35 |
| `apps/api/src/middleware/requestId.ts` | edit — delete dead `const log` + import + directive | D35 |
| 22 new API test files (Tier 2) | new | D39 |
| 15 new web test files (Tier 3) | new | D39 |
| 6 new shared schema test files (Tier 3) | new | D39 |

**Schema/migration changes:** D43 adds 3 columns (migration `0008`). No API response shape change.
**No API route changes.** **No i18n changes.**

**Stakeholders:** Web (D42 + D39 Tier 3 web), shared (D42 type exports + D39 Tier 3 shared), API
(D35 lint + D39 Tier 2 API), DB (D43 schema + migration).

**Risk:** Medium. D42 is the highest-risk item (web type-check added to CI may surface pre-existing
type errors in unrelated files; recipe-detail shape divergence requires a schema decision). D43 is
low-risk (clean, no drift). D35 is low-risk (vestigial directive deletion + dead code removal).
D39 is low-risk (additive tests, no production code change). The four items are independent — if
D42 surfaces unexpected fallout, it can be scoped down without blocking D43/D35/D39.

**Verification:** `make check` (now includes web type-check), `make lint`, `make fmt`, `make test`
(all new tests via Docker with `--allow-all`). Manual: `make dev`, walk recipe list/detail, profile,
setups/beans/equipment pages, admin pages — verify no render regressions from the type changes.