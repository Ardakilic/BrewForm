# t3-api-correctness — Slugs, collection visibility & error mapping

Research and validation notes for the `recipe-slug` (new), `recipe-collections` (modified) and
`error-handling` (modified) capabilities. Every claim below was re-checked against the working
tree on 2026-11-18 (`main` @ `ada9f6e`).

## User decisions (verbatim)

- Slugs: "Slug should generate new one. Check how can this be handled. Maybe a plugin? I prefer
  built-in methods though."
- Collections: "fix collection pages, yes. it should not show deleted and private,
  template/unpublished recipes."
- Errors: "Validate and address 409 to 500 errors yes."

## 1. Validation of audit claims

### 1.1 Slugs (`data-layer/recipe-slug-never-suffixed`)

| Claim | Verdict | Evidence |
|---|---|---|
| `generateUniqueSlug` never adds a suffix | **Confirmed** | `apps/api/src/modules/recipe/service.ts:58-63` calls `ensureUniqueSlug(slug, [])`; `packages/shared/src/utils/slug.ts:13-14` returns the input unchanged when the list is empty |
| Second fork of the same recipe collides | **Confirmed** | `recipe/service.ts:396-398` (`ensureUniqueSlug(slug, [])` with default title `Fork of <title>`) |
| Collisions surface as 500 | **Confirmed** | create route `recipe/index.ts:638-641` only maps `FORBIDDEN`; fork route `:781-785` only maps `RECIPE_NOT_FOUND`/`FORBIDDEN`; the `DrizzleQueryError` is not recognized by `errorHandler.ts:40` (see 1.3) |
| Soft-deleted slugs also collide | **Confirmed** | `packages/db/src/schema.ts:139` `slug … .notNull().unique()` (constraint `recipe_slug_unique`, `drizzle/0000_opposite_switch.sql:248`); pre-check `model.findBySlug` filters `isNull(deletedAt)` (`recipe/model.ts:338-341`) so a deleted row is invisible to the check but still blocks the insert |
| Non-ASCII titles are mangled | **Confirmed** | `slug.ts:5` `/[^\w\s-]/g` without `u` strips `ü` → `trk-kahvesi`; all-CJK/Cyrillic titles become `''` (so every such title collides on the empty slug) |
| Merge path | **Additional** | `mergeRecipes` (`service.ts:847-893`) delegates to `createRecipe`, so the same bug hits a second merge with the same title |

Other entities with slugs: **none.** `grep slug packages/db/src/schema.ts` shows only `recipe.slug`.
Collections, equipment, vendors, coffee varieties and users have no slug column (users have
`username`, which is user-chosen and validated, not generated).

Additional defects found while validating (all in scope of the new `recipe-slug` capability):

1. **Underscores leak into slugs and break QR codes.** `\w` keeps `_`, so `Cold_Brew` → `cold_brew`.
   The QR route accepts only `^([a-z0-9]+(?:-[a-z0-9]+)*)\.(png|svg)$`
   (`packages/shared/src/schemas/common.ts:22-24`, `qrcode/index.ts:56`), so such recipes can never
   get a QR code. `SlugSchema` (`common.ts:16`) also rejects them.
2. **Reserved route words.** A recipe titled `New`, `Starred` or `Unavailable` gets slug `new` /
   `starred` / `unavailable`; the web router serves static pages at `recipes/new`,
   `recipes/starred`, `recipes/unavailable` (`apps/web/src/router.tsx:93-104`) and the API has a
   static `GET /api/v1/recipes/starred` (`recipe/index.ts:257`) registered before `/:slugOrId`, so
   those recipes are unreachable. A UUID-shaped title is treated as an id by `getRecipe`
   (`service.ts:69`).
3. **Fork titles are not sanitized.** `forkRecipe` stores `title || 'Fork of …'` verbatim
   (`service.ts:396`), unlike `createRecipe` which runs `sanitizeText` (`service.ts:171`).
4. **Title that sanitizes to empty → 500.** `'<b></b>'` passes `z.string().min(1)` but
   `sanitizeText` makes it `''`; `service.ts:172` throws `VALIDATION_ERROR: Title cannot be empty`,
   which no controller maps (`recipe/index.ts:638-641`, `:692-696`).

Slug stability: `updateRecipe` never touches `slug` (`service.ts:347-358`) — slugs are already
stable on rename; the spec makes that explicit.

### 1.2 Collections (`api-architecture/collection-detail-leaks-hidden-recipes`, `data-layer/collection-detail-leaks-recipes`)

| Claim | Verdict | Evidence |
|---|---|---|
| Detail loads items with no recipe `deletedAt`/visibility filter | **Confirmed** | `apps/api/src/modules/collection/model.ts:10-34` (`items.recipe` with no filter) |
| Detail maps every item incl. visibility/deletedAt; `recipeCount = items.length` | **Confirmed** | `collection/service.ts:57-102` |
| Cached 10 min, never invalidated by recipe writes | **Confirmed** | `service.ts:13` TTL, `:207-242` cache-aside; `recipe/service.ts:365-372` `deleteRecipe`, `admin/service.ts:203-228` (`updateRecipeVisibility`, `softDeleteRecipe`) touch no collection key |
| `getItems` (filters deleted) has no production caller | **Confirmed** | `model.ts:262-282`; only tests import it |
| List `recipeCount` counts raw rows | **Confirmed** | `model.ts:71-77` (`findByUserId`) and `:159-165` (`findAllPublic`) |
| Owner may add own non-public recipe to a public collection | **Confirmed** | `service.ts:391` `recipe.visibility !== 'public' && recipe.authorId !== userId` |
| Spec requires the detail endpoint to hide deleted recipes | **Overstated** | `openspec/specs/recipe-collections/spec.md` requires `getItems` to filter; it never says the detail must. The new ADDED requirement closes that gap. |
| Leak is titles/slugs/authors/counts, not recipe content | **Confirmed** (verifier) | Following the slug gives a 404/403 from the recipe route |

Additional interactions found:

- **Reorder breaks once items are filtered.** `reorderCollection` requires
  `itemIds.length === collection.items.length` (`service.ts:452-461`), while the web page sends only
  the ids it displays (`apps/web/src/components/collections/CollectionRecipeList.tsx:106-118`).
  Filtering without changing reorder would make reorder fail with `REORDER_MISMATCH` for any
  collection holding a hidden item → spec defines a "visible set" reorder that preserves hidden items.
- **Output schema mismatch.** `CollectionItemOutputSchema.recipe` is non-nullable
  (`packages/shared/src/schemas/responses/collection.ts`), but `toDetailOutput` can emit
  `recipe: null` (`service.ts:63-100`). Dropping items without a visible recipe resolves this.
- **Multi-replica caches.** With `CACHE_DRIVER=memory` each replica has its own cache, so explicit
  invalidation from one replica cannot clear the others. This is why the chosen design re-checks
  recipe state on cache hits instead of relying on invalidation.
- **Visibility predicate.** `canViewRecipe` (`recipe/service.ts:767-776`): draft/private → author
  (or admin when `isAdmin` is passed); public/unlisted → everyone. The recipe detail route calls it
  without `isAdmin` (`recipe/index.ts:541`).

### 1.3 Errors (`api-architecture/error-handler-misses-wrapped-errors`, `data-layer/pg-23505-mapping-bypassed`)

| Claim | Verdict | Evidence |
|---|---|---|
| `errorHandler` checks only top-level `err.name === 'PostgresError'` | **Confirmed** | `apps/api/src/middleware/errorHandler.ts:40-57` |
| drizzle-orm 0.45 wraps driver errors in `DrizzleQueryError` with the `PostgresError` on `.cause` | **Confirmed** | catalog pin `pnpm-workspace.yaml:9` (`drizzle-orm: 0.45.4`); source (0.45.2 copy in `node_modules/.deno/drizzle-orm@0.45.2/.../errors.js:10-20`): `class DrizzleQueryError extends Error { constructor(query, params, cause) { super(\`Failed query: ${query}\nparams: ${params}\`); … this.cause = cause } }` — no `name` override, so `name === 'Error'`; `pg-core/session.js:41-66` wraps every query. Context7 (`/drizzle-team/drizzle-orm/0.45.4`, changelog 0.44.0) confirms the wrapper "wraps all errors from database drivers". |
| Admin and collection code already unwrap by hand | **Confirmed** | `admin/model.ts:143-160` (`throwIfUniqueViolation`, reads `err.cause`); `collection/service.ts:394-404` (substring match on `message`/`cause.message`) |
| Test fabricates an unwrapped error | **Confirmed** | `errorHandler.test.ts:75-84`; the other tests at `:17-72` assert on objects the test itself builds and never call `errorHandler` |
| No `HTTPException` branch; malformed JSON → 500 | **Confirmed** | hono validator (`hono@4.12.32 dist/validator/validator.js:17-21`) throws `new HTTPException(400, { message: 'Malformed JSON in request body' })`; `HTTPException` keeps `name === 'Error'` and matches no branch, so `errorHandler.ts:118-130` returns 500 and logs `Unhandled error`. Context7 (`/websites/hono_dev`, "HTTPException") documents `if (err instanceof HTTPException) return err.getResponse()` as the intended `onError` pattern. |
| Concrete 500 triggers | **Confirmed** | see reproductions below |
| Stringly-typed contract causes other 500s | **Confirmed (partially in scope)** | 121 `throw new Error('UPPER')` / `message ===` pairs; `VALIDATION_ERROR: Title cannot be empty` and unmapped `RECIPE_NOT_FOUND` reach `onError` |

Additional defects found:

1. **PII in error logs.** `DrizzleQueryError.message` embeds the parameter list, and `params` is an
   enumerable property; pino's `stdSerializers.err` (`utils/logger/index.ts:12-14`) serializes both.
   A failed `insert into "user"` therefore logs the email, username and bcrypt hash. postgres-js
   deliberately makes `query`/`parameters` non-enumerable to avoid exactly this (Context7
   `/porsager/postgres/v4.0.0`, "Error handling"), and Drizzle's wrapper undoes it. The pino
   `redact` paths (`*.passwordHash`, …) do not apply to an array or a string.
2. **Non-production 500 echoes parameters.** `errorHandler.ts:125` returns `err.message` when
   `APP_ENV !== 'production'`, i.e. the full `Failed query … params: …` text in development and test.
3. **FK violations → 500.** A bogus `vendorId`/`beanId`/`equipmentIds`/`tasteNoteIds` on recipe create
   raises `23503`; nothing maps it.
4. **Photo upload `c.req.formData()`** (`photo/index.ts:81`) throws a `TypeError` on a malformed
   multipart body → 500. Owned by the photo-upload track; noted only.

### 1.4 Reproductions of the claimed 500 paths

| Path | Reproduction | Today | After |
|---|---|---|---|
| Duplicate title | `POST /api/v1/recipes {title:'Espresso',…}` twice (or once after an `Espresso` recipe was soft-deleted) | `23505 recipe_slug_unique` in `DrizzleQueryError` → 500 | 201, slug `espresso-<6>` |
| Second fork | user B then user C `POST /api/v1/recipes/:id/fork` with no title | second → 500 | both 201 |
| Double follow | two concurrent `POST /api/v1/follow/:userId`; both pass `isFollowing` (`follow/service.ts:31-33`), second plain insert (`follow/model.ts:23-26`) hits `user_follow_follower_id_following_id_unique` | 500 | 409 `CONFLICT` (same code the route already uses for `ALREADY_FOLLOWING`) |
| Concurrent rating | two concurrent first `POST /api/v1/recipes/:id/rate`; select-then-insert (`recipe/model.ts:842-857`) | 500 for the loser | both 2xx via `onConflictDoUpdate` |
| Re-register after deletion | soft-delete account A, register with A's email; `isEmailTaken` filters `isNull(deletedAt)` (`auth/model.ts:142-150`) but `user_email_unique` is global (`schema.ts:80`) | 500 + PII in logs | 409 `Email already registered` (whether the email should be freed is the account-deletion track's call) |
| Malformed JSON | `POST /api/v1/collections` with `Content-Type: application/json` and body `{"name":` | 500 | 400 `BAD_REQUEST` |
| Empty-after-sanitize title | `POST /api/v1/recipes {title:'<b></b>'}` | 500 | 400 `VALIDATION_ERROR` |

## 2. Research: slug generation options

### Built-in building blocks (Node 26 + browsers)

- `String.prototype.normalize('NFKD')` + `/\p{M}+/gu` strip: handles every Latin diacritic incl.
  Turkish `ç ğ ö ş ü İ` and expands compatibility characters (`ﬁ`, `①`, full-width letters).
- `ı` (U+0131), `ß`, `æ`, `œ`, `ø`, `đ`, `ð`, `ł`, `þ` have no decomposition → explicit 9-entry map.
- `toLowerCase()` is locale-independent (default Unicode case mapping), so server locale cannot
  change the output; `'İ'.toLowerCase()` yields `i` + U+0307, which the mark-strip removes.
- `globalThis.crypto.getRandomValues` exists in Node ≥ 19 and every target browser, so the suffix
  helper can live in `@brewform/shared`.

Prototype run in Node (host `node`):

```
"Türk Kahvesi"             -> "turk-kahvesi"
"İSTANBUL Şehir Rehberi"   -> "istanbul-sehir-rehberi"
"Iğdır Usulü"              -> "igdir-usulu"
"ŞEKERSİZ ÇAY"             -> "sekersiz-cay"
"Bob's V60_Pour Over"      -> "bobs-v60-pour-over"
"Crème brûlée ﬁlter ①"     -> "creme-brulee-filter-1"
"Straße Æble"              -> "strasse-aeble"
"東京コーヒー" / "Кофе"     -> ""   (→ fallback recipe-<suffix>)
```

### Libraries considered

| Option | Pros | Cons |
|---|---|---|
| Built-in (chosen) | zero dependencies; runs in shared/web/API; ~30 lines; fully covers en + tr (the two shipped locales) and all Latin scripts | no transliteration for Cyrillic/Greek/CJK (handled by the `recipe-<suffix>` fallback) |
| `slugify` (simov) | small, char map incl. Turkish | another runtime dependency + Renovate/minimumReleaseAge churn; charMap quirks; still needs our uniqueness logic |
| `@sindresorhus/slugify` (+ `@sindresorhus/transliterate`) | good multi-script transliteration, `locale: 'tr'` option | ESM-only, pulls a transliteration table; overkill for two locales; still needs our uniqueness logic |
| `transliteration` | broad script coverage (CJK romanization) | large tables; romanized CJK slugs are of dubious value; dependency weight |

None of the libraries solve the actual bug (uniqueness under concurrency and soft deletes). The user
prefers built-in methods, and the built-in pipeline covers both shipped locales, so no plugin.

### Uniqueness strategies considered

| Strategy | Pros | Cons |
|---|---|---|
| Numeric suffix via prefix scan (`slug`, `slug-2`, …) | pretty | needs `LIKE 'slug-%'` scan + regex filter; races (two requests pick `-2`); leaks how many recipes (incl. private/deleted) share a title; still needs 23505 retry |
| Always random suffix | trivially unique | every URL is ugly, even for unique titles |
| **Clean base, random 6-char suffix on collision, DB unique constraint as arbiter + bounded retry (chosen)** | pretty URLs for the common case; no scan; no count leak; concurrency-safe | colliding titles get a non-semantic suffix (`espresso-k3x9q2`) |
| Slug = title + id prefix | always unique | ugly; changes URL format for everyone |

Collision probability with 36^6 ≈ 2.2·10^9 suffixes is negligible; 5 suffixed candidates plus 3
insert attempts bound the work.

## 3. Collection visibility options

| Option | Pros | Cons |
|---|---|---|
| Per-viewer cache keys | exact | near-zero hit rate; invalidation fan-out |
| Cache only anonymous projection; bypass for logged-in users | simple | logged-in traffic loses the cache; still stale for TTL after a recipe goes private |
| Explicit invalidation hooks from every recipe write (recipe update/delete, admin visibility/delete, account deletion) | fresh titles too | cross-module coupling; easy to miss a write path (admin already bypasses invariants); does not work across replicas with the memory driver |
| **Viewer-independent cached shape + one cheap `getRecipeVisibilityStates` query per hit + per-viewer filter (chosen)** | correct on every hit, every replica, every driver; one shared filter for hit and miss paths; no cross-module hooks | one extra indexed PK query per cached hit; titles/counters may be up to 10 min stale (unchanged behavior) |

Unlisted recipes: kept visible (they are viewable by anyone with the link per `canViewRecipe`, and
the user's list — deleted, private, draft — does not include unlisted). Recorded as an open
question in case the user prefers listing-surface semantics (public-only).

## 4. Error mapping notes

- Structural detection (`name === 'PostgresError'` + 5-char `code` on the `cause` chain) avoids adding
  `postgres` as an `apps/api` dependency (it is only a dependency of `@brewform/db`) and avoids
  importing `drizzle-orm` outside models.
- `23503` is split by statement kind (the wrapper's `query` starts with `insert`/`update` vs
  `delete`): a missing referenced row is the client's fault (400), a still-referenced row is a state
  conflict (409). Hard deletes are rare in this codebase (soft deletes everywhere), so in practice
  `23503` means a bogus id in the request.
- Out of scope: `40001`/`40P01` (serialization/deadlock → could be 503 + retry), connection errors,
  the 52 `zValidator` call sites without `zodValidationHook` (wrong envelope but already 400), and the
  full migration of the 121 string-coded sites to `AppError`.
