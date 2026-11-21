# Notifications

BrewForm notifies users through two channels:

- **In-app**: a row in the `notification` table, shown by the navbar bell and the `/notifications`
  page (F05).
- **Email**: sent through a single SMTP transport (Mailpit in development, the SMTP host configured
  by the `SMTP_*` env vars in production).

Social events use both channels. Account emails (verification, password reset, welcome) are email
only. For the delivery rationale see [ADR-011](decisions.md) (fire-and-forget delivery).

## Categories

| Category | Triggered when | In-app record (`type`) | Email template | Preference flag |
| --- | --- | --- | --- | --- |
| New follower | `follow.followUser` succeeds | `follow` | `new-follower.mjml` | `notifyNewFollower` |
| Recipe liked | `recipe.toggleLike` flips to liked and the liker is not the author | `like` | `recipe-liked.mjml` | `notifyRecipeLiked` |
| Recipe commented | `comment.createComment` succeeds and the commenter is not the author | `comment` | `recipe-commented.mjml` | `notifyRecipeCommented` |
| Mentioned in a comment | a new comment contains `@username` (F04) | `mention` | `mentioned-in-comment.mjml` | `notifyMentionedInComment` |
| Followed user posted | `recipe.createRecipe` succeeds with `visibility: 'public'` | — (email only) | `followed-user-posted.mjml` | `notifyFollowedUserPosted` |
| Email verification | registration, or `POST /auth/send-verification` | — | `verify-email.mjml` | always sent |
| Password reset | `POST /auth/forgot-password` for an existing account | — | `reset-password.mjml` | always sent |
| Welcome | an admin creates a user (`adminCreateUser`) | — | `welcome.mjml` | always sent |

The flat `notify*` flags are columns on `user_preferences` (`packages/db/src/schema.ts`), all
defaulting to `true`, and the same names are used in the shared preference schemas and the
Settings page (`settings.notif.*` i18n keys). A user without a preferences row counts as opted in.

**One flag gates both channels.** The creators in `apps/api/src/modules/notification/service.ts`
(`createFollowNotification`, `createLikeNotification`, `createCommentNotification`,
`createMentionNotifications`) load the recipient's preferences once: an opted-out recipient gets
neither the in-app record nor the email. Each creator is the **sole owner** of its email; callers
must not also call the matching `notify*` helper in `apps/api/src/utils/notify/index.ts`, which
would double-send and bypass the gate. The email helpers re-check the same flag.

## Trigger rules

- **Follow, like, comment**: never for a self-action (self-follow, liking or commenting on your own
  recipe). A like notifies only on the new-like transition, never on un-like.
- **Comment and mention on the same comment**: both run. The recipe author gets the `comment`
  notification ("X commented on your recipe") and each mentioned user gets a `mention`. A mentioned
  recipe author gets the `mention` record but no mention email, because the recipe-commented email
  already covers that comment.
- **New public recipe**: only `createRecipe` fans out. A later visibility change through `PATCH`
  (for example draft → public) and a fork (always created as a draft) do not notify.
- **All emails**: skipped when `APP_ENV=test`. The transport is never called and one
  `delivery: 'skipped'` info line is logged per send. In-app records are still written.

### @mention rules (F04)

Mentions are parsed by `parseMentions` (`packages/shared/src/utils/mention.ts`) from the
sanitized comment body, after the reply prefix is added:

- A username is 3–30 characters of `[a-zA-Z0-9_-]` (the registration rule). The `@` must start the
  text or follow a non-username character, so `a@bcd` (email-like text) is not a mention, and a
  run longer than 30 characters produces no match at all.
- Mentions are de-duplicated case-insensitively and capped at 10 (`MAX_MENTIONS`) per comment.
- Replying to a nested reply prepends `@<author of the reply>`, so that author is mentioned.
- Targets are resolved case-insensitively (`lower(username)`) among active users: soft-deleted
  and banned users are skipped, and so are self-mentions.
- The record references the comment (`referenceType: 'comment'`) with
  `{ recipeSlug, recipeTitle }` metadata.
- Mentions only run after the comment is created, which requires the recipe to be viewable by the
  commenter, so a mention cannot reveal a recipe the commenter cannot see.

## The `notification` table

`notifications` in `packages/db/src/schema.ts` (table `notification`), a soft-deletable entity:

| Column | Meaning |
| --- | --- |
| `userId` | Recipient (cascades on user hard-delete) |
| `actorId` | User who triggered it; `set null` when the actor is deleted |
| `type` | `notification_type` enum: `mention`, `follow`, `like`, `comment` |
| `referenceId` / `referenceType` | Related entity: the comment (`comment`), the recipe (`recipe`) or the actor (`actor`) |
| `metadata` | JSON string: `{ recipeSlug, recipeTitle }` or `{ followerUsername }` |
| `readAt` | `NULL` while unread |

Indexes serve the feed (`userId, createdAt`) and the unread count (`userId, readAt`).

## API

All routes are under `/api/v1/notifications` and require authentication. A user only ever sees
their own notifications.

| Method and path | Purpose |
| --- | --- |
| `GET /` | Paginated feed, newest first (`page`, `perPage` ≤ 100, `unreadOnly`) |
| `GET /unread-count` | `{ count }` of unread notifications |
| `PATCH /read-all` | Mark every unread notification read |
| `PATCH /:id/read` | Mark one notification read; idempotent, 404 if missing, 403 if it belongs to someone else |

Request and response shapes are in the generated [API reference](api-reference.md).

## Web UI

- **Bell** (`apps/web/src/components/layout/NotificationBell.tsx`): unread badge (hidden at 0,
  capped at "9+"), loaded with a fetcher from the `resources/notifications/unread-count` resource
  route on mount, on window focus and on the `brewform:notifications-changed` window event. There
  is no polling.
- **Dropdown** (`NotificationDropdown.tsx`): the 10 most recent notifications, "mark all read" and
  a link to the full page.
- **List page** (`/notifications`, `pages/notifications/NotificationListPage.tsx`): all or unread
  only, paginated.
- **Item** (`NotificationItem.tsx`): text from the `notifications.<type>` i18n keys with the actor
  and recipe title interpolated. Clicking marks it read and opens the recipe when the metadata has a
  `recipeSlug`. Marking read goes through the `resources/notifications/:id/read` and
  `resources/notifications/read-all` actions, which dispatch `brewform:notifications-changed` so the
  badge refreshes.

## Delivery model

```
service action (e.g. follow created)
  │
  ├─ DB write (awaited, part of the response)
  │
  └─ createXxxNotification(...).catch(log)    (not awaited)
        ├─ load recipient + preferences; stop if opted out
        ├─ insert the in-app record    (failure logged, email still attempted)
        └─ send the email              (failure logged, never thrown)
```

The side effect is not awaited, so a slow or failing SMTP server, or a failed insert, never slows or
fails the social action. Failures are logged with the ids involved. If drop rates become meaningful
in production, the next step is a queue with retries (see the ADR-011 trade-offs).

`notifyFollowersOfNewRecipe` sends to all followers in batches of 5.

## Templates

MJML sources live in `apps/api/src/templates/email/`. `make email-build` (`pnpm run email-build`)
compiles them into TypeScript modules under `templates/email/generated/`, which the API imports;
run it before starting the API. Variables use `{{variable}}` placeholders, substituted with
HTML-escaped values by `renderTemplate`.

Every notification template receives:

| Variable | Description |
| --- | --- |
| `{{app_name}}` | Always `BrewForm` |
| `{{username}}` | The recipient's username |

Action-specific variables (for example `{{recipe_title}}`, `{{recipe_url}}`,
`{{follower_username}}`) are listed in each template. Links are built from `PUBLIC_APP_URL` (see
`appBaseUrl()`).

## Local testing

In development, Mailpit captures every outgoing email at `http://localhost:8025`:

1. `make up`, then `make dev`.
2. Trigger a social action (follow another user, like or comment on a recipe, mention someone).
3. Check the bell for the in-app record and `http://localhost:8025` for the email.

## Adding a notification type

1. **Enum**: add the value to `notificationTypeEnum` in `packages/db/src/schema.ts` and run
   `make db-generate && make db-migrate` (`ALTER TYPE … ADD VALUE` cannot be reverted).
   `NotificationOutputSchema` in `@brewform/shared` types `type` as a plain string, so it needs no
   change.
2. **Preference**: add a `notify<Event>` boolean column (default `true`) to `user_preferences`, then
   the field to the shared preference schemas and types, the preference API and a toggle on the
   Settings page.
3. **Both channels**: add an MJML template plus a `notify<Event>` email helper in
   `utils/notify/index.ts`, and a `create<Event>Notification` creator in the notification service
   that checks the flag once, writes the record and sends the email (the sole owner of that email).
   Call it fire-and-forget from the originating service.
4. **i18n**: add `notifications.<type>` (item text) and `settings.notif.<event>` (preference label)
   to BOTH `packages/shared/src/i18n/en.json` and `tr.json`, and render the new type in
   `NotificationItem.tsx`.
5. **Tests**: service tests for opt-out (no record, no email), self-action skip and failure
   isolation; a component test for the new item text; entry/exit debug logs with ids only.
