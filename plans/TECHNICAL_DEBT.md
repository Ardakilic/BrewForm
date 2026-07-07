# Technical Debt — BrewForm

> Status ledger for technical-debt items. Issues categorised by severity and area.
> Last full audit: **2026-07-04** (plan-by-plan verification against `main`). Resolved dates come from `openspec/changes/archive/` directory names; items implemented outside the spec-driven flow have no archive entry and are marked "date unknown".

**All debt items resolved.** _(Wave 2 resolved 2026-07-06: D03, D34, D39 Tier 1. Wave 3 resolved 2026-07-06: D36, D37, D40. Wave 4 resolved 2026-07-07: D35, D42, D43, D39 Tier 2/3 — via `wave-4-independent-fillers`.)_

---

## 1. Critical — Security & Correctness

### 1.1 Vendor Update Missing Ownership Check
- **Status: Resolved** (date unknown — no archive entry)
- **Issue**: `updateVendor()` accepted `_userId` but never used it — any authenticated user could update any vendor.
- **Verified fix**: `apps/api/src/modules/vendor/service.ts:68` now enforces `vendor.createdBy !== userId && !isAdmin`; `createdBy` column + relations exist in `packages/db/src/schema.ts:470`; admin service/model pass `createdBy` through.
- **PRD**: [`plans/D01-vendor-ownership-check.md`](D01-vendor-ownership-check.md)

### 1.2 Duplicate Email Transporter (Connection Leak)
- **Status: Resolved** (date unknown — no archive entry)
- **Issue**: `auth/email.ts` created a new `nodemailer.createTransport()` per send, leaking SMTP connections.
- **Verified fix**: `apps/api/src/modules/auth/email.ts:3-4` imports `getTransporter`/`appBaseUrl`/`escapeHtml`; the only remaining `createTransport` is the singleton in `apps/api/src/utils/notify/index.ts:39`.
- **PRD**: [`plans/D02-email-transporter-consolidation.md`](D02-email-transporter-consolidation.md)

### 1.3 Raw SQL in Equipment Model — **RESOLVED** (2026-07-06)
- **Status: Resolved** (2026-07-06 via Wave 2)
- **File**: `apps/api/src/modules/equipment/model.ts:88` (`getRecipesUsingEquipment`), raw subquery at `:103-107`
- **Issue**: Raw SQL subquery `sql\`... IN (SELECT re.recipe_version_id FROM recipe_equipment re WHERE re.equipment_id = ...)\`` violated the project's "no raw SQL" rule (AGENTS.md), bypassing Drizzle's type safety.
- **Incidental sub-finding (folded into the fix)**: the count branch at `model.ts:111` duplicated the visibility/`deletedAt` predicates of the list branch — now shared in one condition set.
- **Fix**: Rewritten with the Drizzle query builder / `exists()` subquery; D39 Tier 1 (`equipment/model.test.ts`) landed first as the regression net.
- **PRD**: [`plans/D03-raw-sql-drizzle.md`](D03-raw-sql-drizzle.md)

### 1.4 Recipe Fork Button Navigates to Non-Existent Route
- **Status: Resolved** (2026-06-05)
- **Verified fix**: `apps/web/src/router.tsx:121` registers `recipes/:id/fork`; `RecipeForkPage.tsx` exists.
- **PRD**: [`plans/D04-fork-navigation-fix.md`](D04-fork-navigation-fix.md)

### 1.5 Admin User Mutations Ignore Soft-Delete — **RESOLVED** (2026-07-05)
- **Verified fix**: `apps/api/src/modules/admin/model.ts` — `banUser`, `unbanUser`, `setUserAdminRole` now use `and(eq(users.id, userId), isNull(users.deletedAt))`. Sibling sweep also fixed `updateRecipeVisibility`, `updateEquipment`, `updateVendor`. `PATCH /users/:id/admin` route wrapped in try/catch mapping `USER_NOT_FOUND` → 404 (was a 500). `describeRoute` metadata added to the two touched admin user routes. Tests in `admin/model.test.ts` cover active + soft-deleted paths for all six functions, including the privilege-escalation-blocked assertion.
- **Severity**: High — data integrity + latent privilege-escalation edge on account restore.
- **PRD**: [`plans/D41-admin-user-mutation-guards.md`](D41-admin-user-mutation-guards.md)

### 1.6 Security & Error-Handling Hardening Bundle — **RESOLVED** (2026-07-05)
- **Verified fix**:
  - `POST /api/v1/reports` now applies `rateLimitMiddleware({ windowMs: 15 * 60_000, maxRequests: 3, keyPrefix: 'report' })` as the first middleware on the POST route only (admin GET/PATCH routes NOT throttled, per design Decision 4). 429 documented in OpenAPI. Test in `report/index.test.ts` asserts the 4th POST returns 429 and admin GET is not throttled.
  - `apps/api/src/utils/sanitize.test.ts` (new) — 28 cases covering dangerous-input neutralisation (script/img/anchor tags, zero-width chars, whitespace abuse), benign-input pass-through (numeric comparisons, markdown, plain text), and the 3 documented limitations (`javascript:` URLs, HTML entities, `<` not followed by a letter) locked as pass-through regression baselines.
  - `apps/web/src/contexts/AuthContext.tsx` — `refreshUser` catch now branches into 5 cases (banned/401/5xx/network/other-4xx); 401 keeps `log.warn` (silent logout correct — refresh cookie is also dead), 5xx/network use `log.error` and set `sessionError: 'network' | 'server' | null`; `clearSessionError()` exposed; outer `.catch(() => {})` removed. `SessionRestoreBanner.tsx` (new) mounted in `Layout.tsx` as a sibling to `EmailVerificationBanner`. `AuthContext.test.tsx` (new) covers 401/500/network/banned/success.
- **Severity**: High (bundle of P2 security/correctness items).
- **PRD**: [`plans/D38-security-error-hardening.md`](D38-security-error-hardening.md)

---

## 2. High — Type Safety & Code Quality

### 2.1 Pervasive `any` Types in API Services
- **Status: Resolved** (date unknown — no archive entry)
- **Verified fix**: `recipe/service.ts` and `recipe/index.ts` now have **zero** `any` (the ledger previously said "13+ occurrences"); `routes/sitemap.ts` typed. Residual `any` in modules D05 never covered is tracked as **D34** (§2.6).
- **PRD**: [`plans/D05-eliminate-any-types.md`](D05-eliminate-any-types.md)

### 2.2 `DrinkType` Type Missing 4 Enum Values
- **Status: Resolved** (2026-06-04)
- **Verified fix**: `packages/shared/src/types/recipe.ts:25` — `DrinkType = DrinkTypeValue` (all 15 values, derived via D07's single source).
- **PRD**: [`plans/D06-fix-drink-type-enum.md`](D06-fix-drink-type-enum.md)

### 2.3 Enum Duplication Across 3 Locations
- **Status: Resolved** (date unknown — no archive entry)
- **Verified fix**: `packages/db/src/schema.ts:36` imports `*_VALUES` from `@brewform/shared/constants`; `enums.test.ts` locks parity.
- **PRD**: [`plans/D07-enum-single-source.md`](D07-enum-single-source.md)

### 2.4 Duplicate `AuthUser` Interface Definition
- **Status: Resolved** (2026-06-05)
- **Verified fix**: single `AuthUser` in `packages/shared/src/types/user.ts:94`; both web files import from shared.
- **PRD**: [`plans/D08-auth-user-consolidation.md`](D08-auth-user-consolidation.md)

### 2.5 `deno-lint-ignore` Directives in Production Code
- **Status: Resolved** (2026-06-05) — audit note: the original file list here was inaccurate (named web files that never carried directives), and D09 landed as audit-scoped: no enforced-rule suppressions remained in its baseline. Suppressions **outside** that baseline were found in the 2026-07 sweep and are tracked as **D35** (§2.7).
- **PRD**: [`plans/D09-fix-lint-suppressions.md`](D09-fix-lint-suppressions.md)

### 2.6 Residual `any` in Service/Model Layer — **RESOLVED** (2026-07-06; P2 scope complete, P3 stretch documented)
- **Files**: `preference/service.ts:26`, `preference/index.ts:85`, `bean/service.ts:34,47`, `setup/service.ts:38`, `taste/model.ts:50`, `recipe/model.ts:466,473`, `badge/model.ts:131`, `utils/notify/index.ts:27,204` (`NotifyRecipient` interface + recipients `.filter` on `prefs.followedUserPosted`), `equipment/service.ts:42` (all under `apps/api/src/`); stretch: library-boundary casts in `utils/openapi`, `auth/jwt.ts`, `middleware/errorHandler.ts`.
- **Issue**: `data: any` payloads and untyped casts in modules D05 never covered — validated Zod types were dropped at the route → service boundary.
- **Resolution (2026-07-06 via Wave 2)**: P2 scope complete — all twelve `any` locations replaced with shared-schema-inferred / Drizzle relation-row types. P3 stretch (library-boundary casts in `utils/openapi`, `auth/jwt.ts`, `middleware/errorHandler.ts`) documented with justification comments rather than removed, pending clean typed alternatives in the upstream libraries.
- **PRD**: [`plans/D34-residual-any-elimination.md`](D34-residual-any-elimination.md)

### 2.7 Untracked Lint Suppressions — **RESOLVED** (2026-07-07 via wave-4-independent-fillers)
- **Files**: file-level `deno-lint-ignore-file no-explicit-any require-await` in `packages/shared/src/schemas/compatibility.ts:1`, `schemas/report.ts:1`, `logger/index.ts:1`, `logger/types.ts:1`; `apps/api/src/utils/openapi/index.ts:1` (+ `as any` at `:28`); line-level `no-unused-vars` in `middleware/cors.ts:5`, `middleware/requestId.ts:12`.
- **Issue**: file-wide suppressions disable rules for all future edits to those files; none were in D09's audited baseline.
- **Fix**: Deleted 6 vestigial file-level directives (rules are in `deno.json` `rules.exclude`); narrowed `openapi/index.ts` to line-level with justification; deleted dead `const log` + import in `cors.ts`/`requestId.ts`. Production source now has zero `deno-lint-ignore-file` directives.
- **PRD**: [`plans/D35-untracked-lint-suppressions.md`](D35-untracked-lint-suppressions.md)

---

## 3. Medium — Architecture & Patterns

### 3.1 No Data Fetching Cache Layer (Frontend)
- **Status: Resolved** (pilot scope; date unknown — no archive entry)
- **Verified fix**: 6 pages export loaders, 4 components use `useFetcher`; `static-cache.ts`, `recipe-filters.ts`, and `routes/{like,favourite,rate,follow,comments}.ts` exist.
- **Known remainder**: `RecipeFocusModePage.tsx` still fetches via `useEffect`+`useState` — the one page never migrated; absorb into future work on that page.
- **PRD**: [`plans/D10-tanstack-query-migration.md`](D10-tanstack-query-migration.md)

### 3.2 Recipe List Code Duplication
- **Status: Resolved** (2026-06-07)
- **Verified fix**: `apps/web/src/components/recipe-list/` (8 files, incl. `RecipeListView` with `source: 'all' | 'starred'`); the two pages are now ~70/80 lines (previously 693/540). Note: these components shipped **without tests** — covered by D39 Tier 1.
- **PRD**: [`plans/D11-recipe-list-deduplication.md`](D11-recipe-list-deduplication.md)

### 3.3 Recipe Filter Logic Duplication (Model vs Service)
- **Status: Resolved** (2026-06-06)
- **Verified fix**: `apps/api/src/modules/recipe/model.ts:89` — shared `buildRecipeFilters(): SQL[]` used by `listRecipesFiltered` (`:219`) and `findStarred` (`:1040`).
- **PRD**: [`plans/D12-recipe-filter-logic.md`](D12-recipe-filter-logic.md)

### 3.4 Admin Soft-Delete Inconsistency
- **Status: Resolved** (2026-06-09) — with wider scope than originally ledgered (the old `:601-606` ref was stale).
- **Verified fix**: `isNull(deletedAt)` guards in `apps/api/src/modules/admin/model.ts` at `deleteEquipment:296`, `deleteVendor:339`, `deleteCoffeeVariety:608`, and the approve-request inner delete `:671`; double-delete idempotency locked in `admin/model.test.ts`.
- **Follow-up (resolved 2026-07-05)**: the same guard was missing on the admin **user-state** mutations — fixed in D41 (§1.5) along with the three sibling unguarded updates (`updateRecipeVisibility`/`updateEquipment`/`updateVendor`).
- **PRD**: [`plans/D19-admin-soft-delete-fix.md`](D19-admin-soft-delete-fix.md)

### 3.5 Module-Level Cache Without Invalidation
- **Status: Resolved** (2026-06-07)
- **Verified fix**: `invalidateStaticCache()` wired in `EquipmentListPage`/`AdminEquipmentPage`/`AdminTasteNotesPage`; `hooks/useStaticCacheSync.ts` handles cross-tab invalidation. (Old refs to `RecipeListPage.tsx:93-94` predate the D11 refactor.)
- **PRD**: [`plans/D13-fix-module-cache.md`](D13-fix-module-cache.md)

### 3.6 `useUnitSystem` Hook is Not Reactive
- **Status: Resolved** (2026-06-08)
- **Verified fix**: `apps/web/src/hooks/useUnitSystem.ts:18` now reads `user?.preferences?.unitSystem` via `useAuth()` — reactive through context. (The old ledger text blamed localStorage reads; the shipped fix moved the source of truth to auth context.)
- **PRD**: [`plans/D14-fix-use-unit-system.md`](D14-fix-use-unit-system.md)

### 3.7 Comment Section Pagination
- **Status: Resolved** (2026-06-08)
- **Verified fix**: `apps/web/src/routes/comments.ts:25` (`listCommentsLoader`) registered in `router.tsx:233` with loader + action. (Audit note: the originally claimed root cause `setTotal(data.length)` was shown by the D15 plan itself to not exist; the real fix was the loader migration.)
- **PRD**: [`plans/D15-fix-comment-pagination.md`](D15-fix-comment-pagination.md)

### 3.8 Settings Page — Account Deletion Doesn't Logout
- **Status: Resolved** (2026-06-08)
- **Verified fix**: `apps/web/src/pages/settings/SettingsPage.tsx:105-109` calls `logout()` + `navigate('/')` after deletion (old `:57-63` ref stale; flow now at `:99-110`); en/tr i18n keys added.
- **PRD**: [`plans/D16-fix-account-deletion.md`](D16-fix-account-deletion.md)

### 3.9 Recipe Service Layer Imports `drizzle-orm` Directly
- **Status: Resolved** (date unknown — no archive entry)
- **Verified fix**: `apps/api/src/modules/recipe/service.ts` has zero `drizzle-orm` imports; transaction moved to `model.createRecipeWithRelations` (`model.ts:550`).
- **PRD**: [`plans/D29-recipe-service-drizzle-orm-import.md`](D29-recipe-service-drizzle-orm-import.md)

---

## 4. Medium — Frontend Code Quality

### 4.1 Duplicate Component Definitions — **RESOLVED** (2026-07-06 via wave-3-frontend-structure)
- **Status: Resolved** (2026-07-06 via wave-3-frontend-structure)
- **Verified fix**: HomePage imports shared `RecipeCard` from `components/recipe-list/`; `BanDialog` + `useBanUser` extracted to `components/admin/` + `hooks/`; `Section`/`Field` extracted to `components/form/`; both recipe pages import shared primitives.
- **PRD**: [`plans/D36-extract-duplicated-ui.md`](D36-extract-duplicated-ui.md)

### 4.2 Dead Code — Duplicate NotFoundPage Exports — **RESOLVED** (2026-07-06 via wave-3-frontend-structure)
- **Status: Resolved** (2026-07-06 via wave-3-frontend-structure)
- **Verified fix**: `ErrorPage.tsx` is the canonical module (exports `NotFoundPage` + `ServerErrorPage` only); `NotFoundPage.tsx` deleted; `ForbiddenPage` deleted; `ErrorBoundary` delegates 404/5xx to the canonical components; base `ErrorPage` un-exported.
- **PRD**: [`plans/D37-consolidate-error-pages.md`](D37-consolidate-error-pages.md) (also covers §6.5)

### 4.3 Silent Error Swallowing
- **Status: Resolved** (2026-06-09; D17 survivor fixed 2026-07-05 via D38)
- **Verified fix**: zero empty `.catch` in the target pages; `createLogger` in place; focus-mode load-error i18n keys added.
- **D17 survivor (fixed 2026-07-05)**: the `AuthContext.tsx:50` `refreshUser().catch(() => {})` survivor was resolved by D38 (§1.6) — the outer `.catch` is removed, the inner catch now branches into 5 cases (banned/401/5xx/network/other-4xx) with `log.error` + `sessionError` state for 5xx/network, and a `SessionRestoreBanner` mounted in the shell.
- **PRD**: [`plans/D17-fix-error-swallowing.md`](D17-fix-error-swallowing.md)

### 4.4 No Optimistic Update Rollback
- **Status: Resolved** (2026-06-09)
- **Verified fix**: `routes/like.ts`/`favourite.ts`/`follow.ts` return `{ ok: false, error }` for rollback; loggers added.
- **PRD**: [`plans/D18-fix-optimistic-rollback.md`](D18-fix-optimistic-rollback.md)

### 4.5 Hardcoded English Strings (Incomplete i18n) — **RESOLVED** (2026-07-06 via wave-3-frontend-structure)
- **Status: Resolved** (2026-07-06 via wave-3-frontend-structure)
- **Verified fix**: all 15 admin pages + 5 user-facing pages + 2 partial recipe pages now use `t()` for user-visible strings; ~175 new i18n keys added to both en.json and tr.json; deterministic bidirectional parity test enforced; per-page tr-locale spot-check tests added.
- **PRD**: [`plans/D40-complete-i18n.md`](D40-complete-i18n.md)

### 4.6 `Record<string, unknown>` in API Types — **RESOLVED** (2026-07-07 via wave-4-independent-fillers)
- **File**: `apps/web/src/api/index.ts` — 25+ occurrences (`:30-140`: users, recipes, setups, beans, equipment, taste, follow).
- **Now unblocked**: D25 created response Zod schemas in `packages/shared/src/schemas/responses/*` — types can be derived via `z.infer` instead of hand-written.
- **Fix**: Replaced all `Record<string, unknown>` with shared `z.infer`-derived types; deleted `apps/web/src/api/types.ts` (185 lines of shadow types); added web `tsc --noEmit` type-check to CI; extended `RecipeDetailOutputSchema` with per-request overlay fields; added `RecipeListItemOutputSchema` and `PaginatedResponse<T>` shared types.
- **PRD**: [`plans/D42-typed-web-api-boundary.md`](D42-typed-web-api-boundary.md)

---

## 5. Low — Schema & Database

### 5.1 `report.status` Uses String Instead of Enum
- **Status: Resolved** (2026-06-10)
- **Verified fix**: `reportStatusEnum` pgEnum at `packages/db/src/schema.ts:60`, column at `:810` (old `:749` ref stale); `constants/report-status.ts`; shared `schemas/report.ts` derives from it.
- **PRD**: [`plans/D20-fix-report-status-enum.md`](D20-fix-report-status-enum.md)

### 5.3 `CoffeeVariety` Type Uses `string` for Dates
- **Status: Resolved** (2026-06-11)
- **Verified fix**: `packages/shared/src/types/coffee-variety.ts:80-84` (old `:34-36` ref stale) — `Date`/`Date`/`Date | null`.
- **PRD**: [`plans/D22-fix-coffee-variety-dates.md`](D22-fix-coffee-variety-dates.md)

### 5.4 Missing Composite Indexes
- **Status: Resolved** (2026-06-11)
- **Verified fix**: 3 recipe composites at `schema.ts:149/158/166` plus cross-table composites.
- **PRD**: [`plans/D23-add-composite-indexes.md`](D23-add-composite-indexes.md)

### 5.5 Missing `createdAt` on Join Tables — **RESOLVED** (2026-07-07 via wave-4-independent-fillers)
- **Audit correction (2026-07-04)**: `user_follow`, `user_recipe_like`, `user_recipe_favourite`, `user_recipe_rating` **already have** `createdAt` (added with the D23-era index work). Remaining: `recipe_taste_note` (`schema.ts:241`), `recipe_equipment` (`:263`), `recipe_version_photo` (`:330`).
- **Fix**: Added `createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()` to all three tables; generated migration `0008_stiff_bruce_banner.sql`; added column-existence test (`schema-columns.test.ts`) and `createdAt` assertions to `model.create.test.ts`.
- **PRD**: [`plans/D43-join-table-timestamps.md`](D43-join-table-timestamps.md)

---

## 6. Low — Infrastructure & DX

### 6.1 Incomplete OpenAPI Documentation
- **Status: Resolved** (date unknown — no archive entry)
- **Verified fix**: all 15 modules + share/sitemap carry `describeRoute`; `packages/shared/src/schemas/responses/*` created; `openapi.coverage.test.ts` enforces coverage. (Old "only 5 of 18 modules" text stale.)
- **PRD**: [`plans/D25-complete-openapi-docs.md`](D25-complete-openapi-docs.md)

### 6.2 Logging Coverage Gaps
- **Status: Resolved** (2026-06-20)
- **Verified fix**: P1 services + P2 middleware + P1 pages/contexts all logged.
- **Housekeeping**: `TODO_logs.md` still lists all P1/P2 items as pending — actively misleading; retire it. `plans/D26-expand-logging.md` still says "Status: Open" — stale header.
- **PRD**: [`plans/D26-expand-logging.md`](D26-expand-logging.md)

### 6.3 No Request Body Size Limits at Hono Level
- **Status: Resolved** (2026-06-13)
- **Verified fix**: `middleware/bodyLimit.ts` (1 MB, photos excluded) wired at `main.ts:70`.
- **PRD**: [`plans/D24-add-request-body-limit.md`](D24-add-request-body-limit.md)

### 6.4 Offset-Based Pagination
- **Status: Resolved** (date unknown — archive pending)
- **Verified fix**: `utils/cursor.ts`; `RecipeFilterSchema.cursor` (`recipe.ts:154`); cursor path in service + `model.findCursor`.
- **PRD**: [`plans/D27-cursor-pagination.md`](D27-cursor-pagination.md)

### 6.5 Duplicate `NotFoundPage` / Error Page Confusion — **RESOLVED** (2026-07-06 via wave-3-frontend-structure)
- **Status: Resolved** (2026-07-06 via wave-3-frontend-structure; same fix as §4.2)
- **PRD**: [`plans/D37-consolidate-error-pages.md`](D37-consolidate-error-pages.md)

### 6.6 Test Coverage Backfill — **RESOLVED** (Tier 1 2026-07-06; Tier 2/3 2026-07-07 via wave-4-independent-fillers)
- **Scope**: API models with zero tests (equipment — held D03's SQL; vendor — held D01's bug; badge/bean/comment/follow/photo/preference/qrcode/report/setup), `recipe-list/*` components (shipped by D11 untested), `RequireAuth`, plus P3 tiers (route layers, utils, web pages/components, shared schemas). `sanitize.ts` excluded — owned by D38.
- **Tier 1 (resolved 2026-07-06 via Wave 2)**: `equipment/model.test.ts`, `vendor/model.test.ts`, `recipe-list/*` component tests, and `RequireAuth.test.tsx` all landed; D03 cites `equipment/model.test.ts` as its regression net.
- **Tier 2/3 (resolved 2026-07-07 via wave-4-independent-fillers)**: 9 API model tests, 9 API route tests, 4 API util tests, 4 web page tests, 6 web component tests, 5 web hook/util/context tests, and 6 shared input schema tests — 43 new test files total.
- **PRD**: [`plans/D39-test-coverage-backfill.md`](D39-test-coverage-backfill.md)

---

## Infrastructure changes (openspec-only)

The following work was executed through OpenSpec changes only — there are no `plans/D*` files for them; all are complete:

- **d30** — Coolify/GHCR deployment (Docker images, deploy guide, runtime-configurable web API URL)
- **d31** — Deno 2.9 upgrade
- **d32** — deploy-plan / local-dev sync for Deno 2.9 + workspaces (archived 2026-06-27)
- **d33** — workspace dependency refresh (react-router v8, zod-openapi v6)

Also resolved without a ledger section above: **D21** rating-scale CHECK constraint (2026-06-11), **D28** deprecated `tasteNoteId` removal with `Deprecation` headers (2026-06-22).

---

## Summary — Priority Action Items (open items only)

| Priority | Item | Plan | Area | Effort |
|----------|------|------|------|--------|
| **P2** | Extract duplicated UI (RecipeCard / BanDialog / form helpers) | [D36](D36-extract-duplicated-ui.md) | Frontend | Medium |
| **P2** | Typed web API boundary via shared response schemas | [D42](D42-typed-web-api-boundary.md) | Both | Medium |
| **P2** | Test coverage backfill — Tier 2/3 (remaining models, routes, utils, web, shared schemas) | [D39](D39-test-coverage-backfill.md) | Both | High (incremental) |
| **P3** | Remove untracked lint suppressions | [D35](D35-untracked-lint-suppressions.md) | Both | Low–Medium |
| **P3** | Consolidate error pages / remove dead exports | [D37](D37-consolidate-error-pages.md) | Frontend | Low |
| **P3** | Complete i18n (admin, legal, compare, auxiliary pages) | [D40](D40-complete-i18n.md) | Frontend | Medium–High |
| **P3** | Add `createdAt` to remaining join tables | [D43](D43-join-table-timestamps.md) | DB | Low |

**Recently resolved (2026-07-05, openspec change `wave-1-correctness-security`):** D41 (admin user mutation soft-delete guards + sibling sweep + setRole route try/catch + describeRoute) and D38 (report rate limit + sanitizer tests + AuthContext error surfacing + SessionRestoreBanner). See §1.5 and §1.6 above.

**Recently resolved (2026-07-06, Wave 2):** D03 (raw SQL in `equipment/model.ts` rewritten with Drizzle query builder; count-branch predicate dedup folded in), D34 (residual `any` elimination — P2 scope complete, P3 stretch documented), and D39 Tier 1 (equipment/vendor model tests, `recipe-list/*` component tests, `RequireAuth` test). See §1.3, §2.6, and §6.6 above.

**Recently resolved (2026-07-07, Wave 4 — `wave-4-independent-fillers`):** D35 (untracked lint suppressions — deleted 6 vestigial file-level directives, narrowed `openapi/index.ts` to line-level, deleted dead logger code in `cors.ts`/`requestId.ts`), D42 (typed web API boundary — replaced all `Record<string, unknown>` with shared `z.infer`-derived types, deleted `api/types.ts`, added web `tsc --noEmit` to CI, extended `RecipeDetailOutputSchema` with per-request overlay), D43 (`createdAt` on 3 remaining join tables — migration `0008`), and D39 Tier 2/3 (43 new test files: 9 API model + 9 API route + 4 API util + 4 web page + 6 web component + 5 web hook/util/context + 6 shared schema tests). All four items are independent and were bundled for ROADMAP hygiene. See §2.7, §4.6, §5.5, and §6.6 above.

**Sequencing notes**: D39 Tier 1 (equipment model tests) before D03; D37 before D40's NotFoundPage conversion; D36's `BanDialog` before/with D40's admin-page conversion. Wave 4's four items had no sequencing dependency on each other.
