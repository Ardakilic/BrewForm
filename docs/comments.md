# Comments

This document describes the comment system in BrewForm: its threading model, depth rules,
reply-flattening behaviour, and admin moderation capabilities.

## Comment Threading Model

Comments in BrewForm follow a parent–child model backed by the `parentCommentId` column on the
`comments` table.

| Column            | Type        | Notes                                      |
| ----------------- | ----------- | ------------------------------------------ |
| `id`              | `varchar(36)` | UUID, primary key                        |
| `recipeId`        | `varchar(36)` | FK → recipes.id                          |
| `authorId`        | `varchar(36)` | FK → users.id                            |
| `content`         | `text`        | 1–5000 chars (`CommentCreateSchema`), stored after `sanitizeText` |
| `parentCommentId` | `varchar(36)` | Nullable FK → comments.id                |
| `createdAt`       | `timestamptz` |                                          |
| `updatedAt`       | `timestamptz` |                                          |
| `deletedAt`       | `timestamptz` | Nullable; soft-delete sentinel           |

A **Top_Level_Comment** has `parentCommentId IS NULL`. A **Reply** has a non-null `parentCommentId`
that references a Top_Level_Comment.

Commenting requires a signed-in user with a verified email (`403 EMAIL_NOT_VERIFIED` otherwise)
on a recipe the caller can view: listing and creating comments on a draft or private recipe of
another author answers `404`, exactly like a missing recipe (`canViewRecipe`; admins may view
every recipe). Creating a comment is rate limited to 5 per minute per client IP and 5 per minute
per user (`commentIp` and `commentUser` policies).

Any such user may post a top-level comment. Posting a reply (a comment with a
`parentCommentId`) requires the caller to be **one of**:

- The **recipe owner** (the user whose `id` matches the recipe's `authorId`)
- An **admin** (a user with `isAdmin: true`)

Everyone else gets `403 FORBIDDEN` ("Only the recipe author can reply to comments"), including
the author of the top-level comment. The web Reply button is also shown to the top-level
comment's author (see [Reply-on-Reply UX](#reply-on-reply-ux)), so for them the API rejects the
reply.

## One-Level Depth Rule

The threading model is intentionally limited to **one level of nesting**. Replies to replies are
not stored as deeper children; instead they are flattened to the top-level parent (see
[Reply-Flattening Behaviour](#reply-flattening-behaviour) below).

`Comment_Service.createComment` enforces this rule before persisting:

1. It looks up the target comment via `model.findById(parentCommentId)`.
2. If the target comment is itself a Top_Level_Comment (`parentCommentId IS NULL`), the new reply
   is stored with that comment's `id` as its `parentCommentId` — no flattening needed.
3. If the target comment is a Reply (has a non-null `parentCommentId`), the service traverses the
   chain upward to find the Top_Level_Comment and uses its `id` as the effective `parentCommentId`.

This guarantees that every persisted comment is either a Top_Level_Comment or a direct child of
one — never deeper.

## Reply-Flattening Behaviour

A reply stays inside its recipe's thread: a `parentCommentId` whose comment belongs to another
recipe is answered exactly like a missing parent (404 `COMMENT_NOT_FOUND`, "Parent comment not
found"), before any write or side effect. The same check runs on the Top_Level_Comment that the
flattening below resolves, so a chain stored under another recipe before this rule is rejected
too, and the list only loads replies stored under the listed recipe.

When a caller provides a `parentCommentId` that references a Reply rather than a Top_Level_Comment,
`Comment_Service.createComment` applies the following flattening algorithm:

1. Store the directly targeted comment as `directTarget` (used for the mention prefix).
2. Traverse the `parentCommentId` chain upward, incrementing a hop counter on each step.
3. If the hop counter exceeds **100**, throw `COMMENT_DEPTH_EXCEEDED` (guards against cycles or
   unexpectedly deep chains in malformed data).
4. Stop when a comment with `parentCommentId IS NULL` is reached — this is the Top_Level_Comment.
5. Use the Top_Level_Comment's `id` as the effective `parentCommentId` for the new comment.
6. Prepend the **Mention_Prefix** to the submitted content before persisting.

### Mention_Prefix Format

The Mention_Prefix is a string of the form:

```
@username 
```

Specifically: the `@` character, followed by the `username` of the **directly targeted Reply's
author** (not the Top_Level_Comment's author), followed by a single space. This prefix is
prepended to the caller's original content before the comment is stored.

Example: if a user replies to a comment authored by `alice`, the stored content becomes:

```
@alice <original content>
```

If the directly targeted comment's author has no username, or the account was deleted (the author
comes back as `null`), the prefix is omitted and the content is stored as-is.

## Admin Moderation Capabilities

Admins (users whose `isAdmin` flag is set; `authMiddleware` puts the user on the request context)
have elevated permissions in the comment system beyond those of regular users.

### Admin Reply

An admin may reply to **any comment on any recipe**, regardless of whether they are the recipe
owner. The `isAdmin` flag is extracted from the authenticated session in `Comment_Router` and
forwarded to `Comment_Service.createComment` as the fourth argument:

```typescript
export async function createComment(
  userId: string,
  recipeId: string,
  content: string,
  isAdmin: boolean,
  parentCommentId?: string,
): Promise<typeof comment>
```

Authorization logic when `parentCommentId` is set:

| `isAdmin` | `isRecipeOwner` | Outcome           |
| --------- | --------------- | ----------------- |
| `true`    | any             | ✅ Reply created   |
| any       | `true`          | ✅ Reply created   |
| `false`   | `false`         | ❌ `FORBIDDEN`     |

Top-level comments (no `parentCommentId`) are unrestricted by role — any verified user who can
view the recipe may post them.

### Admin Delete

An admin may delete **any comment**, regardless of authorship. Deletion is a soft-delete: the
`deletedAt` timestamp is set to the current time rather than removing the row. Deleting a
top-level comment also soft-deletes its live replies, and the recipe's `commentCount` drops by the
number of comments removed (1 plus those replies); deleting a reply removes one. The counter
changes only when this request's own soft delete changed the row, so two concurrent deletes of one
comment lower it once (the second answers 404). Soft-deleted comments are excluded from all
subsequent read and listing responses. Authors and admins go through the same function.

The `isAdmin` flag is forwarded to `Comment_Service.deleteComment`:

```typescript
export async function deleteComment(
  userId: string,
  id: string,
  isAdmin: boolean,
): Promise<void>
```

Authorization logic:

| `isAdmin` | `isAuthor` | Outcome           |
| --------- | ---------- | ----------------- |
| `true`    | `true`     | ✅ Soft deleted    |
| `true`    | `false`    | ✅ Soft deleted    |
| `false`   | `true`     | ✅ Soft deleted    |
| `false`   | `false`    | ❌ `FORBIDDEN`     |

If the target comment does not exist or has already been soft-deleted, the service throws
`COMMENT_NOT_FOUND` (answered as `404 NOT_FOUND`) for both admin and non-admin callers.

## Stored Comment Count

`recipe.commentCount` (shown on recipe cards and the detail page) counts the recipe's live comments
that are top-level or reply to a live comment on the same recipe. Comments of deleted accounts
count (they stay listed), and so do replies past the 20-reply display cap (they stay stored). A
live reply whose parent was deleted before the thread delete existed, or a reply stored under
another recipe's comment, does not count. Creating a comment adds 1; deleting one subtracts the
comments that delete removed.

Every migration run repairs drifted values: the API image entrypoint runs
`node /app/packages/db/src/recount-comment-counts.ts` right after `Migrations complete.` (a failure
only prints a warning, and the next start retries), and `make db-migrate` runs it after the
migrator. In development, `make db-recount-comments` runs it alone. It prints one line per
repaired recipe (`Comment count recount: repaired recipe <id> (<stored> -> <counted>)`) and a final
`Comment count recount: complete (scanned …, repaired …, skipped …)`; a second run reports
`repaired 0`. Repairs use a compare-and-set update, so a counter that changed during the run is
skipped and repaired by the next run.

## Reply-on-Reply UX

The UI renders a **Reply** button on each reply as well as on each top-level comment. Clicking
Reply on a reply opens the reply form on the **parent top-level comment** (because the backend
enforces one-level threading) and pre-fills the textarea with `@username ` — the username of the
reply's author — so the conversation context is preserved.

The Reply button (`canReplyToComment` in `CommentSection.tsx`) is shown to:

- The **recipe owner**
- An **admin**
- The **author of the top-level comment**

The third case does not match the API, which accepts replies only from the recipe owner and
admins: a top-level comment's author who is neither sees the button but gets `403 FORBIDDEN`.

## Comment Body Formatting

Comment and reply bodies support a limited subset of inline Markdown to keep the UI readable
without enabling arbitrary HTML injection. Only the following tokens are parsed:

| Syntax          | Renders as  | Example input       | Example output  |
| --------------- | ----------- | ------------------- | --------------- |
| `**text**`      | **bold**    | `**great shot**`    | **great shot**  |
| `*text*`        | *italic*    | `*nice*`            | *nice*          |
| `__text__`      | underline   | `__important__`     | <u>important</u> |
| `_text_`        | *italic*    | `_nice_`            | *nice*          |

All other Markdown syntax (headings, links, code blocks, lists, images, etc.) is rendered as plain
text. HTML tags in comment content are never interpreted — they are displayed as literal characters.

The parsing is performed client-side by `renderInlineMarkdown()` in
`apps/web/src/components/recipe/CommentSection.tsx`. The backend stores and returns the raw
Markdown source; rendering is purely a display concern.

## Errors

| Service error            | Response                     | Condition                                                                 |
| ------------------------ | ---------------------------- | ------------------------------------------------------------------------- |
| `RECIPE_NOT_FOUND`       | 404 `NOT_FOUND`              | The recipe does not exist or the caller cannot view it (create and list)  |
| `COMMENT_NOT_FOUND`      | 404 `NOT_FOUND`              | `findById` returns `null` for `parentCommentId` or `id`, the parent (or its resolved top-level comment) is on another recipe, or a concurrent delete won |
| `FORBIDDEN`              | 403 `FORBIDDEN`              | Non-admin, non-recipe-owner attempts to reply; non-admin, non-author attempts to delete |
| `COMMENT_DEPTH_EXCEEDED` | 400 `BAD_REQUEST`            | `parentCommentId` chain exceeds 100 hops without reaching a Top_Level_Comment |
| —                        | 403 `EMAIL_NOT_VERIFIED`     | The caller's email is not verified (create)                               |
| —                        | 429 `RATE_LIMITED`           | More than 5 comments per minute from one client IP or one user            |

## API Reference

| Method   | Endpoint                              | Description                                      |
| -------- | ------------------------------------- | ------------------------------------------------ |
| `POST`   | `/api/v1/comments/recipe/:recipeId`   | Create a top-level comment or a reply. Requires authentication and a verified email. Pass `parentCommentId` in the request body to create a reply. |
| `GET`    | `/api/v1/comments/recipe/:recipeId`   | List top-level comments for a recipe (newest first), each with at most 20 replies (oldest first) nested under a `replies` array and `hasMoreReplies` (true when the comment has more; the web shows "Showing the first 20 replies."). Supports `page` and `perPage` query parameters. Anonymous callers allowed. An author whose account was deleted is `null` (the comment stays listed and counted). |
| `DELETE` | `/api/v1/comments/:id`                | Soft-delete a comment. The caller must be the comment's author or an admin. Deleting a top-level comment also soft-deletes its replies, and `commentCount` drops by the number of comments removed. |

Full request and response shapes are in the generated [api-reference.md](api-reference.md).

## Notifications

A new comment notifies the recipe author (an in-app `comment` notification plus the
recipe-commented email, both gated by the author's `notifyRecipeCommented` preference; no
notification for the author's own comments). `@username` mentions in the stored content
(including an auto-prepended Mention_Prefix) notify each mentioned user except the commenter
(in-app `mention` notification plus email, gated by `notifyMentionedInComment`; a mentioned
recipe author gets the in-app record but no second email). Both run after the comment is saved
and never fail the request. See [notifications.md](notifications.md).
