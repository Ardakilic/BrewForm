## ADDED Requirements

### Requirement: Slug base is derived from the title with built-in ASCII transliteration

The system SHALL derive a recipe slug base from the sanitized title using only built-in JavaScript Unicode facilities (no third-party slug or transliteration dependency), producing either an empty string or a string that matches `SlugSchema` (`^[a-z0-9]+(?:-[a-z0-9]+)*$`).

The derivation, implemented as a pure function in `packages/shared/src/utils/slug.ts`
(`generateSlug(title: string): string`), SHALL apply these steps in order:

1. Remove apostrophes (`'`, `’`, `` ` ``) so possessives stay joined (`Bob's` → `bobs`).
2. Lowercase with `String.prototype.toLowerCase()` (locale-independent; never `toLocaleLowerCase`,
   whose `tr` mapping would turn `I` into `ı` and depend on the runtime locale).
3. Replace characters that have no canonical decomposition through a small explicit map:
   `ı→i`, `ß→ss`, `æ→ae`, `œ→oe`, `ø→o`, `đ→d`, `ð→d`, `ł→l`, `þ→th`.
4. Apply `normalize('NFKD')` and strip every combining mark (`/\p{M}+/gu`). This turns Turkish
   `ç ğ ö ş ü` and `İ` (which `toLowerCase()` yields as `i` + U+0307) and other Latin diacritics into
   their base letters, and expands compatibility characters (`ﬁ` → `fi`, `①` → `1`).
5. Replace every run of characters outside `[a-z0-9]` (including `_`, whitespace and punctuation)
   with a single `-`, then trim leading and trailing `-`.
6. Truncate to at most 93 characters, cutting at the last `-` boundary when one exists within the
   limit, and trim a trailing `-`. (93 + `-` + the 6-character suffix keeps every issued slug at
   or below 100 characters; the `recipe.slug` column is `varchar(255)`.)

The function MAY return an empty string; slug candidate building handles that case.

#### Scenario: Turkish title is transliterated, not mangled

- **WHEN** `generateSlug('Türk Kahvesi')` is called
- **THEN** it returns `turk-kahvesi` (today it returns `trk-kahvesi`)

#### Scenario: Turkish dotted and dotless I are handled

- **WHEN** `generateSlug('İSTANBUL Şehir Rehberi')`, `generateSlug('Iğdır Usulü')` and `generateSlug('ŞEKERSİZ ÇAY')` are called
- **THEN** they return `istanbul-sehir-rehberi`, `igdir-usulu` and `sekersiz-cay`

#### Scenario: Underscores, apostrophes and compatibility characters are normalized

- **WHEN** `generateSlug("Bob's V60_Pour Over")`, `generateSlug('Crème brûlée ﬁlter ①')` and `generateSlug('Straße Æble')` are called
- **THEN** they return `bobs-v60-pour-over`, `creme-brulee-filter-1` and `strasse-aeble`
- **AND** every result matches `SlugSchema`

#### Scenario: Titles without ASCII-mappable characters produce an empty base

- **WHEN** `generateSlug('東京コーヒー')`, `generateSlug('Кофе')` and `generateSlug('!!!')` are called
- **THEN** each returns `''`

#### Scenario: Long titles are truncated at a word boundary

- **WHEN** `generateSlug` is called with a 200-character title made of words separated by spaces
- **THEN** the result has at most 93 characters, does not end with `-`, and does not end mid-word
  when a `-` boundary exists within the first 93 characters

#### Scenario: No slug library is added

- **WHEN** `apps/api/package.json`, `packages/shared/package.json` and the root `package.json` are inspected after the change
- **THEN** none of them declares `slugify`, `@sindresorhus/slugify`, `transliteration`, `limax` or any other slug/transliteration package

### Requirement: Slug suffixes are short, random, unambiguous and uniformly distributed

The system SHALL generate slug suffixes with `randomSlugSuffix(length = SLUG_SUFFIX_LENGTH)` exported from `packages/shared/src/utils/slug.ts`, returning `length` characters drawn uniformly from `SLUG_SUFFIX_ALPHABET = '23456789bcdfghjkmnpqrstvwxz'` using `globalThis.crypto.getRandomValues`.

- `SLUG_SUFFIX_LENGTH` SHALL be `6`. The alphabet has 27 characters (digits `2`–`9` and the
  consonants other than `l` and `y`), so there are 27^6 = 387,420,489 suffixes. It has no vowels
  (a suffix cannot spell a word) and no look-alikes (`0/o`, `1/l/i`), which matters for slugs
  printed on QR-code labels.
- Uniformity SHALL use rejection sampling: random bytes `>= 243` (243 = 27 × 9) are discarded and
  each accepted byte `b` maps to `SLUG_SUFFIX_ALPHABET[b % 27]`. Plain `b % 27` without rejection
  SHALL NOT be used (modulo bias).
- The module SHALL NOT import `node:crypto` or any other `node:` built-in, because
  `@brewform/shared` is also bundled into the web app.
- In this capability's scenarios, `<sfx>` denotes the pattern `[23456789bcdfghjkmnpqrstvwxz]{6}`.

#### Scenario: Suffix shape

- **WHEN** `randomSlugSuffix()` is called 1,000 times
- **THEN** every result matches `^<sfx>$`
- **AND** at least 995 of the results are distinct

#### Scenario: Biased bytes are rejected

- **WHEN** `globalThis.crypto.getRandomValues` is stubbed to fill its array with byte `250` on the first call and byte `5` on every later call, and `randomSlugSuffix()` is called
- **THEN** it returns `777777` (all bytes `>= 243` were discarded; byte `5` maps to `SLUG_SUFFIX_ALPHABET[5]`, which is `7`)

### Requirement: Slug candidates are built deterministically from the title and the suffixes

The system SHALL build the ordered list of slugs to try with the pure function `slugCandidates(title: string, suffixes: readonly string[]): string[]` exported from `packages/shared/src/utils/slug.ts`, and the API SHALL call it with `SLUG_SUFFIX_ATTEMPTS` (`5`) fresh `randomSlugSuffix()` values.

- Let `base = generateSlug(title)`. When `base` is empty, the base used for suffixing SHALL be
  `recipe`.
- The bare `base` SHALL be the first candidate only when it is non-empty and not reserved (see the
  reserved-slug requirement). Otherwise every candidate is suffixed.
- Each suffix SHALL produce the candidate `<base>-<suffix>` (or `recipe-<suffix>`).
- Duplicate candidates SHALL be removed, keeping the first occurrence, so the list has at most
  `1 + SLUG_SUFFIX_ATTEMPTS` entries.
- The service SHALL pass the suffixes in (rather than `slugCandidates` drawing them itself), so the
  function stays deterministic and a test can replace `randomSlugSuffix` through `vi.mock`.

#### Scenario: Ordinary title tries the bare base first

- **WHEN** `slugCandidates('Morning V60', ['bbbbbb', 'cccccc'])` is called
- **THEN** it returns `['morning-v60', 'morning-v60-bbbbbb', 'morning-v60-cccccc']`

#### Scenario: Reserved, UUID-shaped and empty bases are always suffixed

- **WHEN** `slugCandidates('New', ['bbbbbb'])`, `slugCandidates('123e4567-e89b-12d3-a456-426614174000', ['bbbbbb'])` and `slugCandidates('東京コーヒー', ['bbbbbb'])` are called
- **THEN** they return `['new-bbbbbb']`, `['123e4567-e89b-12d3-a456-426614174000-bbbbbb']` and `['recipe-bbbbbb']`

#### Scenario: Repeated suffixes are de-duplicated

- **WHEN** `slugCandidates('Espresso', ['bbbbbb', 'bbbbbb'])` is called
- **THEN** it returns `['espresso', 'espresso-bbbbbb']`

### Requirement: Titles that produce no ASCII characters fall back to a generated slug

The system SHALL issue a slug of the form `recipe-<sfx>` whenever `generateSlug` returns an empty string for the sanitized title, so recipes with fully non-Latin or punctuation-only titles are still creatable and addressable.

#### Scenario: Japanese title gets a fallback slug

- **WHEN** an authenticated user creates a recipe titled `東京コーヒー`
- **THEN** the response is `201` and the recipe slug matches `^recipe-<sfx>$`

#### Scenario: Cyrillic and punctuation-only titles get a fallback slug

- **WHEN** an authenticated user creates a recipe titled `Кофе`, and another titled `!!!`
- **THEN** both responses are `201` and both slugs match `^recipe-<sfx>$`

### Requirement: Reserved and identifier-shaped slugs are never issued bare

The system SHALL always suffix a slug base that equals a reserved route word or is shaped like a UUID, so a recipe can never shadow, or be shadowed by, a static route or the id lookup in `getRecipe(slugOrId)`.

- The reserved list SHALL be exported from `packages/shared/src/utils/slug.ts` as
  `RESERVED_RECIPE_SLUGS` and SHALL contain exactly: `new`, `edit`, `starred`, `unavailable`,
  `compare`, `meta`, `merge`, `versions`, `diff`, `focus`, `fork`, `search`, `feed`, `share`,
  `recipe`, `recipes`.
- `isReservedRecipeSlug(base: string): boolean` SHALL return `true` for every list entry and for a
  base matching the UUID pattern used by `getRecipe`
  (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`).
- Drift guards SHALL fail when a new static route sibling of `:slug` is added without updating the
  list: one test over the API recipe router's registered paths, one over the `recipes/...` paths in
  `apps/web/src/router.tsx`.

#### Scenario: Recipe titled "New" stays reachable

- **WHEN** a user creates a recipe titled `New`
- **THEN** the slug matches `^new-<sfx>$`, so `/recipes/<slug>` resolves to the recipe instead of the create page at `/recipes/new`

#### Scenario: Recipe titled "Starred" does not shadow the API route

- **WHEN** a user creates a recipe titled `Starred`
- **THEN** the slug matches `^starred-<sfx>$` and `GET /api/v1/recipes/starred` keeps serving the starred-recipes list

#### Scenario: UUID-shaped title is suffixed

- **WHEN** a user creates a recipe whose title is `123e4567-e89b-12d3-a456-426614174000`
- **THEN** the slug is the UUID text plus `-<sfx>`, so `GET /api/v1/recipes/<slug>` resolves by slug rather than being treated as an id lookup

#### Scenario: A new static route without a reserved word fails the guard

- **WHEN** a static path such as `GET /api/v1/recipes/popular` or a web route `recipes/popular` is added and `popular` is not in `RESERVED_RECIPE_SLUGS`
- **THEN** `apps/api/src/modules/recipe/reserved-slugs.test.ts` or `apps/web/src/router.reserved-slugs.test.ts` fails and names `popular`

### Requirement: Recipe slugs are unique across every recipe row including soft-deleted ones

The system SHALL keep the existing global `recipe_slug_unique` constraint, which covers active and soft-deleted rows alike, as the only uniqueness guarantee for recipe slugs, and SHALL NOT replace it with a partial unique index that ignores soft-deleted rows.

- A soft-deleted recipe's slug SHALL never be issued again, so an old link, QR code, sitemap entry
  or notification for a deleted recipe answers `404` instead of opening a different recipe.
- No slug pre-check query SHALL run before the insert: the insert itself is the check (see the
  slug-claim requirement). The pre-change `generateUniqueSlug` pre-check (`model.findBySlug`,
  which ignores soft-deleted rows) SHALL be removed.
- Numeric suffixes (`-2`, `-3`, …) SHALL NOT be used: they need a prefix scan, race under
  concurrency, and reveal how many recipes (including private and deleted ones) share a title.
- The broken `ensureUniqueSlug(slug, existingSlugs)` helper (always called with `[]`, so it never
  adds a suffix) SHALL be removed together with its export and every test that imports it
  (`packages/shared/src/utils/slug.test.ts`, `apps/api/src/utils/qrcode/qrcode.test.ts`,
  `apps/api/src/modules/recipe/service.test.ts`).

#### Scenario: Second recipe with the same title succeeds

- **WHEN** two different users each create a recipe titled `Morning V60`, one after the other, on a database where `morning-v60` is unused
- **THEN** both responses are `201`
- **AND** the first slug is `morning-v60` and the second matches `^morning-v60-<sfx>$`

#### Scenario: Title of a soft-deleted recipe does not collide

- **WHEN** a recipe titled `Espresso` is soft-deleted and a user then creates a new recipe titled `Espresso`
- **THEN** the response is `201` (today it is `500`)
- **AND** the new slug matches `^espresso-<sfx>$` and the soft-deleted row keeps `espresso`

#### Scenario: Same user creates the same title three times

- **WHEN** one user creates three recipes with the same new title in a row
- **THEN** all three responses are `201` and the three slugs are pairwise distinct

#### Scenario: The removed helper is gone

- **WHEN** `grep -rn ensureUniqueSlug apps packages` is run after the change
- **THEN** it prints nothing

### Requirement: Slugs are claimed inside the creation transaction without aborting it

The system SHALL claim a recipe slug as the first write of the recipe-creation or fork transaction with `tx.insert(recipes).values({ ...row, slug }).onConflictDoNothing({ target: recipes.slug }).returning()`, trying the slug candidates in order and moving to the next candidate whenever the returned array is empty.

- Rationale that the implementation SHALL preserve: a unique violation (`23505`) inside a Postgres
  transaction aborts the whole transaction, so catching it and retrying with the same `tx` fails
  with `25P02 current transaction is aborted`. `ON CONFLICT (slug) DO NOTHING` never raises, so the
  transaction stays usable. Under `READ COMMITTED`, if another uncommitted transaction holds the
  same slug, the insert waits for it, then returns no row if that transaction committed or inserts
  if it rolled back, so the result is correct under concurrency.
- The claim SHALL live in one private model helper, `claimRecipeSlug(tx, row, slugCandidates)` in
  `apps/api/src/modules/recipe/model.ts`, used by both `createRecipeWithRelations` and
  `forkRecipe`. It returns the inserted `recipes` row, or `null` when every candidate is taken.
- The claim SHALL run before any other write in the transaction (version, relations, the source
  recipe's `forkCount` update), so a waiting transaction holds no other locks.
- `CreateRecipeWithRelationsInput.slug: string` SHALL become `slugCandidates: readonly string[]`, and
  `forkRecipe(sourceId, authorId, title, slugCandidates)` SHALL take the list in place of one slug.
  When the claim returns `null`, the transaction callback SHALL return `null` before writing
  anything else, and both model functions SHALL return `null` to the service.
- The implementation SHALL NOT use nested `tx.transaction()` savepoints, SHALL NOT catch `23505`
  to retry, and SHALL NOT re-run the whole transaction from the service. Only the `slug` conflict
  target is absorbed. A unique violation on any other constraint still raises and propagates to the
  global error handler.

#### Scenario: A taken candidate falls through to the next one in the same transaction

- **WHEN** `createRecipeWithRelations` is called with `slugCandidates: [taken, free]`, where `taken` belongs to a soft-deleted recipe
- **THEN** it returns a recipe with slug `free`
- **AND** exactly one `recipe_version` row and one set of taste-note, equipment and preparation rows exist for the new recipe

#### Scenario: All candidates taken writes nothing

- **WHEN** `createRecipeWithRelations` is called with `slugCandidates` that all belong to existing recipes
- **THEN** it returns `null`
- **AND** no `recipe`, `recipe_version`, `recipe_taste_note`, `recipe_equipment` or `recipe_additional_preparation` row was written for that call

#### Scenario: Fork claim uses the same helper

- **WHEN** `forkRecipe(sourceId, authorId, 'Fork of Espresso', [taken, free])` is called
- **THEN** the fork's slug is `free` and the source recipe's `forkCount` increased by exactly 1
- **AND** when every candidate is taken, it returns `null` and the source recipe's `forkCount` is unchanged

### Requirement: Exhausted slug candidates return 409 SLUG_CONFLICT

The system SHALL answer a create, fork or merge whose slug candidates are all taken with `409` and `error.code === 'SLUG_CONFLICT'`, never `500`.

- On a `null` result from the model, the service SHALL log
  `logger.warn({ authorId, attempts, constraint: 'recipe_slug_unique' }, 'recipe slug candidates exhausted')`
  and throw `new ConflictError('SLUG_CONFLICT', 'Could not allocate a unique recipe slug')` (the
  typed error from `apps/api/src/utils/errors.ts`, mapped to `409` by the global error handler).
- With 27^6 suffixes, exhaustion needs the bare base and all five random suffixes to be taken
  already. With 1,000 existing recipes on the same base, that probability is about 1e-28, so in
  practice the path is reached only by tests.

#### Scenario: Exhausted retries return 409, not 500

- **WHEN** `randomSlugSuffix` is replaced through `vi.mock` to always return `bbbbbb`, a title is created twice (taking `<base>` and `<base>-bbbbbb`), and the same title is posted a third time to `POST /api/v1/recipes`
- **THEN** the response is `409` with `error.code === 'SLUG_CONFLICT'` and `error.message === 'Could not allocate a unique recipe slug'`
- **AND** no `Unhandled error` log line is emitted

#### Scenario: Exhausted fork returns 409

- **WHEN** with the same mock, recipe `R` is forked twice without a title and then forked a third time
- **THEN** the third `POST /api/v1/recipes/:id/fork` responds `409` with `error.code === 'SLUG_CONFLICT'`

### Requirement: Concurrent recipe creation with the same title succeeds for every request

The system SHALL give every one of several concurrent create, fork or merge requests with the same title its own slug, without any request failing because of the slug.

#### Scenario: Two simultaneous creates with the same new title

- **WHEN** two `createRecipe` calls (and, in the route test, two `POST /api/v1/recipes` requests) with the same title are issued concurrently through `Promise.all` against a database where that slug is unused
- **THEN** both succeed (`201` at the route)
- **AND** one recipe has the bare slug and the other matches `^<base>-<sfx>$`
- **AND** each recipe has exactly one `recipe_version` row

### Requirement: Forked and merged recipes receive unique slugs

The system SHALL generate fork and merge slugs through the same slug pipeline as recipe creation (base derivation, fallback, reserved check, candidate list and in-transaction claim), so a recipe can be forked any number of times by any number of users.

- `forkRecipe` (service) SHALL sanitize a caller-supplied fork title with `sanitizeText` (as
  `createRecipe` does) and SHALL fall back to `Fork of <source title>` when the supplied title is
  absent or empty after sanitization.
- `mergeRecipes` already delegates to `createRecipe`; it SHALL keep doing so and therefore inherits
  the pipeline.

#### Scenario: A recipe can be forked twice

- **WHEN** user B forks public recipe `Espresso` without a title, and then user C forks the same recipe without a title
- **THEN** both fork responses are `201` (today the second is `500`)
- **AND** the slugs are `fork-of-espresso` and a value matching `^fork-of-espresso-<sfx>$`

#### Scenario: Fork title is sanitized

- **WHEN** a user forks a recipe with title `<b>My</b> Fork`
- **THEN** the stored fork title is `My Fork` and its slug is `my-fork` (or `my-fork-<sfx>` if taken)

#### Scenario: Fork title that sanitizes to empty falls back

- **WHEN** a user forks recipe `Espresso` with title `<b></b>`
- **THEN** the stored fork title is `Fork of Espresso`

#### Scenario: Merging twice with the same title succeeds

- **WHEN** a user merges two versions into a recipe titled `Best Of Both` twice
- **THEN** both merge responses succeed and the two resulting slugs are distinct

### Requirement: Recipe slugs are stable after creation

The system SHALL NOT change a recipe's slug when its title is edited (with or without `bumpVersion`), when its visibility changes, or when it is soft-deleted, so shared links, QR codes, sitemap entries and notification links keep resolving.

- No slug-history or redirect table SHALL be added: there is no rename-URL feature, and a history
  lookup would add a second query to every slug miss.
- Existing slugs SHALL NOT be rewritten or backfilled by this change, with the single opt-in
  exception for empty legacy slugs in the legacy-slug requirement. Only newly created, forked or
  merged recipes use the new pipeline.
- The URL shape stays `/recipes/<slug>`. `getRecipe(slugOrId)` keeps accepting a recipe UUID as
  well, so no id-plus-slug URL scheme is introduced.

#### Scenario: Renaming keeps the slug

- **WHEN** the author renames recipe `morning-v60` to `Evening V60` via `PATCH /api/v1/recipes/:id`
- **THEN** the response contains `title: 'Evening V60'` and `slug: 'morning-v60'`
- **AND** `GET /api/v1/recipes/morning-v60` still resolves to the recipe

#### Scenario: Existing slugs are untouched

- **WHEN** this change is deployed against a database with existing recipes and the identifier-check script is not run with `--fix-empty-slugs`
- **THEN** no existing `recipe.slug` value changes

### Requirement: Legacy slugs remain addressable, including QR codes

The system SHALL keep recipes whose slugs were produced by the pre-change generator (which kept `_`) reachable through every slug route, including the QR-code route.

- `QrCodeFilenameSchema` in `packages/shared/src/schemas/common.ts` SHALL accept
  `^([a-z0-9_]+(?:-[a-z0-9_]+)*)\.(png|svg)$` (case-insensitive extension), and SHALL export that
  pattern as `QR_CODE_FILENAME_PATTERN`. The inline duplicate regex in
  `apps/api/src/modules/qrcode/index.ts` SHALL be replaced by that export.
- `SlugSchema` SHALL stay strict (`^[a-z0-9]+(?:-[a-z0-9]+)*$`), because it describes newly issued
  slugs.
- A legacy recipe whose slug is the empty string (the old generator returned `''` for all-CJK or
  all-Cyrillic titles, and the first such recipe was stored with `slug = ''`) can never be opened
  by slug. The identifier-check script (see the `unique-identifiers` capability) SHALL report such
  recipes by id. With `--fix-empty-slugs`, it SHALL assign each one a `recipe-<sfx>` slug. This is
  the only permitted slug rewrite, because the empty slug never produced a working link.

#### Scenario: Legacy underscore slug gets a QR code

- **WHEN** a public recipe stored with slug `cold_brew_<marker>` is requested at `GET /api/v1/qrcode/recipe/cold_brew_<marker>.png`
- **THEN** the response is `200` with an `image/png` body

#### Scenario: Unsafe QR filenames are still rejected

- **WHEN** `QrCodeFilenameSchema` parses `../x.png`, `a--b.png`, `-a.png` and `a.gif`
- **THEN** every parse fails

#### Scenario: Empty legacy slug is repaired only on request

- **WHEN** a recipe with `slug = ''` exists and the identifier-check script runs without flags, then with `--fix-empty-slugs`
- **THEN** the first run reports the recipe id and leaves the slug unchanged
- **AND** the second run sets its slug to a value matching `^recipe-<sfx>$`

### Requirement: Slug pipeline has logging and regression coverage

The system SHALL cover the slug pipeline with failing-first regression tests and structured logging that follows AGENTS.md (module-scoped logger, debug entry/exit on public service functions, no PII; slugs and ids are not PII).

Required logging:

- `claimRecipeSlug` SHALL log `modelLog.debug({ authorId, attempt }, 'recipe slug candidate taken')`
  for each taken candidate.
- Exhaustion is logged at `warn` by the service, as in the exhaustion requirement.

Required tests (DB-backed tests run against `brewform_test`, and every test uses a title with a
per-run random marker so the tests do not depend on each other's rows):

- `packages/shared/src/utils/slug.test.ts`: the transliteration, truncation and empty-result
  cases; `randomSlugSuffix` shape, distinctness and rejection; `slugCandidates`; and the reserved
  and UUID cases.
- `packages/shared/src/schemas/common.test.ts`: `QrCodeFilenameSchema` accepts and rejects.
- `apps/api/src/modules/recipe/model.create.test.ts`: claim fall-through on a soft-deleted slug,
  all-taken returns `null` with no rows written, and fork claim and `forkCount` behaviour.
- `apps/api/src/modules/recipe/service.slug.test.ts`: duplicate title, soft-deleted collision,
  reserved titles, non-Latin and punctuation fallback, double fork, double merge, concurrent create
  via `Promise.all`, fork-title sanitization and fallback, and rename keeps slug.
- `apps/api/src/modules/recipe/service.slug-exhaustion.test.ts`: `vi.mock` of `randomSlugSuffix`,
  service-level `ConflictError` and route-level `409 SLUG_CONFLICT` for create and fork.
- `apps/api/src/modules/recipe/reserved-slugs.test.ts` and
  `apps/web/src/router.reserved-slugs.test.ts`: the drift guards.
- `apps/api/src/modules/recipe/index.test.ts`: posting the same payload twice returns `201` twice
  with different slugs.

#### Scenario: Regression test fails before the fix

- **WHEN** the duplicate-title service test is run against the pre-change code
- **THEN** it fails because the second insert raises a unique violation

#### Scenario: Full suite passes after the fix

- **WHEN** `make check`, `make lint`, `make test-shared`, `make test-api` and `make test-web` run after the change
- **THEN** all pass, including every new slug test
