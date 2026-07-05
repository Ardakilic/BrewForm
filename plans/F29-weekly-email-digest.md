# F29 — Weekly Personalized Email Digest

## Summary

An opt-in weekly email summarising: top new recipes from users you follow, trending recipes in your favourite brew methods, and badges you earned this week. Built on the existing singleton nodemailer transporter in `apps/api/src/utils/notify` and the established `Deno.cron()` job pattern in `apps/api/src/utils/jobs/cron.ts`. Opt-in via a new `userPreferences` flag (default **off**).

## Motivation

BrewForm already sends transactional/social emails (new follower, like, comment, followed-user-posted), but users who don't visit daily have no pull back into the product. A single, digestible weekly email increases retention while *reducing* mail volume for users who would rather disable the per-event `followedUserPosted` notifications.

## Current state (verified)

- Email infra (`apps/api/src/utils/notify/index.ts`): singleton `getTransporter()` / `closeTransporter()`; private `sendEmail(to, subject, html)` that skips in `APP_ENV=test`; `renderTemplate()` interpolating `{{var}}` with `escapeHtml`; `appBaseUrl()`; pre-compiled templates imported from `apps/api/src/templates/email/generated/*.ts`; fan-out batching with `BATCH_SIZE = 5` (see `notifyFollowersOfNewRecipe`).
- Cron pattern (`apps/api/src/utils/jobs/cron.ts`): top-level `Deno.cron('evaluate-badges', '0 * * * *', ...)` that dynamically imports the service and wraps it in try/catch with `createLogger('jobs')`.
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
Deno.cron('weekly-digest', '0 8 * * 1', async () => { // Mondays 08:00 UTC
  try {
    const { sendWeeklyDigests } = await import('../../modules/digest/service.ts');
    await sendWeeklyDigests();
  } catch (err) {
    log.error({ err, job: 'weekly-digest' }, 'Cron job failed');
  }
});
```

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
- Email template: `apps/api/src/templates/email/weekly-digest.html` → compiled to `apps/api/src/templates/email/generated/weekly-digest.ts` (same generated-template pipeline as `new-follower.ts` etc.). All interpolations go through `renderTemplate` (HTML-escaped). Footer links to `${appBaseUrl()}/settings` for one-click preference change.

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

- `apps/api/src/modules/digest/service.test.ts` (`@std/testing/bdd` + `@std/expect`):
  - `buildDigest` returns null when no follows, no trending matches, no badges.
  - Section assembly respects `since` window, public-only, soft-delete guards.
  - `sendWeeklyDigests` skips users sent < 6 days ago (idempotency) and non-opted-in users; continues past a per-user failure.
  - Favourite-method derivation picks top-2 by version count.
- `utils/notify/notify.test.ts` (extend): `sendDigestEmail` skips in test env and logs.
- Admin route test: non-admin → 403; `dryRun: true` sends nothing.
- Web: SettingsPage test — toggle renders from loader data and PATCHes `emailNotifications.weeklyDigest`.

## Acceptance criteria

- [ ] `weeklyDigest` defaults to **false**; only opted-in users ever receive the digest
- [ ] Digest contains up to 5 followed-user recipes, up to 5 trending-in-favourite-methods recipes, and this week's badges; empty digests are not sent
- [ ] Cron registered top-level in `utils/jobs/cron.ts` following the `evaluate-badges` pattern
- [ ] Re-running the job within the week does not double-send (`weeklyDigestLastSentAt`)
- [ ] All email HTML goes through `renderTemplate` (escaped); unsubscribe path via settings link
- [ ] Sending uses the notify singleton transporter and skips in `APP_ENV=test`
- [ ] Admin manual trigger with dry-run works; settings toggle round-trips
- [ ] `make check && make lint && make test` pass

## Effort

**M** (3–4 days): 2 columns + migration, digest module (model/service), email template, cron entry, admin route, settings toggle, tests.

## Priority

**Medium** — retention lever; schedule after F27. Requires production SMTP capacity review (weekly fan-out vs. current per-event volume).

## Dependencies

- `utils/notify` transporter + template pipeline (D02 consolidation)
- `Deno.cron` jobs file (`apps/api/src/utils/jobs/cron.ts`)
- `userPreferences`, `userFollows`, `userBadges`, `recipes`, `recipeVersions` tables (verified)
- Existing preferences PATCH flow and `SettingsPage` loader
- `adminMiddleware`; D07 enums; D26 logging; D29 layering
