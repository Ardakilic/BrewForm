## Why

The ponytail review of PR #172 (`audit/review.md`, 2026-11-21) found 34 problems in the
wave-6 audit remediation before it was merged. Four are must-fix:
- recipe edits break after a linked item is deleted;
- restoring a pre-upgrade backup leaves a half-restored, unstartable database;
- one client can crash the API by downloading photos;
- admin user search no longer finds mixed-case accounts.

The rest are access gaps, race conditions, deploy pitfalls, web data-loading regressions and
dead code. Research on the current code (`audit/r1`–`r7`) confirmed every finding except one
(#26, partly: it only affects Turkish/Azeri-locale databases). It widened several findings and
found eleven more problems (E1–E11). The user chose to fix all of it in this change, on the same
branch, before PR #172 merges and its images are published to GHCR (`audit/decisions.md`). That
includes three items first parked as debt: raw database errors in logs, mirror tests of the recipe
filters, and stored comment counts that drifted before this change.

## What Changes

### API: recipes, comments, search (r1, r2)
- Recipe updates re-check only references that are new to the version. Merges drop soft-deleted
  taste notes and equipment instead of failing (#1).
- Replies must belong to the same recipe as their parent (#5, closes D99.42).
- A comment delete decrements `commentCount` only when it actually deleted. Deleting a top-level
  comment also removes its replies, and the count drops by the number of rows removed (#14, E1).
- Stored `commentCount` values are recounted after every migration run (the image entrypoint and
  `make db-migrate`, plus `make db-recount-comments`). The Drizzle-only recount updates only
  drifted rows, never overwrites a concurrent change, and logs the repaired recipe ids. A failed
  recount only warns (D99.67).
- The comment list returns at most 20 replies per top-level comment (oldest first) with a
  `hasMoreReplies` flag (E10).
- A deleted account has no public identity. Comments, recipe lists, detail, feed, the crawler
  description, collections and the `?author=` filter return a null author. The web shows
  "Deleted user" without a profile link, and admin pages keep the name (E11).
- Recipe relation arrays get size limits: `additionalPreparations`, `tasteNoteIds`,
  `equipmentIds`. Coffee-variety string fields get bounds (#15, E3).
- `recipes.createdAt` stores millisecond precision (generated migration), so cursor pages on the
  recipe list and the follow feed neither repeat nor skip rows (#16).
- **BREAKING (API):** `dateFrom`/`dateTo` accept dates only (`YYYY-MM-DD`, UTC days). The range
  includes both days (#17).
- The QR route answers 404 for recipes it does not encode (#20).
- **BREAKING (path):** the sitemap moves to the site root as a sitemap index (`/sitemap.xml`)
  with bounded pages of at most 50,000 URLs. Deleted users' profiles are no longer listed, and
  `/api/v1/sitemap.xml` answers 301 (#33, E8).
- Every admin and catalog substring search uses one shared, escaped, case-insensitive helper:
  users, coffee varieties, equipment, vendors, taste notes (#4, closes D99.61).
- The version-diff route is author-only like every other recipe surface. It no longer passes
  the admin flag, and the `version-diff` spec is corrected (E5).

### API: infrastructure and auth (r2)
- `/uploads` streams files with bounded memory and sends immutable cache headers (#3).
- Failed-login limiting consumes a point before the password check and refunds it on success, so
  parallel guesses cannot overshoot (#6).
- The rate-limit store's `degraded` status recovers after a successful call (#18).
- `lower()` takes a column or a bound value, so both sides of every identifier comparison are
  lowered by Postgres (#26).
- `S3_PUBLIC_URL` and `PUBLIC_APP_URL` are normalised without a trailing slash, and duplicate URL
  builders are deleted (#27).
- A partially written upload is cleaned up (#28).
- Email send failures are logged without recipient addresses (review "Not checked" item).
- Every catch that can see a database error logs it through `toLoggableError`: the notification
  service, the side-effect handlers, brew logs, the auth and crawler middleware, the cron job and
  the admin setup script. A static test pins these files (D99.65).
- Dead code is deleted: unused identifier helpers, recipe/comment/collection model functions,
  upload helpers, the `symmetricX` chart option, and stale log lines (#34, closes D99.51).

### Deploy and operations (r3)
- Restore goes into a scratch database in one transaction. It is swapped in only on success, and
  a safety backup is taken first (#2, #29). CI runs a real restore round-trip, including a dump
  from an older schema.
- The uploads backup survives files that change during the run but still fails on real errors.
  One-shot backups never prune (#10, #29).
- `.dockerignore` keeps local data, dumps and exports out of the build context, with a test (#11).
- **BREAKING (first install):** the production seed creates only the admin account and reference
  data, with no demo accounts (#12, reverses and closes D99.52). Seed re-runs survive user edits
  to seeded rows (#31).
- The guides document the front-proxy `X-Forwarded-For` contract (#13), keep secrets off command
  lines (#30), and state the pre-wave-6 rollback floor.

### Web (r4, r6)
- Debounced URL text commits apply on top of the current URL, never a stale one, and so do
  "Clear filters" and the discrete setters (#7, E2).
- Rating, like, favourite and follow actions return `{ ok, error }` and roll back to the last
  confirmed value with a toast. Follow and unfollow are idempotent (#8, #23).
- Element-less resource routes never redirect to login. Only login, register, refresh and logout
  skip the session refresh (#9).
- Signing out lands on `/` and leaves no private data on screen. Sign-in and sign-out are
  mirrored in every open tab (#22, E7).
- The add-to-collection modal refreshes the "In collections" card (#24).
- The brew-log create page shows not-found for a missing recipe (#25).
- A soft-deleted taste note stays visible and removable in the edit form (E4).
- Chart and app text tokens meet 4.5:1 in light, dark and coffee themes on the surfaces they
  are drawn on. `niceTicks` terminates on every input (#19, #21, E6).
- The taste picker, session-restore banner, version badges and admin avatar text are
  translated. The i18n literal guard catches double-quoted and template-literal attributes (E9).

### Specs and process (r5)
- The raw-SQL accepted-exception registry lists every `sql` fragment, every fragment carries its
  `// D03 raw-SQL exception:` comment, and a test enforces both (#32).
- Wave-6 manual checks 10.36, 16.9, 17.22, 19.27 and the post-merge part of 29.14 are carried
  here. 16.9, 17.22 and 19.27 are re-run after the fixes.
- The remaining mirror tests (inline copies of `buildRecipeFilters`, `listRecipes` and
  `getPublicProfile`) are replaced by tests of the real functions, DB-backed where needed (D99.66).

## Capabilities

### New Capabilities
- `coffee-variety-write`: coffee-variety create and update payloads bound their list fields
  (20 items of at most 100 characters each) for the user and admin routes (E3).
- `database-seed`: the production seed creates only the admin account and the reference data
  (taste notes, equipment, coffee varieties, the 7 real-roaster vendors, badges, compatibility
  rules), with no override; seed re-runs survive user edits and partial unique indexes (#12, #31).

### Modified Capabilities
- `account-deletion`: a deleted account has no public identity: non-admin responses return a `null`
  author or owner for its comments, recipes and collections, the web shows "Deleted user" without a
  profile link, and the `author` filter skips it (E11); the post-deletion sign-out goes through
  `useSignOut()` (server logout, navigate to `/`, then clear the user), so it never lands on
  `/login` (#22).
- `advanced-search`: `dateFrom`/`dateTo` are inclusive UTC days in `YYYY-MM-DD` form (#17); the
  search helpers move to `utils/search.ts` and every admin and catalog substring search matches
  literally and ignores letter case (#4).
- `api-env-config`: `S3_PUBLIC_URL`, `PUBLIC_APP_URL` and `APP_URL` are normalised without a
  trailing slash, and the storage driver's `save()` returns the stored URL (#27).
- `api-rate-limiting`: failure-only login limits consume a point before the handler and refund it
  (#6); the store leaves `degraded` on the first successful call (#18).
- `api-service-logging`: the cache and side-effect logging requirements drop the deleted setup
  "clearing defaults" log lines (#34).
- `brew-journal`: the brew-log create page renders not-found for a deleted recipe (#25).
- `chart-rendering`: chart text contrast is checked against the backgrounds it is drawn on, phase
  titles use `--text-primary` (#19, E6 numbers); `niceTicks` terminates on every finite input;
  `fitViewBox(content, margin)` loses `symmetricX` (#21, #34).
- `ci-image-publishing`: the PR image job adds a `.dockerignore` build-context test, a restore
  round-trip (including an older dump), the tar-exit-1 backup check, the production-seed check and
  the root sitemap and its 301 (#2, #10, #11, #12, E8).
- `comment-authz`: replies stay inside their recipe's thread (#5); deleting a comment removes its
  thread and lowers `commentCount` by exactly the rows it deleted (#14, E1); the recipe GET routes,
  version diff included, give admins no bypass (E5); stored comment counts are recounted after
  every migration run (D99.67).
- `comment-pagination`: the comment list returns at most 20 replies per top-level comment, oldest
  first, with `hasMoreReplies` (E10).
- `container-deployment`: the entrypoint defers seed content to `database-seed` (#12);
  `make prod-restore` takes a safety backup and `prod-backup` never prunes (#2, #29); the build
  context excludes local data folders and backup files (#11); the web edge proxies `/sitemap.xml`
  and `robots.txt` points at it (E8); the entrypoint recounts comment counts after the migrations,
  and a failed recount does not block the start (D99.67).
- `cursor-pagination`: `recipe.created_at` has millisecond precision so cursor timestamps
  round-trip exactly (#16).
- `deployment-guide`: the guides keep secrets off command lines (#30).
- `equipment-recipe-query`: renamed requirement keeps the correlated `EXISTS` as a registered
  raw-SQL exception; the count branch uses `countDistinct()` (#32).
- `error-handling`: email send failures are logged without recipient addresses (review "Not
  checked" item); every catch that can see a database error logs `toLoggableError` (D99.65); the
  `AuthContextType.logout` signature takes the `leave` callback (#22).
- `i18n`: the literal-attribute test catches every quoting form and template static text; the taste
  picker, session-restore banner and version badge strings are translated (E9).
- `lint-style`: the raw-SQL registry lists every fragment, each fragment carries its D03 comment,
  and `lint-policy.test.ts` enforces both (#32).
- `model-test-coverage`: the upload util test row drops the deleted URL helpers (#27); the mirror
  tests of the recipe filters, `listRecipes` and `getPublicProfile` are replaced by tests of the
  real functions (D99.66).
- `optimistic-rollback`: like, favourite, rate and follow return `{ ok, error }` with the pre-click
  state, roll back to the last confirmed value with a toast, and follow is idempotent (#8, #23).
- `photo-upload-security`: `/uploads` streams files with bounded memory and immutable caching (#3);
  cleanup covers the key whose write failed, except `EEXIST` (#28).
- `production-operations`: restore into a scratch database in one transaction, swapped in only on
  success, after a safety backup (#2, #29); one-shot backups never prune and tar exit 1 keeps the
  uploads archive (#10, #29); the front-proxy `X-Forwarded-For` contract (#13); the pre-wave-6
  rollback floor.
- `recipe-collections`: the model layer has no `getItems` (#34); the collection detail `author` is
  nullable for a deleted owner (E11).
- `recipe-comparison`: a merge drops soft-deleted taste notes and equipment (#1).
- `recipe-filter`: `buildRecipeFilters` takes `dateFrom`/`dateTo` as UTC days with an exclusive
  next-day bound (#17), and the `author` filter matches only live accounts (E11).
- `recipe-visibility`: the QR route answers 404 for recipes it does not encode (#20); the sitemap is
  a root-level, bounded sitemap index with a 301 from the old path, and skips deleted accounts
  (#33, E8); the enforcement test covers relational recipe loads and drops the stale exemption (#34).
- `recipe-write`: references are re-validated only when the write newly sets them, and an unchanged
  deleted coffee variety is kept (#1); relation arrays are bounded (#15); the edit page keeps a
  deleted linked taste note visible and removable (E4).
- `unique-identifiers`: `lower()` takes a column or a bound value and lookups lower both sides in
  SQL (#26); admin writes rely on the unique indexes and the 409 mapping, the dead helpers are gone
  (#34).
- `version-diff`: the diff authorizes without the admin flag, like the recipe detail (E5).
- `web-data-loading`: resource routes never redirect to login and only login, register, refresh and
  logout skip the refresh (#9); failed actions do not revalidate and the add-to-collection modal
  revalidates once on close (#8, #24); signing out leaves no private data on screen (#22) and is
  mirrored in every open tab (E7).
- `web-shared-components`: theme text tokens meet 4.5:1 on the surfaces they are allowed on, with a
  usage guard (E6).
- `web-url-state`: debounced and discrete URL writes build on the current URL (#7); Clear Filters
  cancels pending debounced commits (E2).

## Non-Goals

- No new features beyond the fixes. No ADR (ADR-022 stays the next free number).
- No `SEED_DEMO_DATA` override (`audit/decisions.md` §2).
- No change to the `TRUSTED_PROXIES` default (#13 is fixed in docs).
- No `COLLATE "C"` rebuild of the identifier indexes (#26 is fixed in the query).
- No advisory lock for concurrent migrators (multi-replica serve stays unsupported, D99.45).

## Impact

- **Code:**
  - `apps/api`: recipe, comment, qrcode, admin, auth, user, setup, photo, collection,
    equipment, vendor, taste-note, coffee-variety, notification, follow, badge and brew-log
    modules; `main.ts`, `setup.ts`; the auth and crawler middleware; rate-limit, storage, upload,
    search, config and cron utils; sitemap routes; the recipe and user mirror tests.
  - `apps/web`: hooks, routes and resources, auth guards, API client, AuthContext, buttons, chart
    utils, `globals.css`.
  - `packages/shared` schemas; `packages/db`: schema (one generated migration), seed (two seeded
    comment counts corrected), `lower()`, the new `recount-comment-counts.ts`.
- **Deploy:** `compose.production.yml` (backup and restore), `Makefile` (`prod-restore`,
  `db-migrate`, the new `db-recount-comments`), `.dockerignore`, `docker-entrypoint.sh` (the
  recount step), `scripts/ci/*`.
- **API contract:**
  - `dateFrom`/`dateTo` date-only (breaking for clients that sent timestamps);
  - QR answers 404 instead of 403;
  - the sitemap index at the root `/sitemap.xml`, with a 301 from `/api/v1/sitemap.xml`;
  - recipe and collection `author` fields are nullable for deleted accounts (six response
    schemas);
  - comment threads carry `hasMoreReplies`.
  - OpenAPI metadata and `docs/api-reference.md` are regenerated.
- **Docs:** AGENTS.md, `docs/deployment_compose.md`, `docs/deployment_coolify.md`, `docs/api.md`,
  `docs/comments.md`, `docs/logging.md`, the `.env*.example` files, `plans/D99-debts.md` (closes D99.42, D99.51, D99.52 and D99.61; adds
  entries only for what stays deferred: D99.63 and D99.64).
- **Data:** one migration (`0020`) rewrites `recipe.created_at` to millisecond precision. Every
  migration run recounts `recipe.comment_count` and writes only drifted rows; the first run after
  the upgrade repairs counts that drifted before. The comment self-relation gets a
  `relationName`, with no migration. Fresh production installs get no demo accounts; existing
  installs keep theirs, and the guides explain how to remove them.
