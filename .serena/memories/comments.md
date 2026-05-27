## Threading Model

Parent–child backed by `parentCommentId` (nullable FK → `comments.id`). Top-level has `parentCommentId IS NULL`.

## One-Level Depth Rule (Enforced in Service)

- Only top-level comments can be parent (`parentCommentId IS NULL`).
- When caller targets a reply (non-null `parentCommentId`), service flattens: traverses chain up to top-level (max 100 hops, else `COMMENT_DEPTH_EXCEEDED`), uses that top-level ID as effective parent.
- Mention prefix prepended: `@username_of_reply_author ` + original content.

## Authorization (createComment with parentCommentId)

| isAdmin | isRecipeOwner | isCommentAuthor | Outcome |
|---------|--------------|----------------|---------|
| true | any | any | ✅ Reply created |
| any | true | any | ✅ Reply created |
| any | any | true | ✅ Reply created |
| false | false | false | ❌ FORBIDDEN |

Top-level comments unrestricted — any authenticated user may post.

## Admin Delete (deleteComment)

Admin may delete any comment regardless of authorship. Non-admin only own comments. Soft-delete sets `deletedAt`.

## Content Formatting

Only inline Markdown parsed client-side: `**bold**`, `*italic*`, `__underline__`, `_italic_`. All other syntax (headings, links, code blocks, lists, images, HTML tags) rendered as plain text.

Rendering: `renderInlineMarkdown()` in `apps/web/src/components/recipe/CommentSection.tsx`. Backend stores/returns raw Markdown.

## Reply-on-Reply UX

Reply button on replies opens form on parent top-level comment, pre-fills `@username `. Visible only to permitted users (recipe owner, admin, top-level author).

## Error Codes

| Code | Status | Condition |
|------|--------|-----------|
| COMMENT_NOT_FOUND | 404 | parentCommentId or id not found |
| FORBIDDEN | 403 | Unauthorized reply or delete |
| COMMENT_DEPTH_EXCEEDED | 400 | >100 hops in parent chain |
