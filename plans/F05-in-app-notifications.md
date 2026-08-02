# F05 — In-App Notification Center

> **✅ Shipped via OpenSpec change `f05-in-app-notifications` (2026-08-02).**
>
> The implemented shape is **Option C — flat top-level `notify*` schema fields + `notify_`-prefixed DB columns** (the 11-point What Changes in the OpenSpec `proposal.md` is the source of truth; the validation preface below is preserved as the historical 2026-07-13 audit context).
>
> **Validation status (2026-07-13): ⚠️ Outdated — F04 shipped the substrate; scope shrinks to extension**
>
> Supersedes the 2026-07-04 ✅ (which assumed F04 was unbuilt). F04 has landed (uncommitted) in this tree via migration `0010_clever_wilson_fisk.sql`, building most of this plan's foundation — but with a different shape than proposed, so several sections here are now stale.
>
> **Already shipped by F04 (verify before extending):**
> - `notifications` table (`packages/db/src/schema.ts:918-952`): `userId` (recipient, cascade delete), nullable `actorId` (acting user, `ON DELETE no action`), `type`, `referenceId`/`referenceType`, `metadata` (TEXT holding a JSON string — not typed columns), `readAt`, soft-delete `deletedAt`; indexes `(userId,createdAt)` and `(userId,readAt)`. Relations `NotificationRecipient`/`NotificationActor` (schema.ts:1349-1358).
> - API module `apps/api/src/modules/notification/` — the endpoints this plan lists as "defined in F04" all exist: `GET /` (paginated, `unreadOnly`), `GET /unread-count`, `PATCH /read-all`, `PATCH /:id/read`; mounted at `/api/v1/notifications`; `Notifications` OpenAPI tag; the service flattens the actor join to `actorUsername` (service.ts:31-44).
> - `mentionedInComment` boolean on `user_preferences` (schema.ts:107, default true); mention fan-out wired in `comment/service.ts` → `createMentionNotifications` (notification/service.ts:67), which gates BOTH the record and the email on the pref (service.ts:97) and skips the mention email for the recipe author (record still created, service.ts:109).
>
> **Schema deltas vs this plan's proposal (reconcile — the plan is stale here):**
> - `notificationTypeEnum` ships with **only `'mention'`** (schema.ts:904), not the 6-value enum this plan authors up front (mention/follow/like/comment/badge/system). Extending it is a Drizzle `ALTER TYPE … ADD VALUE` migration via `make db-generate`; note Postgres runs `ADD VALUE` outside a transaction and it is not reversible per value — add values as each type lands.
> - The 5 extra per-type boolean columns this plan proposes (`followNotifications`, `likeNotifications`, `commentNotifications`, `badgeNotifications`, `systemNotifications`) were **not** added. The existing gates are `newFollower`/`recipeLiked`/`recipeCommented`/`followedUserPosted` (email-only today) plus F04's `mentionedInComment` (gates both record and email). The free-form `metadata` JSON + the `actorUsername` join already support every per-type text pattern in the plan's rendering table — no typed columns needed.
>
> **Remaining F05 work:**
> 1. Extend `notificationTypeEnum` with `follow`/`like`/`comment` (and, if kept in scope, `badge`/`system`).
> 2. Add fan-out record creation beside the existing email call sites — none of which write notification records yet, except mentions: `follow/service.ts:40` (`notifyNewFollower`), the recipe-like path (`notifyRecipeLiked`), `comment/service.ts:93` (`notifyRecipeCommented` — a comment-author record, distinct from the mention record already created there), and optionally `notifyFollowersOfNewRecipe` (`utils/notify/index.ts:222`) and `badge/service.ts` awards. Note the plan's enum has no `followed_user_posted` type — the "followed user posted" fan-out has no matching notification type, so decide reuse-vs-add before wiring a record there.
> 3. **Decision — per-type in-app-vs-email split (in scope, unresolved):** prefs gate email only today; F04's `mentionedInComment` set the precedent of one flag gating both. Recommend reusing the existing email flags to also gate records (avoids column sprawl) rather than adding this plan's parallel `*Notifications` columns — but make this scope call explicit.
> 4. **UI substrate shipped with F04 (verified in tree).** The correction supersedes the earlier claim that no web UI existed. The notification bell, dropdown, item, `/notifications` list page, Navbar mounting (desktop + mobile), `notificationApi` client, SettingsPage toggle, and `notifications.*` i18n keys (en+tr, parity green) all landed with F04 — see `apps/web/src/components/layout/NotificationBell.tsx`, `NotificationDropdown.tsx`, `NotificationItem.tsx`, and `apps/web/src/pages/notifications/NotificationListPage.tsx`. `mentionedInComment` is likewise now surfaced end-to-end: shared `emailNotifications.mentionedInComment` (`schemas/user.ts`), `/preferences` PATCH flatten (`preference/index.ts`), `responses/preference.ts` field, and the SettingsPage toggle. So this plan's Frontend Components / router entry / settings scaffolding / i18n sections are **done**; the remaining F05 UI work is only **per-type `NotificationItem` icon/text rendering** for the new types and any **pagination/UX polish** (e.g. the All/Unread filter).
> - `/u/:username` route still confirmed (apps/web/src/router.tsx) for the follow/badge notification link targets.

## Overview

Expand beyond email-only notifications to a full in-app notification system. Users receive notifications for social actions (mentions, follows, likes, comments, badges) directly in the app. Provides a notification bell with unread count, a dropdown for quick access, and a full notification list page with filtering and mark-as-read functionality.

This feature depends on F04 (notification table and @mention notifications) and extends it to support all notification types.

## Goals

1. Display an in-app notification bell with real-time unread count
2. Show a dropdown with recent notifications for quick access
3. Provide a full notification list page with pagination
4. Support multiple notification types: mention, follow, like, comment, badge, system
5. Allow mark-as-read (individual and bulk)
6. Link each notification to its relevant entity
7. Provide a foundation for future real-time updates (WebSocket/polling)

## User Stories

| # | As a… | I want to… | So that… |
|---|-------|-----------|----------|
| US-1 | Authenticated user | See an unread count badge on the notification bell | I know I have new notifications |
| US-2 | Authenticated user | Click the bell to see recent notifications | I can quickly check what's new |
| US-3 | Authenticated user | Mark a notification as read | I can track what I've reviewed |
| US-4 | Authenticated user | Mark all notifications as read at once | I can clear my notification queue |
| US-5 | Authenticated user | View all notifications on a dedicated page | I can see my full notification history |
| US-6 | Authenticated user | Click a notification to navigate to the relevant entity | I can see the context of the notification |
| US-7 | Authenticated user | See different icons/styles for different notification types | I can quickly understand what happened |
| US-8 | Authenticated user | Receive a notification when someone follows me | I know who's interested in my recipes |
| US-9 | Authenticated user | Receive a notification when someone likes my recipe | I know who enjoys my work |
| US-10 | Authenticated user | Receive a notification when someone comments on my recipe | I can engage in discussions |
| US-11 | Authenticated user | Receive a notification when I earn a badge | I can celebrate my achievements |
| US-12 | Authenticated user | Control which notification types I receive via preferences | I can customise my experience |

## Technical Design

### Database Schema

**No new tables.** This feature uses the `notifications` table and `notificationTypeEnum` created in F04.

The existing schema supports all required notification types:

```ts
// From F04:
export const notificationTypeEnum = pgEnum('notification_type', [
  'mention',   // @username in comment
  'follow',    // new follower
  'like',      // recipe liked
  'comment',   // new comment on user's recipe
  'badge',     // badge earned
  'system',    // system-wide announcements
]);
```

### User Preferences Extension

Add additional notification preference fields to `userPreferences`:

```ts
// Additional fields on userPreferences table:
followNotifications: boolean('follow_notifications').notNull().default(true),
likeNotifications: boolean('like_notifications').notNull().default(true),
commentNotifications: boolean('comment_notifications').notNull().default(true),
badgeNotifications: boolean('badge_notifications').notNull().default(true),
systemNotifications: boolean('system_notifications').notNull().default(true),
```

Note: `mentionNotifications` is added in F04. The existing preferences already have `newFollower`, `recipeLiked`, `recipeCommented`, `followedUserPosted` — the new fields provide more granular control and map to the notification types.

### API Endpoints

All endpoints are defined in F04. This feature extends the service layer to handle additional notification types.

#### Notification Type Handlers

Each notification type has a creator function in `modules/notification/service.ts`:

```ts
/** Create a follow notification. */
export async function createFollowNotification(params: {
  followerId: string;
  followerUsername: string;
  followingId: string;
}) { /* ... */ }

/** Create a like notification. */
export async function createLikeNotification(params: {
  likerId: string;
  likerUsername: string;
  recipeAuthorId: string;
  recipeId: string;
  recipeSlug: string;
  recipeTitle: string;
}) { /* ... */ }

/** Create a comment notification. */
export async function createCommentNotification(params: {
  commenterId: string;
  commenterUsername: string;
  recipeAuthorId: string;
  recipeId: string;
  recipeSlug: string;
  recipeTitle: string;
}) { /* ... }

/** Create a badge notification. */
export async function createBadgeNotification(params: {
  userId: string;
  badgeId: string;
  badgeName: string;
}) { /* ... */ }

/** Create a system notification (admin only). */
export async function createSystemNotification(params: {
  userIds: string[]; // bulk create
  message: string;
  referenceId?: string;
  referenceType?: string;
}) { /* ... */ }
```

### Integration Points

Modify existing services to trigger notifications:

#### Follow Service (`modules/follow/service.ts`)

```ts
// After creating a follow relationship:
(async () => {
  await notificationService.createFollowNotification({
    followerId: userId,
    followerUsername: currentUser.username,
    followingId: targetUserId,
  });
  // Also trigger email notification
  await notifyNewFollower({ followingId: targetUserId, followerUsername: currentUser.username });
})().catch((err) => logger.error({ err }, 'createFollowNotification failed'));
```

#### Recipe Like (in `modules/recipe/service.ts` or model)

```ts
// After toggling a like ON:
(async () => {
  const recipe = await recipeModel.findById(recipeId);
  if (recipe && recipe.authorId !== userId) {
    await notificationService.createLikeNotification({
      likerId: userId,
      likerUsername: currentUser.username,
      recipeAuthorId: recipe.authorId,
      recipeId: recipe.id,
      recipeSlug: recipe.slug,
      recipeTitle: recipe.title,
    });
  }
})().catch((err) => logger.error({ err }, 'createLikeNotification failed'));
```

#### Comment Service (`modules/comment/service.ts`)

```ts
// Already handled in F04 for @mentions. Add comment notification for recipe author:
(async () => {
  if (recipe.authorId !== userId) {
    await notificationService.createCommentNotification({
      commenterId: userId,
      commenterUsername: currentUser.username,
      recipeAuthorId: recipe.authorId,
      recipeId: recipe.id,
      recipeSlug: recipe.slug,
      recipeTitle: recipe.title,
    });
  }
})().catch((err) => logger.error({ err }, 'createCommentNotification failed'));
```

#### Badge Service (`modules/badge/service.ts`)

```ts
// After awarding a badge:
(async () => {
  await notificationService.createBadgeNotification({
    userId,
    badgeId: badge.id,
    badgeName: badge.name,
  });
})().catch((err) => logger.error({ err }, 'createBadgeNotification failed'));
```

### Frontend Components

#### NotificationBell (`components/layout/NotificationBell.tsx`)

```tsx
// Location: apps/web/src/components/layout/NotificationBell.tsx
// Displays bell icon with unread count badge
// Fetches unread count on mount, refetches on window focus
// Click opens NotificationDropdown

import { useEffect, useState } from 'react';
import { api } from '../../api/client.ts';

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Fetch unread count
    api.get<{ count: number }>('/notifications/unread-count')
      .then((data) => setUnreadCount(data.count));

    // Refetch on window focus
    const handleFocus = () => {
      api.get<{ count: number }>('/notifications/unread-count')
        .then((data) => setUnreadCount(data.count));
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  return (
    <div className="relative">
      <button onClick={() => setIsOpen(!isOpen)} className="relative p-2">
        {/* Bell icon */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      {isOpen && <NotificationDropdown onClose={() => setIsOpen(false)} />}
    </div>
  );
}
```

#### NotificationDropdown (`components/layout/NotificationDropdown.tsx`)

```tsx
// Shows latest 10 notifications
// Each item has icon, text, timestamp, read/unread indicator
// "Mark all as read" button at top
// "View all" link at bottom
```

#### NotificationItem (`components/layout/NotificationItem.tsx`)

```tsx
// Renders a single notification with:
// - Type-specific icon (mention: @, follow: person, like: heart, comment: chat, badge: trophy, system: info)
// - Text content based on type
// - Relative timestamp (e.g., "2 hours ago")
// - Read/unread visual indicator (dot or background color)
// - Click handler to navigate to the linked entity
```

**Notification type rendering:**

| Type | Icon | Text Pattern | Links To |
|------|------|-------------|----------|
| `mention` | `@` | "Mentioned you in a comment on {recipeTitle}" | `/recipes/{slug}` |
| `follow` | Person icon | "{username} started following you" | `/u/{username}` |
| `like` | Heart icon | "{username} liked your recipe {recipeTitle}" | `/recipes/{slug}` |
| `comment` | Chat icon | "{username} commented on {recipeTitle}" | `/recipes/{slug}` |
| `badge` | Trophy icon | "You earned: {badgeName}" | `/u/{username}` (badges tab) |
| `system` | Info icon | "{message}" | Optional reference link |

#### NotificationListPage (`pages/notifications/NotificationListPage.tsx`)

```tsx
// Full-page notification list with:
// - Paginated notifications
// - Filter: All / Unread
// - Mark all as read button
// - Each item is clickable and marks as read on click
// - Empty state when no notifications
```

#### Router Changes

Add to `apps/web/src/router.tsx`:

```tsx
{
  path: 'notifications',
  element: <RequireAuth><NotificationListPage /></RequireAuth>,
},
```

### Real-Time Considerations

**Current approach (v1):** Polling on window focus + manual refresh
- Fetch unread count when the window gains focus
- Fetch unread count on mount
- User can refresh the page to see new notifications

**Future enhancement (v2):** Server-Sent Events (SSE) or WebSocket
- Push new notifications to the client in real-time
- Update unread count badge without polling
- This is explicitly out of scope for v1

### Internationalization

Add translation keys:

```json
{
  "notifications.title": "Notifications",
  "notifications.markAllRead": "Mark all as read",
  "notifications.viewAll": "View all",
  "notifications.empty": "No notifications yet",
  "notifications.unread": "Unread",
  "notifications.read": "Read",
  "notifications.mention": "Mentioned you in a comment on {recipeTitle}",
  "notifications.follow": "{username} started following you",
  "notifications.like": "{username} liked your recipe {recipeTitle}",
  "notifications.comment": "{username} commented on {recipeTitle}",
  "notifications.badge": "You earned: {badgeName}",
  "notifications.system": "{message}",
  "notifications.preferences.mention": "Mention notifications",
  "notifications.preferences.follow": "Follow notifications",
  "notifications.preferences.like": "Like notifications",
  "notifications.preferences.comment": "Comment notifications",
  "notifications.preferences.badge": "Badge notifications",
  "notifications.preferences.system": "System notifications"
}
```

## Acceptance Criteria

- [ ] Notification bell appears in the navbar for authenticated users
- [ ] Bell shows unread count badge (red dot with number, "99+" for >99)
- [ ] Clicking bell opens a dropdown with latest 10 notifications
- [ ] Dropdown shows "Mark all as read" button and "View all" link
- [ ] Each notification has a type-specific icon and text
- [ ] Clicking a notification navigates to the relevant entity and marks it as read
- [ ] NotificationListPage shows all notifications with pagination
- [ ] NotificationListPage has "All" / "Unread" filter
- [ ] Mark-as-read works for individual notifications (PATCH /notifications/:id/read)
- [ ] Mark-all-as-read works (PATCH /notifications/read-all)
- [ ] Notifications are created for: mentions (F04), follows, likes, comments, badges
- [ ] System notifications can be created by admins (future use, endpoint available)
- [ ] User can control notification types via preferences (settings page)
- [ ] Unread count refetches on window focus
- [ ] Empty state shows when user has no notifications
- [ ] All queries use soft-delete pattern (`isNull(deletedAt)`)
- [ ] Type-check passes (`make check`)
- [ ] Lint passes (`make lint`)
- [ ] Tests pass (`make test`)

## Implementation Steps

1. Ensure F04 (notification table, mention notifications) is complete
2. Add additional preference fields to `userPreferences` in `packages/db/src/schema.ts`
3. Run `make db-generate` to create migration for new preference fields
4. Run `make db-migrate` to apply migration
5. Extend `modules/notification/service.ts` with handlers for all notification types (follow, like, comment, badge, system)
6. Extend `modules/notification/model.ts` if needed for additional queries
7. Add notification creation calls to:
   - `modules/follow/service.ts` (follow notification)
   - `modules/recipe/model.ts` or service (like notification)
   - `modules/comment/service.ts` (comment notification)
   - `modules/badge/service.ts` (badge notification)
8. Create frontend components: `NotificationBell.tsx`, `NotificationDropdown.tsx`, `NotificationItem.tsx`
9. Create `NotificationListPage.tsx`
10. Add notification bell to navbar (`components/layout/`)
11. Add routes to `apps/web/src/router.tsx`
12. Add notification preferences to SettingsPage
13. Add i18n translation keys
14. Write tests for all notification type handlers and API endpoints
15. Run `make check && make lint && make test`

## Dependencies

- F04 (@Mention Notifications) — notification table, notificationTypeEnum, mention notification flow
- `users` table (existing)
- `userPreferences` table (existing, extended in F04 and F05)
- `recipes` table (existing — for like/comment notification context)
- `userFollows` table (existing — for follow notifications)
- `userBadges` / `badges` tables (existing — for badge notifications)
- Existing email notification infrastructure (`utils/notify/index.ts`)
- Existing navbar component
