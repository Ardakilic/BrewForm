## Two-Layer Model

- **Recipe** — mutable metadata (title, visibility, like/favourite counts, `currentVersionId`, `forkedFromId`, `forkCount`)
- **RecipeVersion** — immutable snapshot of all brewing parameters

Create always auto-creates version 1. Update with `bumpVersion: true` creates new version; `bumpVersion: false` modifies current version in place (minor corrections only).

## Versioning Invariants

- `versionNumber` monotonically increasing per recipe.
- Versions are **immutable** once created.
- `currentVersionId` always points to latest version.
- Full history: `GET /recipes/:slug/versions` (API) and `/recipes/:slug/versions` (UI).

## Forking

- `POST /recipes/:id/fork` — copies latest version to new recipe owned by forker.
- Sets `forkedFromId`, starts as `draft` visibility.
- Increments `forkCount` on original.

## Visibility States

| State | Seen by |
|-------|---------|
| `draft` | Author only |
| `private` | Author only |
| `unlisted` | Anyone with link (not in listings) |
| `public` | Everyone, searchable, indexable |

`optionalAuthMiddleware` gates visibility: anonymous → public only; authenticated → + own drafts/private.

## Validation

- **Hard** (blocks save): brew method × drink type compatibility, `grindDate >= roastDate`, required fields, numeric bounds, taste note IDs must exist, equipment IDs must exist, brew method × equipment compatibility via `BrewMethodEquipmentRule` table.
- **Soft** (warnings, never blocks): espresso ratio <1:1.5 or >1:3, extraction time unusual for method, temperature outside common range, missing expected optional fields. Returned in `meta.warnings` array.

## Canonical Units

| Measurement | Unit |
|-------------|------|
| Coffee weight | grams |
| Water weight | grams |
| Temperature | Celsius |
| Time | seconds |
| Grind size | micrometers (optional) |
| TDS | percentage (e.g. 1.35) |

Extraction yield derived client-side: `EY% = (TDS%/100 × extractionVolumeMl) / groundWeightGrams × 100`. Not stored.

UI reads `UserPreferences.unitSystem` + `temperatureUnit` for display conversion.

## Filtering (GET /recipes)

Parameters: `brewMethod`, `drinkType`, `visibility`, `authorId`, `search` (title), `equipmentId`, `tasteNoteIds` (AND, max 10), `grinder`, `mainBrewer` (partial, case-insensitive), `sortBy` (createdAt/likeCount/rating), `sortOrder` (asc/desc). Paginated: `page` (1-based), `perPage` (max 100).
