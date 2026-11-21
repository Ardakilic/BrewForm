## MODIFIED Requirements

### Requirement: Brew log form page with create, edit, and prefill

The system SHALL add `BrewLogFormPage` serving both `/brew-logs/new` and `/brew-logs/:id/edit`
(both `RequireAuth`, both with loaders). The shared `BrewLogForm` component SHALL provide fields
for `brewedAt` (native date/datetime input), `yieldActual`, `doseActual`, `notes`, and
`personalRating` (1–10), with client-side constraints matching the shared schemas. On create, the
loader SHALL read `recipeId` (required) and `recipeVersionId` (optional) from the URL search
params, fetch the recipe, and pre-fill `doseActual`/`yieldActual` from the version's parameters as
starting points; a recipe that no longer exists (API 404) SHALL render the not-found page through
`getRecipeOr404`, not the generic load-failed state. On edit, the loader SHALL fetch the existing log
and reject non-owners. Submit SHALL POST/PATCH via `brewLogApi` and navigate back to the brew log
list on success.

#### Scenario: Brew Again prefill

- **WHEN** an authenticated user opens `/brew-logs/new?recipeId=<id>&recipeVersionId=<vid>` from a
  recipe whose current version specifies 15g dose / 250g yield
- **THEN** the form shows that recipe with `doseActual` pre-filled to 15 and `yieldActual` to 250,
  both editable

#### Scenario: Brew Again for a deleted recipe

- **WHEN** an authenticated user opens `/brew-logs/new?recipeId=<id>` for a recipe that has been deleted
- **THEN** the route renders the not-found page and no error is logged

#### Scenario: Edit round-trip

- **WHEN** the owner opens `/brew-logs/:id/edit`, changes the rating, and submits
- **THEN** a PATCH is sent with only the form values and the user lands on the updated list
