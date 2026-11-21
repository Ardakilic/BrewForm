# F29 — Weekly Personalized Email Digest

> **Refresh (2026-11-21, wave 6):** the API now runs on Node 26 with pnpm (#135). The scheduler is `node-cron` (`cron.schedule(expr, fn, { name })` in `apps/api/src/utils/jobs/cron.ts`), templates build with `pnpm run email-build` (`make email-build`), and tests use Vitest. node-cron fires in **every** API replica, so the digest job takes a `SET NX PX` lock in Valkey when `CACHE_DRIVER=redis` (see "Multiple API replicas" below). The 2026-07-13 validation below is updated to match.
>
> **⚠️ Forward-compat note (F05, 2026-08-02):** The `emailNotifications` namespace was flattened and renamed by the F05 `f05-in-app-notifications` OpenSpec change. References to "add `weeklyDigest` to `emailNotifications`" below should be read as "add a flat top-level `notifyWeeklyDigest` boolean column on `user_preferences` (per the F05 pattern)." Do NOT introduce a new nested namespace; align with F05's flat `notify*` convention.
>
> **Validation status (2026-07-13): ✅ Valid — infrastructure assumptions verified; two corrections**
>
> All load-bearing "Current state" claims check out against the tree:
> - Notify pipeline (`utils/notify/index.ts`): `getTransporter`/`closeTransporter`, `sendEmail` skips `APP_ENV=test`, `renderTemplate` HTML-escapes via `escapeHtml`, `appBaseUrl()`, and `notifyFollowersOfNewRecipe` batches at `BATCH_SIZE = 5` (:253) — all present.
> - node-cron scheduler exists: `utils/jobs/cron.ts` registers `evaluate-badges` with `cron.schedule('0 * * * *', fn, { name: 'evaluate-badges' })` via dynamic import + try/catch + `createLogger('jobs')`; `cron.test.ts` mocks `node-cron` with `vi.mock` and finds a registration by its `name` option — the `weekly-digest` entry and its test slot straight into this pattern.
> - `userPreferences` flat booleans (`newFollower`/`recipeLiked`/`recipeCommented`/`followedUserPosted`, all default true) + `locale`/`timezone`; no digest flag today (schema.ts:103-107). Trending infra present: `recipe_visibility_like_count_idx` (schema.ts:167), `recipeVersions.brewMethod` + `recipe_version_brew_method_idx` (schema.ts:191,221). `admin` module + `adminMiddleware` (`middleware/auth.ts:162`) exist for the manual-trigger route.
>
> **Correction 1 — template extension.** Email template *sources* are MJML (`apps/api/src/templates/email/*.mjml`), compiled to `generated/*.ts` by `make email-build` (Makefile:55 → `pnpm run email-build`, which runs `tsx scripts/build-email-templates.ts` in `@brewform/api`). The design text names `weekly-digest.html`; it should be `weekly-digest.mjml` → `generated/weekly-digest.ts`, matching the eight existing templates.
> **Correction 2 — the `mentionedInComment` precedent is now complete end-to-end (was: "weaker than stated").** As of F04 (2026-07-13, verified in tree) `mentionedInComment` is no longer just a DB column + comment-service gate — it is surfaced through the full preferences plumbing: exposed in the shared `emailNotifications` object (now 5 flags, `schemas/user.ts:20-31`), flattened by the `/api/v1/preferences` PATCH handler (`preference/index.ts:98`), present in the `responses/preference.ts` output schema (`:27`), and toggled in `SettingsPage` (`:349-354`). This makes the plan's route — add `weeklyDigest` to `emailNotifications` so the existing PATCH flow picks it up unchanged — a proven, working pattern: `mentionedInComment` is the exact end-to-end precedent to follow. `weeklyDigestLastSentAt` is a new nullable timestamp on a table otherwise all booleans/varchars — fine, just novel.
>
> Verdict: buildable as specified once the two corrections are folded in; effort **M** stands.

## Summary

An opt-in weekly email summarising: top new recipes from users you follow, trending recipes in your favourite brew methods, and badges you earned this week. Built on the existing singleton nodemailer transporter in `apps/api/src/utils/notify` and the established node-cron job pattern (`cron.schedule(expr, fn, { name })`) in `apps/api/src/utils/jobs/cron.ts`. Opt-in via a new `userPreferences` flag (default **off**).

## Motivation

BrewForm already sends transactional/social emails (new follower, like, comment, followed-user-posted), but users who don't visit daily have no pull back into the product. A single, digestible weekly email increases retention while *reducing* mail volume for users who would rather disable the per-event `followedUserPosted` notifications.

## Current state (verified)

- Email infra (`apps/api/src/utils/notify/index.ts`): singleton `getTransporter()` / `closeTransporter()`; private `sendEmail(to, subject, html)` that skips in `APP_ENV=test`; `renderTemplate()` interpolating `{{var}}` with `escapeHtml`; `appBaseUrl()`; pre-compiled templates imported from `apps/api/src/templates/email/generated/*.ts`; fan-out batching with `BATCH_SIZE = 5` (see `notifyFollowersOfNewRecipe`).
- Cron pattern (`apps/api/src/utils/jobs/cron.ts`): top-level `cron.schedule('0 * * * *', async () => { ... }, { name: 'evaluate-badges' })` (`import cron from 'node-cron'`, pinned `4.6.0` in `apps/api/package.json`) that dynamically imports the service and wraps it in try/catch with `createLogger('jobs')`. The file is imported at module top level from `main.ts` before `serve()`.
- `userPreferences` (`packages/db/src/schema.ts:91-108`): flat boolean flags `newFollower`, `recipeLiked`, `recipeCommented`, `followedUserPosted` (all default `true`), plus `locale`, `timezone`. **No digest flag exists.** The shared user schema exposes these under an `emailNotifications` object (`packages/shared/src/schemas/user.ts:16-27`).
- `userFollows` (`followerId`, `followingId`) — used the same way by `notifyFollowersOfNewRecipe`.
- Trending signal: `recipes.likeCount` with composite index `recipe_visibility_like_count_idx` (`packages/db/src/schema.ts`); brew method lives on `recipeVersions.brewMethod` (indexed) — a user's "favourite methods" are derivable from their own versions' `brewMethod` frequency.
- Badges: `userBadges` (`packages/db/src/schema.ts:691-704`) has `awardedAt`; badge module exposes `evaluateAllBadges`/`getUserBadges` (`apps/api/src/modules/badge/service.ts`).
- Settings UI: `SettingsPage` with loader (`apps/web/src/router.tsx:148`); preferences module at `/api/v1/preferences` (`apps/api/src/routes/index.ts:56`).

## Proposed design

### DB schema (Drizzle)

Extend `userPreferences` in `packages/db/src/schema.ts` (migration via `make db-generate`):

```ts
// inside userPreferences pgTable, after followedUserPosted:
weeklyDigest: boolean('weekly_digest').notNull().default(false), // opt-in
weeklyDigestLastSentAt: timestamp('weekly_digest_last_sent_at', { withTimezone: true }),
```

`weeklyDigestLastSentAt` makes the job idempotent: a re-run (deploy restart mid-window) skips users already served in the last 6 days. No new tables.

Shared schema: add `weeklyDigest: z.boolean().default(false)` to the `emailNotifications` object in `packages/shared/src/schemas/user.ts` so the existing preferences PATCH flow picks it up unchanged.

### Digest job

`apps/api/src/utils/jobs/cron.ts` (same pattern as `evaluate-badges`):

```ts
cron.schedule(
  '0 8 * * 1', // Mondays 08:00 UTC
  async () => {
    try {
      const { sendWeeklyDigests } = await import('../../modules/digest/service.ts');
      await runExclusive('weekly-digest', 60 * 60_000, sendWeeklyDigests);
    } catch (err) {
      log.error({ err, job: 'weekly-digest' }, 'Cron job failed');
    }
  },
  { name: 'weekly-digest', timezone: 'Etc/UTC', noOverlap: true },
);
```

### Multiple API replicas

node-cron schedules inside each API process, so with N replicas the job fires N times per slot. `weeklyDigestLastSentAt` already prevents most double sends, but two replicas that start together can both read a user as "not yet sent" before either marks it. So:

- When `CACHE_DRIVER=redis`, `runExclusive(name, ttlMs, fn)` (new `apps/api/src/utils/jobs/lock.ts`) takes a Valkey lock with `SET job-lock:<name>:<slot> <random token> NX PX <ttlMs>` through a client from `createRedisClient()` (`apps/api/src/utils/redis/client.ts`). Only the replica whose `SET` succeeds runs `fn`; the others log `info` (`{ job, reason: 'locked' }`) and return. The TTL (1 hour) outlives a normal run, so a crashed holder frees the slot on its own; the lock is not released early, so a slow replica cannot re-run the same slot.
- With `CACHE_DRIVER=memory` (the default single-instance deployment) `runExclusive` just runs `fn`; run a single API replica in that mode, as `docs/deployment_compose.md` (§13) and `docs/deployment_coolify.md` already recommend (both note that in-process jobs run once per replica).
- The same helper can later wrap `evaluate-badges` (hourly, idempotent today, so not required).

### Module: `apps/api/src/modules/digest/`

- `model.ts` (only place importing drizzle-orm, D29):
  - `findOptedInUsers()` — users joined with `userPreferences` where `weeklyDigest = true`, `isNull(users.deletedAt)`, and `weeklyDigestLastSentAt` null or `< now − 6 days`.
  - `getFollowedTopRecipes(userId, since)` — `userFollows` → `recipes` (`visibility = 'public'`, `isNull(deletedAt)`, `createdAt >= since`), order by `likeCount` desc, limit 5. Uses `recipe_visibility_like_count_idx`.
  - `getFavouriteBrewMethods(userId)` — group user's `recipeVersions.brewMethod` by count, top 2. Validated against `BREW_METHOD_VALUES` (D07).
  - `getTrendingByMethods(methods, since, excludeAuthorId)` — public recipes whose current version's `brewMethod` is in `methods`, created since `since`, order by `likeCount` desc, limit 5.
  - `getNewBadges(userId, since)` — `userBadges` joined `badges` where `awardedAt >= since`.
  - `markDigestSent(userId, sentAt)` — update `weeklyDigestLastSentAt`.
- `service.ts` — `createLogger('digest-service')`:
  - `buildDigest(userId)` — assembles the three sections; returns `null` when **all** sections are empty (never send an empty email).
  - `sendWeeklyDigests()` — iterates opted-in users in batches of 5 (mirror `notifyFollowersOfNewRecipe`), renders the template, sends via a new exported `sendDigestEmail` helper in `utils/notify` (reuses `getTransporter()`/test-skip/logging), then `markDigestSent`. Failures per user are logged and never abort the run.
- Email template: `apps/api/src/templates/email/weekly-digest.mjml` → compiled to `apps/api/src/templates/email/generated/weekly-digest.ts` (same generated-template pipeline as `new-follower.ts` etc.). All interpolations go through `renderTemplate` (HTML-escaped). Footer links to `${appBaseUrl()}/settings` for one-click preference change.

### API endpoints

No new user-facing endpoints — opt-in rides the existing preferences flow. One admin utility:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `PATCH` | `/api/v1/preferences` | Required | Existing endpoint; now accepts `emailNotifications.weeklyDigest` |
| `POST` | `/api/v1/admin/digest/run` | Admin | Manually trigger `sendWeeklyDigests()` (dry-run flag returns per-user section counts without sending) |

Admin route (in `apps/api/src/modules/admin/index.ts`, behind `adminMiddleware` from `apps/api/src/middleware/auth.ts`):

```ts
const DigestRunSchema = z.object({ dryRun: z.boolean().default(false) });
```

### Frontend (loader-based)

- `SettingsPage` already loads preferences via its loader (`settingsLoader`) and renders notification toggles; add a "Weekly digest" toggle in the email-notifications group, saved through the existing `api.patch('/preferences', ...)` call — no new data flow, `useLoaderData` from `'react-router'` as today.
- Copy clarifies: opt-in, Mondays, only sent when there is content.

### i18n & logging

- UI keys `settings.notifications.weeklyDigest` + `.weeklyDigestHint` in `packages/shared/src/i18n/en.json` / `tr.json`.
- Email body is a static template (English, matching the four existing templates); localised email templates are out of scope (note: recipient `locale` is available on `userPreferences` if a follow-up wants per-locale templates).
- Logging (D26): `digest-service` logs run start/end with `{ candidates, sent, skippedEmpty, failed }`; per-user failures at error with `{ err, userId }`; `jobs` logger already covers cron-level failure.

## Test plan

- `apps/api/src/modules/digest/service.test.ts` (Vitest: `describe`/`it`/`expect` from `vitest`; DB-backed against `brewform_test`, run with `make test-specific filter=src/modules/digest/service.test.ts`):
  - `buildDigest` returns null when no follows, no trending matches, no badges.
  - Section assembly respects `since` window, public-only, soft-delete guards.
  - `sendWeeklyDigests` skips users sent < 6 days ago (idempotency) and non-opted-in users; continues past a per-user failure.
  - Favourite-method derivation picks top-2 by version count.
- `utils/notify/notify.test.ts` (extend): `sendDigestEmail` skips in test env and logs.
- `utils/jobs/cron.test.ts` (extend): `findJobCall('weekly-digest')` has expression `'0 8 * * 1'` and options `{ name: 'weekly-digest', timezone: 'Etc/UTC' }`.
- `utils/jobs/lock.test.ts`: with a stubbed redis client, the second `runExclusive` call for the same slot does not run `fn`; with the memory driver `fn` always runs.
- Admin route test: non-admin → 403; `dryRun: true` sends nothing.
- Web: SettingsPage test — toggle renders from loader data and PATCHes `emailNotifications.weeklyDigest`.

## Acceptance criteria

- [ ] `weeklyDigest` defaults to **false**; only opted-in users ever receive the digest
- [ ] Digest contains up to 5 followed-user recipes, up to 5 trending-in-favourite-methods recipes, and this week's badges; empty digests are not sent
- [ ] Cron registered top-level in `utils/jobs/cron.ts` with `cron.schedule('0 8 * * 1', fn, { name: 'weekly-digest', ... })`, following the `evaluate-badges` pattern
- [ ] With `CACHE_DRIVER=redis` and two API replicas, one slot sends each digest once (`SET NX PX` lock)
- [ ] Re-running the job within the week does not double-send (`weeklyDigestLastSentAt`)
- [ ] All email HTML goes through `renderTemplate` (escaped); unsubscribe path via settings link
- [ ] Sending uses the notify singleton transporter and skips in `APP_ENV=test`
- [ ] Admin manual trigger with dry-run works; settings toggle round-trips
- [ ] `make check && make lint && make test-api && make test-web` pass

## Effort

**M** (3–4 days): 2 columns + migration, digest module (model/service), email template, cron entry + `runExclusive` lock helper, admin route, settings toggle, tests.

## Priority

**Medium** — retention lever; schedule after F27. Requires production SMTP capacity review (weekly fan-out vs. current per-event volume).

## Dependencies

- `utils/notify` transporter + template pipeline (D02 consolidation)
- node-cron jobs file (`apps/api/src/utils/jobs/cron.ts`); Valkey via `apps/api/src/utils/redis/client.ts` for the multi-replica lock
- `userPreferences`, `userFollows`, `userBadges`, `recipes`, `recipeVersions` tables (verified)
- Existing preferences PATCH flow and `SettingsPage` loader
- `adminMiddleware`; D07 enums; D26 logging; D29 layering
