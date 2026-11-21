# PR notes (collected per group for task 22.4)

## Group 13 (web action results)

- Deleted `apps/web/src/components/user/FollowButton.exploration.test.ts` and `FollowButton.preservation.test.ts`: they tested a hand-written copy of an old follow state machine (the D99.13 mirror-test pattern), and their premise that a 409 is an error contradicts the now idempotent follow. The real `FollowButton.test.tsx` covers the component.
- A dead session during a background action (resource routes) now shows the `error.unauthorized` toast instead of redirecting to `/login?next=/resources/...`.

## Group 4 (identifiers and search)

- `lower()` (`packages/db/src/schema.ts`) now takes `AnyPgColumn | SQLWrapper | string` and returns `SQL<string>`; every identifier lookup lowers both sides in SQL (`eq(lower(col), lower(value))`), guarded by `apps/api/src/modules/auth/identifier.enforcement.test.ts`. PostgreSQL resolves `lower($1)` with the untyped postgres-js parameter, so no `::text` cast was needed.
- Equipment, vendor and taste-note `search` model functions became `async` and return `[]` for a whitespace-only term without querying.

## Group 5 (recipe writes, version diff and QR)

- `POST`/`PATCH /api/v1/coffee-varieties` now pass `zodValidationHook` to `zValidator`, so a schema failure answers the standard `400 VALIDATION_ERROR` envelope with field details (it returned the raw Zod result before), as the E3 route test and the `coffee-variety-write` spec require. The admin variety routes already used the hook.
- `docs/api-reference.md` lists parameters and statuses only, so the new `maxItems`/`maxLength` request-body bounds do not appear there; the only diff is the QR row (`200, 404`).

## Group 6 (millisecond cursors and the date-only filter)

- Migration `packages/db/drizzle/0020_yummy_spyke.sql` narrows `recipe.created_at` to `timestamp(3) with time zone`. drizzle-kit 0.31.10 emits the type change as `SET DATA TYPE timestamp (3) with time zone` followed by `SET DEFAULT now()` (its convertor always re-sets the default after a type change on a defaulted column; the default is unchanged). The first start after the upgrade rewrites the `recipe` table and its indexes under an exclusive lock (well under a second for a self-hosted site).
- BREAKING: `dateFrom`/`dateTo` accept only `YYYY-MM-DD` (inclusive UTC days); a timestamp now answers `400`. The web app always sent days; `extractListParams` drops a hand-edited non-day value instead of failing the loader.
- `docs/api-reference.md` has no diff: it lists parameter names and types, not the reworded descriptions.

## Group 8 (comments and deleted accounts)

- API behaviour change: author and owner fields of recipe and collection payloads can now be `null` (a deleted account), on the comment list, recipe list/detail/feed/cursor, collection detail and public browse, equipment and variety recipe lists. Six response schemas became nullable; admin routes keep the identity. Read side only: no data change, accounts deleted before the upgrade are masked from the first request.
- `GET /api/v1/comments/recipe/:recipeId` returns at most 20 replies per comment (oldest first) and a new required `hasMoreReplies` field. Deleting a top-level comment now also soft-deletes its replies and lowers `commentCount` by the number removed; a second concurrent delete of one comment answers 404 instead of decrementing twice.
- The comment delete buttons used `var(--danger)`, which no theme defined. The top-level delete (on `--bg-secondary`) now uses `--error`; the reply delete (on `--bg-tertiary`, where dark `--error` measures 3.71:1) uses a new `--error-on-raised` token (light `#b91c1c`, dark `#fca5a5`, coffee `#fca5a5`; 5.15 / 5.41 / 5.13 on `--bg-tertiary`), locked by a `contrast.test.ts` row. `theme-usage.test.ts` now fails on any `var(--…)` that is not defined in the light, dark and coffee blocks (Tailwind `@theme` tokens and Base UI's `--anchor-width`/`--transform-origin` are exempt); the `web-shared-components` delta names `--error-on-raised`.
- `docs/api-reference.md` has no diff: it lists summaries, parameters and statuses, not response shapes or descriptions (`hasMoreReplies`, the nullable authors and the reworded descriptions are in `/api/v1/openapi.json`).
- Every migration run of the API image now also recounts `recipe.comment_count` (`node /app/packages/db/src/recount-comment-counts.ts`, right after `Migrations complete.`; new log lines `Recounting comment counts...` and `Comment count recount: …`). The first start after the upgrade repairs drifted counters (ids and counts only in the log); a failed recount prints `WARNING: comment count recount failed; continuing (the next start retries).` and does not stop the boot. `make db-migrate` runs it after the migrator; `make db-recount-comments` runs it alone. The demo seed's two wrong counts (`evans-iced-latte` 1 → 0, `catuai-cappuccino` 1 → 2) are corrected.

## Group 9 (dead code, mirror tests, visibility scan)

- No behaviour change. Every `buildRecipeFilters` branch the deleted mock-mirror asserted now runs against `brewform_test` (`model.cursor.test.ts`, "Recipe model — list filters (DB)"); all new cases passed against the existing code, so the mirror hid no bug. `getPublicProfile` gained a DB-backed follower/counts case before the user preservation/exploration copies were deleted.
- Not in the task list, left in place: `apps/api/src/modules/recipe/service.exploration.test.ts` imports no production code (it asserts local literals and mock objects), which the `model-test-coverage` rule "Test files exercise the production module they name" also forbids; the D99.66 grep does not match it.

## Group 10 (sitemap index at the site root)

- The sitemap moved: `GET /sitemap.xml` is a sitemap index (`?part=static`, `?part=recipes&page=N`, `?part=users&page=N`, 50,000 URLs per page, 404 past the end, 400 for a bad query, each document cached 24 h). `GET /api/v1/sitemap.xml` answers `301` to `<public origin>/sitemap.xml`. Operators resubmit `<public origin>/sitemap.xml` in Search Console (both deployment guides say so). Soft-deleted accounts' profiles are no longer listed.
- The web edge (`API_UPSTREAM`) and the Vite dev server proxy the exact path `/sitemap.xml` (query passed through); `robots.txt` announces `/sitemap.xml`. Split-domain installs without `API_UPSTREAM` serve the SPA at `/sitemap.xml` on the web origin (D99.58, text to update in group 19).

## Group 11 (raw-SQL registry made executable)

- No behaviour change. `packages/shared/src/lint-policy.test.ts` now enforces the `lint-style` raw-SQL registry: every Drizzle `sql` tag (plain or typed) and the pre-flight's postgres-js `client` tag in production code needs a `// D03 raw-SQL exception: <why>` comment within the 10 lines above, `sql.raw(` and `.unsafe(` fail, and the per-file counts must equal `RAW_SQL_REGISTRY` (`equipment/model.ts` 1, `recipe/model.ts` 11, `preflight.ts` 1, `schema.ts` 9). The three `count(distinct …)` fragments became `countDistinct()`; the D03 comments in `schema.ts` leave the drizzle-kit snapshot unchanged.

## Group 11 extra (mock-mirror guard)

- New `packages/shared/src/mock-mirror.test.ts` (`make test-shared`) fails on any `*.test.ts`/`*.test.tsx` under `apps/*/src` and `packages/*/src` that imports no project module (relative, `@brewform/*`, `@/*`; test support does not count); genuine static scans are listed in `STATIC_SCAN_TESTS` with their reason, and the list must stay exact. It failed first on four mirrors, all deleted: `recipe/service.exploration.test.ts` (supersedes the Group 9 note; starred visibility and note length are covered by the real `listStarredRecipes`/`findStarred` DB tests and the `RecipeNotesSchema` tests), `web/pages/users/FollowList.exploration.test.ts` (now real render tests in `UserProfilePage.test.tsx`), and two the orchestrator had not listed: `badge/service.test.ts` (the `precision_brewer` rule now has DB-backed tests in `badge/model.test.ts`) and `web/pages/recipes/__tests__/recipe-coffee-dates.integration.test.ts` (edit-page dates and detail date rows were already covered; new create-page date payload tests in `RecipeCreatePage.test.tsx`).
- `apps/web/vitest.config.ts` no longer excludes `*.exploration.test.ts`/`*.preservation.test.ts` from the run (they matched nothing after the deletions, and the exclusion is how the FollowList copy went unnoticed).

## Groups 17-18 (deploy: restore, backups, build context, front proxies, demo accounts)

- Compose operators must `git pull` on the host before the next `make prod-*` run: the restore fix (`make prod-restore` takes a safety backup first and restores into a scratch `<db>_restore` database that replaces the live one only on success), the one-shot backups that never prune, and the `.dockerignore` exact-path exceptions live in the repository checkout (Makefile, `compose.production.yml`, `.dockerignore`), not in the published images.
- A front nginx (or another proxy in front of the web edge) must add `X-Forwarded-For` (`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`) so per-client rate limits work, and raise `client_max_body_size` to `16m` (nginx defaults to 1 MB; photos go up to about 11 MiB). See `docs/deployment_compose.md` §5 "Front proxy contract".
- Existing installs (created before this release) still have the five demo accounts with the password published in the README; run the cleanup once (`docs/deployment_compose.md` §3 "Installs created before this release: remove the demo accounts", the same step in `docs/deployment_coolify.md`). New production installs no longer create them.
