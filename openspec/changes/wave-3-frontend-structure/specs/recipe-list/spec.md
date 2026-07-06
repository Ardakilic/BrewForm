## ADDED Requirements

### Requirement: HomePage adopts the shared RecipeCard as the canonical card for public recipe listings

The `RecipeCard` component exported from `apps/web/src/components/recipe-list/` MUST be the single
canonical card for public recipe listings (established by the `recipe-list` capability's "Shared
recipe-list view component" and "Module barrel and re-exports" requirements). The `HomePage`
component SHALL import and render this shared `RecipeCard` for both the "Latest Recipes" and
"Popular Recipes" sections. No other page in `apps/web/src/pages/` SHALL define a local `RecipeCard`
function component for public recipe listings.

This requirement extends the `recipe-list` capability's scope from "the shared module backs
`/recipes` and `/recipes/starred`" to "the shared `RecipeCard` is the canonical card for ALL public
recipe listings, including the home page." The `AdminRecipesPage` table (which uses a `<table>`,
not cards) is explicitly out of scope — see the `web-shared-components` requirement "AdminRecipesPage
table is NOT extracted (stretch rejected)."

**Reason:** `HomePage.tsx` had a local `RecipeCard` fork (lines 103–137) that was a stale subset of
the shared card (missing the `currentVersion` badge row). The D36 plan's Cluster 1 deletes the fork
and imports the shared card. This requirement codifies the canonical-card contract so future pages
don't re-fork it. This is a narrow scope extension of `recipe-list` (not a general dedup spec);
the broader dedup work (BanDialog, Section/Field) is covered by the new `web-shared-components`
capability.

#### Scenario: HomePage imports the shared RecipeCard

- **WHEN** the source of `apps/web/src/pages/HomePage.tsx` is inspected
- **THEN** it imports `RecipeCard` from `../components/recipe-list/` (or the barrel
  `../components/recipe-list/index.ts`) and contains NO local `function RecipeCard` definition

#### Scenario: No public recipe listing page defines a local RecipeCard

- **WHEN** `grep -rn "function RecipeCard" apps/web/src/pages/` is run
- **THEN** no matches are returned — no page defines a local `RecipeCard` function (the shared
  `components/recipe-list/RecipeCard.tsx` is the only definition)

#### Scenario: HomePage renders the currentVersion badge row via the shared card

- **WHEN** `HomePage` is rendered with loader data where recipes have `currentVersion` populated
- **THEN** each card renders the badge row (brew method • drink type • ★ rating) — the shared
  `RecipeCard` behaviour, previously absent from the home page's local fork

#### Scenario: HomePage test passes unchanged

- **WHEN** `make test-web` is executed (or `deno task --cwd apps/web test src/pages/HomePage.test.tsx`)
- **THEN** the existing `HomePage.test.tsx` suite passes — assertions on author buttons, titles, and
  counts still hold because the shared `RecipeCard` has the same `<button>` + `<Link>` structure