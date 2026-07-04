# F04 — @Mention Notifications

> **Validation status (2026-07-04): ✅ Valid**
>
> - Must land before F05 (F05 consumes the notifications table + module created here).
> - Comment @mention auto-prepend already exists with no notification sent (apps/api/src/routes/comment/service.ts:5,18,68) — plan is genuinely additive; `mentionNotifications` pref column is a clean add.
> - `getRecipeForNotification` / `getCommenterById` are NEW model functions to add — comment/model.ts (:157) currently only has a commenter helper.

## Overview

When a comment contains `@username`, send an in-app notification to the mentioned user. This builds the foundation for the notification system (F05 expands it into a full notification center). Notifications are created on comment creation, with optional email delivery based on user preferences.

## Goals

1. Parse `@username` mentions in comment content
2. Create notification records for each mentioned user
3. Respect user notification preferences (opt-out for mentions)
4. Optionally send email notifications for mentions
5. Provide API endpoints to fetch and manage notifications
6. Lay the groundwork for the full notification center (F05)

## User Stories

| # | As a… | I want to… | So that… |
|---|-------|-----------|----------|
| US-1 | Authenticated user | Mention someone in a comment using @username | I can draw their attention to my comment |
| US-2 | Mentioned user | Receive a notification when someone mentions me | I can respond to discussions about my recipes |
| US-3 | Mentioned user | See notification details (who mentioned me, in which recipe) | I can understand the context |
| US-4 | Mentioned user | Opt out of mention notifications | I can control what notifications I receive |
| US-5 | Mentioned user | Receive an email notification for mentions (if enabled) | I can stay informed even when not on the site |
| US-6 | Authenticated user | Mark a notification as read | I can track what I've seen |
| US-7 | Authenticated user | Mark all notifications as read | I can clear my notification queue quickly |

## Technical Design

### Database Schema (Drizzle ORM)

Add to `packages/db/src/schema.ts`:

```ts
export const notificationTypeEnum = pgEnum('notification_type', [
  'mention',
  'follow',
  'like',
  'comment',
  'badge',
  'system',
]);

export const notifications = pgTable(
  'notification',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
    type: notificationTypeEnum('type').notNull(),
    referenceId: varchar('reference_id', { length: 36 }), // ID of the related entity
    referenceType: varchar('reference_type', { length: 50 }), // 'recipe', 'comment', 'user', 'badge'
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('notification_user_id_idx').on(table.userId),
    index('notification_user_id_read_at_idx').on(table.userId, table.readAt),
    index('notification_user_id_created_at_idx').on(table.userId, table.createdAt),
    index('notification_type_idx').on(table.type),
    index('notification_deleted_at_idx').on(table.deletedAt),
  ],
);
```

**Relations to add:**

```ts
export const usersRelations = relations(users, ({ one, many }) => ({
  // ... existing relations
  notifications: many(notifications),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));
```

### Migration

Run `make db-generate` to produce the SQL migration. **Never write manual SQL.**

### User Preferences Extension

Add a new field to the existing `userPreferences` table:

```ts
// In the existing userPreferences table definition, add:
mentionNotifications: boolean('mention_notifications').notNull().default(true),
```

### Shared Schemas

Add `packages/shared/src/schemas/notification.ts`:

```ts
import { z } from 'zod';

export const NotificationMarkReadSchema = z.object({
  id: z.uuid(),
});

export const NotificationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
  unreadOnly: z.coerce.boolean().default(false),
});
```

Export from `packages/shared/src/schemas/index.ts`.

### API Module: `modules/notification/`

#### `model.ts`

```ts
import { db } from '@brewform/db';
import { notifications, users, userPreferences } from '@brewform/db/schema';
import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';

export async function findById(id: string) { /* ... */ }
export async function findByUserId(userId: string, page: number, perPage: number, unreadOnly?: boolean) { /* ... */ }
export async function create(data: typeof notifications.$inferInsert) { /* ... */ }
export async function markAsRead(id: string) { /* ... */ }
export async function markAllAsRead(userId: string) { /* ... */ }
export async function getUnreadCount(userId: string) { /* ... */ }
export async function softDelete(id: string) { /* ... */ }
```

#### `service.ts`

```ts
import * as model from './model.ts';
import { createLogger } from '../../utils/logger/index.ts';

const logger = createLogger('notification-service');

/** Parse @mentions from comment content and create notifications. */
export async function createMentionNotifications(params: {
  mentions: string[]; // usernames mentioned
  commentId: string;
  recipeId: string;
  recipeSlug: string;
  recipeTitle: string;
  mentionerUsername: string;
}) {
  // 1. Look up mentioned users by username
  // 2. Filter out self-mentions
  // 3. Check each user's mentionNotifications preference
  // 4. Create notification records for opted-in users
  // 5. Optionally send email notifications (fire-and-forget)
}

/** List notifications for a user (paginated). */
export async function listNotifications(userId: string, page: number, perPage: number, unreadOnly?: boolean) { /* ... */ }

/** Mark a single notification as read (owner only). */
export async function markAsRead(userId: string, notificationId: string) { /* ... */ }

/** Mark all notifications as read for a user. */
export async function markAllAsRead(userId: string) { /* ... */ }

/** Get unread notification count. */
export async function getUnreadCount(userId: string) { /* ... */ }
```

#### `index.ts` (Hono Routes)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/notifications` | Required | List user's notifications (paginated, optional unreadOnly filter) |
| `GET` | `/notifications/unread-count` | Required | Get count of unread notifications |
| `PATCH` | `/notifications/:id/read` | Required | Mark a notification as read |
| `PATCH` | `/notifications/read-all` | Required | Mark all notifications as read |

```ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { PaginationSchema } from '@brewform/shared/schemas';
import { authMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { error, paginated, success } from '../../utils/response/index.ts';
import type { AppEnv } from '../../types/hono.ts';

const notification = new Hono<AppEnv>();

notification.get('/', authMiddleware, async (c) => { /* ... */ });
notification.get('/unread-count', authMiddleware, async (c) => { /* ... */ });
notification.patch('/:id/read', authMiddleware, async (c) => { /* ... */ });
notification.patch('/read-all', authMiddleware, async (c) => { /* ... */ });

export default notification;
```

Register in `apps/api/src/routes/index.ts`:

```ts
import notification from '../modules/notification/index.ts';
routes.route('/api/v1/notifications', notification);
```

### Integration with Comment Creation

Modify `apps/api/src/modules/comment/service.ts` to parse mentions and create notifications:

```ts
// In createComment(), after creating the comment:
(async () => {
  // Parse @mentions from effectiveContent
  const mentionRegex = /@(\w+)/g;
  const mentions: string[] = [];
  let match;
  while ((match = mentionRegex.exec(effectiveContent)) !== null) {
    mentions.push(match[1]);
  }

  if (mentions.length > 0) {
    const recipe = await model.getRecipeForNotification(recipeId);
    const commenter = await model.getCommenterById(userId);
    if (recipe && commenter?.username) {
      await notificationService.createMentionNotifications({
        mentions,
        commentId: comment.id,
        recipeId: recipe.id,
        recipeSlug: recipe.slug,
        recipeTitle: recipe.title,
        mentionerUsername: commenter.username,
      });
    }
  }
})().catch((err) => logger.error({ err }, 'createMentionNotifications failed'));
```

### Frontend Components

#### New Components

| Component | Location | Description |
|-----------|----------|-------------|
| `NotificationBell` | `components/layout/NotificationBell.tsx` | Bell icon in navbar with unread count badge |
| `NotificationDropdown` | `components/layout/NotificationDropdown.tsx` | Dropdown showing recent notifications (first 10) |
| `NotificationItem` | `components/layout/NotificationItem.tsx` | Single notification row (icon, text, timestamp, read/unread indicator) |
| `NotificationListPage` | `pages/notifications/NotificationListPage.tsx` | Full-page notification list with pagination |

#### Navbar Integration

Add `NotificationBell` to the navbar component (`apps/web/src/components/layout/`):

```tsx
// In the navbar, alongside the user menu:
<NotificationBell />
```

The bell fetches `GET /notifications/unread-count` on mount and polls every 30 seconds (or uses a simpler approach: refetch on window focus).

#### Notification Dropdown

When the bell is clicked, show a dropdown with:
- Latest 10 notifications
- "Mark all as read" button
- "View all" link to NotificationListPage

#### Notification Item Rendering

Each notification type renders differently:

```tsx
// mention: "Mentioned you in a comment on {recipeTitle}"
// follow: "Started following you"
// like: "Liked your recipe {recipeTitle}"
// comment: "Commented on your recipe {recipeTitle}"
// badge: "Earned badge: {badgeName}"
// system: "{message}"
```

#### Router Changes

Add to `apps/web/src/router.tsx`:

```tsx
{
  path: 'notifications',
  element: <RequireAuth><NotificationListPage /></RequireAuth>,
},
```

## Acceptance Criteria

- [ ] Creating a comment with @username creates a notification for the mentioned user
- [ ] Self-mentions are not create notifications
- [ ] Users who opted out of mention notifications do not receive them
- [ ] Notification records are created with correct type, referenceId, and referenceType
- [ ] `GET /notifications` returns paginated notifications for the authenticated user
- [ ] `GET /notifications/unread-count` returns the count of unread notifications
- [ ] `PATCH /notifications/:id/read` marks a notification as read (owner only)
- [ ] `PATCH /notifications/read-all` marks all notifications as read
- [ ] NotificationBell shows unread count badge in navbar
- [ ] NotificationDropdown shows recent notifications with mark-all-as-read
- [ ] NotificationListPage shows full notification history with pagination
- [ ] Notifications link to the relevant entity (recipe page, user profile, etc.)
- [ ] Email notifications for mentions are sent when preference is enabled
- [ ] All queries use soft-delete pattern (`isNull(deletedAt)`)
- [ ] Type-check passes (`make check`)
- [ ] Lint passes (`make lint`)
- [ ] Tests pass (`make test`)

## Implementation Steps

1. Add Drizzle schema changes (`notifications` table, `notificationTypeEnum`, relations) to `packages/db/src/schema.ts`
2. Add `mentionNotifications` field to `userPreferences` table in schema
3. Run `make db-generate` to create migration
4. Run `make db-migrate` to apply migration
5. Add Zod schemas to `packages/shared/src/schemas/notification.ts` and export from `index.ts`
6. Create `apps/api/src/modules/notification/model.ts` — data-access functions
7. Create `apps/api/src/modules/notification/service.ts` — business logic including mention parsing
8. Create `apps/api/src/modules/notification/index.ts` — Hono route handlers
9. Register route in `apps/api/src/routes/index.ts`
10. Modify `apps/api/src/modules/comment/service.ts` to parse mentions and trigger notification creation
11. Add `mentionNotifications` to user preferences schema and frontend settings page
12. Create frontend components: `NotificationBell.tsx`, `NotificationDropdown.tsx`, `NotificationItem.tsx`
13. Create `NotificationListPage.tsx`
14. Add notification bell to navbar
15. Add routes to `apps/web/src/router.tsx`
16. Add i18n translation keys
17. Write tests for mention parsing, notification creation, and API endpoints
18. Run `make check && make lint && make test`

## Dependencies

- `comments` table (existing — for referenceId)
- `recipes` table (existing — for notification context)
- `users` table (existing — for mention resolution)
- `userPreferences` table (existing — for notification opt-out)
- Existing comment creation flow (`modules/comment/service.ts`)
- Existing email notification infrastructure (`utils/notify/index.ts`)
