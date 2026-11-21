# Recipes

Recipes are the core entity of BrewForm. This document covers the versioning model, forking,
validation rules, and visibility controls.

## Two-Layer Model

A recipe consists of two layers:

- **Recipe** — mutable metadata (title, visibility, fork reference, like/favourite counts)
- **RecipeVersion** — an immutable snapshot of all brewing parameters

When you create a recipe, version 1 is automatically created. When you update a recipe with
`bumpVersion: true`, a new immutable version is created while preserving the previous version's
data.

## Versioning

- Each version has a monotonically increasing `versionNumber`
- Versions are **immutable** — once created, they cannot be modified
- The recipe's `currentVersionId` always points to the latest version
- Full version history is accessible via:
  - API: `GET /api/v1/recipes/:slug/versions` — returns all versions for a recipe
  - UI: `/recipes/:slug/versions` — browsable version history page (linked from the
    recipe detail page when `versionCount > 1`)
- Updating with `bumpVersion: false` modifies the current version in place (only for minor
  corrections)

## Forking

Any public or unlisted recipe can be forked:

```
POST /api/v1/recipes/:id/fork
```

- Creates a new recipe owned by the forker
- Links back to the original via `forkedFromId`
- Copies all parameters from the source recipe's latest version
- Starts as `draft` visibility
- Increments `forkCount` on the original recipe
- The forker can modify any parameters after forking

## Slugs

Recipe URLs are `/recipes/<slug>`. The slug is derived from the title when the recipe is created
(also for forks and merges) and never changes afterwards, even when the title is renamed.

- **Built-in ASCII transliteration** (`generateSlug` in `packages/shared/src/utils/slug.ts`, no
  library): apostrophes are dropped, the title is lowercased, nine letters without a decomposition
  (`ı ß æ œ ø đ ð ł þ`) are mapped, `normalize('NFKD')` strips accents (so Turkish
  `Türk Kahvesi` becomes `turk-kahvesi`), every run outside `[a-z0-9]` becomes `-`, and the result
  is trimmed and capped at 93 characters at a hyphen boundary.
- **Fallback for non-Latin titles**: a title that leaves nothing (for example all CJK or Cyrillic)
  gets `recipe-<suffix>`.
- **Suffix when taken**: if the bare slug already exists, a 6-character suffix drawn from
  `23456789bcdfghjkmnpqrstvwxz` (no vowels, no look-alikes) is appended: `<base>-<suffix>`. Slugs
  are unique across all recipes, soft-deleted ones included, so a deleted recipe's slug is never
  reused and old links never open a different recipe.
- **Reserved words and UUID-shaped titles** (`new`, `edit`, `starred`, `unavailable`, `compare`,
  `meta`, `merge`, `versions`, `diff`, `focus`, `fork`, `search`, `feed`, `share`, `recipe`,
  `recipes`) are always suffixed, so they never shadow a static route or a recipe id.
- **Claimed in the transaction**: the recipe insert is the first write of the create and fork
  transactions and uses `ON CONFLICT (slug) DO NOTHING` per candidate (the bare slug, then five
  suffixed ones). A taken candidate moves on to the next one without an error; if every candidate
  is taken the API answers `409 SLUG_CONFLICT`. Concurrent requests for the same title always end
  with distinct slugs.
- **Forks**: the fork title is sanitized and falls back to `Fork of <source title>`, then follows
  the same pipeline.
- **Legacy slugs**: older slugs may contain `_`. They stay addressable, and the QR code route
  accepts them (`QR_CODE_FILENAME_PATTERN`); new slugs never contain `_`.
- **`unlisted` is not secret**: slugs are derived from the title, so an `unlisted` recipe's URL
  can be guessed. `unlisted` means "not listed anywhere"; use `private` for a recipe nobody else
  may open.

## Visibility

| State      | Description                                 | Who Can See          |
| ---------- | ------------------------------------------- | -------------------- |
| `draft`    | Work in progress                            | Author only          |
| `private`  | Saved but not shared                        | Author only          |
| `unlisted` | Accessible via direct link, not in listings | Anyone with the link |
| `public`   | Visible to everyone, searchable, indexable  | Everyone             |

Private and draft recipes are only visible to their author. The `optionalAuthMiddleware` enables
this: anonymous requests see only public recipes, while authenticated requests can also see their
own drafts/private recipes.

## Validation

BrewForm implements two levels of validation:

### Hard Validation (blocks save)

- Brew method and drink type must be compatible (per the brew method compatibility matrix)
- `grindDate` cannot be earlier than `roastDate`
- Required fields must be present (`title`, `brewMethod`, `drinkType`, `preparationNotes`)
- Numeric values must be physically valid (non-negative where required, e.g. dose and yield)
- Taste note IDs must reference existing taste notes
- Equipment IDs must reference existing equipment
- Brew method and equipment compatibility is enforced at save time via the
  `BrewMethodEquipmentRule` table. Incompatible combinations return a `422
  VALIDATION_ERROR` with a `details` array naming each incompatible equipment type.

### Soft Validation (warnings only)

- Espresso ratio outside typical range (< 1:1.5 or > 1:3)
- Extraction time unusually short/long for the brew method
- Brew temperature outside common ranges
- Missing commonly expected optional fields

Soft warnings are returned in the response alongside the data:

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "warnings": [
      { "field": "extractionTimeSeconds", "message": "Extraction time seems short for espresso" }
    ]
  }
}
```

## Canonical Units

All numeric values are stored in canonical (metric) units:

| Measurement      | Storage Unit           |
| ---------------- | ---------------------- |
| Coffee weight    | grams                  |
| Water weight     | grams                  |
| Brew temperature | Celsius                |
| Extraction time  | seconds                |
| Grind size       | micrometers (optional) |
| TDS (Total Dissolved Solids) | percentage (e.g. 1.35 for 1.35%) |

Extraction Yield is **not stored** — it is derived on the client from TDS, extraction
volume, and dose when all three are present:

  EY% = (TDS% / 100 × extractionVolumeMl) / groundWeightGrams × 100

The UI reads `UserPreferences.unitSystem` and `UserPreferences.temperatureUnit` from
the preferences API at page load and converts all displayed measurements via
`packages/shared/src/utils/conversion.ts`.

## Comparison

Two public recipes can be compared side by side:

```
GET /api/v1/recipes/compare/:id1/:id2
```

Returns both recipes' latest versions with all parameters for side-by-side display. If either recipe
becomes private/draft, the comparison becomes inaccessible.

## Filtering by Main Brewer

Recipes can be filtered by the main brewer's name via the `mainBrewer` query parameter on the list endpoint:

```
GET /api/v1/recipes?mainBrewer=Lelit%20Mara%20X
```

This performs a case-insensitive partial match on `recipeVersions.brewerDetails`.

## Like and Favourite

- **Like**: Toggle endpoint — `POST /api/v1/recipes/:id/like`. Returns `{ liked: boolean }`. If
  already liked, unlikes. If not liked, likes.
- **Favourite**: Toggle endpoint — `POST /api/v1/recipes/:id/favourite`. Returns
  `{ favourited: boolean }`. Same toggle pattern.

Both increment/decrement the `likeCount`/`favouriteCount` on the recipe.

## Featured Recipes

Users can feature one of their recipes on their profile:

```
POST /api/v1/recipes/:id/feature
```

Toggle pattern — if already featured, unfeatures. Only the author can feature their recipe.

## Recipe Meta (Social Crawlers)

```
GET /api/v1/recipes/meta/:slug
```

Returns minimal recipe metadata (title, description, image) for social media crawlers (Open Graph,
Twitter Cards) without requiring authentication.
