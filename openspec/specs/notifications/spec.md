# notifications Specification

## Purpose
TBD - created by archiving change f05-in-app-notifications. Update Purpose after archive.
## Requirements
### Requirement: Flat channel-agnostic notification preferences

The `UserPreferences` shared schema SHALL expose 5 notification preference fields as FLAT top-level booleans: `notifyNewFollower`, `notifyRecipeLiked`, `notifyRecipeCommented`, `notifyFollowedUserPosted`, `notifyMentionedInComment`. There SHALL NOT be a nested `emailNotifications` or `notifyPreferences` object.

- Each flag SHALL default to `true` on the schema and on the DB column.
- The 5 DB columns on `user_preferences` SHALL be named `notify_new_follower`, `notify_recipe_liked`, `notify_recipe_commented`, `notify_followed_user_posted`, `notify_mentioned_in_comment` (column-rename from the legacy `new_follower` etc. names, executed via Drizzle interactive `generate` preserving data via `ALTER TABLE ... RENAME COLUMN`).
- The flat `/preferences` response (`UserPreferencesOutputSchema`) SHALL expose the same 5 `notify*` field names at the top level — request and response shapes are identical for the notification section.
- The `/me` response SHALL expose `preferences: { notifyNewFollower, notifyRecipeLiked, notifyRecipeCommented, notifyFollowedUserPosted, notifyMentionedInComment }` (5 flat fields, no nesting) — matching the flat `/preferences` shape. `notifyMentionedInComment` SHALL be present (fixing the F04 latent bug where it was forgotten inside the nested shape).
- A missing recipient preferences row SHALL be treated as opted-in for every flag (default-true semantics) — both in the schema and in the fan-out gate.

#### Scenario: PATCH /preferences with flat notify field

- Given an authenticated user with a preferences row
- When the client sends `PATCH /preferences` with `{ notifyMentionedInComment: false }`
- Then the response row has `notifyMentionedInComment = false` and the remaining `notify*` flags unchanged.

#### Scenario: /me response includes notifyMentionedInComment

- Given a user with no preferences row
- When the client calls `GET /me`
- Then the response's `preferences.notifyMentionedInComment` is `true` (default-true semantics, surfaced in the flat shape).

#### Scenario: /me and /preferences shape parity

- Given an authenticated user with a preferences row
- When the client calls `GET /me` and `GET /preferences` for the same user
- Then the 5 `notify*` fields returned by `/me` (`preferences.notifyNewFollower` etc.) match the 5 returned by `/preferences` (`notifyNewFollower` etc.); the only difference is the surrounding object structure (one nested under `preferences`, the other flat atop the response).

#### Scenario: DB migration preserves existing preferences

- Given existing rows in `user_preferences` with `new_follower = false`
- When the F05 migration runs `ALTER TABLE user_preferences RENAME COLUMN new_follower TO notify_new_follower`
- Then the migrated rows have `notify_new_follower = false` (data preserved; not drop+create).

#### Scenario: Legacy emailNotifications request body is non-fatal

- Given a legacy client (one not updated for F05) sending a PATCH with `{ emailNotifications: { newFollower: false } }`
- When the server parses the body via the flat `UserPreferencesSchema` (Zod with default `strip` unknown-keys mode)
- Then the legacy `emailNotifications` key is stripped (unknown-key behavior), and the parsed result's 5 `notify*` fields all default to `true` (the legacy field is silently dropped — no error, no effect). This is the documented behavior; clients MUST migrate. A future change may add explicit rejection if needed.

### Requirement: One flag per type gates both record and email

For each notification type, the matching `notify*` flag SHALL gate BOTH in-app record creation AND email sending. There SHALL NOT be separate in-app vs email flags per type.

- A missing recipient preferences row SHALL be treated as opted-in for every flag (i.e. default-true semantics).
- An actor SHALL NOT create a notification for themselves (actor === recipient → skip).
- Per-recipient failures (record creation OR email send) SHALL be caught and logged; the loop SHALL continue to the next recipient.
- The notification creation in the caller (follow / like / comment) SHALL be fire-and-forget — the caller does not block on fan-out.

#### Scenario: Opted-out recipient receives neither

- Given a recipient whose `notifyNewFollower = false`
- When `createFollowNotification` is called for them
- Then no notification record is created AND the `notifyNewFollower` email helper is never called

#### Scenario: Missing prefs row treated as enabled

- Given a recipient with no `userPreferences` row
- When `createLikeNotification` is called for them
- Then a record is created AND `notifyRecipeLiked` is called

#### Scenario: Self-action skipped

- Given a user likes their own recipe
- When `toggleLike` runs
- Then `createLikeNotification` is never invoked (no record, no email)

#### Scenario: Record insert failing does not cancel caller

- Given `createFollowNotification` is fire-and-forget from `follow/service.ts`
- When the underlying `model.create` throws for one recipient
- Then `follow/service.ts` continues unaffected (the `.catch(err => logger.error(...))` swallows the rejection), and the next logged-in recipient's fan-out (in a multi-recipient future) would proceed

### Requirement: Independent gating of mention vs comment events

The `notifyMentionedInComment` and `notifyRecipeCommented` flags SHALL be gated INDEPENDENTLY. A recipe author mentioned in a comment on their own recipe may receive any combination of the four outputs (mention record, comment record, mention email, recipe-commented email) based on their prefs and the recipe-author email skip-rule.

- The mention record is gated on `notifyMentionedInComment`.
- The comment record is gated on `notifyRecipeCommented`.
- The recipe-commented email is gated on `notifyRecipeCommented`.
- The mention email is gated on `notifyMentionedInComment` AND additionally suppressed when the target IS the recipe author (D5 skip-rule — the recipe-commented email covers that case for the author).

#### Scenario: Recipe author with notifyMentionedInComment=true and notifyRecipeCommented=false

- Given user B is the author of recipe R, with `notifyMentionedInComment = true` and `notifyRecipeCommented = false`, and user A comments on R mentioning @B
- When the comment is created
- Then a `mention` notification record with `userId=B, type='mention'` IS created (gated on `notifyMentionedInComment` = true)
- And a `comment` notification record with `userId=B, type='comment'` is NOT created (gated on `notifyRecipeCommented` = false)
- And the `notifyMentioned` email is NOT sent to B (D5 recipe-author skip-rule regardless of pref flag)
- And the `notifyRecipeCommented` email is NOT sent to B (gated on `notifyRecipeCommented` = false)

#### Scenario: Recipe author with both flags true (default)

- Given user B is the author of recipe R, with both `notifyMentionedInComment = true` and `notifyRecipeCommented = true` (the default), and user A comments on R mentioning @B
- When the comment is created
- Then both records ARE created (`mention` + `comment`, distinct `referenceId`/`type`)
- And `notifyRecipeCommented` IS sent to B
- And `notifyMentioned` is NOT sent to B (D5 recipe-author skip-rule — author email is recipe-commented, not mention)

#### Scenario: Non-author mentioned user with both flags true

- Given user C (not the recipe author) is mentioned in a comment on recipe R, with both flags true
- When the comment is created
- Then a `mention` notification record with `userId=C` IS created
- And a `comment` notification record with `userId=C` is NOT created (comment record targets the recipe author B only, not random mentioned users)
- And `notifyMentioned` IS sent to C (no recipe-author skip-rule for non-authors)
- And `notifyRecipeCommented` is NOT sent to C (C is not the recipe author)

### Requirement: Notification type enum covers follow / like / comment

The `notificationTypeEnum` SHALL include `mention`, `follow`, `like`, `comment`.

- `badge` and `system` values SHALL NOT be added by this change (deferred YAGNI — no call sites).

#### Scenario: Migration adds three enum values

- Given the enum has only `mention`
- When `make db-migrate` runs
- Then the enum has `mention, follow, like, comment` and the migration SQL uses three `ALTER TYPE ... ADD VALUE` statements (outside a transaction — Postgres requirement)

#### Scenario: Existing mention records remain valid

- Given existing `notifications` rows with `type = 'mention'` (from F04)
- When the F05 migration runs (extending the enum)
- Then the existing rows' `type` values remain valid — `ALTER TYPE ... ADD VALUE` does not invalidate existing rows

### Requirement: Follow fan-out

When a `userFollows` relationship is created, `createFollowNotification` SHALL be invoked for the followed user with `actorId = followerId`.

- The notification record SHALL have `type = 'follow'`, `referenceId = null`, `referenceType = null` (or `'actor'`), `metadata` containing `{ followerUsername }`.
- The fan-out SHALL run after the follow transaction commits; it SHALL be fire-and-forget.

#### Scenario: Follow creates a follow notification

- Given user A follows user B
- When the follow relationship is created
- Then a notification record with `type='follow'`, `actorId=A`, `userId=B`, `referenceId=null`, `referenceType='actor'`, `metadata='{"followerUsername":"<A's username>"}'` is created
- And the `notifyNewFollower` email helper is called for B

#### Scenario: Re-follow (idempotent) does not double-fire

- Given user A already follows user B (relationship already exists)
- When the follow-create service detects the existing relationship and short-circuits
- Then `createFollowNotification` is NOT invoked (idempotent — re-following does not re-notify)

### Requirement: Like fan-out

When a recipe like is toggled ON and the liker is not the recipe author, `createLikeNotification` SHALL be invoked for the recipe author.

- When the like is toggled OFF, no notification SHALL be created or removed (likes are idempotent events — no "unlike" notification).
- When the liker is the recipe author, no like notification SHALL be created.
- The notification record SHALL have `type = 'like'`, `actorId = likerId`, `referenceId = recipeId`, `referenceType = 'recipe'`, `metadata` containing `{ recipeSlug, recipeTitle }`.

#### Scenario: Like creates a like notification

- Given user A likes recipe R authored by user B (A ≠ B)
- When `toggleLike(R, A)` turns the like ON
- Then a notification record with `type='like'`, `actorId=A`, `userId=B`, `referenceId=R.id`, `referenceType='recipe'`, `metadata='{"recipeSlug":"<R.slug>","recipeTitle":"<R.title>"}'` is created

#### Scenario: Self-like creates no notification

- Given user A likes their own recipe R
- When `toggleLike(R, A)` turns the like ON
- Then no like notification record is created

### Requirement: Comment fan-out for recipe author

When a comment is created and the commenter is not the recipe author, `createCommentNotification` SHALL be invoked for the recipe author with `type = 'comment'`.

- This fan-out is distinct from `createMentionNotifications` — the comment notification targets the recipe author, the mention notifications target each `@username` in the comment body. Both SHALL run for the same comment when applicable; neither SHALL block the other.
- The notification record SHALL have `referenceId = commentId`, `referenceType = 'comment'`, `metadata` containing `{ recipeSlug, recipeTitle }`.

#### Scenario: Comment creates a comment notification for recipe author

- Given user A comments on user B's recipe
- When the comment is created
- Then a notification record with `type='comment'`, `actorId=A`, `userId=B`, `referenceId=<comment.id>`, `referenceType='comment'`, `metadata='{"recipeSlug":"<R.slug>","recipeTitle":"<R.title>"}'` is created, and the `notifyRecipeCommented` email helper is called for B

#### Scenario: Self-comment creates no comment notification

- Given user A comments on their own recipe R
- When the comment is created
- Then no `comment` notification is created (mention notifications for @mentioned users still fire)

### Requirement: Recipe author skip-rule for mention emails

When a comment mentions the recipe author, `createMentionNotifications` (F04) SHALL still create the in-app `mention` notification record for them, but SHALL NOT send the mention email (the recipe-commented email already covers that case).

- This is preserved unchanged from F04 — the new `comment` fan-out (Requirement above) is independent of this rule.

#### Scenario: Recipe author mentioned in own recipe

- Given user B is the author of recipe R and user A comments on R mentioning @B
- When the comment is created
- Then a `mention` notification record with `userId=B` is created
- And a `comment` notification record with `userId=B` is also created (the new fan-out)
- And the `notifyMentioned` email is suppressed for B (recipe-author skip-rule)
- And `notifyRecipeCommented` is sent to B (gated on `notifyRecipeCommented`)

### Requirement: Feed UI renders per type

`NotificationItem` SHALL render a type-specific icon and text pattern for `mention`, `follow`, `like`, `comment`.

- For an unknown `type`, `NotificationItem` SHALL fall back to a generic rendering (no crash, no empty DOM).
- `NotificationListPage` SHALL provide an `All` / `Unread` filter controlling the `?unreadOnly=true|false` API parameter.
- i18n keys SHALL exist (en + tr parity) for each type's text pattern: `notifications.mention`, `notifications.follow`, `notifications.like`, `notifications.comment`, plus the existing `notifications.mentionGeneric` fallback and `notifications.all` (filter label).

#### Scenario: NotificationItem renders follow

- Given a notification `{ type: 'follow', actorId: '<A.id>', actorUsername: 'alice', metadata: '{"followerUsername":"alice"}' }`
- When `<NotificationItem>` renders
- Then the rendered text contains "alice started following you" (interpolated via `notifications.follow` i18n key)
- And the link target is `/u/alice`

#### Scenario: NotificationItem renders like

- Given a notification `{ type: 'like', actorId, actorUsername: 'alice', metadata: '{"recipeSlug":"foo","recipeTitle":"Bar"}' }`
- When `<NotificationItem>` renders
- Then the rendered text contains "Bar" (recipeTitle interpolation)
- And the link target is `/recipes/foo`

#### Scenario: NotificationItem renders comment

- Given a notification `{ type: 'comment', actorId, actorUsername: 'alice', referenceId: 'c-123', metadata: '{"recipeSlug":"foo","recipeTitle":"Bar"}' }`
- When `<NotificationItem>` renders
- Then the rendered text contains "Bar"
- And the link target is `/recipes/foo#c-123`

#### Scenario: NotificationItem renders unknown type as fallback

- Given a notification with `type = 'futureType'` (an enum value added by a later change)
- When `<NotificationItem>` renders
- Then the rendered text uses the `notifications.mentionGeneric` fallback
- And the component does NOT crash or render empty DOM

#### Scenario: NotificationListPage All/Unread filter

- Given a `/notifications` page with both read and unread notifications
- When the user clicks "Unread"
- Then only unread notifications are displayed (the underlying API call uses `?unreadOnly=true`)
- When the user clicks "All"
- Then both read and unread notifications are displayed (the API call uses `?unreadOnly=false`)

### Requirement: OpenAPI metadata stays current

The PATCH `/preferences` route's OpenAPI `requestBody` SHALL describe the flat `notify*` fields (not a nested `emailNotifications` object).

- The newly-added `createFollow/Like/CommentNotification` service functions need no route changes (the four `/notifications` endpoints are unchanged from F04).

#### Scenario: OpenAPI spec reflects the flat shape

- Given the renamed schema
- When `GET /api/v1/openapi.json` is fetched
- Then the PATCH `/preferences` request body schema shows `notifyNewFollower`, `notifyRecipeLiked`, `notifyRecipeCommented`, `notifyFollowedUserPosted`, `notifyMentionedInComment` as flat top-level fields (no nested object)

#### Scenario: OpenAPI coverage test passes

- Given the PATCH `/preferences` route's `describeRoute()` metadata is unchanged structurally (still has tags, summary, security, responses)
- When `apps/api/src/routes/openapi.coverage.test.ts` runs
- Then it passes — every in-scope route still documented, no orphan tags, the renamed request body shape is reflected via the auto-generated `jsonRequestBody(UserPreferencesSchema)`

### Requirement: Code quality gates

The change SHALL pass all repo-mandated code quality gates before commit.

- `make check` (type-check across all workspaces) SHALL pass.
- `make lint` (lint across all apps and packages) SHALL pass.
- `make test` (full test suite via Docker with `--allow-all`) SHALL pass — including the new test suites added by this change.
- `make fmt` SHALL be applied; `deno fmt --check` SHALL pass (CI gate — the build fails on any diff).

#### Scenario: CI green

- Given all Phase 1-4 tasks complete
- When `make check && make lint && make test` runs
- Then all three commands exit 0

#### Scenario: deno fmt --check passes

- Given all source edits are saved
- When `make fmt` runs (applies `deno fmt` formatting)
- Then `git status` shows no unformatted files; `deno fmt --check` (run by the pre-commit hook and CI) passes — the build does not fail on formatting diffs

