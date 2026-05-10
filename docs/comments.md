# Comments

This document describes the comment system in BrewForm: its threading model, depth rules,
reply-flattening behaviour, and admin moderation capabilities.

## Comment Threading Model

Comments in BrewForm follow a parent–child model backed by the `parentCommentId` column on the
`comments` table.

| Column            | Type        | Notes                                      |
| ----------------- | ----------- | ------------------------------------------ |
| `id`              | `text`      | UUID, primary key                          |
| `recipeId`        | `text`      | FK → recipes.id                            |
| `authorId`        | `text`      | FK → users.id                              |
| `content`         | `text`      | 1–5000 chars (validated by Zod schema)     |
| `parentCommentId` | `text`      | Nullable FK → comments.id                  |
| `createdAt`       | `timestamp` |                                            |
| `updatedAt`       | `timestamp` |                                            |
| `deletedAt`       | `timestamp` | Nullable; soft-delete sentinel             |

A **Top_Level_Comment** has `parentCommentId IS NULL`. A **Reply** has a non-null `parentCommentId`
that references a Top_Level_Comment.

Any authenticated user may post a top-level comment on a recipe. Posting a reply (a comment with a
`parentCommentId`) requires the caller to be **one of**:

- The **recipe owner** (the user whose `id` matches the recipe's `authorId`)
- An **admin** (a user with `isAdmin: true`)
- The **author of the top-level comment** being replied to

This means a commenter can always reply within their own thread, while recipe owners and admins can
reply to any comment.

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

If the directly targeted comment's author has no username (a data-integrity edge case), the prefix
is omitted and the content is stored as-is.

## Admin Moderation Capabilities

Admins (users whose role is `admin`, as determined by `authMiddleware`) have elevated permissions
in the comment system beyond those of regular users.

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

| `isAdmin` | `isRecipeOwner` | `isCommentAuthor` | Outcome           |
| --------- | --------------- | ----------------- | ----------------- |
| `true`    | any             | any               | ✅ Reply created   |
| any       | `true`          | any               | ✅ Reply created   |
| any       | any             | `true`            | ✅ Reply created   |
| `false`   | `false`         | `false`           | ❌ `FORBIDDEN`     |

Top-level comments (no `parentCommentId`) are unrestricted by role — any authenticated user may
post them.

### Admin Delete

An admin may delete **any comment**, regardless of authorship. Deletion is a soft-delete: the
`deletedAt` timestamp is set to the current time rather than removing the row. Soft-deleted
comments are excluded from all subsequent read and listing responses.

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

If the target comment does not exist or has already been soft-deleted, `COMMENT_NOT_FOUND` is
thrown for both admin and non-admin callers.

## Reply-on-Reply UX

The UI renders a **Reply** button on each reply as well as on each top-level comment. Clicking
Reply on a reply opens the reply form on the **parent top-level comment** (because the backend
enforces one-level threading) and pre-fills the textarea with `@username ` — the username of the
reply's author — so the conversation context is preserved.

The Reply button is shown only to users who are permitted to reply to that thread:

- The **recipe owner**
- An **admin**
- The **author of the top-level comment**

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

| Error Code               | HTTP Status | Condition                                                                 |
| ------------------------ | ----------- | ------------------------------------------------------------------------- |
| `COMMENT_NOT_FOUND`      | 404         | `findById` returns `null` for `parentCommentId` or `id`                   |
| `FORBIDDEN`              | 403         | Non-admin, non-recipe-owner attempts to reply; non-admin, non-author attempts to delete |
| `COMMENT_DEPTH_EXCEEDED` | 400         | `parentCommentId` chain exceeds 100 hops without reaching a Top_Level_Comment |

## API Reference

| Method   | Endpoint                              | Description                                      |
| -------- | ------------------------------------- | ------------------------------------------------ |
| `POST`   | `/api/v1/comments/recipe/:recipeId`   | Create a top-level comment or a reply. Requires authentication. Pass `parentCommentId` in the request body to create a reply. |
| `GET`    | `/api/v1/comments/recipe/:recipeId`   | List top-level comments for a recipe, each with its replies nested under a `replies` array. Supports `page` and `perPage` query parameters. |
| `DELETE` | `/api/v1/comments/:id`                | Soft-delete a comment. The caller must be the comment's author or an admin. |
