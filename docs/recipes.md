# Recipes

Recipes are the core entity of BrewForm. This document covers the versioning model, brewer and
private notes, forking, slugs, visibility, validation rules, version diff, and comparison and
merge. Per-route request and response shapes are in the generated
[api-reference.md](api-reference.md); shared API conventions (envelopes, partial updates,
visibility classes) are in [api.md](api.md).

## Two-Layer Model

A recipe consists of two layers:

- **Recipe** — mutable metadata (title, slug, visibility, fork reference, the `likeCount`,
  `commentCount` and `forkCount` counters, the `featured` flag)
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
- Two versions can be compared field by field (see [Version diff](#version-diff))

Editing goes through `PATCH /api/v1/recipes/:id` (author only, verified email required; see
[api-reference.md](api-reference.md) and [Partial updates](api.md#partial-updates)). The body
says which fields change: an absent key keeps the stored value, `null` clears a field, and `[]`
removes every taste note, equipment item or additional preparation. An omitted `visibility` or
`isFavourite` is always kept.

- **Amend** (`bumpVersion: false`, also when `bumpVersion` is absent): every field in the body
  is written to the current version in one transaction, and only the relations in the body are
  replaced. No new version is created, `versionNumber` and `currentVersionId` stay the same, and
  the stored `brewDate` is kept unless the body sends one. The edit page labels this "Updates the
  current version (vN) in place".
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
version unchanged. The write locks the recipe row (`SELECT … FOR UPDATE`) inside its
transaction, so concurrent edits of the same recipe are serialized and two bumps get
consecutive version numbers. Earlier versions are never touched.

## Brewer notes and private notes

A recipe page shows two kinds of notes:

- **Brewer's notes** (`personalNotes` on the version) are the author's public notes. Everyone who
  can view the recipe sees them, and they feed the recipe description, search and the tasting
  notes card. Only the author edits them, through the create and edit forms (they belong to the
  version, so amend, bump, fork and diff treat them like any other version field).
- **My private notes** are per viewer: every signed-in user, the author included, can keep one
  private note per recipe they can view, through `GET`, `PUT` and `DELETE
  /api/v1/recipes/:id/notes` (see [api-reference.md](api-reference.md)). The note belongs to the
  caller: the user id always comes from the session, never from the request, and every query is
  keyed by it. Nobody else, admins included, can read it (admin status only widens which recipes
  an admin may annotate). A recipe the caller cannot view answers `404`. Notes are plain text up
  to 10,000 characters (markup is stripped before storage); they are never part of the recipe
  payload, search, feeds or forks, and their text is scrubbed when the note is deleted or the
  account is deleted.

Before wave 6 the "Personal Notes" box on the recipe page wrote to the author's public notes for
any signed-in viewer (the removed `POST /api/v1/recipes/:id/notes`). Existing brewer notes were
left as they are, so authors should review theirs; private notes start empty.

## Forking

Any public or unlisted recipe can be forked (an author can also fork their own draft or private
recipe):

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
- The fork's attribution (`forkedFrom`, `forkedFromId`, `forkedFromSlug`) is shown only while
  the source is public (see [Visibility](#visibility))

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

Every recipe has one of four `visibility` values (a new recipe defaults to `draft`, and forks
and merges always start as `draft`):

| Value      | Meaning                                                   | Who can open it                     |
| ---------- | --------------------------------------------------------- | ----------------------------------- |
| `draft`    | Work in progress                                          | Author only                         |
| `private`  | Saved but not shared                                      | Author only                         |
| `unlisted` | Direct link only                                          | Anyone with the URL or id           |
| `public`   | Listed on discovery surfaces, searchable and indexable    | Everyone                            |

**`unlisted` = direct link only.** An unlisted recipe opens for anyone who has its URL or id, but
it never appears in search, browse lists or filters, user profiles, the follow feed, the home
grids, the equipment and coffee-variety pages, other users' collections (a collection shows it
only to the recipe's own author), the sitemap or Open Graph/social previews. Its pages carry
`noindex, nofollow`. Two lists are personal and can contain it: the caller's own **Starred** list
(recipes they favourited) and their own **brew journal** (recipes they logged). Discovery lists
show only `public` recipes to everyone, the author included.

**Fork attribution** is hidden unless the source is public: a fork of an unlisted, private, draft
or deleted recipe shows no `forkedFrom` link (the source's own author still sees it on the recipe
detail), because an unlisted recipe's id works as its link.

Draft and private recipes open only for their author (`canViewRecipe`); everyone else gets
`404`. The `optionalAuthMiddleware` on the read routes lets an authenticated author see their own
drafts and private recipes, while anonymous requests see public and unlisted ones. The API keeps
these rules in one place: `listableRecipeCondition(viewerId)` and `viewableRecipeCondition(viewerId)`
in `apps/api/src/modules/recipe/model.ts` (SQL), with `canListRecipe` and `canViewRecipe` as their
pure twins in `service.ts`. The full surface-by-surface table is in
[api.md → Visibility](api.md#visibility).

## Validation

### Hard validation (blocks the save)

The API rejects a create, edit, fork or merge that breaks any of these rules, before anything is
written:

- **Required fields** on create: `title`, `brewMethod`, `drinkType` and `preparationNotes`.
  A title that is empty after sanitization is a `400 VALIDATION_ERROR` on `title`.
- **Ranges** (shared Zod schemas in `packages/shared/src/schemas/recipe.ts`): dose
  (`groundWeightGrams`) and yield (`extractionVolumeMl`) are `>= 0`, `extractionTimeSeconds` is
  positive, `temperatureCelsius` is between -40 and 100, `tds` is between 0 and 25, `rating` is
  1-10, `preInfusionTimeSeconds` is a whole number `>= 1`, text fields have maximum lengths, and
  a version holds at most 20 additional preparations (`MAX_ADDITIONAL_PREPARATIONS`) and at most
  50 taste notes and 50 equipment items (`MAX_RELATION_IDS`).
- **Cross-field rules** (`recipeCrossFieldIssues`): the grind date and the package-open date are
  not before the roast date, the grind date is not before the package-open date, the pre-infusion
  time is shorter than the extraction time, and a pre-infusion time needs an extraction time. An
  edit is checked on the values merged over the stored version.
- **References**: taste notes, equipment, the vendor and the coffee variety must exist and not be
  deleted, and a newly set bean must belong to the author (`400 VALIDATION_ERROR` with one detail
  per field). The checks apply to the references a write newly sets: on an edit, ids already
  linked to the current version (and a `vendorId`, `coffeeVarietyId` or `beanId` equal to the
  stored one) are kept even if the record was deleted since, so the edit form can re-send them; a
  newly added deleted id is still rejected and the detail names only it. Repeated ids in
  `tasteNoteIds` or `equipmentIds` are rejected with `400`.
- **Equipment compatibility** with the brew method is enforced through the
  `BrewMethodEquipmentRule` table. An incompatible combination returns `422 VALIDATION_ERROR`
  with a `details` array naming each incompatible equipment type.

The create and edit forms offer only the drink types that fit the selected brew method
(`DRINK_TYPES_LIST[].compatibleMethods` from `@brewform/shared`). The API does not re-check the
brew method / drink type pair.

### Soft validation (advisory)

`validateSoftWarnings` in `packages/shared/src/utils/validation.ts` lists advisory hints (espresso
ratio outside 1:1.5-1:3, espresso extraction under 15 s or over 60 s, espresso temperature
outside 88-96 °C, a missing grind size, no product name or brand, a milk preparation on a
non-milk drink, no equipment). It never blocks a save. It is not wired up today: the API does
not return warnings and the forms do not show them.

## Canonical Units

All numeric values are stored in canonical (metric) units:

| Measurement                          | Storage                              |
| ------------------------------------ | ------------------------------------ |
| Coffee dose (`groundWeightGrams`)    | grams                                |
| Yield (`extractionVolumeMl`)         | millilitres                          |
| Brew temperature                     | Celsius                              |
| Extraction and pre-infusion time     | seconds                              |
| Grind size (`grindSize`)             | free text (for example "18 clicks"), never converted |
| TDS (Total Dissolved Solids)         | percentage (e.g. 1.35 for 1.35%)     |

`brewRatio` (yield / dose) and `flowRate` (yield / extraction time) are computed by the API from
the measurements and never accepted from clients.

Extraction Yield is **not stored** — it is derived on the client from TDS, extraction
volume, and dose when all three are present:

  EY% = (TDS% / 100 × extractionVolumeMl) / groundWeightGrams × 100

The web app reads the signed-in user's `unitSystem` preference from the auth state
(`useUnitSystem`, `metric` when signed out) and formats displayed values with
`packages/shared/src/utils/conversion.ts`: `imperial` shows ounces, fluid ounces and °F. The
recipe pages derive the temperature unit from `unitSystem`; the separate `temperatureUnit`
preference is stored but not used there.

## Version diff

Two versions of the same recipe can be compared field by field:

```
GET /api/v1/recipes/:slug/versions/diff?v1=<versionId>&v2=<versionId>
```

The response lists the 20 scalar version fields with their two values and a status (`added`,
`removed`, `modified` or `unchanged`), plus added, removed and unchanged taste notes and
equipment by name. Both versions must belong to the recipe (`404` otherwise) and must differ
(`400`). The recipe must be viewable by the caller, as for the recipe detail. In the UI, the
version history page lets the reader pick two versions and opens
`/recipes/:slug/versions/diff?v1=…&v2=…` (always `noindex`).

## Comparison and merge

The web page `/recipes/compare/:slug1/:slug2` shows two recipes side by side. Its loader fetches
both through `GET /api/v1/recipes/:slugOrId`, so it works for any two recipes the viewer can open
(public and unlisted for anyone, drafts and private recipes for their author); a recipe the
viewer cannot open renders the not-found page. There is no dedicated compare endpoint. The page
is reached by URL (there is no in-app link to it yet) and is always `noindex`.

From the compare page a signed-in user with a verified email can merge the two current versions
into a new recipe:

```
POST /api/v1/recipes/merge
```

The body names the two version ids, the new title and, per field, which side to take (`v1`, `v2`,
`both` for taste notes, equipment and additional preparations, or `none`). Both source recipes
must exist and not be deleted (`404`) and the caller must be allowed to view both
(`canViewRecipe`, otherwise `403`): another user's public or unlisted recipe can be merged, their
draft or private recipe cannot. The merged recipe is created through the normal create path (same
slug pipeline and validation), starts as `draft`, and the page then opens its editor. Taste notes
and equipment deleted from the catalog are left out of the merged recipe.

## Filtering by Main Brewer

Recipes can be filtered by the main brewer's name via the `mainBrewer` query parameter on the list endpoint:

```
GET /api/v1/recipes?mainBrewer=Lelit%20Mara%20X
```

This performs a case-insensitive partial match on `recipeVersions.brewerDetails`.

## Like, Favourite and Rating

- **Like**: Toggle endpoint — `POST /api/v1/recipes/:id/like`. Returns `{ liked: boolean }`. If
  already liked, unlikes. If not liked, likes. The recipe's stored `likeCount` is adjusted in the
  same transaction, and liking another author's recipe creates a `like` notification (in-app and
  email, gated by the author's `notifyRecipeLiked` preference).
- **Favourite**: Toggle endpoint — `POST /api/v1/recipes/:id/favourite`. Returns
  `{ favourited: boolean }`. Same toggle pattern. There is no stored favourite counter: the
  recipe detail's `favouriteCount` is counted from the favourites, and favourited recipes make up
  the caller's Starred list (`GET /api/v1/recipes/starred`).
- **Rating**: `POST /api/v1/recipes/:id/rate` with `{ rating }` (1-10) stores the caller's rating
  and returns it with the recipe's `avgRating` and `ratingCount`.

## Featured Recipes

Authors can flag their own recipes as featured:

```
POST /api/v1/recipes/:id/feature
```

Toggle pattern — if already featured, unfeatures; returns `{ featured: boolean }`. Only the author
can toggle it, and there is no limit on how many recipes are featured. The flag is part of the
recipe payload; the web app has a client method for it but does not show a featured section or a
toggle yet.

## Recipe Meta (Social Crawlers)

```
GET /api/v1/recipes/meta/:slug
```

Returns minimal recipe metadata (title, author, counts, product name, brew method and the primary
photo URL) for social media crawlers (Open Graph, Twitter Cards) without requiring
authentication. Only `public` recipes are served; any other recipe answers `404`.
