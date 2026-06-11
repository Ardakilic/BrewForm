# Technical Debt — BrewForm

> Based on comprehensive codebase analysis. Issues categorised by severity and area.

---

## 1. Critical — Security & Correctness

### 1.1 Vendor Update Missing Ownership Check
- **File**: `apps/api/src/modules/vendor/service.ts:36`
- **Issue**: `updateVendor()` accepts `_userId: string` but never uses it. Any authenticated user can update any vendor's data.
- **Fix**: Add ownership/admin check before mutation.
- **Severity**: Security vulnerability — unauthorized data modification.
- **PRD**: [`plans/D01-vendor-ownership-check.md`](plans/D01-vendor-ownership-check.md)

### 1.2 Duplicate Email Transporter (Connection Leak)
- **Files**: `apps/api/src/modules/auth/email.ts:34`, `apps/api/src/utils/notify/index.ts`
- **Issue**: Two separate email sending implementations. `auth/email.ts` creates a new `nodemailer.createTransport()` on every `sendEmail()` call, while `utils/notify/` uses a singleton. This leaks SMTP connections.
- **Fix**: Consolidate to the singleton transporter in `utils/notify/index.ts`.
- **Severity**: Resource leak — SMTP connections not pooled.
- **PRD**: [`plans/D02-email-transporter-consolidation.md`](plans/D02-email-transporter-consolidation.md)

### 1.3 Raw SQL in Equipment Model
- **File**: `apps/api/src/modules/equipment/model.ts:103`
- **Issue**: Raw SQL subquery `sql\`...IN (SELECT re.recipe_version_id FROM recipe_equipment re WHERE re.equipment_id = ${equipmentId})\`` violates the project's "no raw SQL" rule from AGENTS.md. Raw SQL bypasses Drizzle's type safety and escape protection.
- **Fix**: Rewrite using Drizzle's query builder or `exists()` with a subquery.
- **Severity**: Anti-pattern that undermines project conventions.
- **PRD**: [`plans/D03-raw-sql-drizzle.md`](plans/D03-raw-sql-drizzle.md)

### 1.4 Recipe Fork Button Navigates to Non-Existent Route
- **File**: `apps/web/src/pages/recipes/RecipeDetailPage.tsx:209`, `apps/web/src/pages/recipes/RecipeEditPage.tsx:209`
- **Issue**: `navigate(\`/recipes/${recipe.id}/fork\`)` — no `/recipes/:id/fork` route exists in the router. This will 404.
- **Fix**: Either add the route or change to the fork API call + redirect pattern.
- **Severity**: Broken feature — fork from detail page is non-functional.
- **PRD**: [`plans/D04-fork-navigation-fix.md`](plans/D04-fork-navigation-fix.md)

---

## 2. High — Type Safety & Code Quality

### 2.1 Pervasive `any` Types in API Services
- **Files**: `apps/api/src/modules/recipe/service.ts` (13+ occurrences), `recipe/index.ts` (9+), `vendor/service.ts` (2), `admin/service.ts` (3), `auth/service.ts` (2), `photo/service.ts` (1), `routes/sitemap.ts` (1)
- **Issue**: Production code heavily uses `any`, undermining TypeScript's type safety. The recipe module alone has 20+ `any` casts.
- **Fix**: Define proper types for service parameters, Drizzle query results, and Hono context variables.
- **Severity**: Defeats the purpose of TypeScript; hides type errors at compile time.
- **PRD**: [`plans/D05-eliminate-any-types.md`](plans/D05-eliminate-any-types.md)

### 2.2 `DrinkType` Type Missing 4 Enum Values
- **File**: `packages/shared/src/types/recipe.ts:26-37`
- **Issue**: The `DrinkType` union type is missing `aeropress`, `drip_coffee`, `moka_pot`, and `siphon` which exist in the DB enum and Zod schema. TypeScript code using `DrinkType` won't type-check recipes with these methods.
- **Fix**: Update the type to include all 15 values from the DB enum.
- **Severity**: Type mismatch between DB, Zod, and TypeScript types.
- **PRD**: [`plans/D06-fix-drink-type-enum.md`](plans/D06-fix-drink-type-enum.md)

### 2.3 Enum Duplication Across 3 Locations
- **Files**: `packages/db/src/schema.ts`, `packages/shared/src/schemas/*.ts`, `packages/shared/src/types/*.ts`
- **Issue**: Every enum (BrewMethod, DrinkType, EquipmentType, Visibility, etc.) is defined independently in DB schema, Zod schemas, and TypeScript types. Adding a new value requires updating 3+ files in sync.
- **Fix**: Create a single source of truth (e.g., `packages/shared/src/constants/enums.ts`) and derive Zod schemas and TS types from it.
- **Severity**: Maintenance burden; high risk of drift.
- **PRD**: [`plans/D07-enum-single-source.md`](plans/D07-enum-single-source.md)

### 2.4 Duplicate `AuthUser` Interface Definition
- **Files**: `apps/web/src/api/index.ts:136`, `apps/web/src/contexts/AuthContext.tsx:4`
- **Issue**: `AuthUser` is defined differently in two locations with different field shapes.
- **Fix**: Consolidate to a single definition in `@brewform/shared/types`.
- **Severity**: Inconsistent user object across the frontend.
- **PRD**: [`plans/D08-auth-user-consolidation.md`](plans/D08-auth-user-consolidation.md)

### 2.5 `deno-lint-ignore` Directives in Production Code
- **Files**: `auth/service.ts`, `user/service.ts`, `admin/service.ts`, `coffee-variety/service.ts`, `coffee-variety/model.ts`, `photo/service.ts`, `RecipeFocusModePage.tsx`, `RecipeComparePage.tsx`, `EquipmentDetailPage.tsx`, `EquipmentCatalogPage.tsx`, `CoffeeVarietyDetailPage.tsx`, `CoffeeVarietiesPage.tsx`
- **Issue**: 12+ files suppress lint rules (`no-explicit-any`, `require-await`) rather than fixing the underlying issues.
- **Fix**: Address each suppression: add proper types, use `void` return types for fire-and-forget functions.
- **Severity**: Masks code quality issues.
- **PRD**: [`plans/D09-fix-lint-suppressions.md`](plans/D09-fix-lint-suppressions.md)

---

## 3. Medium — Architecture & Patterns

### 3.1 No Data Fetching Cache Layer (Frontend) — RESOLVED
- **Files**: All pages in `apps/web/src/pages/`
- **Fix**: Adopted React Router 7 data loaders + `useFetcher` for server state management. This eliminates ~80% of `useEffect`+`useState` data-fetching patterns across the 6 highest-traffic pages and 4 mutation components. Remaining pages to be migrated in follow-up PRs.
- **Severity**: Major DX and UX issue (now resolved for pilot scope).
- **PRD**: [`plans/D10-tanstack-query-migration.md`](plans/D10-tanstack-query-migration.md)

### 3.2 Recipe List Code Duplication (~90%)
- **Files**: `apps/web/src/pages/recipes/RecipeListPage.tsx` (693 lines), `apps/web/src/pages/recipes/StarredRecipesPage.tsx` (540 lines)
- **Issue**: These pages share ~90% identical code: filter sidebar, `FilterField`, `ActiveFilterBadge`, `RecipeCard`, equipment type labels, pagination logic. `StarredRecipesPage` also has inconsistent `EQUIPMENT_TYPE_LABELS` (includes `gooseneck_kettle`/`scale` but missing `espresso_machine`/`grinder`).
- **Fix**: Extract shared components and hooks into a `recipe-list/` module. Use a single `RecipeListView` component with a `source` prop (`all` vs `starred`).
- **Severity**: Maintenance burden; inconsistent filter options between pages.
- **PRD**: [`plans/D11-recipe-list-deduplication.md`](plans/D11-recipe-list-deduplication.md)

### 3.3 Recipe Filter Logic Duplication (Model vs Service)
- **Files**: `apps/api/src/modules/recipe/model.ts` (`findStarred` ~100 lines), `apps/api/src/modules/recipe/service.ts` (`listRecipes` ~120 lines)
- **Issue**: The filter logic in `findStarred()` substantially duplicates `listRecipes()` — same brew method, drink type, equipment, taste note, coffee variety, and search filters.
- **Fix**: Extract a shared `buildRecipeFilters()` function used by both methods.
- **Severity**: DRY violation; filter changes require updating two locations.
- **PRD**: [`plans/D12-recipe-filter-logic.md`](plans/D12-recipe-filter-logic.md)

### 3.4 Admin Coffee Variety Soft-Delete Inconsistency
- **File**: `apps/api/src/modules/admin/model.ts:601-606`
- **Issue**: `deleteCoffeeVariety()` soft-deletes without checking `isNull(deletedAt)` in the WHERE clause, unlike every other soft-delete implementation. This means it could update an already-deleted record.
- **Fix**: Add `isNull(table.deletedAt)` to the WHERE clause.
- **Severity**: Data integrity issue — double-deletion possible.
- **PRD**: [`plans/D19-admin-soft-delete-fix.md`](plans/D19-admin-soft-delete-fix.md)

### 3.5 Module-Level Cache Without Invalidation
- **Files**: `apps/web/src/pages/recipes/RecipeListPage.tsx:93-94`, `apps/web/src/pages/recipes/StarredRecipesPage.tsx:67-68`
- **Issue**: `cachedEquipment` and `cachedTasteNotes` are module-level variables that survive re-renders but reset on page reload. If a user adds equipment in one tab, the cached data in another tab becomes stale.
- **Fix**: Move to React Query or add a cache invalidation mechanism.
- **Severity**: Stale UI data.
- **PRD**: [`plans/D13-fix-module-cache.md`](plans/D13-fix-module-cache.md)

### 3.6 `useUnitSystem` Hook is Not Reactive
- **File**: `apps/web/src/hooks/useUnitSystem.ts`
- **Issue**: Reads `brewform-preferences` from localStorage on every render call but has no state subscription. Changing unit preference in Settings won't update recipe detail pages until a full page reload.
- **Fix**: Subscribe to preference changes via context or a custom event.
- **Severity**: Stale unit display.
- **PRD**: [`plans/D14-fix-use-unit-system.md`](plans/D14-fix-use-unit-system.md)

### 3.7 Comment Section Pagination Broken
- **File**: `apps/web/src/components/recipe/CommentSection.tsx:108`
- **Issue**: Fetches `?page=${page}` but always sets `setTotal(data.length)` (current page count, not total). The "Load More" check `total > comments.length` will almost never be true.
- **Fix**: Use the `meta.pagination.total` from the API response envelope.
- **Severity**: Pagination is effectively broken.
- **PRD**: [`plans/D15-fix-comment-pagination.md`](plans/D15-fix-comment-pagination.md)
- **Status**: Resolved in pilot scope (D10 follow-up; remaining scope: ensure all callers use meta.pagination.total not data.length)

### 3.8 Settings Page — Account Deletion Doesn't Logout
- **File**: `apps/web/src/pages/settings/SettingsPage.tsx:57-63`
- **Issue**: After successful account deletion, the page never calls `logout()` or navigates away. The user remains "logged in" with stale auth state.
- **Fix**: Call `logout()` and redirect to home after successful deletion.
- **Severity**: Broken user flow.
- **PRD**: [`plans/D16-fix-account-deletion.md`](plans/D16-fix-account-deletion.md)

### 3.9 Recipe Service Layer Imports `drizzle-orm` Directly
- **File**: `apps/api/src/modules/recipe/service.ts:16-24, 202-284`
- **Issue**: `service.ts:createRecipe` imports `eq` from `drizzle-orm` and runs an inline `db.transaction` over six schema tables (`recipes`, `recipeVersions`, `recipeTasteNotes`, `recipeEquipment`, `recipeAdditionalPreparations`, `recipeVersionPhotos`). This violates the project's layering rule (AGENTS.md) that services must not import from `drizzle-orm` directly. The file-level docstring's "except for the compatibility validation helper" exception is outdated — that helper is pure and does not touch Drizzle. Other recipe operations (`forkRecipe`, `createVersion`, `update`, `toggleLike`) already follow the correct pattern of delegating to model helpers.
- **Fix**: Move the entire `createRecipe` transaction body into a new `model.createRecipeWithRelations(input)` helper in `model.ts` (alongside the analogous `forkRecipe` helper), then replace the inline transaction in the service with a single model call. Remove the now-unused `drizzle-orm`, schema table, and `db` imports from `service.ts`. Update the file-level docstring.
- **Severity**: Layering violation; reduced encapsulation; no runtime bug.
- **PRD**: [`plans/D29-recipe-service-drizzle-orm-import.md`](plans/D29-recipe-service-drizzle-orm-import.md)

---

## 4. Medium — Frontend Code Quality

### 4.1 Duplicate Component Definitions
- **Files**: Multiple locations
- **Issue**: `RecipeCard` is duplicated in `HomePage`, `RecipeListPage`, `StarredRecipesPage`, and admin pages (each with slightly different structure). `Section`/`Field` helpers are duplicated between `RecipeCreatePage` and `RecipeEditPage`. Ban dialog is duplicated between `AdminUsersPage` and `AdminUserDetailPage`.
- **Fix**: Extract `RecipeCard`, `Section`/`Field`, and `BanDialog` into shared components under `components/recipe/` and `components/admin/`.
- **Severity**: Inconsistency and maintenance burden.

### 4.2 Dead Code — Duplicate NotFoundPage Exports
- **Files**: `apps/web/src/pages/NotFoundPage.tsx`, `apps/web/src/pages/ErrorPage.tsx`
- **Issue**: `ErrorPage.tsx` exports `NotFoundPage`, `ServerErrorPage`, and `ForbiddenPage`, but the router imports from `NotFoundPage.tsx` only. The `ErrorPage.tsx` versions are dead code — never imported.
- **Fix**: Remove duplicate exports from `ErrorPage.tsx` or consolidate.
- **Severity**: Dead code; confusion about which to use.

### 4.3 Silent Error Swallowing
- **Files**: `RecipeListPage.tsx` (5), `RecipeDetailPage.tsx` (1), `StarredRecipesPage.tsx` (3), `SettingsPage.tsx` (2), `SetupListPage.tsx` (3), `BeanListPage.tsx` (3), `EquipmentListPage.tsx` (3), `UserProfilePage.tsx` (1), `HomePage.tsx` (1) — total 22+ occurrences
- **Issue**: `.catch(() => {})` silently swallows errors for non-critical data loads. Users see no feedback when data fails to load.
- **Fix**: Log errors at minimum; show user-facing error states for critical data.
- **Severity**: Silent failures degrade UX.
- **PRD**: [`plans/D17-fix-error-swallowing.md`](plans/D17-fix-error-swallowing.md)

### 4.4 No Optimistic Update Rollback
- **Files**: `apps/web/src/components/recipe/LikeButton.tsx`, `FavouriteButton.tsx`, `apps/web/src/components/user/FollowButton.tsx`
- **Issue**: These components do optimistic UI updates but never rollback on failure (they silently catch errors).
- **Fix**: Store previous state and restore on API failure.
- **Severity**: UI shows incorrect state after failed mutations.
- **PRD**: [`plans/D18-fix-optimistic-rollback.md`](plans/D18-fix-optimistic-rollback.md)
- **Status**: Resolved in pilot scope (D18 follow-up; remaining scope: ensure error tracking for rolled-back mutations)

### 4.5 Hardcoded English Strings (Incomplete i18n)
- **Files**: `RecipeCreatePage.tsx`, `RecipeEditPage.tsx`, `AdminLayout.tsx`, `AdminDashboard.tsx`, `RecipeComparePage.tsx`
- **Issue**: Section titles, admin labels, and some UI text are hardcoded in English despite i18n being available via `t()`.
- **Fix**: Move all user-facing strings to translation keys.
- **Severity**: Incomplete localisation; Turkish translation will be partial.

### 4.6 `Record<string, unknown>` in API Types
- **File**: `apps/web/src/api/index.ts`
- **Issue**: Most API return types use `Record<string, unknown>` instead of properly typed interfaces. `RecipeListItem` is locally defined in `RecipeListPage` instead of using a shared type.
- **Fix**: Define proper TypeScript interfaces for all API responses in `@brewform/shared/types`.
- **Severity**: Loses type safety at the API boundary.

---

## 5. Low — Schema & Database

### 5.1 `report.status` Uses String Instead of Enum
- **File**: `packages/db/src/schema.ts:749`
- **Issue**: `reports.status` is `varchar('status', { length: 50 })` with a default, not a pgEnum. The Zod schema defines `ReportStatusEnum` but the DB has no constraint on valid values.
- **Fix**: Create a pgEnum for report status and use it in the schema.
- **Severity**: DB allows invalid status values.
- **PRD**: [`plans/D20-fix-report-status-enum.md`](plans/D20-fix-report-status-enum.md)

### 5.3 `CoffeeVariety` Type Uses `string` for Dates
- **File**: `packages/shared/src/types/coffee-variety.ts:34-36`
- **Issue**: `createdAt`, `updatedAt`, `deletedAt` are typed as `string` while all other entity types use `Date`.
- **Fix**: Use `Date` consistently.
- **Severity**: Type inconsistency.
- **PRD**: [`plans/D22-fix-coffee-variety-dates.md`](plans/D22-fix-coffee-variety-dates.md)

### 5.4 Missing Composite Indexes
- **File**: `packages/db/src/schema.ts`
- **Issue**: Common query patterns lack composite indexes: `recipe(authorId, visibility)`, `recipe(visibility, createdAt)`, `recipe(visibility, likeCount)`, `recipe(visibility, featured)`.
- **Fix**: Add composite indexes for high-traffic query patterns.
- **Severity**: Query performance degradation at scale.
- **PRD**: [`plans/D23-add-composite-indexes.md`](plans/D23-add-composite-indexes.md)

### 5.5 Missing `createdAt`/`updatedAt` on Join Tables
- **File**: `packages/db/src/schema.ts`
- **Issue**: Join tables (`recipe_taste_note`, `recipe_equipment`, `recipe_version_photo`, `user_follow`, `user_recipe_like`, `user_recipe_favourite`, `user_recipe_rating`) lack `createdAt` timestamps.
- **Fix**: Add timestamps to all join tables for audit trail.
- **Severity**: No audit trail for social interactions.

---

## 6. Low — Infrastructure & DX

### 6.1 Incomplete OpenAPI Documentation
- **Files**: Only 5 of 18 modules have `describeRoute()` decorators (auth, recipe, admin, health, openapi). Missing: user, bean, equipment, taste, photo, comment, follow, badge, setup, preference, report, contact, coffee-variety, vendor.
- **Fix**: Add OpenAPI annotations to all route modules.
- **Severity**: Incomplete API documentation.
- **PRD**: [`plans/D25-complete-openapi-docs.md`](plans/D25-complete-openapi-docs.md)

### 6.2 Logging Coverage Gaps
- **File**: `TODO_logs.md`
- **Issue**: 15+ API services and 30+ web pages still lack structured logging coverage.
- **P1 services**: user, vendor, bean, setup, report, coffee-variety
- **P2 services**: preference, taste, qrcode, auth middleware, cors, rateLimit
- **P2 pages**: All admin pages, user profile, recipe versions/compare/focus, starred recipes, bean/setup/equipment CRUD, coffee varieties, taste notes, settings, context providers
- **Fix**: Expand logging per `TODO_logs.md` priorities.
- **Severity**: Reduced observability in production.
- **PRD**: [`plans/D26-expand-logging.md`](plans/D26-expand-logging.md)

### 6.3 No Request Body Size Limits at Hono Level
- **File**: `apps/api/src/main.ts`
- **Issue**: Only file upload size is limited via `UPLOAD_MAX_SIZE_BYTES`. No global request body size limit is configured at the Hono level, making the API vulnerable to large payload attacks.
- **Fix**: Add body size limit middleware (e.g., 1MB default).
- **Severity**: Potential DoS vector.
- **PRD**: [`plans/D24-add-request-body-limit.md`](plans/D24-add-request-body-limit.md)

### 6.4 Offset-Based Pagination
- **Files**: All paginated API endpoints
- **Issue**: All pagination uses offset-based (`page`/`perPage`). This degrades at scale (OFFSET scans all previous rows) and causes inconsistent results when data changes between pages.
- **Fix**: Migrate to cursor-based pagination for large datasets.
- **Severity**: Performance issue at scale.
- **PRD**: [`plans/D27-cursor-pagination.md`](plans/D27-cursor-pagination.md)

### 6.5 Duplicate `NotFoundPage` / Error Page Confusion
- **Files**: `apps/web/src/pages/NotFoundPage.tsx`, `apps/web/src/pages/ErrorPage.tsx`
- **Issue**: Two files export error-related components with overlapping names. `ErrorPage.tsx` exports `NotFoundPage` (dead code), `ServerErrorPage`, and `ForbiddenPage`. The router only imports from `NotFoundPage.tsx`.
- **Fix**: Consolidate error pages into a single module; use `ErrorPage.tsx` as the canonical source.
- **Severity**: Developer confusion.

---

## Summary — Priority Action Items

| Priority | Item | Area | Effort |
|----------|------|------|--------|
| **P0** | Fix vendor update missing ownership check | Security | Trivial |
| **P0** | Fix recipe fork broken navigation | Frontend | Trivial |
| **P0** | Consolidate email transporters | Backend | Low |
| **P0** | Replace raw SQL in equipment model | Backend | Low |
| **P1** | Add React Router 7 loaders for data fetching (D10) | Frontend | High |
| **P1** | Fix `DrinkType` type missing 4 values | Shared | Trivial |
| **P1** | Fix admin soft-delete inconsistency | Backend | Trivial |
| **P1** | Fix comment pagination (resolved in pilot scope) | Frontend | Low |
| **P1** | Fix account deletion logout | Frontend | Trivial |
| **P1** | Eliminate `any` types in API services | Backend | High |
| **P2** | Extract shared RecipeList components | Frontend | Medium |
| **P2** | Extract shared recipe filter logic | Backend | Medium |
| **P2** | Create single source of truth for enums | Shared | Medium |
| **P2** | Fix `useUnitSystem` reactivity | Frontend | Low |
| **P2** | Move recipe createRecipe transaction into model helper (D29) | Backend | Low |
| **P2** | Add optimistic update rollback (resolved in pilot scope) | Frontend | Low |
| **P2** | Replace `Record<string, unknown>` with proper types | Frontend | Medium |
| **P3** | Add composite indexes for common queries | DB | Low |
| **P3** | Complete OpenAPI documentation | Backend | Medium |
| **P3** | Expand logging coverage per TODO_logs.md | Both | Medium |
| **P3** | Add request body size limits | Backend | Trivial |
| **P3** | Migrate to cursor-based pagination | Both | High |
| **P3** | Complete i18n coverage | Frontend | Medium |
