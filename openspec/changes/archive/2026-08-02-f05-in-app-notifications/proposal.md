## Why

F04 (2026-07-13) shipped the notification substrate: `notifications` table with soft-delete, `notificationTypeEnum` with a single value `'mention'`, four `/api/v1/notifications` endpoints (list paginated, unread-count, read-all, read-one), the `mentionedInComment` preference flag gating both record AND email, and the web bell/dropdown/list-page chrome. It stopped short of the other actionable types (follow / like / comment) and surfaced the preference flags under an `emailNotifications` namespace that no longer reflects their dual role (they now gate in-app records too). F05 closes both gaps: it extends fan-out to the three remaining social-action types, flattens the preference namespace and renames the columns to be channel-agnostic, and as a side-effect of the flatten fixes the F04 debt where `/me` omits the `mentionedInComment` flag.

## What Changes

1. **Flatten and rename** the notification preference fields. Drop the nested `emailNotifications` object; expose 5 flat top-level fields `notifyNewFollower`, `notifyRecipeLiked`, `notifyRecipeCommented`, `notifyFollowedUserPosted`, `notifyMentionedInComment`. **DB columns also rename** with `notify_` prefix: `new_follower` → `notify_new_follower`, `recipe_liked` → `notify_recipe_liked`, `recipe_commented` → `notify_recipe_commented`, `followed_user_posted` → `notify_followed_user_posted`, `mentioned_in_comment` → `notify_mentioned_in_comment`. Files touched: `packages/shared/src/schemas/user.ts` (input schema — flatten + rename fields), `packages/shared/src/types/user.ts` (interface — flatten + rename fields), `packages/shared/src/schemas/responses/user.ts` (`SelfPreferencesSchema` — flatten + rename fields, include `notifyMentionedInComment`), `packages/shared/src/schemas/responses/preference.ts` (flat `UserPreferencesOutputSchema` — rename 5 fields), `apps/api/src/modules/preference/index.ts` (PATCH flatten — shrinks to identity-copy per field, no `[object] !== undefined` wrapper), `apps/api/src/modules/user/model.ts:findById` (no more nested `emailNotifications` object — `preferences` becomes flat), `apps/web/src/pages/settings/SettingsPage.tsx` (5 toggles + adapter simplification). `apps/api/src/utils/notify/index.ts` helpers reading `recipient.prefs.newFollower` etc. update to `recipient.prefs.notifyNewFollower`.
2. Replace the i18n section header key `settings.emailNotifications` with `settings.notifications` (en + tr); keep `settings.notif.*` per-toggle keys (already channel-agnostic).
3. Extend `notificationTypeEnum` with `'follow'`, `'like'`, `'comment'`. Skip `badge` / `system` (no call sites today).
4. Add `createFollowNotification`, `createLikeNotification`, `createCommentNotification` in `apps/api/src/modules/notification/service.ts`, mirroring `createMentionNotifications`: load recipient prefs, skip if flag is `false` (missing row = enabled), skip if actor === recipient, create the record, then send the matching email via the existing `notifyNewFollower` / `notifyRecipeLiked` / `notifyRecipeCommented` helper, catch-log-continue per recipient.
5. Wire fan-out at the three call sites: `apps/api/src/modules/follow/service.ts` (after follow create), `apps/api/src/modules/recipe/service.ts:toggleLike` (when like ON and liker !== author), `apps/api/src/modules/comment/service.ts:runCommentNotificationSideEffects` (for the recipe author — distinct from the existing mention records).
6. Update `apps/web/src/components/layout/NotificationItem.tsx` to render `mention` / `follow` / `like` / `comment` with per-type icon + text pattern from the rendering table below.
7. Add an `All` / `Unread` filter to `apps/web/src/pages/notifications/NotificationListPage.tsx`.
8. Add i18n keys `notifications.follow` / `notifications.like` / `notifications.comment` (en + tr, parity).
9. Update OpenAPI metadata on the preference PATCH route — the request body is now flat with `notify*` fields (no nested object).
10. Fix latent F04 debt: `/me` response now includes `notifyMentionedInComment` (previously dropped because the nested `emailNotifications` object forgot to grow). With the flattened shape (Option C), the field joins the other 4 flat prefs automatically — the debt disappears by structural simplification, not by addition to a nest.
11. Update affected tests (listed in the Testing Strategy).

## Capabilities

### New Capabilities

- `notifications`: In-app notification feed, per-type preference gating, fan-out rules for follow/like/comment, and per-type feed UI rendering.

### Modified Capabilities

- `api-type-safety`: Decision 3 rationale references `emailNotifications`; updated to flat `notify*` fields to reflect the F05 flatten + column rename.

## Impact

- **Shared**: `packages/shared/src/schemas/user.ts`, `packages/shared/src/types/user.ts`, `packages/shared/src/schemas/responses/user.ts`, `packages/shared/src/schemas/responses/preference.ts`, i18n `en.json` + `tr.json`.
- **API**: `apps/api/src/modules/preference/index.ts` (flatten + OpenAPI), `apps/api/src/modules/user/model.ts` (findById flat nesting), `apps/api/src/modules/notification/service.ts` (3 new creators), 3 call sites (`follow/service.ts`, `recipe/service.ts:toggleLike`, `comment/service.ts:runCommentNotificationSideEffects`), `apps/api/src/utils/notify/index.ts` (rename prefs.X → prefs.notifyX reads).
- **Web**: `apps/web/src/components/layout/NotificationItem.tsx`, `apps/web/src/pages/notifications/NotificationListPage.tsx`, `apps/web/src/pages/settings/SettingsPage.tsx`.
- **DB**: one Drizzle migration containing (a) three `ALTER TYPE notification_type ADD VALUE` statements for follow/like/comment, AND (b) five `ALTER TABLE user_preferences RENAME COLUMN old_name TO notify_new_name` statements. Drizzle Kit's interactive `generate` prompts to confirm each rename — NOT a drop+create (data is preserved). Per AGENTS.md, the generated SQL is committed unmodified.
- **OpenAPI**: PATCH `/preferences` `requestBody` flat shape with `notify*` fields; the four `/notifications` endpoints are unchanged from F04.
- No new API endpoints. No deprecation period (clean rename — single in-repo web client). DB columns renamed (5 column renames via Drizzle interactive migration).