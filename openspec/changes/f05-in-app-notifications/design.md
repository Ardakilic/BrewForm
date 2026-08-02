## Architecture

Decision D2 (Option C): flatten the preference namespace AND prefix DB columns with `notify_`. Simpler end state — request, response, and DB row all share the same flat shape.

### Preference reshape (Option C — flatten + column rename)

```
AS-IS                                                 TO-BE
─────                                                 ────
PATCH /preferences                                    PATCH /preferences
  body.emailNotifications.{5 flags}                    body.{notifyNewFollower, notifyRecipeLiked,
       │ flatten                                            notifyRecipeCommented, notifyFollowedUserPosted,
       ▼                                                    notifyMentionedInComment}     ← flat
  flatData.{newFollower, recipeLiked, ...}                  │ identity copy per field
       │                                                      ▼
       ▼                                                   flatData.{notifyNewFollower, ...}  (one-to-one with body)
  DB row: new_follower, recipe_liked, ...                  DB row: notify_new_follower, ...    ← column prefix

GET /preferences  -> flat row                              GET /preferences  -> flat row
  (UserPreferencesOutputSchema:                            (UserPreferencesOutputSchema:
   newFollower, recipeLiked, recipeCommented,               notifyNewFollower, notifyRecipeLiked,
   followedUserPosted, mentionedInComment)                  notifyRecipeCommented, notifyFollowedUserPosted,
                                                             notifyMentionedInComment)   ← renamed, still flat

GET /me  ->  model.findById nests (4 flags — BUG):         GET /me  ->  model.findById:
  preferences.emailNotifications.{4 flags}  ← missing         preferences.{5 notify* flags}  ← flat
     mentionedInComment                                        (no more nesting level; the bug evaporates)
       │
       ▼
  SelfPreferencesSchema (4 fields, nested under emailNotifications)
                                                          SelfPreferencesSchema (5 flat fields on `preferences`)
```

### Fan-out flow

```
follow/service.ts ─── createFollowNotification ─┬─ record {type:'follow', actorId=follower}
                   └─ notifyNewFollower (email) — already exists

recipe/service.ts:toggleLike (like ON, liker≠author)
   └── createLikeNotification ─┬─ record {type:'like', referenceId=recipeId}
                                └─ notifyRecipeLiked — already exists

comment/service.ts:runCommentNotificationSideEffects
   ├── createCommentNotification (recipe author, commenter≠author)
   │     └─ ┌─ record {type:'comment', referenceId=commentId}
   │       └─ notifyRecipeCommented — already exists
   └── createMentionNotifications (F04, unchanged — for @mentioned users only)
```

### Gating precedence inside each new fan-out function

```
loadRecipientPrefs(recipientId)
  └─ prefs missing → treat as all-true (DB column defaults)
  └─ prefs.<notifyFlag> === false → skip entirely (no record, no email)
actor === recipient? → skip
create notification record (type, actorId, referenceId, metadata JSON)
  └─ on error: log.error({err, recipientId}, 'create failed'); continue
send email via notify* helper
  └─ on error: log.error({err, recipientId}, 'email failed'); continue
```

## Key Decisions

### D1: One flag per type gates both record AND email

F04 set this precedent with `mentionedInComment`. Splitting into separate in-app-vs-email columns is overkill today (the F05 plan originally proposed 5 extra parallel `*Notifications` columns — dropped). A single boolean flag per event governs both surfaces. With Option C (D2), the renamed `notify_*` columns and flat `notify*` schema fields form the single source of truth per type; users opt out of the event entirely with one toggle.

### D2: Flatten the namespace and prefix columns with `notify_` (Option C)

The original F05 PRD proposed a nested `emailNotifications` object with parallel `*Notifications` boolean columns. D1 eliminated the parallel columns. The remaining question was the shape: keep a nested namespace (renamed to `notifyPreferences`) or flatten.

Option C flattens. The request body becomes 5 top-level fields (`notifyNewFollower`, etc.), the DB columns become `notify_new_follower` (etc.), and the `/preferences` + `/me` responses both expose the same flat shape. The request/response asymmetry that F04 introduced (nested request → flat response) is fixed as a side-effect.

Rejected alternatives:
- Option A (namespace rename only, columns stay): clean but columns don't visually group with `notify_` prefix in `\d user_preferences` — they mix with `unit_system`, `theme`, `locale` etc. Also leaves the F04 asymmetry in place.
- Option B (namespace + column prefix without override): produces redundant `notifyPreferences.notifyNewFollower` ("notify" appears twice — outer namespace + inner field).
- Option E (namespace + `.columnName()` overrides): no redundancy but adds 5 overrides in schema.ts and the TS property name diverges from the DB column name (must remember the override when reasoning about queries).

Drizzle Kit's interactive `generate` command prompts "Did you rename column X to Y?" — confirming yields `ALTER TABLE ... RENAME COLUMN` (data-preserving). Per AGENTS.md, the generated SQL is committed unmodified. The migration now bundles enum extension + column renames into one file — both shape changes ship together.

### D3: Clean rename — no dual-acceptance / deprecation alias

BrewForm is self-hosted and pre-v1; the single in-repo web client updates in the same PR. Accepting both shapes during a transition adds Zod-union parsing complexity for zero callers. If a public API contract emerges later, the next change can introduce versioned deprecation.

### D4: Enum extension to follow / like / comment only; skip badge / system

The F05 plan listed all six types upfront, but `badge/service.ts` has zero notification references today (badge awards don't even email), and "system" has no admin trigger surfacing in the codebase. Adding enum values with no fan-out creators violates YAGNI; Postgres `ALTER TYPE ADD VALUE` is also non-reversible, so each value is a one-way door. Add values as their creators land.

### D5: Recipe-author skip-rule preserved for mentions

F04 already created the mention record for the recipe author but suppressed the mention email (the author already gets the recipe-commented email from the same comment). That asymmetric rule is preserved unchanged; comment-fan-out for the recipe author (D6) sends its own record + email because it IS a distinct event (someone commented on your recipe).

### D6: Comment-on-recipe record is distinct from mention records

`comment` notifications target the recipe author (event: "X commented on your recipe"). `mention` notifications target each `@username` in the comment body (event: "X mentioned you"). Same comment, different recipients, different `type` enum value, different `referenceType`. The F04 mention path is untouched; the new comment path slots in beside it in `runCommentNotificationSideEffects`.

### D7: Latent F04 `/me` debt disappears by structural simplification

F04 added `mentionedInComment` to the DB column, the input schema, and the flat `UserPreferencesOutputSchema`, but NOT to the nested `SelfPreferencesSchema` nor to the `/me` model nesting nor to the `types/user.ts` `UserPreferences` interface — the field was forgotten at each nesting site because the nesting required re-listing every field.

Option C flattens the shape: `SelfPreferencesSchema`, the `/me` model, and the `UserPreferences` interface all now expose 5 flat `notify*` fields (including `notifyMentionedInComment`). The debt is paid by structural change — no extra additions needed. The original SettingsPage worked only because it called `/preferences` (flat), not `/me`; with Option C the two endpoints are interchangeable on prefs shape.

### D8: `notifyFollowersOfNewRecipe` not wired for in-app records

That helper emails followers when an author posts a new recipe. The plan flags it as "optional". The enum has no matching type (`followed_user_posted` was the email-pref flag name, not an enum value — it doesn't appear in `notificationTypeEnum`). Adding a new type for this is speculative without UI design. Defer until a "followed-user-posted" feed entry has a rendering decision.

## Notification Types

| Type | Enum value | Pref flag gates both | Trigger call site | Record referenceType | Email helper | NotificationItem links to |
|------|------------|----------------------|-------------------|----------------------|--------------|----------------------------|
| Mention | `mention` | `notifyMentionedInComment` | `comment/service.ts:runCommentNotificationSideEffects` (existing F04) | `comment` | `notifyMentioned` (skipped for recipe author) | `/recipes/{slug}#{commentId}` |
| Follow | `follow` | `notifyNewFollower` | `follow/service.ts` (after follow create) | null / actor reference | `notifyNewFollower` | `/u/{actorUsername}` |
| Like | `like` | `notifyRecipeLiked` | `recipe/service.ts:toggleLike` (like ON) | `recipe` | `notifyRecipeLiked` | `/recipes/{slug}` |
| Comment | `comment` | `notifyRecipeCommented` | `comment/service.ts:runCommentNotificationSideEffects` (recipe-author path, NEW) | `comment` | `notifyRecipeCommented` | `/recipes/{slug}#{commentId}` |

## Error Handling

| Failure | Strategy |
|---------|----------|
| Recipient prefs load throws | catch in fan-out, log.error, skip this recipient, continue |
| `notifyMentionedInComment` / `notifyNewFollower` / `notifyRecipeLiked` / `notifyRecipeCommented` === false | silent skip (record + email both suppressed) |
| Actor === recipient (self-action) | silent skip (no self-notification) |
| Record insert throws | log.error, continue (email step may still run OR be skipped based on type; default: continue to next recipient) |
| Email send throws | log.error, continue (record is still genuine — author may have the record even if the email failed) |
| Migration failure | `make db-migrate` rollback per Drizzle migration policy |

Fan-out is fire-and-forget from the caller's perspective — the creation of a follow / like / comment never blocks on notification fan-out. Per-recipient catch-log-continue is the rule.

## Implementation Reference

Self-contained skeletons a fresh-context implementer can lift verbatim. Every absolute path is repo-rooted at `/Users/arda/projects/BrewForm/`.

### R1. DB schema — `packages/db/src/schema.ts`

The `notificationTypeEnum` (current line ~945) extends to 4 values:

```ts
/**
 * Notification type enum (single source of truth for the `notifications.type`
 * column). F04 introduced `mention`; F05 extends with `follow` / `like` /
 * `comment`. `badge` and `system` are NOT added by F05 — there are no fan-out
 * call sites today (badge awards do not even email yet; system notifications
 * would require an admin broadcast UI that does not exist). Add values as their
 * creators land; remember `ALTER TYPE … ADD VALUE` is non-reversible.
 *
 * Values are declared inline (not sourced from `@brewform/shared/constants`)
 * because the notification module pre-dates the shared-constants convention
 * and the enum is private to the notifications feature.
 */
export const notificationTypeEnum = pgEnum('notification_type', [
  'mention',
  'follow',
  'like',
  'comment',
]);
```

The `userPreferences` table (current lines ~105-123) notification columns rename:

```ts
  // F05 rename: was new_follower / recipe_liked / recipe_commented /
  // followed_user_posted / mentioned_in_comment. Renamed with `notify_`
  // prefix so the columns visually group in `\d user_preferences` and the
  // names match the flat `notify*` shared-schema fields end-to-end.
  notifyNewFollower: boolean('notify_new_follower').notNull().default(true),
  notifyRecipeLiked: boolean('notify_recipe_liked').notNull().default(true),
  notifyRecipeCommented: boolean('notify_recipe_commented').notNull().default(true),
  notifyFollowedUserPosted: boolean('notify_followed_user_posted').notNull().default(true),
  notifyMentionedInComment: boolean('notify_mentioned_in_comment').notNull().default(true),
```

`make db-generate` will prompt interactively: "Did you rename column `new_follower` to `notify_new_follower`?" — answer YES for all 5. Confirm the generated SQL contains both the enum `ADD VALUE`s and the `RENAME COLUMN`s, then run `make db-migrate`.

### R2. Shared input schema — `packages/shared/src/schemas/user.ts`

Flatten the nested object. The 5 flags become top-level booleans:

```ts
export const UserPreferencesSchema = z.object({
  unitSystem: z.enum(UNIT_SYSTEM_VALUES).default('metric'),
  temperatureUnit: z.enum(TEMPERATURE_UNIT_VALUES).default('celsius'),
  theme: z.enum(THEME_VALUES).default('light'),
  locale: z.string().default('en'),
  timezone: z.string().default('UTC'),
  dateFormat: z.enum(DATE_FORMAT_VALUES).default('YYYY_MM_DD'),
  // F05: notification preferences are FLAT (no `emailNotifications` nest).
  // One flag per event gates BOTH in-app record creation AND email sending
  // (the F04 precedent set by `notifyMentionedInComment`).
  notifyNewFollower: z.boolean().default(true),
  notifyRecipeLiked: z.boolean().default(true),
  notifyRecipeCommented: z.boolean().default(true),
  notifyFollowedUserPosted: z.boolean().default(true),
  notifyMentionedInComment: z.boolean().default(true),
});
```

### R3. Shared `/me` response schema — `packages/shared/src/schemas/responses/user.ts`

`SelfPreferencesSchema` (around current line ~46-61) flattens:

```ts
const SelfPreferencesSchema = z
  .object({
    unitSystem: z.string(),
    temperatureUnit: z.string(),
    theme: z.string(),
    locale: z.string(),
    timezone: z.string(),
    dateFormat: z.string(),
    // F05: flat `notify*` fields (was nested `emailNotifications` object
    // missing `mentionedInComment` — the F04 latent bug; the flatten fixes
    // it structurally because adding a flat field is a one-line change
    // whereas the nest required re-listing every field).
    notifyNewFollower: z.boolean(),
    notifyRecipeLiked: z.boolean(),
    notifyRecipeCommented: z.boolean(),
    notifyFollowedUserPosted: z.boolean(),
    notifyMentionedInComment: z.boolean(),
  })
  .nullable();
```

### R4. Shared flat `/preferences` response — `packages/shared/src/schemas/responses/preference.ts`

`UserPreferencesOutputSchema` (current lines ~14-30) renames its 5 notification fields:

```ts
  notifyNewFollower: z.boolean(),
  notifyRecipeLiked: z.boolean(),
  notifyRecipeCommented: z.boolean(),
  notifyFollowedUserPosted: z.boolean(),
  notifyMentionedInComment: z.boolean(),
```

Update the docblock on this file: replace the historical "request body nests notification flags under `emailNotifications`, but the persisted/returned row is flat" with "F05 flattens both the request body and the response — they share the same `notify*` field names (the F04 asymmetry is gone)."

### R5. Shared TS interface — `packages/shared/src/types/user.ts`

`UserPreferences` interface (current lines ~41-54) flattens. Include `notifyMentionedInComment` (F04 forgot it):

```ts
export interface UserPreferences {
  unitSystem: UnitSystem;
  temperatureUnit: TemperatureUnit;
  theme: Theme;
  locale: string;
  timezone: string;
  dateFormat: DateFormat;
  // F05: flat `notify*` flags (was nested `emailNotifications` object).
  notifyNewFollower: boolean;
  notifyRecipeLiked: boolean;
  notifyRecipeCommented: boolean;
  notifyFollowedUserPosted: boolean;
  notifyMentionedInComment: boolean;
}
```

### R6. API preference PATCH — `apps/api/src/modules/preference/index.ts`

The flatten block at lines ~83-104 shrinks. The `if (body.emailNotifications !== undefined) { ... }` wrapper disappears; 5 direct per-field copies replace it:

```ts
const flatData: PreferenceUpdate = {};
if (body.unitSystem !== undefined) flatData.unitSystem = body.unitSystem;
if (body.temperatureUnit !== undefined) flatData.temperatureUnit = body.temperatureUnit;
if (body.theme !== undefined) flatData.theme = body.theme;
if (body.locale !== undefined) flatData.locale = body.locale;
if (body.timezone !== undefined) flatData.timezone = body.timezone;
if (body.dateFormat !== undefined) flatData.dateFormat = body.dateFormat;
// F05: 5 direct per-field copies (no `emailNotifications` nest anymore).
// The `PreferenceUpdate` type auto-adapts — it's `Partial<$inferInsert>` and
// `$inferInsert` now has `notifyNewFollower` etc.
if (body.notifyNewFollower !== undefined) flatData.notifyNewFollower = body.notifyNewFollower;
if (body.notifyRecipeLiked !== undefined) flatData.notifyRecipeLiked = body.notifyRecipeLiked;
if (body.notifyRecipeCommented !== undefined) flatData.notifyRecipeCommented = body.notifyRecipeCommented;
if (body.notifyFollowedUserPosted !== undefined) flatData.notifyFollowedUserPosted = body.notifyFollowedUserPosted;
if (body.notifyMentionedInComment !== undefined) flatData.notifyMentionedInComment = body.notifyMentionedInComment;
const prefs = await service.updatePreferences(userId, flatData);
```

The OpenAPI `requestBody` auto-adapts via `jsonRequestBody(UserPreferencesSchema)` from `apps/api/src/utils/openapi/index.ts` — since `UserPreferencesSchema` is now flat, the generated JSON schema is flat with `notify*` fields. No manual schema object needed (per AGENTS.md, do NOT use `resolver()` for request bodies).

### R7. API `/me` model — `apps/api/src/modules/user/model.ts`

`findById` (current lines ~36-41) currently nests `emailNotifications: { 4 fields }` and drops `mentionedInComment`. After F05 it projects a flat object with all 5 `notify*` fields:

```ts
preferences: prefsRow
  ? {
      unitSystem: prefsRow.unitSystem,
      temperatureUnit: prefsRow.temperatureUnit,
      theme: prefsRow.theme,
      locale: prefsRow.locale,
      timezone: prefsRow.timezone,
      dateFormat: prefsRow.dateFormat,
      // F05: flat `notify*` fields (was nested `emailNotifications`).
      notifyNewFollower: prefsRow.notifyNewFollower,
      notifyRecipeLiked: prefsRow.notifyRecipeLiked,
      notifyRecipeCommented: prefsRow.notifyRecipeCommented,
      notifyFollowedUserPosted: prefsRow.notifyFollowedUserPosted,
      notifyMentionedInComment: prefsRow.notifyMentionedInComment,
    }
  : null,
```

### R8. API notify helpers — `apps/api/src/utils/notify/index.ts`

The 5 helpers gate on the flat prefs row. Every `recipient.prefs.X` access renames to `recipient.prefs.notifyX`. There are 5 access sites (one per helper):

| Helper (current line) | Current access | Renamed access |
|-----------------------|----------------|----------------|
| `notifyNewFollower` (~131) | `recipient.prefs.newFollower === false` | `recipient.prefs.notifyNewFollower === false` |
| `notifyRecipeLiked` (~154) | `recipient.prefs.recipeLiked === false` | `recipient.prefs.notifyRecipeLiked === false` |
| `notifyRecipeCommented` (~178) | `recipient.prefs.recipeCommented === false` | `recipient.prefs.notifyRecipeCommented === false` |
| `notifyMentioned` (~204) | `recipient.prefs.mentionedInComment === false` | `recipient.prefs.notifyMentionedInComment === false` |
| `notifyFollowersOfNewRecipe` (~246) | `followedUserPosted !== false` filter | `notifyFollowedUserPosted !== false` filter |

### R9. API notification model — new `findNotifyTarget` helper

`apps/api/src/modules/notification/model.ts` currently has `findMentionTargets(mentions: string[])` returning `{ id, username, prefs }[]`. The new fan-out functions are single-recipient — add an analogous one-recipient loader. Adapt the existing `findMentionTargets` query shape (likely a `users` LEFT JOIN `userPreferences`); do NOT duplicate the SQL — share the loader or extract a helper.

```ts
/**
 * Look up a single notification recipient with their preferences row
 * (parallel to `findMentionTargets`, used by the single-recipient fan-out
 * creators in `service.ts`). Returns `null` when the user does not exist or
 * is inactive. Missing prefs (`null`) is treated as opted-in by the caller.
 *
 * @param userId - The recipient's UUID.
 * @returns `{ id, username, prefs }` or `null`.
 */
export async function findNotifyTarget(
  userId: string,
): Promise<{ id: string; username: string; prefs: typeof userPreferences.$inferSelect | null } | null> {
  // …same LEFT JOIN userPreferences shape as findMentionTargets, single row.
}
```

### R10. API notification service — three new creators

The F04 template at `apps/api/src/modules/notification/service.ts:70-139` (`createMentionNotifications`) is the literal pattern to mirror. The exact body (quoted verbatim from the current file):

```ts
export async function createMentionNotifications(params: {
  mentions: string[];
  commentId: string;
  recipeId: string;
  recipeSlug: string;
  recipeTitle: string;
  mentionerUserId: string;
  mentionerUsername: string;
  recipeAuthorId: string;
}): Promise<void> {
  const { mentions, commentId, recipeId, recipeSlug, recipeTitle, mentionerUserId, mentionerUsername, recipeAuthorId } = params;
  logger.debug({ commentId, recipeId, mentionCount: mentions.length }, 'createMentionNotifications started');
  if (mentions.length === 0) {
    logger.debug({ commentId, recipeId, created: 0 }, 'createMentionNotifications completed');
    return;
  }

  try {
    const targets = await deps.model.findMentionTargets(mentions);
    let created = 0;
    for (const target of targets) {
      if (target.id === mentionerUserId) continue;
      if (target.prefs?.mentionedInComment === false) continue;

      try {
        await deps.model.create({
          userId: target.id, type: 'mention', actorId: mentionerUserId,
          referenceId: commentId, referenceType: 'comment',
          metadata: JSON.stringify({ recipeSlug, recipeTitle }),
        });
        created++;
      } catch (err) {
        logger.error({ err, commentId, recipeId }, 'mention notification create failed');
        continue;
      }

      if (target.id !== recipeAuthorId) {
        try {
          await deps.notifyMentioned({ mentionedUserId: target.id, mentionerUsername, recipeTitle, recipeSlug });
        } catch (err) {
          logger.error({ err, commentId, recipeId }, 'mention email failed');
        }
      }
    }
    logger.debug({ commentId, recipeId, created }, 'createMentionNotifications completed');
  } catch (err) {
    logger.error({ err, commentId, recipeId }, 'createMentionNotifications failed');
    throw err;
  }
}
```

Note: after the rename in R8/R11, the gate `target.prefs?.mentionedInComment === false` becomes `target.prefs?.notifyMentionedInComment === false`. Update the existing F04 function as part of the rename — do NOT leave a `mentionedInComment` reference after the column is renamed.

Three new functions mirror this pattern. The `deps` object already has `{ model, notifyMentioned }` — extend it to include the 3 new email helpers:

```ts
import { notifyMentioned, notifyNewFollower, notifyRecipeLiked, notifyRecipeCommented } from '../../utils/notify/index.ts';
// …
export const deps = { model, notifyMentioned, notifyNewFollower, notifyRecipeLiked, notifyRecipeCommented };
```

#### `createFollowNotification`

```ts
/**
 * Create a follow notification (and follow email) when a user follows another.
 *
 * Flow per F05 D1/D2/D4:
 *   1. Resolve the followed user + their preferences row via the model.
 *   2. Drop self-follow (should never happen at the call-site, belt-and-braces).
 *   3. The `notifyNewFollower` preference gates BOTH the DB record and the
 *      email: an opted-out target is skipped entirely (missing prefs row
 *      counts as enabled — the column defaults to true).
 *   4. Insert a `follow` notification row with `actorId = followerId`,
 *      `referenceType = 'actor'`, `metadata = { followerUsername }`.
 *   5. Send the follow email (`notifyNewFollower`).
 *
 * Per-target failures are isolated: a failed insert or email is logged and
 * skipped without aborting. Designed fire-and-forget from the follow service.
 *
 * @param params - `{ followerId, followerUsername, followingId }`.
 */
export async function createFollowNotification(params: {
  followerId: string;
  followerUsername: string;
  followingId: string;
}): Promise<void> {
  const { followerId, followerUsername, followingId } = params;
  logger.debug({ followerId, followingId }, 'createFollowNotification started');
  if (followerId === followingId) {
    logger.debug({ followerId, followingId, created: 0 }, 'createFollowNotification completed (self-follow skipped)');
    return;
  }

  try {
    const target = await deps.model.findNotifyTarget(followingId);
    if (!target) {
      logger.debug({ followingId, created: 0 }, 'createFollowNotification completed (target not found)');
      return;
    }
    if (target.prefs?.notifyNewFollower === false) {
      logger.debug({ followingId, created: 0 }, 'createFollowNotification completed (opted out)');
      return;
    }

    let created = 0;
    try {
      await deps.model.create({
        userId: followingId,
        type: 'follow',
        actorId: followerId,
        referenceId: null,
        referenceType: 'actor',
        metadata: JSON.stringify({ followerUsername }),
      });
      created++;
    } catch (err) {
      logger.error({ err, followerId, followingId }, 'follow notification create failed');
    }

    try {
      await deps.notifyNewFollower({ followingId, followerUsername });
    } catch (err) {
      logger.error({ err, followerId, followingId }, 'follow email failed');
    }

    logger.debug({ followingId, created }, 'createFollowNotification completed');
  } catch (err) {
    logger.error({ err, followerId, followingId }, 'createFollowNotification failed');
    throw err;
  }
}
```

#### `createLikeNotification`

Same skeleton — gate on `notifyRecipeLiked`, skip if `likerId === recipeAuthorId`, record has `type: 'like', referenceId: recipeId, referenceType: 'recipe'`, `metadata: { recipeSlug, recipeTitle }`, email `notifyRecipeLiked({ recipeAuthorId, likerUsername, recipeTitle, recipeSlug })`.

#### `createCommentNotification`

Same skeleton — gate on `notifyRecipeCommented`, skip if `commenterId === recipeAuthorId`, record has `type: 'comment', referenceId: commentId, referenceType: 'comment'`, `metadata: { recipeSlug, recipeTitle }`, email `notifyRecipeCommented({ recipeAuthorId, commenterUsername, recipeTitle, recipeSlug })`. This path targets the recipe author only — distinct from `createMentionNotifications` which targets each `@username` in the body.

### R11. Update existing `createMentionNotifications` for the rename

The F04 function at `service.ts:104` has `if (target.prefs?.mentionedInComment === false) continue;`. After R8 renames the column to `mentioned_in_comment` → `notify_mentioned_in_comment`, this access becomes `target.prefs?.notifyMentionedInComment === false`. Update this single line. Everything else in the F04 function is unchanged.

### R12. Fan-out call sites

At each site, the call is fire-and-forget. Use the existing `.catch` pattern:

#### `apps/api/src/modules/follow/service.ts` — after follow create

```ts
// Fire-and-forget fan-out: never blocks the follow operation,
// never throws to the caller. Per-recipient errors logged inside.
createFollowNotification({
  followerId: userId,
  followerUsername: currentUser.username,
  followingId: targetUserId,
}).catch((err) => logger.error({ err, followerId: userId, followingId: targetUserId }, 'createFollowNotification failed'));
```

#### `apps/api/src/modules/recipe/service.ts:toggleLike` — when like ON, author ≠ liker

```ts
if (result.liked && recipe.authorId !== userId) {
  createLikeNotification({
    likerId: userId,
    likerUsername: currentUser.username,
    recipeAuthorId: recipe.authorId,
    recipeId: recipe.id,
    recipeSlug: recipe.slug,
    recipeTitle: recipe.title,
  }).catch((err) => logger.error({ err, recipeId, likerId: userId }, 'createLikeNotification failed'));
}
```

#### `apps/api/src/modules/comment/service.ts:runCommentNotificationSideEffects` — recipe-author path

The function already calls `notifyRecipeCommented({ recipeAuthorId, commenterUsername, recipeTitle, recipeSlug })` (around line 163) for the recipe-author path (when `commenterId !== recipeAuthorId`). Colocate the new record creation beside that email call. DO NOT touch the existing `createMentionNotifications` invocation at line ~178.

```ts
if (commenterId !== recipeAuthorId) {
  // Existing email call (gated on notifyRecipeCommented inside the helper):
  (async () => {
    try {
      await notifyRecipeCommented({ recipeAuthorId, commenterUsername, recipeTitle, recipeSlug });
    } catch (err) {
      logger.error({ err, recipeId, commenterId }, 'notifyRecipeCommented failed');
    }
  })().catch((err) => logger.error({ err, recipeId }, 'recipe-commented side effect failed'));

  // NEW F05 fan-out: in-app record creation, gated on the same pref flag.
  createCommentNotification({
    commenterId, commenterUsername, recipeAuthorId, recipeId, recipeSlug, recipeTitle, commentId,
  }).catch((err) => logger.error({ err, commentId, recipeId }, 'createCommentNotification failed'));
}
```

### R13. Web — `apps/web/src/pages/settings/SettingsPage.tsx`

The `toUserPreferences()` adapter (lines ~24-31) currently unpacks a flat row into a nested `emailNotifications: { ... }`. With Option C, the row IS already the right shape — the adapter loses the re-nest step entirely. Each of the 5 toggles (lines ~263-304) reads `prefs.emailNotifications.X` → `prefs.notifyX` and writes `emailNotifications: { ...prefs.emailNotifications, X: v }` → flat `{ ...prefs, notifyX: v }`. The `savePreferences()` payload (lines ~79-86) sends `emailNotifications: prefs.emailNotifications` → sends the whole flat prefs object directly.

### R14. Web — `apps/web/src/components/layout/NotificationItem.tsx`

Today (line 61) handles only `type === 'mention'`, else falls back to `notifications.mentionGeneric`. Extend the switch to handle `follow` / `like` / `comment` per the Notifications Types table above. The metadata JSON (`{ recipeSlug, recipeTitle }` or `{ followerUsername }`) is parsed at render time. Fall-through default keeps `notifications.mentionGeneric` for safety (forward-compat with future enum additions).

### R15. Web — `apps/web/src/pages/notifications/NotificationListPage.tsx`

Add a single `All` / `Unread` filter toggle. Local `useState<'all' | 'unread'>('all')` drives the `notificationApi.list({ unreadOnly: filter === 'unread' })` call. Re-fetch on filter change. Empty state unchanged.

### R16. i18n — `packages/shared/src/i18n/{en,tr}.json`

Add 3 keys with parity (en + tr values per the table in the PRD):

| Key | en | tr |
|-----|-----|-----|
| `notifications.follow` | `"{actorUsername} started following you"` | `"{"actorUsername"} seni takip etmeye başladı"` |
| `notifications.like` | `"{actorUsername} liked your recipe {recipeTitle}""` | `"{"actorUsername"} tarifini beğendi: {recipeTitle}"` |
| `notifications.comment` | `"{actorUsername} commented on {recipeTitle}"` | `"{"actorUsername"} tarifine yorum yaptı: {recipeTitle}"` |

Remove `settings.emailNotifications` (line 324 in both files). The section header already has `settings.notifications` (line 247) — use it.

### R17. Migration SQL — exact shape (for reference, NOT hand-editing)

`make db-generate` produces one file under `packages/db/migrations/<timestamp>_<name>.sql`. Expected contents:

```sql
-- enum extension (ADD VALUE runs outside a transaction — Postgres requirement)
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'follow';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'like';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'comment';

-- column renames (data-preserving)
ALTER TABLE "user_preferences" RENAME COLUMN "new_follower" TO "notify_new_follower";
ALTER TABLE "user_preferences" RENAME COLUMN "recipe_liked" TO "notify_recipe_liked";
ALTER TABLE "user_preferences" RENAME COLUMN "recipe_commented" TO "notify_recipe_commented";
ALTER TABLE "user_preferences" RENAME COLUMN "followed_user_posted" TO "notify_followed_user_posted";
ALTER TABLE "user_preferences" RENAME COLUMN "mentioned_in_comment" TO "notify_mentioned_in_comment";
```

Per AGENTS.md: do NOT hand-edit the generated SQL. If the generation isn't what you expect, fix the schema and re-generate.

## Testing Strategy

Tests live in `*.test.ts` files alongside the source. Framework: `jsr:@std/testing/bdd` (`describe`/`it`) + `jsr:@std/expect`. Tests run with `--no-check`; type-checking is separate (via `make check`). DB-backed tests point at the `brewform_test` DB via `make test-db-provision` (idempotent). Email is suppressed when `APP_ENV === 'test'`.

### Shared / package tests

- **`packages/shared/src/schemas/user.test.ts`** — `UserPreferencesSchema` (the input schema):
  - defaults: when omitted, all 5 `notify*` fields default to `true`
  - partial-input parsing: `{ notifyNewFollower: false }` parses with the other 4 still defaulting to `true`
  - `notifyMentionedInComment` round-trips truthy and falsy
  - the schema MUST NOT accept `{ emailNotifications: {...} }` anymore (it's a flat object now — extra keys are ignored by Zod default, but assert the old shape's keys land nowhere visible)
- **`packages/shared/src/schemas/responses/user.test.ts`** — `SelfUserOutputSchema` (`SelfPreferencesSchema` nested inside):
  - accepts `preferences: { ...flat 5 notify* fields..., unitSystem, theme, ... }`
  - accepts `preferences: null` (user with no prefs row)
  - rejects `preferences: { emailNotifications: {...} }` (the nest is gone — Zod should strip it via default `z.object` strict-true OR fail it depending on the schema's `.strict()` posture; assert the documented behavior)
  - assert `notifyMentionedInComment` is present (F04 latent bug)
- **`packages/shared/src/schemas/responses/preference.test.ts`** — `UserPreferencesOutputSchema`:
  - existing flat-row rejection test stays valid — update field names to `notify*`
  - assert all 5 `notify*` fields round-trip
  - assert the schema rejects a nested `emailNotifications` object (the test currently at line 57-72 — keep the spirit, update the field-name assertions)
- **`packages/shared/src/schemas/responses/output-schema-acceptance.pbt.test.ts:568`** — the property-based arbitrary for `SelfUserOutputSchema` uses `emailNotifications: fc.record({ 4 fields })` — update to 5 flat `notify*` fields on the outer `preferences` object.

### API tests

- **`apps/api/src/modules/notification/service.test.ts`** — add 3 new suites (one per new creator) mirroring the existing `createMentionNotifications` suite (lines ~166-193 are the reference). Each suite must enumerate:
  - gate-skip: `prefs: { notifyX: false }` → no record, no email call
  - null-prefs = enabled: missing prefs row → record + email both called
  - actor-skip: actor === recipient → no record, no email
  - recipe-author-skip (like / comment only): `likerId === recipeAuthorId` → no record, no email
  - record-then-email ordering: assert `deps.model.create` is called before `deps.notifyX` for each recipient
  - per-recipient-error-continues: when `model.create` throws, the loop catches, logs, and continues to the next recipient (multi-recipient case only meaningful for the mention suite, already covered — single-recipient creators just assert log+continue
  - matched-call: assert `model.create` was called with exact `{ type, userId, actorId, referenceId, referenceType, metadata }` shape; assert `deps.notifyX` was called with the helper's exact param shape
  - Update the existing `createMentionNotifications` suite: every `prefs: { mentionedInComment: ... }` becomes `prefs: { notifyMentionedInComment: ... }`
- **`apps/api/src/modules/notification/model.test.ts`** (if it exists — search first; if not, the model helpers are exercised via the service test) — add coverage for new `findNotifyTarget`:
  - returns a user with prefs when the user exists and has a prefs row
  - returns a user with `prefs: null` when the user exists but has no prefs row
  - returns `null` when the user does not exist (or is soft-deleted)
- **`apps/api/src/modules/preference/index.test.ts`** — currently 401-only (pre-auth). Optionally add a happy-path PATCH that sends `{ notifyMentionedInComment: false }` and asserts the persisted row has `notify_mentioned_in_comment = false` (ponytail: only if a DB-backed route test pattern already exists in the repo — don't bootstrap a new DB-route-testing pattern just for this; existing model tests cover persistence). If keeping 401-only, at least update mocked assertions referencing `emailNotifications` to reference the flat `notify*` shape.
- **`apps/api/src/modules/preference/model.test.ts`** — DB-backed round-trip; currently exercises `unitSystem` / `theme` / `temperatureUnit`. Add 1 assertion that `notifyMentionedInComment` round-trips through `upsert` (was missing — F04 added the column but the test never grew).
- **`apps/api/src/modules/user/model.test.ts:56-59`** — `/me` `findById` currently asserts `preferences.emailNotifications.{4 flags} === false`. Update to assert 5 flat `notify*` fields on `preferences` (no nested object).
- **`apps/api/src/modules/follow/service.test.ts`** — assert `createFollowNotification` is invoked after follow creation with the right param shape; assert it's NOT invoked when the follow already existed (idempotent).
- **`apps/api/src/modules/recipe/service.test.ts`** — `toggleLike`:
  - assert `createLikeNotification` invoked when like toggles ON, `recipe.authorId !== userId`
  - assert NOT invoked when like toggles OFF
  - assert NOT invoked when `recipe.authorId === userId` (self-like)
- **`apps/api/src/modules/comment/service.test.ts`** — `runCommentNotificationSideEffects`:
  - assert `createCommentNotification` invoked when `commenterId !== recipeAuthorId`
  - assert NOT invoked when `commenterId === recipeAuthorId` (self-comment)
  - assert `createMentionNotifications` STILL fires for `@mentioned` users (unchanged — regression guard)
- **`apps/api/src/utils/notify/notify.test.ts`** (exists per glob) — update every `prefs.X` mock/check to `prefs.notifyX` across the 5 helpers' gate-skip tests.

### Web tests

- **`apps/web/src/components/layout/NotificationItem.test.tsx`** — add 3 rendering tests:
  - `follow` type: assert Person icon present, text contains `"{actorUsername} started following you"`, link `/u/{actorUsername}`
  - `like` type: assert Heart icon present, text contains `"{actorUsername} liked your recipe {recipeTitle}"`, link `/recipes/{recipeSlug}`
  - `comment` type: assert Chat icon present, text contains `"{actorUsername} commented on {recipeTitle}"`, link `/recipes/{recipeSlug}#{commentId}`
  - unknown type: assert fallback generic rendering (no crash)
- **`apps/web/src/pages/notifications/NotificationListPage.test.tsx`** — add All / Unread filter test:
  - initial render: `notificationApi.list` called with `unreadOnly: false` (default `all`)
  - click "Unread": `notificationApi.list` called with `unreadOnly: true`; only unread items rendered
  - click "All": reverts to `unreadOnly: false`
- **`apps/web/src/pages/settings/SettingsPage.test.tsx`**:
  - update mock i18n map: drop `settings.emailNotifications`; keep `settings.notifications`; add `settings.notif.notifyMentionedInComment` (or whatever the new toggle labels key to — see T28)
  - the toggles now read flat `prefs.notifyNewFollower` etc. (not `prefs.emailNotifications.X`)
  - PATCH payload test: after toggling `notifyMentionedInComment` OFF, payload is `{ notifyMentionedInComment: false }` (flat, no nest)

### Migration data-preservation test (NEW)

Add a small test that asserts the F05 migration preserves existing preference data. Pattern: insert a row with the new column names BEFORE the migration vs AFTER is awkward — instead, run `make test-db-provision` (which applies the migration to the test DB) and assert the seeded users' preference rows have the expected `notify*` values (true by default, or whatever the seed sets). If the seed sets a `false` value, that flag survives the rename — that's the assertion. Add a task to update `packages/db/src/seed.ts` if it references the old column names (search for `newFollower` / `new_follower` in `seed.ts`).

### Verification (mandatory before commit)

- `make check` — type-check all workspaces
- `make lint` — lint all apps and packages
- `make test` — all tests green (via Docker, `--allow-all`)
- `make fmt` — apply `deno fmt` (lineWidth 100, indentWidth 2, singleQuote, semiColons). CI runs `deno fmt --check` and fails the build on unformatted code — the pre-commit hook (`make setup-hooks`) catches this locally, but run `make fmt` proactively after each batch of edits.
- `make test-api` after Phase 3 — assert the OpenAPI introspection coverage test `apps/api/src/routes/openapi.coverage.test.ts` passes with the updated PATCH `/preferences` schema (no orphan tags, every in-scope route documented).

### Plan docs (housekeeping)

- **`plans/F05-in-app-notifications.md`** — prepend a "✅ Shipped via OpenSpec change `f05-in-app-notifications`" banner to the top of the file (after line 1, before the existing 2026-07-13 correction note). Add a short note that the implemented shape is Option C (flat `notify*` + DB column prefix), NOT the nested `notifyPreferences` namespace the 2026-07-13 preface assumed — the preface is preserved as historical context.
- **`plans/F29-weekly-email-digest.md`** — this future plan proposes adding `weeklyDigest` to `emailNotifications` (lines 11, 27, 47, 84, 113). With F05's flat shape, that addition would be a flat top-level `notifyWeeklyDigest` field (per-column, not nested). Add a forward-compat note at the top of F29's PRD flagging this so the future implementer doesn't blindly follow the original nesting suggestion.