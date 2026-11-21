# Spec map: review findings and extras → delta specs

Every item of `audit/review.md` (#1–#34 and the "Not checked" mail-error item), the extras of
`audit/decisions.md` (E1–E11, the catalog `like` searches, the pre-wave-6 rollback floor, the debt
items D99.65–D99.67 pulled into scope) and the
requirement header(s) in `specs/<capability>/spec.md` that carry it. "ADDED", "MODIFIED" and
"RENAMED" are the delta sections the header sits under.

| Item | Capability | Requirement(s) |
|---|---|---|
| #1 recipe edit fails after a linked record is deleted | `recipe-write` | MODIFIED "Referenced records are validated before writing"; MODIFIED "Coffee variety is linkable and persisted" |
| | `recipe-comparison` | MODIFIED "Service merges two accessible versions into a new draft" |
| #2 restore half-applies a pre-upgrade dump | `production-operations` | MODIFIED "Restore, upgrade and rollback runbook" |
| | `container-deployment` | MODIFIED "Makefile targets for image build and prod profile" |
| | `ci-image-publishing` | MODIFIED "Pull requests build and smoke-test both images without publishing" |
| #3 `/uploads` buffers whole files | `photo-upload-security` | ADDED "Local uploads are streamed with bounded memory and cached as immutable" |
| #4 admin user search is case-sensitive and unescaped | `advanced-search` | ADDED "Admin and catalog substring searches match literally and ignore letter case"; MODIFIED "Search term bounds and pattern sanitization" (helpers move to `apps/api/src/utils/search.ts`) |
| #5 replies posted into another recipe's thread | `comment-authz` | ADDED "Replies stay inside their recipe's thread" |
| #6 parallel wrong passwords pass the failure limit | `api-rate-limiting` | MODIFIED "Login is protected per IP and per account" |
| #7 debounced commit uses a stale `setSearchParams` | `web-url-state` | MODIFIED "Text inputs debounce and replace history while typing" |
| #8 a failed rating replaces the page | `optimistic-rollback` | MODIFIED "Resource route actions return error data instead of throwing"; MODIFIED "Actions log structured entry, exit, and error events"; MODIFIED "Optimistic UI rollback on action failure" |
| | `web-data-loading` | MODIFIED "Revalidation after actions is scoped to affected data" |
| #9 background actions redirect to `/login?next=/resources/…`; `/auth/*` skips refresh | `web-data-loading` | MODIFIED "Auth-guarded loaders redirect to login with a return path"; MODIFIED "API client supports cancellation, single-flight refresh and defensive parsing" |
| #10 tar exit 1 drops the uploads archive | `production-operations` | MODIFIED "Uploads are backed up with the database when stored locally" |
| | `ci-image-publishing` | MODIFIED "Pull requests build and smoke-test both images without publishing" |
| #11 `.dockerignore` misses local data folders | `container-deployment` | MODIFIED "Docker build context excludes local state and nested artifacts"; MODIFIED "No secrets baked into images" |
| | `ci-image-publishing` | MODIFIED "Pull requests build and smoke-test both images without publishing" |
| #12 demo accounts on every fresh production install | `database-seed` (new) | ADDED "Production seed creates only the admin and reference data" |
| | `container-deployment` | MODIFIED "Entrypoint runs seed only on first boot" |
| | `ci-image-publishing` | MODIFIED "Pull requests build and smoke-test both images without publishing" |
| #13 client IP spoofable behind a front proxy | `production-operations` | ADDED "Self-hosting guide documents the front-proxy client-IP contract" |
| #14 double delete drives `commentCount` negative | `comment-authz` | ADDED "Deleting a comment removes its thread and keeps the comment count exact" (E1's block, which keeps r1's two scenarios; r1's "Deleting a comment decrements the comment count once" is not shipped) |
| #15 unbounded `additionalPreparations` | `recipe-write` | ADDED "Recipe relation arrays are bounded" |
| #16 cursor pages repeat or skip rows | `cursor-pagination` | ADDED "Cursor timestamps round-trip exactly" |
| #17 `dateTo` excludes the chosen day | `advanced-search` | MODIFIED "Date range filter" |
| | `recipe-filter` | MODIFIED "Shared recipe filter-building helper" |
| #18 rate-limit store stays `degraded` | `api-rate-limiting` | MODIFIED "Limiter degrades safely when the shared store is unavailable" |
| #19 brew timeline labels below 4.5:1 | `chart-rendering` | MODIFIED "Chart colours come from theme tokens and meet contrast minimums" |
| #20 QR route reveals hidden recipes (403) | `recipe-visibility` | ADDED "The QR route answers 404 for recipes it does not encode" |
| #21 `niceTicks` infinite loop | `chart-rendering` | MODIFIED "Shared chart primitives module" |
| #22 logout leaves private pages on screen | `web-data-loading` | ADDED "Signing out leaves no private data on screen" |
| | `account-deletion` | MODIFIED "Post-deletion auth cleanup and redirect" |
| | `error-handling` | MODIFIED "AuthContext exposes sessionError and clearSessionError" (`logout(leave?)` signature) |
| #23 follow/like roll back to the page-load value | `optimistic-rollback` | MODIFIED "Resource route actions return error data instead of throwing"; MODIFIED "Optimistic UI rollback on action failure"; MODIFIED "Error path test coverage for button components" |
| #24 "In collections" card goes stale | `web-data-loading` | MODIFIED "Revalidation after actions is scoped to affected data" |
| #25 "Brew again" for a deleted recipe shows load failed | `brew-journal` | MODIFIED "Brew log form page with create, edit, and prefill" |
| #26 `lower()` vs `toLowerCase()` on Turkish/Azeri locales | `unique-identifiers` | MODIFIED "Email addresses are normalized before validation, storage and lookup"; MODIFIED "Email and username uniqueness is case-insensitive at the database level"; MODIFIED "Email and username lookups are case-insensitive"; MODIFIED "Identifier conflicts are detected and remediated before stricter constraints apply" |
| | `lint-style` | MODIFIED "Raw SQL is confined to an accepted-exception registry" (the `lower()` row: column or bound value) |
| #27 trailing slash in `S3_PUBLIC_URL` (and `PUBLIC_APP_URL`) | `api-env-config` | ADDED "Public base URLs are normalised without a trailing slash" |
| | `model-test-coverage` | MODIFIED "Tier 2 API util tests follow the established util-test pattern" |
| #28 failed storage write leaves a partial file | `photo-upload-security` | MODIFIED "Best-effort cleanup of partially persisted uploads" |
| #29 `make prod-restore` takes no safety backup | `production-operations` | MODIFIED "Restore, upgrade and rollback runbook"; MODIFIED "Automated database backups" (one-shot runs never prune) |
| | `container-deployment` | MODIFIED "Makefile targets for image build and prod profile" |
| #30 Coolify guide puts secrets on command lines | `deployment-guide` | ADDED "Deployment guides keep secrets off command lines" |
| #31 seed re-run fails after a renamed default setup | `database-seed` (new) | ADDED "Seed re-runs survive user edits to seeded rows" |
| #32 raw-SQL registry incomplete | `lint-style` | MODIFIED "Raw SQL is confined to an accepted-exception registry" |
| | `equipment-recipe-query` | RENAMED "Equipment recipe query uses the Drizzle query builder exclusively" → "Equipment recipe query keeps its correlated EXISTS as a registered raw-SQL exception" (plus MODIFIED under the new title); MODIFIED "getRecipesUsingEquipment retains the count branch's innerJoin chain" |
| #33 sitemap queries unbounded | `recipe-visibility` | Superseded by E8: ADDED "The sitemap is a root-level sitemap index with bounded pages" (r1's "The sitemap stays within the sitemap protocol limit" is not shipped) |
| #34 dead code: admin `isEmailTaken`/`isUsernameTaken` | `unique-identifiers` | MODIFIED "Identifiers of soft-deleted accounts stay reserved and conflicts map to 409"; MODIFIED "Email and username lookups are case-insensitive" (admin entries dropped) |
| #34 dead code: `auth/model.ts#findUserByUsername` | `unique-identifiers` | MODIFIED "Email and username lookups are case-insensitive" (entry dropped) |
| #34 dead code: `user/model.ts#searchUsers` | none | no spec change: no spec names it |
| #34 dead code: recipe `create`, `update` (D99.51), `incrementLikes`, `decrementLikes` | none | no spec change: no spec names them (the `lint-style` counter row lists only the live counters) |
| #34 dead code: `comment/model.ts#getRecipeAuthorId` | `recipe-visibility` | MODIFIED "An enforcement test keeps every recipe listing on the shared condition" (exemption removed; relational `recipe:` loads added to Rule B) |
| #34 dead code: `collection/model.ts#getItems` | `recipe-collections` | MODIFIED "API model layer — pure Drizzle data-access" |
| #34 dead code: `fitViewBox` `symmetricX` | `chart-rendering` | MODIFIED "Shared chart primitives module" (`fitViewBox(content, margin = 0)`) |
| #34 dead code: setup "clearing defaults" log lines | `api-service-logging` | MODIFIED "Cache-aware functions log cache interactions"; MODIFIED "Services with async side effects log the side effect execution" |
| #34 dead code: upload `getPublicUrl`, `saveThumbnail`, `getThumbnailSizes` (r2, with #27) | `model-test-coverage`, `api-env-config` | see #27 |
| "Not checked": mail send errors log recipient addresses | `error-handling` | ADDED "Email send failures are logged without recipient addresses" |
| Catalog `like` searches (equipment, vendor, taste note, coffee variety; closes D99.61) | `advanced-search` | folded into #4: ADDED "Admin and catalog substring searches match literally and ignore letter case" |
| E1 replies of a deleted top-level comment stay counted but hidden | `comment-authz` | ADDED "Deleting a comment removes its thread and keeps the comment count exact" |
| | `lint-style` | MODIFIED "Raw SQL is confined to an accepted-exception registry" (counter row: `decrementComments` takes the number of removed rows) |
| E2 Clear Filters within 300 ms keeps the pending search | `web-url-state` | ADDED "Clear-all cancels pending debounced text commits" |
| E3 coffee-variety list fields unbounded | `coffee-variety-write` (new) | ADDED "Coffee-variety list fields are bounded" |
| E4 deleted taste note invisible in the edit picker | `recipe-write` | MODIFIED "Recipe edit page saves honestly" |
| E5 version diff passes the admin flag | `version-diff` | MODIFIED "Diff endpoint"; MODIFIED "Authorization" |
| | `comment-authz` | MODIFIED "Shared recipe-visibility predicate" |
| E6 app-wide text tokens below 4.5:1 | `web-shared-components` | ADDED "Theme text tokens meet WCAG AA on the surfaces they are drawn on" |
| | `chart-rendering` | MODIFIED "Chart colours come from theme tokens and meet contrast minimums" (three number edits) |
| E7 logout and login not synced across tabs | `web-data-loading` | ADDED "Sign-in and sign-out are mirrored in every open tab" |
| E8 sitemap index past 50,000 URLs, at the site root | `recipe-visibility` | ADDED "The sitemap is a root-level sitemap index with bounded pages"; MODIFIED "Discovery surfaces list only public recipes" |
| | `container-deployment` | MODIFIED "Web edge reverse-proxies API paths when an upstream is configured"; MODIFIED "Web image applies the public app URL at runtime" |
| | `ci-image-publishing` | MODIFIED "Pull requests build and smoke-test both images without publishing" (edge checks `/sitemap.xml` and the 301) |
| E9 `TasteAutocomplete` hard-codes English (plus the blind literal guard, `SessionRestoreBanner`, `MetadataBadges`) | `i18n` | MODIFIED "A literal-attribute regression test guards against new stragglers"; ADDED "Taste picker, session banner and version badge strings are translated" |
| E10 replies query has no `limit` | `comment-pagination` | ADDED "Replies per top-level comment are bounded" (20 per parent, oldest first, `hasMoreReplies`) |
| E11 a deleted account keeps its public identity (comments, recipes, collections) | `account-deletion` | ADDED "A deleted account has no public identity" |
| | `comment-authz` | ADDED "Deleting a comment removes its thread and keeps the comment count exact" (closing clause: a deleted account's comments show no author identity) |
| | `recipe-filter` | MODIFIED "Shared recipe filter-building helper" (`author` subquery requires `isNull(users.deletedAt)`) |
| | `recipe-collections` | MODIFIED "Shared response Output Schemas for collections" (`author` nullable) |
| D99.65 raw database errors in logs (notification service and 11 more files; pulled into scope by the user) | `error-handling` | MODIFIED "Database error logs never contain query parameters or row values" (every catch that can see a database error logs `toLoggableError`; the enforcement test pins the files) |
| D99.66 mirror tests of `buildRecipeFilters`, `listRecipes` and `getPublicProfile` (pulled into scope by the user) | `model-test-coverage` | MODIFIED "Test files exercise the production module they name" (rewritten files listed; every filter branch runs against the database; no mirror remains) |
| D99.67 drifted `recipe.comment_count` values (pulled into scope by the user) | `comment-authz` | ADDED "Stored comment counts are recounted after every migration run" (what is counted, the Drizzle-only compare-and-set recount, output, idempotency, the seed check) |
| | `container-deployment` | MODIFIED "Entrypoint runs migrations on every boot" (the recount step after `Migrations complete.`; a failed recount warns and does not block the start) |
| Pre-wave-6 rollback floor | `production-operations` | MODIFIED "Restore, upgrade and rollback runbook" (Rollback bullet: the compose file runs only images with the `migrate` entrypoint mode, wave 6 and later) |
| Wave-6 manual checks 10.36, 16.9, 17.22, 19.27, 29.14 (post-merge) | none | no spec change: manual verification tasks |

## Assembly notes

- Four MODIFIED blocks come from the specs assembler, not from a research note, because the fixes
  contradict them: `account-deletion` "Post-deletion auth cleanup and redirect" (it required
  clearing the user before navigating, the order #22 reverses), `recipe-filter` "Shared recipe
  filter-building helper" (`dateTo?: Date` with `lte`, contradicting #17; the unfiltered `author`
  subquery, contradicting E11), `error-handling` "AuthContext exposes sessionError and
  clearSessionError" (the interface snippet's `logout: () => Promise<void>`) and
  `recipe-collections` "Shared response Output Schemas for collections" (a non-null detail
  `author`, contradicting E11).
- Scenarios dropped on purpose (their behaviour is removed): `api-service-logging` "Default-clearing
  side effect in setup service is logged", "setDefault logs the clearDefaultForUser side effect
  before executing it", "updateSetup logs the clearDefaultForUser side effect when isDefault is
  true"; `optimistic-rollback` "Loader revalidation proceeds after action error return";
  `recipe-collections` "getItems excludes soft-deleted recipes"; `version-diff` "Admin views private
  recipe diff". Every other existing scenario name is kept.
- After archiving, replace the placeholder Purpose of `openspec/specs/database-seed/spec.md` and
  `openspec/specs/coffee-variety-write/spec.md`, and rewrite the Purpose of
  `openspec/specs/equipment-recipe-query/spec.md` (it still describes the abandoned `exists()`
  rewrite; a delta cannot change it).
