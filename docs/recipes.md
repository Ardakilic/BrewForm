# Recipes

Recipes are the core entity of BrewForm. This document covers the versioning model, brewer and
private notes, forking, validation rules, and visibility controls.

## Two-Layer Model

A recipe consists of two layers:

- **Recipe** — mutable metadata (title, visibility, fork reference, like/favourite counts)
- **RecipeVersion** — a snapshot of all brewing parameters (measurements, dates, coffee identity
  including `tds` and the coffee variety, brewer notes, taste notes with intensities, equipment,
  additional preparations and photos)

When you create a recipe, version 1 is automatically created. Every later edit either amends the
current version or saves a new version (`bumpVersion`).

## Versioning

- Each version has a monotonically increasing `versionNumber`
- The **current version is amendable** by the recipe's author; **earlier versions are
  immutable** and are never modified
- The recipe's `currentVersionId` always points to the latest version
- Full version history is accessible via:
  - API: `GET /api/v1/recipes/:slug/versions` — returns all versions for a recipe
  - UI: `/recipes/:slug/versions` — browsable version history page (linked from the
    recipe detail page when `versionCount > 1`)

Editing goes through `PATCH /api/v1/recipes/:id` (author only, verified email required; see
[api.md](api.md)). The body says which fields change: an absent key keeps the
stored value, `null` clears a field, and `[]` removes every taste note, equipment item or
additional preparation. An omitted `visibility` or `isFavourite` is always kept.

- **Amend** (`bumpVersion: false`, the default): every field in the body is written to the
  current version in one transaction, and only the relations in the body are replaced. No new
  version is created. The edit page labels this "Updates the current version (vN) in place".
- **Bump** (`bumpVersion: true`): a new version numbered one above the highest existing version
  is created in one transaction, and the recipe points at it. The edit page labels this "Save as
  a new version".

**Bump carry-forward rules.** The new version starts as a copy of the current version, and the
body overrides only what it provides:

- every scalar field is carried forward, including `tds`, `coffeeVarietyId` and
  `coffeeVarietyName`, `beanId`, `vendorId`, `preInfusionTimeSeconds`, `rating`, `emojiTag`,
  `isFavourite` and the brewer notes;
- taste notes keep their intensities; equipment, additional preparations (with their order) and
  version photos are copied;
- a relation in the body replaces the copied rows (`[]` leaves the new version without them),
  and the previous version keeps its own;
- `brewDate` is the body value or the time of the bump;
- `brewRatio` and `flowRate` are recomputed from the merged measurements.

All validation (title, cross-field rules on the merged values, referenced records, equipment
compatibility) runs before the first write, so a rejected edit leaves the recipe and every
version unchanged. Concurrent edits of the same recipe are serialized, so two bumps get
consecutive version numbers.

## Brewer notes and private notes

A recipe page shows two kinds of notes:

- **Brewer's notes** (`personalNotes` on the version) are the author's public notes. Everyone who
  can view the recipe sees them, and they feed the recipe description, search and the tasting
  notes card. Only the author edits them, through the create and edit forms (they belong to the
  version, so amend, bump, fork and diff treat them like any other version field).
- **My private notes** are per viewer: every signed-in user, the author included, can keep one
  private note per recipe they can view, through `GET`, `PUT` and `DELETE
  /api/v1/recipes/:id/notes` (see [api.md](api.md)). Nobody else, admins included, can read
  them; they are never part of the recipe payload, search, feeds or forks, and they are scrubbed
  when deleted or when the account is deleted.

Before wave 6 the "Personal Notes" box on the recipe page wrote to the author's public notes for
any signed-in viewer (the removed `POST /api/v1/recipes/:id/notes`). Existing brewer notes were
left as they are, so authors should review theirs; private notes start empty.

## Forking

Any public or unlisted recipe can be forked:

```
POST /api/v1/recipes/:id/fork
```

- Creates a new recipe owned by the forker
- Links back to the original via `forkedFromId`
- Copies every version-level value of the source's current version, including `tds`, the coffee
  variety (`coffeeVarietyId` and `coffeeVarietyName`), the brewer notes, taste notes with their
  intensities, equipment, additional preparations and photos
- Resets the source author's own assessments (`rating` is cleared and `isFavourite` is `false`)
  and never copies anyone's private notes
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
