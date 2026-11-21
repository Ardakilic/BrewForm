# Ponytail review: PR #172 (wave-6-audit-remediation)

- PR: https://github.com/Ardakilic/BrewForm/pull/172
- Change: `openspec/changes/archive/2026-11-21-wave-6-audit-remediation/`
- Reviewed: 2026-11-21, at commit `e18f2bd` (CI green: doc-drift, quality, test, images)

**What this change does:** PR #172 fixes the problems found in the 2026-11-18 audit. On the API it
adds case-insensitive email and username handling, named rate limits, safer uploads and shared
recipe-visibility rules. The web app now loads all data through react-router loaders and actions.
It also adds a production compose stack (Caddy edge, migrate, backup and restore services) with one
gated CI pipeline, plus doc-drift tooling.

**Assumed load:** a small self-hosted site: one API container at 1 GB, Postgres, optional Valkey,
with local photo storage (the default).

## Must fix

1. **Editing a recipe fails after something it links to is deleted** (`apps/api/src/modules/recipe/service.ts:540-546`)
   - **What this is:** On save, the new `validateReferences` checks every taste note, equipment
     item and coffee variety id in the request against rows that are not deleted.
   - **Problem:** The edit form always sends the recipe's current ids back. If someone deletes a
     custom variety (or an admin deletes a taste note) that another user's recipe uses, that user
     gets a 400 on every save, even a title-only change. Merges fail the same way. This is new in
     this PR; on `main` these saves worked.
   - **Fix:** Check only ids that are not already on the current version, as the code already does
     for `beanId`. Add one test: soft-delete a linked taste note, PATCH the same ids, expect 200.
   - **If we skip it:** Users get stuck with recipes they can't edit, for reasons they can't see.

2. **Restoring a pre-upgrade backup half-restores the database and the site stays down** (`compose.production.yml:427`)
   - **What this is:** The restore service runs `pg_restore --clean --if-exists` into the live
     database, with no `--single-transaction` and no `--exit-on-error`.
   - **Problem:** The docs present this as the rollback path. In a pre-wave-6 dump restored onto a
     wave-6 database, the new `user_recipe_note` table is missing from the dump but still has
     foreign keys to `user` and `recipe`. So dropping those two tables fails, while every other
     table is replaced with old data. The migration records go back to 0015, so the next start
     re-runs 0016, hits "already exists", and the API never starts.
   - **Fix:** In the restore script, drop and recreate the database first
     (`dropdb --force --if-exists` then `createdb`). Then run
     `pg_restore --no-owner --exit-on-error --single-transaction`. Add a restore round-trip to
     `scripts/ci/smoke-compose.sh`; CI only runs `pg_restore --list` today.
   - **If we skip it:** The first real rollback leaves a broken, mixed database. The local restore
     drill only covered restoring a dump of the same schema version.

3. **One client can crash the API by downloading photos** (`apps/api/src/main.ts:134-144`)
   - **What this is:** This PR fixed the `/uploads` route so it serves files at all; before, every
     request got a 400. Each request now reads the whole file into memory and then copies it again.
   - **Problem:** Originals can be about 10 MB, and the rate limit allows 600 requests per minute
     but does not limit how many run at once. About 60 parallel requests for one photo hold around
     1.2 GB, which is more than the API container's 1 GB limit, so it gets killed. No login is
     needed, and local storage is the compose default.
   - **Fix:** Stream the file instead, with `serveStatic` from `@hono/node-server` (already a
     dependency) or `createReadStream`, and drop the copy. Keys are UUIDs, so add
     `Cache-Control: public, max-age=31536000, immutable`.
   - **If we skip it:** Anyone can take the site down with a basic load tool.

4. **Admin user search is case-sensitive, and this PR made it worse** (`apps/api/src/modules/admin/model.ts:36-45`)
   - **What this is:** `listUsers` filters with `like('%q%')` on email, username and display name.
   - **Problem:** This PR stores all new emails lower-cased, so searching `John` or pasting
     `John@Example.com` now finds nothing. Searching `arda` never finds username `Arda`, and a
     query of `_` matches every user, because `%` and `_` are not escaped.
   - **Fix:** Use `ilike(col, toContainsPattern(normalizeSearchTerm(q)))`. Both helpers are already
     exported from `recipe/model.ts`. Add one mixed-case test.
   - **If we skip it:** Admins can't find the accounts they need to moderate.

## Should fix

5. **Anyone can post a reply into any recipe's comment thread** (`apps/api/src/modules/comment/service.ts:68-74`)
   - **What this is:** A reply checks that the caller wrote the recipe in the URL. It never checks
     that the parent comment belongs to that recipe.
   - **Problem:** A user writes their own recipe, then posts to it with `parentCommentId` set to a
     comment on someone else's recipe. Their text shows up in that other thread, where only the
     recipe author is meant to reply.
   - **Fix:** Throw `COMMENT_NOT_FOUND` when `targetComment.recipeId !== recipeId`, and add a test.
     This is already logged as debt D99.42, but it's a one-line access fix.
   - **If we skip it:** Spam and impersonation in other people's threads.

6. **Parallel wrong-password requests get past the failed-login limit** (`apps/api/src/middleware/rateLimit.ts:227-241`)
   - **What this is:** `rateLimitFailures` reads the counter before the handler and only adds a
     point after a 401.
   - **Problem:** 20 requests sent at the same moment all read 0, so all 20 get a password check
     instead of the 5 allowed. With several IPs, the per-account limit is multiplied by the number
     of IPs.
   - **Fix:** Take the point up front with `consume`. Give it back with `reward` on success, or
     `delete` when `resetOnSuccess` is set. Add one `Promise.all` test.
   - **If we skip it:** The brute-force protection the audit asked for can be bypassed.

7. **Typing a search and then clicking a filter drops the filter** (`apps/web/src/hooks/useListUrlState.ts:154-168`)
   - **What this is:** The 300 ms debounce timer calls the `setSearchParams` captured when the user
     typed. React Router builds `prev` from that older URL.
   - **Problem:** Type "latte", then click a brew-method chip within 300 ms: the timer's write
     replaces `?brewMethod=v60` with `?search=latte`. Two debounced boxes (search plus author) also
     wipe each other.
   - **Fix:** Keep the latest `setSearchParams` in a ref and call `ref.current(...)` inside the
     timer.
   - **If we skip it:** Filters vanish on their own. This sits in the 16.9 manual check that hasn't
     been done yet.

8. **A failed rating replaces the whole recipe page with the error screen** (`apps/web/src/routes/rate.ts:27`)
   - **What this is:** `rateAction` is the only mutation not converted to the
     `{ ok: false, error }` result. It has no try/catch.
   - **Problem:** A 429, a network blip or an expired session throws to the route's error boundary,
     so the page shows "load failed", with no toast and no rollback.
   - **Fix:** Wrap the call like `like.ts` does: pass `request.signal`, use `withDataLog`, and have
     the page show a toast when `ok` is false.
   - **If we skip it:** A rating click can blank the page.

9. **A session that expires during a background action lands on a blank page after login** (`apps/web/src/routes/auth-guards.ts:12-15`, `apps/web/src/api/client.ts:149`)
   - **What this is:** `requireAuth` builds `next` from the request URL. For a fetcher, that is the
     action's own address, such as `/resources/notifications/:id/read`.
   - **Problem:** After login the user is sent to a route with no page. The API client also skips
     the session refresh for every `/auth/*` call. So "Resend verification" with a token older than
     15 minutes logs the user out even though their refresh cookie is valid.
   - **Fix:** Have these resource actions return `toActionFailure(err, [])`, as comments and notes
     already do. Limit the refresh skip to login, register, refresh and logout.
   - **If we skip it:** Users get a confusing logout and an empty page.

10. **A photo upload during the nightly backup throws away that night's photo backup** (`compose.production.yml:337`)
    - **What this is:** The backup treats any non-zero exit from `tar` as a failure.
    - **Problem:** GNU tar exits 1 with "file changed as we read it" when a photo is added or
      deleted mid-run. The partial archive is deleted, and the health check only looks at database
      dumps, so nothing warns about it.
    - **Fix:** Accept exit status 1 (`tar … || [ $$? -eq 1 ]`).
    - **If we skip it:** Photo backups go missing without anyone noticing on busy nights.

11. **`make images` fails or copies the live database into the image build** (`.dockerignore:25-28`)
    - **What this is:** The deploy guide suggests `./data/postgres` and `./data/uploads` inside the
      checkout. `.dockerignore` excludes only `uploads` and `backups`.
    - **Problem:** `COPY . .` hits `data/postgres`, which belongs to uid 999 with mode 0700, so the
      build fails with permission denied. Run as root, it sends the database files and the
      `backup-export` dumps into the build.
    - **Fix:** Add `data`, `backup-export`, `uploads-rescue` and `*.dump` to `.dockerignore`.
    - **If we skip it:** Self-hosters following the guide hit build failures, or ship their data
      inside build layers.

12. **Demo accounts with a password published in the repo are created on every fresh production install** (`packages/db/src/seed.ts:296-306`, `docker-entrypoint.sh:61-70`)
    - **What this is:** On an empty database, the seed creates `alice@example.com` through
      `evan@example.com`, all verified, with password `user123456`.
    - **Problem:** This was accepted as D99.52 with the condition "revisit when anyone else deploys
      the image". This PR publishes GHCR images and a self-hosting guide, and the guide doesn't
      mention these accounts.
    - **Fix:** Skip the demo users when `APP_ENV=production`. The minimum is a warning plus a
      cleanup step in both deploy guides.
    - **If we skip it:** Every self-hosted site starts with five accounts anyone can log into.

13. **The client IP can be spoofed behind a front proxy that doesn't set X-Forwarded-For** (`compose.production.yml:270`, `docs/deployment_compose.md:206-211`)
    - **What this is:** By default (`TRUSTED_PROXIES=private_ranges`), the Caddy edge trusts the
      `X-Forwarded-For` header from any private address.
    - **Problem:** A plain nginx `proxy_pass` passes the client's own `X-Forwarded-For` through. So
      every request can claim a new IP and get a fresh rate-limit bucket, or claim a victim's IP to
      lock them out.
    - **Fix:** Document that the front proxy must set it (for nginx,
      `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`) in §5 and in
      `.env.production.example`.
    - **If we skip it:** Rate limits don't work for a common setup.

14. **Deleting a comment twice at once drives the comment count negative** (`apps/api/src/modules/comment/service.ts:235-236`)
    - **What this is:** `deleteComment` always decrements the count after `softDelete`, even when
      nothing was deleted.
    - **Problem:** A double-click sends two DELETE requests, and both decrement. One comment becomes
      `commentCount: -1`.
    - **Fix:** `if (await deps.model.softDelete(id)) await deps.recipeModel.decrementComments(...)`.
    - **If we skip it:** Wrong counts on recipe cards.

15. **The `additionalPreparations` list has no size limit** (`packages/shared/src/schemas/recipe.ts:66`)
    - **What this is:** The list is `z.array(...)` with no `.max()`, and each item becomes one row
      in a single INSERT with 7 values per row.
    - **Problem:** A request under 1 MB can carry about 9,400 items. That is more than Postgres
      allows in one statement, so the API answers 500. Smaller amounts are stored, loaded on every
      detail view, and copied on each fork or new version.
    - **Fix:** Add `.max(20)` (or your product limit) and a schema test.
    - **If we skip it:** One request can bloat a recipe or cause 500s.

16. **Cursor pages repeat a row forever when sorted oldest first** (`apps/api/src/modules/recipe/model.ts:1754-1831`)
    - **What this is:** `created_at` is stored with microseconds, but the cursor goes through a JS
      `Date`, which keeps only milliseconds.
    - **Problem:** With `sortOrder=asc`, each page starts with the previous page's last row. With
      `perPage=1`, the same row comes back forever with `hasMore: true`. Newest-first can skip rows
      that share a millisecond. This predates the PR, but the PR edits this function.
    - **Fix:** Declare `createdAt` with `precision: 3` and generate the migration. Add an
      ascending-order test that uses database-default timestamps.
    - **If we skip it:** API clients that use the cursor loop or miss recipes.

17. **The "To" date filter leaves out recipes from the chosen day** (`apps/api/src/modules/recipe/model.ts:321-323`)
    - **What this is:** `dateTo=2026-11-21` becomes midnight UTC, and the filter uses `lte`.
    - **Problem:** "From today to today" returns nothing. The spec and the OpenAPI text both say the
      range includes that day.
    - **Fix:** Use `lt(createdAt, dateTo + 1 day)`, and add a database-backed test. The current test
      checks a local copy of the function, not the real one.
    - **If we skip it:** Search results quietly lose the last day.

18. **The rate-limit store shows "degraded" forever after a brief Valkey error** (`apps/api/src/utils/rate-limit/backend.ts:153-195`)
    - **What this is:** The degraded flag is cleared only by the Redis client's `ready` event.
    - **Problem:** A command timeout, or an out-of-memory reply, leaves the connection up, so
      `ready` never fires again. `/ready` reports degraded even after every call succeeds again,
      and later outages don't log a new warning.
    - **Fix:** Clear the flag after the next successful call (as `FailSoftCacheProvider` does), or
      time it out after 30 s.
    - **If we skip it:** A false alarm hides real problems later.

19. **Brew timeline labels are too faint in dark mode** (`apps/web/src/components/recipe/BrewTimeline.tsx:164-176`)
    - **What this is:** The 11px phase titles use `--text-secondary` on `--bg-tertiary`, or on the
      accent gradient. The contrast test checks a different background.
    - **Problem:** The dark theme gives 4.07:1 on the pre-infusion area and about 2.5–3:1 on the
      extraction area. The chart spec requires at least 4.5:1.
    - **Fix:** Use `--text-primary`, and test against the real backgrounds.
    - **If we skip it:** The labels fail the accessibility rule the PR set for itself. This is part
      of the 19.27 manual check.

## Nice to have

20. **The QR route reveals that a private recipe exists** (`apps/api/src/modules/qrcode/service.ts:40-45`):
    it answers 403 for a draft or private recipe and 404 for an unknown slug. Slugs come from
    titles, so guessing a title confirms the recipe exists. Return 404 for both, as `share.ts` now
    does.
21. **`niceTicks` loops forever on almost-equal numbers** (`apps/web/src/utils/chart/ticks.ts:43-58`):
    `niceTicks(0.3, 0.1 + 0.2, 4)` runs until the browser throws. Nothing calls it yet, but the
    chart spec tells future charts to use it. Return `null` when the bounds aren't safe integers,
    and add that test.
22. **Logout leaves private pages on screen** (`apps/web/src/contexts/AuthContext.tsx`, Navbar):
    logout only clears the user, so a private recipe or collection stays visible. Navigate to `/`
    or revalidate after logout. This predates the PR.
23. **Failed follow or like buttons roll back to the page-load value, not the last confirmed one**
    (`apps/web/src/components/user/FollowButton.tsx:24-28`, `LikeButton.tsx:27-31`): Follow
    succeeds, then Unfollow fails, and the button shows "Follow" while the server still follows.
    The next click gets a 409. Keep the last successful value and fall back to that.
24. **The "In collections" card goes stale after the add-to-collection modal**
    (`apps/web/src/components/collections/AddToCollectionModal.tsx:121-124`): every submit turns off
    revalidation. Revalidate once when the modal closes after a change.
25. **"Brew again" for a deleted recipe shows "load failed" instead of not-found**
    (`apps/web/src/pages/brew-logs/BrewLogFormPage.data.ts:63-70`): use the existing
    `getRecipeOr404`.
26. **Case-insensitive lookups break on a Turkish-locale database** (`packages/db/src/schema.ts:45-48`):
    Postgres `lower('Ilker')` gives `ılker` under `tr_TR`, while JavaScript gives `ilker`. Lookups
    then miss, and duplicates get past the unique index. The default compose image uses en_US, so
    this only hits custom databases. Lower both sides in SQL, as `lower(input)`.
27. **A trailing slash in `S3_PUBLIC_URL` stores `//` in photo URLs**
    (`apps/api/src/utils/upload/index.ts:142-147`): strip it once in the env schema.
28. **A failed storage write leaves a partial file behind** (`apps/api/src/modules/photo/service.ts:149-160`):
    add the key to the cleanup list before each save, not after. Deleting a missing key is already
    harmless.
29. **`make prod-restore` replaces live data with no safety backup** (`Makefile:293-294`): take a
    one-off backup (`BACKUP_ONESHOT=1`) after stopping api and web, before restoring.
30. **The Coolify guide puts the database password on the command line**
    (`docs/deployment_coolify.md:677`): it shows up in `ps` and in shell history. Use
    `-e DATABASE_URL` with no value, or `--env-file`.
31. **Re-running the seed in dev fails if a user renamed their default setup**
    (`packages/db/src/seed.ts:914-946`): the new partial unique index rejects a second default. Add
    `.onConflictDoNothing()` to the setups insert.
32. **The raw-SQL registry is missing three new uses** (`openspec/specs/lint-style/spec.md:101-109`,
    `packages/db/src/schema.ts:701`): `lower()`, the partial-index condition and the pre-flight
    catalog query aren't listed. Line 701 is the only new fragment without its
    `// D03 raw-SQL exception:` comment.
33. **The sitemap queries have no limit** (`apps/api/src/routes/sitemap.ts:53-76`): this breaks the
    "bounded reads" rule in AGENTS.md, and past 50,000 URLs search engines reject the sitemap. Add
    `.limit(...)`.
34. **Dead code** (lean):
    - `isEmailTaken`, `isUsernameTaken` (`apps/api/src/modules/admin/model.ts:69-99`),
      `findUserByUsername` (`apps/api/src/modules/auth/model.ts:78-86`) and `searchUsers`
      (`apps/api/src/modules/user/model.ts:160-191`) were converted to case-insensitive but have no
      production caller.
    - In the recipe area, `create`, `incrementLikes` and `decrementLikes`
      (`apps/api/src/modules/recipe/model.ts`), `getRecipeAuthorId`
      (`apps/api/src/modules/comment/model.ts`) and `getItems`
      (`apps/api/src/modules/collection/model.ts`) are unused. `getRecipeAuthorId` also has a
      visibility-test exemption (`apps/api/src/modules/recipe/visibility.enforcement.test.ts:48`)
      whose reason isn't true.
    - The `symmetricX` option of `fitViewBox` (`apps/web/src/utils/chart/layout.ts:134-158`) is
      never used.
    - The leftover "clearing defaults" log lines in `apps/api/src/modules/setup/service.ts:50,93,154`
      describe work the code no longer does.
    - Delete all of these and their tests.

---

**Verdict:** fix 1–4 first. Item 5 is a one-line access fix worth doing in the same pass.

**Lean:** about −140 lines of production code possible, plus their tests.

**Not checked:** the review read code only and did not run anything. The four manual browser checks
(10.36, 16.9, 17.22, 19.27) are still open, and items 7 and 19 fall inside them. The finding that a
failed email send can write the recipient's address to the logs is left out: it rests on nodemailer
error fields checked from memory, and the code predates this PR.
