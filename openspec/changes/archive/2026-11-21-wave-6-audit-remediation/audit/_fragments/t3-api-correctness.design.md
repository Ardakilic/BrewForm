### Slugs, collection visibility & error mapping (t3-api-correctness)

**Context**

Three API correctness defects, all re-validated against the code (full evidence in
`audit/t3-api-correctness.md`):

- **Slugs.** `generateUniqueSlug` (`apps/api/src/modules/recipe/service.ts:58-63`) and `forkRecipe`
  (`:396-398`) call `ensureUniqueSlug(slug, [])`; with an empty list
  (`packages/shared/src/utils/slug.ts:13-14`) no suffix is ever added. `recipe_slug_unique`
  (`packages/db/src/schema.ts:139`) is global, including soft-deleted rows, while the pre-check
  `findBySlug` ignores deleted rows (`recipe/model.ts:338-341`). Result: a second recipe with the same
  title, a title matching a deleted recipe, a second fork, or a second merge with the same title all
  return 500. `generateSlug` (`slug.ts:3-9`) strips non-ASCII (`Türk Kahvesi` → `trk-kahvesi`; CJK →
  `''`), keeps `_` (breaking the QR filename regex in `packages/shared/src/schemas/common.ts:22-24`),
  and can emit reserved words (`new`, `starred`, `unavailable`) that static routes shadow. Fork titles
  skip `sanitizeText`. Only recipes have slugs. **Validation: confirmed, plus the four extra defects.**
- **Collections.** `collection/model.ts:10-34` loads every item's recipe with no `deletedAt` or
  visibility filter; `service.ts:57-102` maps all of them (title, slug, author, visibility,
  deletedAt) and sets `recipeCount = items.length`; the result is cached for 10 minutes
  (`service.ts:13`, `:207-242`) and nothing invalidates it on recipe delete/visibility change
  (`recipe/service.ts:365-372`, `admin/service.ts:203-228`). List counts count raw rows
  (`model.ts:71-77`, `:159-165`). Reorder requires the full item list (`service.ts:452-461`) while the
  web sends only displayed ids (`CollectionRecipeList.tsx:106-118`). **Validation: confirmed; the
  claim that the existing spec already requires the detail to hide deleted recipes is overstated (it
  only covers `getItems`). Leak is titles/slugs/authors/counts, not recipe content.**
- **Errors.** `errorHandler.ts:40` tests `err.name === 'PostgresError'`, but drizzle-orm 0.45
  (`pnpm-workspace.yaml:9`) wraps every driver error in `DrizzleQueryError` (name `Error`, original on
  `.cause`; verified in source and via Context7). There is no `HTTPException` branch, so hono's
  `Malformed JSON in request body` (400) becomes 500. Admin (`admin/model.ts:143-160`) and collections
  (`collection/service.ts:394-404`) unwrap by hand. The error-handler test (`errorHandler.test.ts`)
  never exercises the wrapped shape. Further: `DrizzleQueryError` embeds query parameters in its
  message and an enumerable `params` field, so pino logs emails/usernames/bcrypt hashes on DB errors,
  and non-production 500s echo them. **Validation: confirmed; reproductions for duplicate slug, double
  fork, double follow, concurrent first rating, re-register after deletion, malformed JSON and
  empty-after-sanitize title are listed in the audit notes.**

**Decisions**

1. *Built-in slug pipeline, no plugin.* `generateSlug` = strip apostrophes → `toLowerCase()` →
   9-entry map (`ı ß æ œ ø đ ð ł þ`) → `normalize('NFKD')` + strip `\p{M}` → non-`[a-z0-9]` runs to
   `-` → trim → cap 93 chars at a hyphen boundary. Empty result → `recipe-<suffix>`.
   *Alternatives:* `slugify`, `@sindresorhus/slugify` (+ transliterate), `transliteration`, or
   Unicode slugs (`\p{L}\p{N}`). *Rationale:* the user prefers built-in; NFKD covers every Latin
   script including Turkish, which with English is every shipped locale; libraries add dependency and
   Renovate churn and do not fix the real bug (uniqueness); Unicode slugs would break `SlugSchema`,
   the QR filename regex and produce percent-encoded share URLs.
2. *Collision handling: clean base, random 6-char `[a-z0-9]` suffix on collision, DB constraint as
   arbiter.* `model.slugExists(slug)` checks ALL rows (deliberately no `deletedAt` filter, documented in
   the docblock). Up to 5 suffixed candidates; then the insert transaction is retried up to 3 times when
   `isUniqueViolation(err, 'recipe_slug_unique')`; exhaustion throws `ConflictError('SLUG_CONFLICT')`
   (409). *Alternatives:* numeric `-2/-3` via `LIKE` prefix scan; always-random suffix; id-prefixed
   slugs. *Rationale:* pretty URLs for unique titles; no scan; no count leak about private/deleted
   recipes; concurrency-safe because the unique constraint decides and the retry absorbs the race.
   The suffix helper uses `globalThis.crypto.getRandomValues` so it lives in `@brewform/shared`.
3. *Reserved slugs.* `RESERVED_RECIPE_SLUGS` (`new`, `starred`, `unavailable`, `compare`, `meta`,
   `merge`, `edit`, `versions`, `focus`, `search`, `feed`, `recipe`) and UUID-shaped bases always get a
   suffix. *Alternative:* rename/guard routes. *Rationale:* cheaper and future-proof; keeps
   `getRecipe(slugOrId)` unambiguous.
4. *Slugs are immutable after creation; no backfill.* *Alternatives:* regenerate on rename with a
   redirect table; backfill mangled legacy slugs. *Rationale:* shared links, QR codes, sitemap and
   notification links must keep working; a redirect table is new schema for little value. Legacy
   slugs with `_` remain QR-incompatible (open question).
5. *Fork/merge reuse the pipeline; fork title sanitized* with `sanitizeText`, falling back to
   `Fork of <source title>` when empty.
6. *Collection item predicate = canonical `canViewRecipe` + not soft-deleted.* public/unlisted → all;
   draft/private → recipe author only; collection ownership grants nothing extra; admin flag not
   passed (matches the recipe detail route). *Alternatives:* owner sees everything in their own
   collection; hide unlisted from non-authors (listing-surface semantics). *Rationale:* the user asked
   to hide "deleted and private, template/unpublished" recipes; an owner seeing another author's now-
   private recipe would itself be a leak; reusing `canViewRecipe` keeps one visibility rule (if the
   visibility-rules track relocates it, import the relocated export). Unlisted stays visible because
   it is link-viewable by design (open question recorded).
7. *Caching: viewer-independent cached shape + per-request filter + cached-hit state refresh.* The
   cache stores the collection and every item whose recipe was not deleted at fill time, each retaining
   recipe `visibility`/`authorId`. Every response (hit or miss) passes through one
   `filterItemsForViewer(detail, viewerId, freshStates?)`; on a hit, `model.getRecipeVisibilityStates(recipeIds)`
   (one PK `inArray` query, selecting 4 columns, no `deletedAt` filter) supplies fresh state.
   *Alternatives:* per-viewer keys; anonymous-only cache; explicit invalidation hooks on every recipe
   write path; dropping the cache. *Rationale:* correct on every replica and cache driver without
   cross-module hooks (admin writes already bypass invariants, and memory caches are per replica);
   keeps the 4-level join off the hot path; TTL stays 10 minutes.
8. *Counts by audience.* Detail: `items.length` after filtering. Owner list: non-deleted AND
   (public/unlisted OR authored by owner). Public lists: non-deleted AND public/unlisted. Implemented
   with a Drizzle `innerJoin(recipes)` in the existing batched count (no raw SQL). `containsRecipe`
   stays raw membership.
9. *Reorder over the visible set.* `itemIds` must equal the owner-visible set; hidden items keep
   their relative order and get the trailing `sortOrder` values in the same transaction. Remove works
   on hidden items by `recipeId`. *Alternative:* return hidden items to the owner as tombstones.
   *Rationale:* tombstones need a schema change (`recipe` nullable) and leak existence; hidden items
   are inert and reappear if the recipe becomes visible again.
10. *Add rule unchanged; make it explicit.* Owner may add own recipes of any visibility and others'
    public recipes; own draft/private items stay hidden from others; the web modal shows
    `collection.modal.hiddenRecipeNote` (en + tr) when the recipe is draft/private. `AddToCollectionButton`
    gains a `recipeVisibility` prop passed from `RecipeDetailPage`.
11. *Error handler: structural Postgres detection on the `cause` chain* via
    `getPostgresError(err)` in `apps/api/src/utils/errors.ts` (depth ≤ 5). *Alternatives:*
    `instanceof DrizzleQueryError` / `instanceof PostgresError`. *Rationale:* no new `postgres`
    dependency in `apps/api`, no `drizzle-orm` import outside models, works for wrapped and bare errors
    and for errors re-thrown with `{ cause }`.
12. *SQLSTATE mapping:* `23505` → 409 `CONFLICT`; `23503` → 400 `VALIDATION_ERROR` on
    insert/update, 409 `CONFLICT` on delete (from the wrapper's `query` prefix; default 400);
    `23502`/`23514`/class `22` → 400 `VALIDATION_ERROR`; others → 500. No SQL, params or constraint
    names in responses. *Alternative:* single status for 23503. *Rationale:* the two directions mean
    different things; soft deletes make the delete case rare.
13. *`HTTPException` first.* Preserve status; envelope via `c.json` (keeps CORS/request-id headers);
    honor custom `res` via `getResponse()`; status→code table; 4xx logged at warn, never
    `Unhandled error`.
14. *Small typed `AppError` hierarchy + legacy convention fallback.* `AppError(code, status, message,
    details?)` with `NotFoundError`, `ForbiddenError`, `ConflictError`, `ValidationError` in
    `apps/api/src/utils/errors.ts`; the handler maps them. Unhandled string codes map by convention
    (`FORBIDDEN`, `*_NOT_FOUND`, `ALREADY_*`/`*_ALREADY_EXISTS`, `VALIDATION_ERROR…`) with a warn log.
    *Alternatives:* migrate all 121 sites now; leave strings alone. *Rationale:* fixes every 500 the
    audit reproduced without a repo-wide rewrite; existing `message ===` controller mappings keep
    working; new code (slug conflict, title validation) uses the typed classes; the full migration is a
    follow-up.
15. *Log sanitization.* `toLoggableError(err)` keeps name, SQL text (no params), SQLSTATE, constraint,
    stack; drops `params`/`parameters`/`detail`. Mapped DB errors log `{ pgCode, constraint, table }` at
    warn. Non-production 500 message for DB errors becomes `Database error`.
16. *Race paths.* `upsertUserRating` becomes one `insert … onConflictDoUpdate` on
    `(userId, recipeId)`; double-follow and version-bump races rely on the global 23505 → 409 (same
    `CONFLICT` code the follow route already returns); registration maps `23505` on
    `user_email_unique`/`user_username_unique` to the existing `EMAIL_ALREADY_EXISTS` /
    `USERNAME_ALREADY_EXISTS`; `throwIfUniqueViolation` and the collection duplicate check switch to
    `isUniqueViolation`.

**Risks / Trade-offs**

- [Colliding titles get non-semantic suffixes (`espresso-k3x9q2`)] → acceptable; unique titles stay
  clean, and numeric suffixes would leak counts and race.
- [Insert retry re-runs the whole create transaction] → the failed attempt is rolled back by Postgres;
  side effects (notifications, badges) run only after success; retries are bounded (3).
- [Legacy convention fallback could turn a genuine internal `*_NOT_FOUND` bug into a 404] → each
  fallback logs `Unmapped domain error reached global handler` at warn with the code, so gaps stay
  visible; arbitrary messages still 500.
- [Extra PK query on every cached collection hit] → bounded by collection size, 4 columns, indexed;
  far cheaper than the 4-level join the cache avoids.
- [Titles/like counts in cached collection details can still be ≤10 min stale] → unchanged behavior;
  only visibility/deletion (the privacy-relevant fields) are refreshed per hit.
- [Hidden items are invisible to the collection owner and cannot be removed from the UI] → they are
  inert, excluded from counts, and reappear if the recipe becomes visible; remove-by-recipeId still
  works via the API.
- [`23503` split relies on the wrapper's `query` text] → falls back to 400 when absent; covered by unit
  tests for both statement kinds.
- [Overlap with other tracks: visibility-rule consolidation, account deletion, admin CRUD, docs/api.md
  refresh, recipe-interactions visibility on `/rate`] → this track only consumes `canViewRecipe`, only
  maps the registration conflict (does not decide email reuse), and edits only the error-code table /
  error-path sections of the docs.
- [Unlisted recipes remain visible in public collections] → consistent with `canViewRecipe`; open
  question for the user.

**Migration / Rollout**

- No database migration, no schema change, no new env var, no new dependency. `make db-generate`
  must still report "No schema changes, nothing to migrate".
- Existing slugs are untouched; only new recipes/forks/merges use the new pipeline.
- Cache: the cached collection-detail shape changes (it must now carry each item's recipe
  `visibility`/`authorId`, which it already does). After deploy, old entries remain readable; no flush
  is required, but `make flush-cache` (or the admin cache flush) clears them immediately if desired.
- Client impact: some responses change from 500 to 400/409 (`BAD_REQUEST`, `VALIDATION_ERROR`,
  `CONFLICT`, `SLUG_CONFLICT`); the web client already handles non-2xx envelopes generically.
- Rollback: revert the commit; no data to undo (slugs created with suffixes remain valid slugs).
