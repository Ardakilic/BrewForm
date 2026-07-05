# model-test-coverage Specification

## Purpose

Backfills characterisation test coverage for the highest-traffic untested web and API surfaces: the `recipe-list/` shared components shipped by D11, the `RequireAuth` route guard, and the API model test conventions. Establishes that new test files follow existing project conventions (inline fixtures, no shared helpers) and that no untested exported function remains in the covered modules.

## Requirements

### Requirement: recipe-list web components have Vitest test coverage

The following files SHALL exist in `apps/web/src/components/recipe-list/` with Vitest + Testing Library test coverage:

- `RecipeCard.test.tsx` — covers: renders recipe title (links to `/recipes/${slug}`); renders author username with a button that `stopPropagation()` and navigates to `/u/${author.username}`; renders `currentVersion.brewMethod` / `drinkType` / `rating`; renders `likeCount` / `commentCount` / `forkCount`; handles missing author (renders "unknown"); handles missing `currentVersion` (optional rendering). Uses `createMemoryRouter` + `RouterProvider` (component uses `useNavigate`). Logger mock via `vi.hoisted`.

- `FilterField.test.tsx` — covers: renders the `label` text; renders `children` passthrough. Pure presentational, no router needed.

- `ActiveFilterBadge.test.tsx` — covers: renders `label` + `value`; the ✕ button has `aria-label="Remove ${label} filter"`; clicking ✕ calls `onRemove`. No router needed.

- `PaginationControls.test.tsx` — covers: Previous button hidden on page 1; Next button hidden on last page (`page === totalPages`); clicking Previous calls `onPageChange(page - 1)`; clicking Next calls `onPageChange(page + 1)`; `pageLabel` placeholder substitution (`{page}` → page, `{total}` → total); `previousLabel` / `nextLabel` rendered verbatim. No router needed.

- `useRecipeFilters.test.tsx` — covers: default values when no search params (`page = 1`, `sortBy = 'createdAt'`, scalars `''`, `tasteNoteIds = []`); parsing each scalar filter from the URL query string; `tasteNoteIds` parsed as comma-separated and filtered through the UUID regex (non-UUID values dropped); `updateFilter(key, scalarValue)` sets the param (or deletes if empty); `updateFilter(key, arrayValue)` joins with `,`; `updateFilter` always clears `page` (resets to page 1 on filter change); `clearAllFilters()` empties all params. Tested via a `TestConsumer` component that calls `useRecipeFilters()` and renders the return fields to `data-testid` spans. Render via `createMemoryRouter` with `initialEntries` carrying the query string (pattern from `AuthContext.test.tsx`).

- `RecipeListView.test.tsx` — covers: renders `RecipeCard`s for each recipe in `recipesResponse.data`; loading state shows skeleton (`source: 'all'`) vs text (`source: 'starred'`) based on `useNavigation().state`; empty state when `data` is empty; `hasActiveFilters` shows the Clear button; admin visibility filter only renders when `showAdminVisibilityFilter = true`; pagination hidden when `total <= PER_PAGE` (12); `ActiveFilterBadge`s render for active equipment/mainBrewer/tasteNotes/coffeeVariety filters. Uses `createMemoryRouter` + `RouterProvider`, mocks `useTranslation` (or wraps in `I18nProvider`).

Tests SHALL follow the existing Vitest convention: imports from `vitest` (`{ beforeEach, describe, expect, it, vi }`), `@testing-library/react` (`{ render, screen, waitFor }`), `@testing-library/user-event` (`userEvent`). Logger mock via `vi.hoisted` + `vi.mock('@/utils/logger.ts', () => ({ createLogger: () => mockLogger }))`. `beforeEach(() => vi.clearAllMocks())`. Components using router hooks render via `createMemoryRouter` + `RouterProvider` with `initialEntries`.

**Reason:** D11 shipped the `recipe-list/` deduplication (8 files backing both `/recipes` and `/recipes/starred`) without tests. These components are the highest-traffic untested web surface. D39 Tier 1 backfills them.

#### Scenario: RecipeCard test passes

- **WHEN** `make test-web` is executed (or `deno task --cwd apps/web test src/components/recipe-list/RecipeCard.test.tsx`)
- **THEN** the `RecipeCard.test.tsx` suite passes, covering title render, author button stopPropagation, and currentVersion optional rendering

#### Scenario: useRecipeFilters test covers param parsing and updateFilter

- **WHEN** `make test-web` is executed
- **THEN** the `useRecipeFilters.test.tsx` suite passes, covering default values, scalar parsing, `tasteNoteIds` UUID filtering, `updateFilter` set/delete/array-join/page-reset, and `clearAllFilters`

#### Scenario: RecipeListView test covers loading and empty states

- **WHEN** `make test-web` is executed
- **THEN** the `RecipeListView.test.tsx` suite passes, covering loading skeleton (source='all'), loading text (source='starred'), empty state, hasActiveFilters Clear button, admin visibility filter conditional, and pagination visibility

#### Scenario: No pre-existing web test regresses

- **WHEN** `make test-web` is executed on a clean checkout with the new test files
- **THEN** all pre-existing web tests (`HomePage`, `LoginPage`, `AuthContext`, etc.) still pass — zero regressions

### Requirement: RequireAuth component has Vitest test coverage

The file `apps/web/src/components/auth/RequireAuth.test.tsx` SHALL exist and SHALL cover the 4 branches of `RequireAuth`:

1. **Loading:** `useAuth()` returns `{ isLoading: true }` → renders `<PageSkeleton />`, does NOT render children.
2. **Unauthenticated:** `useAuth()` returns `{ isLoading: false, isAuthenticated: false }` → renders `<Navigate to='/login' />`, does NOT render children.
3. **Authenticated non-admin with `requireAdmin`:** `useAuth()` returns `{ isLoading: false, isAuthenticated: true, user: { isAdmin: false } }` with `requireAdmin = true` → renders `<Navigate to='/' />`, does NOT render children.
4. **Authenticated admin (or `requireAdmin` false):** `useAuth()` returns `{ isLoading: false, isAuthenticated: true, user: { isAdmin: true } }` → renders children.

Tests SHALL mock `useAuth` by wrapping `RequireAuth` in a test `AuthContext.Provider` with a controlled value (or via `vi.mock` of `../../contexts/AuthContext.tsx`). Render under `MemoryRouter` to observe `<Navigate>` targets. Assert children presence/absence via a `data-testid` on a child element.

**Reason:** `RequireAuth` is the route guard for every authenticated and admin page. It has zero tests. D39 Tier 1 backfills it.

#### Scenario: RequireAuth loading shows skeleton

- **WHEN** `useAuth` returns `isLoading: true` and `RequireAuth` is rendered
- **THEN** the skeleton renders (via `PageSkeleton`) and the children do NOT appear in the DOM

#### Scenario: RequireAuth unauthenticated redirects to login

- **WHEN** `useAuth` returns `isAuthenticated: false` and `RequireAuth` is rendered under `MemoryRouter`
- **THEN** the router navigates to `/login` and children do NOT render

#### Scenario: RequireAuth non-admin with requireAdmin redirects home

- **WHEN** `useAuth` returns `isAuthenticated: true, user: { isAdmin: false }` with `requireAdmin = true`
- **THEN** the router navigates to `/` and children do NOT render

#### Scenario: RequireAuth admin renders children

- **WHEN** `useAuth` returns `isAuthenticated: true, user: { isAdmin: true }` with `requireAdmin = true`
- **THEN** children render in the DOM

### Requirement: New test files follow existing project conventions

All new test files (API and web) SHALL follow the existing project test conventions:

**API tests (`apps/api/src/modules/equipment/model.test.ts`, `apps/api/src/modules/vendor/model.test.ts`):**
- `// deno-lint-ignore-file no-explicit-any require-await` file header (matches `admin/model.test.ts`).
- `import '../../test-setup.ts';` as the first import (sets `DATABASE_URL`/`JWT_SECRET`/`LOG_LEVEL` if missing).
- `{ afterEach, beforeEach, describe, it }` from `jsr:@std/testing/bdd`, `expect` from `jsr:@std/expect`.
- Real `db` from `@brewform/db`, schema tables from `@brewform/db/schema`, `* as model from './model.ts'`.
- Inline `crypto.randomUUID()` fixtures; `db.insert(users).values({ id, email: \`test-${userId}@example.com\`, username: \`testuser-${userId}\`, passwordHash: 'hash' })`.
- `afterEach` hard-deletes test rows (child tables first, then parent).
- Every `describe` gets `{ sanitizeOps: false, sanitizeResources: false }` as the second argument (required for DB I/O tests — the real connection pool leaks across the test boundary).
- `'should ...'` `it` naming (matches `admin/model.test.ts`).

**Web tests (`recipe-list/*.test.tsx`, `RequireAuth.test.tsx`):**
- `{ beforeEach, describe, expect, it, vi }` from `vitest`, `{ render, screen, waitFor }` from `@testing-library/react`, `userEvent` from `@testing-library/user-event`.
- Logger mock via `vi.hoisted(() => ({ mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))` + `vi.mock('@/utils/logger.ts', () => ({ createLogger: () => mockLogger }))`.
- `beforeEach(() => vi.clearAllMocks())`.
- Components using router hooks (`useNavigate`, `useSearchParams`, `useNavigation`, `useLocation`) render via `createMemoryRouter` + `RouterProvider` with `initialEntries`.
- Hook tests (`useRecipeFilters`) use a `TestConsumer` component that renders hook return fields to `data-testid` spans (pattern from `AuthContext.test.tsx`).

**Reason:** Following existing conventions keeps the test suite consistent and avoids introducing new patterns that would need separate documentation. The existing patterns are proven by `admin/model.test.ts` (API) and `AuthContext.test.tsx` / `LikeButton.test.tsx` (web).

#### Scenario: API test files have the lint-ignore header and test-setup import

- **WHEN** the new API test files are inspected
- **THEN** the first line is `// deno-lint-ignore-file no-explicit-any require-await` and the first import is `import '../../test-setup.ts';`

#### Scenario: API test describe blocks have sanitizer options

- **WHEN** the new API test files are inspected at each `describe` call
- **THEN** the second argument is `{ sanitizeOps: false, sanitizeResources: false }`

#### Scenario: Web test files use vi.hoisted logger mock

- **WHEN** the new web test files are inspected
- **THEN** they use `vi.hoisted` for the logger mock and `vi.mock('@/utils/logger.ts', ...)` with `beforeEach(() => vi.clearAllMocks())`

### Requirement: No shared test helper or fixture factory is introduced

The new test files SHALL inline their own fixtures (per-test `crypto.randomUUID()` + `db.insert(...)`) and mocks. No shared `testDb`, `makeUser`, `makeRecipe`, or `test-utils` helper file SHALL be created.

**Reason:** The existing project convention (verified across all 60 API test files and 65 web test files) is "copy-paste the fixture inline per describe block." No shared helper exists. Introducing one in Wave 2 would be a new convention requiring separate review. The existing pattern is verbose but explicit and avoids cross-test coupling.

#### Scenario: No new helper files are created

- **WHEN** the Wave 2 change is inspected for new files
- **THEN** no `*helper*`, `*fixture*`, or `*test-utils*` files appear in `apps/api/src/` or `apps/web/src/` — all fixtures are inline in the test files