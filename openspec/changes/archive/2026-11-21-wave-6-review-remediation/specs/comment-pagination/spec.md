## ADDED Requirements

### Requirement: Replies per top-level comment are bounded

`GET /api/v1/comments/recipe/:recipeId` SHALL return at most `MAX_REPLIES_PER_COMMENT` (20, exported from `@brewform/shared/constants`) live replies per top-level comment, oldest first, and SHALL set `hasMoreReplies: true` on every top-level comment that has more live replies on that recipe.

`comment/model.ts#findByRecipe` loads the page of top-level comments and their replies in one
Drizzle relational query: the `replies` relation (`relationName: 'commentReplies'`) carries
`limit: MAX_REPLIES_PER_COMMENT + 1`, which Drizzle applies per parent (a `left join lateral`
subquery), ordered by `createdAt` then `id`. One request therefore reads at most
`perPage × (MAX_REPLIES_PER_COMMENT + 1)` reply rows, with no raw SQL and no window function. The
web comment section shows "Showing the first {count} replies." (`comment.repliesTruncated`) under
a thread with `hasMoreReplies`. Reading replies past the cap is a later "load more replies" UI.

#### Scenario: A long thread is cut at the cap

- **WHEN** a top-level comment has 25 live replies
- **THEN** the list returns its 20 oldest replies in ascending `createdAt` order and `hasMoreReplies: true`

#### Scenario: One long thread does not hide other threads' replies

- **WHEN** the same page holds comment P1 with 25 replies and comment P2 with 2 replies
- **THEN** P1 carries 20 replies and P2 carries both of its replies with `hasMoreReplies: false`

#### Scenario: A thread at the cap is not flagged

- **WHEN** a top-level comment has exactly 20 live replies
- **THEN** all 20 are returned and `hasMoreReplies` is false
