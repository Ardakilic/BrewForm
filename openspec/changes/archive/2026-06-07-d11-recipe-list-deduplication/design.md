## Context

`RecipeListPage` and `StarredRecipesPage` were built by copy-paste with
minimal extraction. After D10 (React Router 7 data loading, commit
`fac8863` on `main`) the two pages both export `loader` and use
`useLoaderData()`, so the underlying data shape is already aligned:

```text
loader data
   recipesResponse: { data: RecipeListItem[]; meta: { pagination?: { total?: number } } }
   equipment:       EquipmentListItem[]
   tasteNotes:      TasteNoteFlatItem[]
```

The remaining divergence is purely view-layer. A validated plan exists at
`plans/D11-recipe-list-deduplication.md` (June 2026) with eight corrections
applied against `main`. The original plan had this to say:

> Eight errors were found in the original plan during validation against
> the `main` branch.

This design adopts every correction in the validated plan. The full
proposal–design–spec–task structure lets a fresh-context agent execute
the work without re-discovering the codebase.

### Codebase facts (verified)

- Drizzle schema enums live in `packages/shared/src/constants/equipment-types.ts`
  and are exported via `packages/shared/src/constants/index.ts` → `@brewform/shared/constants`.
- `EQUIPMENT_TYPE_LABELS` (shared, canonical) has 17 entries with
  `'Pour-Over & Filter Brewer'` and `'Immersion & Pressure Brewer'`.
- `RecipeListPage` local copy diverges on those two labels.
- `StarredRecipesPage` has 11 types with stale `gooseneck_kettle` and
  `scale` keys.
- `apps/web/src/api/static-cache.ts` already centralises
  `getEquipmentCached()` and `getTasteNotesCached()` (D10).
- `apps/web/src/components/recipe/RecipeCard.styles.ts` exports only
  `AUTHOR_BUTTON_STYLE` (8 lines). There is no `RecipeCard.tsx` — the
  component is defined inline in both pages.
- Tests run with Vitest + jsdom (`apps/web/vitest.config.ts`).
- `apps/web/deno.json` `test` task is `deno run -A npm:vitest run`.

### Stakeholders

- Web app (`apps/web/`) — affected.
- API and DB packages — not affected.
- Product — needs to confirm two renamed labels are acceptable
  (medium-risk visible change).

## Goals / Non-Goals

**Goals:**

- Reduce `RecipeListPage.tsx` from 650 → ~80 lines and
  `StarredRecipesPage.tsx` from 515 → ~40 lines.
- Introduce a single, self-contained `apps/web/src/components/recipe-list/`
  module with no dependencies on either page.
- Resolve the four per-page behavioural divergences (loading state,
  total fallback, taste-note i18n key, navigation path check) inside
  `RecipeListView` driven by a `source: 'all' | 'starred'` prop.
- Eliminate the equipment-label drift by re-exporting
  `EQUIPMENT_TYPE_LABELS` from `@brewform/shared/constants` (no
  duplication).
- Preserve every existing behaviour on `/recipes` and intentionally
  tighten `/recipes/starred` (more filters, corrected labels, plural
  i18n key) — these are the same drift fixes the original plan calls
  for.
- Pass `make check-web` and the two page test files without test-logic
  changes (one import-line update in `RecipeListPage.test.tsx`).

**Non-Goals:**

- No new dependencies (no `npm install`, no `deno install`).
- No backend changes (D12 owns backend filter dedup; not in scope).
- No module-level cache changes (D10 already extracted
  `static-cache.ts`; D13 is its own concern).
- No `RecipeCard.tsx` promotion into `components/recipe/`. The card is
  only consumed by the list pages; promoting it now would be
  premature.
- No change to `router.tsx` — both pages still export `loader` and
  `RecipeListPage` / `StarredRecipesPage`.
- No change to `apps/web/src/api/static-cache.ts` —
  `getEquipmentCached()` / `getTasteNotesCached()` already exist.
- No change to `apps/web/src/components/recipe/RecipeCard.styles.ts` —
  `AUTHOR_BUTTON_STYLE` stays where it is; only its importer moves.
- No new loader, no API endpoint, no Drizzle migration, no
  documentation update to `AGENTS.md`.
- No admin-side equipment creation: the refactor does not address
  whether equipment added in another tab appears immediately (D13
  concern).

## Decisions

### Decision 1: New module under `apps/web/src/components/recipe-list/`

**Rationale**: A dedicated `recipe-list/` directory matches the existing
`recipe/` and `auth/` patterns under `components/`. Putting the module
alongside other components keeps the import surface small and makes the
"all recipe list UI lives here" rule obvious to the next reader.

**Alternatives considered**:
- `apps/web/src/features/recipe-list/` — rejected; the codebase does
  not use a `features/` convention.
- `apps/web/src/pages/recipes/_shared/` — rejected; co-locating with
  page components muddies the page ↔ shared distinction and the next
  shared component would naturally land elsewhere.

### Decision 2: `source: 'all' | 'starred'` prop on `RecipeListView`

**Rationale**: The view has only two callers. A boolean would be opaque
(`isStarred` reads as "is this the starred page?" but loses context).
A union string is self-documenting at every call site and makes
exhaustive `switch` checks possible.

**Alternatives considered**:
- Two separate components — rejected; would re-introduce drift.
- Boolean `isStarred` prop — rejected; loses the domain vocabulary.
- Render-prop slot for the page header — rejected; no header
  divergence exists.

### Decision 3: Slot for coffee-variety filter, not embedded state

**Rationale**: The coffee-variety filter is the only piece of
RecipeListPage state that doesn't belong in the shared view: it has
its own debounced search, dropdown positioning, click-outside handler,
and lazy variety-name resolution. Lifting it into the view would
inflate the view's surface with no benefit to `/recipes/starred`.
A `coffeeVarietyFilterSlot?: ReactNode` keeps the view focused on
filter presentation and lets the page own its search UX.

**Alternatives considered**:
- Move all variety state into the view, hide it via the `source` prop
  — rejected; bloats the view with 100+ lines of state machinery
  that `/recipes/starred` will never use.
- Use a `renderCoffeeVarietyFilter` render-prop function — rejected;
  adds ceremony without benefit (the slot never needs to be
  conditionally rendered, just optionally present).

### Decision 4: Boolean `showAdminVisibilityFilter` prop

**Rationale**: The visibility filter is a 14-line `<FilterField>` that
depends only on `user.isAdmin`. Boolean props are the idiomatic React
way to opt into small UI additions. The visibility option list is
already imported from `@brewform/shared/constants` and re-rendered
identically across pages.

**Alternatives considered**:
- Pass `user: AuthUser | null` and let the view decide — rejected;
  leaks more auth shape than the view needs.
- Use a slot like the coffee-variety filter — rejected; the visibility
  filter has no per-page state to share, a boolean is the minimum
  signal.

### Decision 5: `emptyMessageKey: string` prop

**Rationale**: `recipe.list.noResults` (all) and `recipe.starred.noResults`
(starred) are the only two empty-state messages. A string prop is
minimal and forward-compatible — adding a new source in the future
just supplies a new key.

**Alternatives considered**:
- Two boolean props (`useListNoResults`, `useStarredNoResults`) —
  rejected; doesn't scale, harder to read.
- A slot like the coffee-variety filter — rejected; an empty-state
  message is a single line of JSX with no state, no slot needed.

### Decision 6: `useRecipeFilters` returns parsed values + actions

**Rationale**: The hook is internal to `RecipeListView`. Returning the
parsed scalar values (page, brewMethod, drinkType, etc.) plus the
actions (`updateFilter`, `clearAllFilters`) keeps the view body clean
of `Number(searchParams.get('page')) || 1` repetition. The split
between "parsed scalars" and "actions" is the natural API for a URL
filter hook.

**Alternatives considered**:
- Return only `searchParams` + `setSearchParams` and let the view
  parse — rejected; duplicates the parsing block across view and any
  future consumer.
- Memoize the parsed values with `useMemo` over `searchParams` — the
  hook does this internally; the consumer never sees the cost.

### Decision 7: One shared `RecipeListLoaderData` type

**Rationale**: Both pages' loaders return the same shape. Keeping two
types risks drift (someone adds a field to one loader type and not
the other). The plan validated against `main` keeps two types
(`RecipeListLoaderData` / `StarredRecipesLoaderData`) for "minimum
diff" reasons, but a fresh implementation should collapse them into
one shared type exported from the new module. Both pages import
the same type for their `useLoaderData()` cast.

**Alternatives considered**:
- Keep two separate types — rejected; invites future drift.
- `useLoaderData<typeof loader>()` inference — the D10 plan uses
  this, but the existing pages do `as RecipeListLoaderData` /
  `<StarredRecipesLoaderData>()` casts. Sticking with the cast form
  for minimum diff is fine, but the type itself should be shared.

### Decision 8: `useLoaderData` cast form kept

**Rationale**: Both pages currently use a `useLoaderData()` cast form
(`as RecipeListLoaderData` or `useLoaderData<StarredRecipesLoaderData>()`).
Switching both to `useLoaderData<typeof loader>()` is orthogonal to
this refactor and would inflate the diff. Keep the existing form;
the cast now refers to the shared type from `recipe-list/`.

### Decision 9: `EQUIPMENT_TYPE_LABELS` re-export, not duplicate

**Rationale**: The shared package is the single source of truth.
Re-exporting preserves the existing import surface
(`import { EQUIPMENT_TYPE_LABELS } from '<new location>'`) without
copying the object literal. Using the local copy as source-of-truth
would perpetuate the two label drifts the refactor is supposed to
fix.

**Alternatives considered**:
- Move the local `EQUIPMENT_TYPE_LABELS` to the shared package — it
  already exists there; this would be a no-op.
- Drop the re-export and import directly from
  `@brewform/shared/constants` everywhere — equivalent, but the
  re-export documents the module's intent ("we use the canonical
  labels").

### Decision 10: No `useLoaderData` change for `StarredRecipesPage` auth gate

**Rationale**: The page's `loader` throws `redirect('/login')` on 401,
so by the time `StarredRecipesPage` renders, the user is
authenticated. The `!isAuthenticated` guard is a defensive belt-and-
braces check that the current code does inline. It must stay in the
page wrapper (not the view) because the view is shared with
`RecipeListPage`, which has no auth gate.

### Decision 11: `pageTitle` and `seoDescription` are string props on the view

**Rationale**: The two pages render `<SEOHead>` with different
titles and descriptions:

- `RecipeListPage`:
  `title=t('recipe.list.title')`,
  `description='Browse and discover coffee brewing recipes on BrewForm.'`
- `StarredRecipesPage`:
  `title=t('recipe.starred.title')`,
  `description='Your starred coffee brewing recipes on BrewForm.'`

The cleanest API is two `string` props on `RecipeListView`:

- `pageTitle: string` — the i18n-resolved heading and SEO title
- `seoDescription: string` — the hardcoded SEO description

This avoids an `seoDescriptionKey` indirection (the strings are
not in the i18n catalog) and keeps the view free of hardcoded
copy. The two page wrappers compute both strings via `t()` (for
`pageTitle`) or as a literal (for `seoDescription`) and pass them
in.

**Alternatives considered**:
- Hardcode both SEO strings inside the view, branch on `source` —
  rejected; view becomes a copy-paste target again.
- `useTranslation` inside the view, derive from `source` — rejected;
  view would need to know both i18n keys, which is a coupling
  leak.

### Decision 12: `useLocation()` is no longer used in either page wrapper

**Rationale**: After the refactor, `useLocation()` is only needed
inside `RecipeListView` (for the dynamic `=== location.pathname`
loading-state check). The page wrappers have no remaining use for
it (the original `StarredRecipesPage` used it for the same check,
but the check moves to the view). The mount/unmount log does not
include the pathname in either the original or the refactored
code.

**Action**: remove the `useLocation` import from
`StarredRecipesPage.tsx`; do not add it to `RecipeListPage.tsx`.

## Risks / Trade-offs

- [Two label strings change in the UI] → Document in `pr_desription.md`
  as a visible product change. Product stakeholder to confirm before
  shipping. Low likelihood of pushback (the new names are more
  descriptive of the equipment category).
- [Starred page picks up 6 new equipment dropdowns] → Document in
  `pr_desription.md` as intentional behaviour parity. No rollback
  path needed (the new filters are additive).
- [Taste-note badge i18n key change on `/recipes/starred`] → The
  `enT` and `trT` maps in `StarredRecipesPage.test.tsx` already
  include both `tasteNoteFilter` (singular) and `tasteNotesFilter`
  (plural) keys (lines 131–133). The test does not assert the badge
  label directly, so no test change is required. Mitigation:
  snapshot the new label text in a manual run.
- [Vitest module-resolution for the new module path] → The new
  files live under `apps/web/src/components/recipe-list/`, which
  Vite resolves via the same `@/` and relative-path rules as the
  existing `components/recipe/`. No vitest config change needed.
- [Type-cast ergonomics] → `useLoaderData() as RecipeListLoaderData`
  in `RecipeListPage` and `useLoaderData<StarredRecipesLoaderData>()`
  in `StarredRecipesPage` both refer to the same type. Acceptable
  inconsistency: minimum diff to keep both pages' existing call
  forms.
- [Re-export of `EQUIPMENT_TYPE_LABELS` may mask a future change to
  the shared package] → Mitigation: the re-export is a
  `export { ... } from ...` line, not a copy. Renaming the shared
  label will surface as a missing-export compile error in this
  module.
- [Coffee-variety filter slot duplicates the variety-search state
  setup in `RecipeListPage`] → Mitigation: the page wrapper is
  ~80 lines total; the state machinery is 35 of those lines, all
  already written. No new code, just a relocation.
- [Test file `RecipeListPage.test.tsx` may need additional mock
  updates] → Mitigation: the new module imports from the same
  paths the test already mocks (`@brewform/shared/constants`,
  `static-cache.ts`, `api/index.ts`). The one import-line update
  covers the new constant location.

## Migration Plan

This is an extractive refactor — no data migration, no deploy
sequence, no feature flag. The steps in `tasks.md` are sequenced so
the build is green at every commit:

1. **Add new files** (`components/recipe-list/*`) — pure additions,
   no existing file changes, build stays green.
2. **Refactor `RecipeListPage.tsx`** to use the new view — the
   component is replaced wholesale; both `loader` and the
   `RecipeListPage` export remain.
3. **Update `RecipeListPage.test.tsx`** import — single line.
4. **Refactor `StarredRecipesPage.tsx`** to use the new view — same
   pattern as `RecipeListPage`.
5. **Verify** with `make check-web` and the two page test files.

### Rollback

A single `git revert` of the merge commit reverts all changes
atomically. No database or API state to roll back.

## Open Questions

- **None blocking.** All six questions from the prior analysis have
  been resolved with the approved defaults. See `tasks.md` for the
  exact per-file actions.
