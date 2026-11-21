## ADDED Requirements

### Requirement: Replies stay inside their recipe's thread
`createComment` SHALL reject a `parentCommentId` whose comment belongs to a different recipe than the request's `recipeId` with `COMMENT_NOT_FOUND` (404 `NOT_FOUND`, "Parent comment not found"), before any write or side effect.

The check runs right after the parent is loaded, so a parent on another recipe is answered exactly
like a missing parent, and again on the top-level comment that thread flattening resolves.
`comment/model.ts#findByRecipe` SHALL load replies only from the listed recipe
(`eq(comments.recipeId, recipeId)` next to the `parentCommentId` filter), so a cross-recipe reply
stored before this rule never appears in another recipe's thread.

#### Scenario: Reply to another recipe's comment is rejected
- **WHEN** user U, author of recipe R1, posts to R1 with `parentCommentId` set to a comment on recipe R2
- **THEN** the response is 404 `NOT_FOUND` "Parent comment not found", no comment row is created, and `incrementComments` and the notification side effects are not invoked

#### Scenario: A stored cross-recipe reply stays out of the other thread
- **WHEN** a reply row with `recipeId` R1 and a parent comment on R2 exists
- **THEN** `GET /api/v1/comments/recipe/R2` lists the parent comment without that reply

### Requirement: Deleting a comment removes its thread and keeps the comment count exact
`deleteComment` SHALL soft-delete the comment and, when it is a top-level comment, every live reply to it on the same recipe, and SHALL lower the recipe's `commentCount` by exactly the number of comment rows this call soft-deleted, only after its own soft delete of the comment changed the row.

`comment/model.ts#softDelete` updates only a row whose `deletedAt` is null and returns `null`
otherwise; under READ COMMITTED a concurrent second update waits for the first and then matches no
row. When `softDelete` returns `null`, `deleteComment` SHALL throw `COMMENT_NOT_FOUND` (404), the
same answer a sequential second delete gets from the `findById` check, and SHALL NOT delete replies
or call `decrementComments`. For a top-level comment, `comment/model.ts#softDeleteReplies(parentId,
recipeId)` soft-deletes the live replies whose `parentCommentId` is the comment and whose
`recipeId` is the comment's recipe and returns the rows it changed; the service then calls
`decrementComments(recipeId, 1 + <replies changed>)`. A reply deleted earlier, or deleted
concurrently by its author, is counted only by the statement that changed its row. The admin path
(`isAdmin: true`) follows the same rule. Replies stored on another recipe before "Replies stay
inside their recipe's thread" are not touched. Account deletion soft-deletes only the user row, so
that user's comments stay listed and counted; they show no author identity (account-deletion, "A
deleted account has no public identity").

#### Scenario: Double-click delete
- **WHEN** the author sends two `DELETE /api/v1/comments/:id` requests for the same comment at the same time
- **THEN** exactly one succeeds, the other answers 404 `NOT_FOUND`, and the recipe's `commentCount` drops by exactly 1

#### Scenario: Lost race does not touch the counter
- **WHEN** `findById` returns the comment but `softDelete` returns `null`
- **THEN** `deleteComment` throws `COMMENT_NOT_FOUND`, no reply is soft-deleted and `decrementComments` is not called

#### Scenario: Deleting a top-level comment removes its replies
- **WHEN** a top-level comment C has two live replies, the recipe's `commentCount` is 3, and C's author or an admin deletes C
- **THEN** the response is 200, C and both replies have `deletedAt` set, `commentCount` is 0, and `GET /api/v1/comments/recipe/:recipeId` lists none of them

#### Scenario: A reply deleted earlier is not counted twice
- **WHEN** one of C's two replies was deleted before (`commentCount` 2) and C is then deleted
- **THEN** `commentCount` is 0

#### Scenario: Deleting a reply removes only that reply
- **WHEN** the recipe author deletes one reply of C
- **THEN** `commentCount` drops by 1 and C and its other replies stay listed

### Requirement: Stored comment counts are recounted after every migration run
`packages/db/src/recount-comment-counts.ts` SHALL set the `commentCount` of every live recipe to the number of its counted comments, SHALL write only the rows whose stored value differs, and SHALL run after every successful migration run of the API image entrypoint (container-deployment, "Entrypoint runs migrations on every boot") and of `make db-migrate`.

A counted comment is a live comment (`deletedAt` null) on the recipe that is either top-level or a
reply whose parent is a live comment on the same recipe. Comments of deleted accounts and replies
past the per-thread display cap are counted. A live reply whose parent was deleted (left by deletes
made before "Deleting a comment removes its thread and keeps the comment count exact") and a reply
stored under another recipe's comment (before "Replies stay inside their recipe's thread") are not.

The recount:
- uses Drizzle builders only: `$count` over `comment` with an `exists` subquery on an aliased
  `comment` table; it has no `sql` fragment, so the lint-style registry is unchanged;
- reads live recipes in `id` order in keyset batches of at most 500 rows (`limit`), each row with
  its stored `commentCount` and its counted comments;
- repairs each drifted recipe with a compare-and-set update (`where id = <id> and comment_count =
  <stored value read>`), so an increment or decrement written after the batch was read is never
  overwritten: that recipe is reported as skipped and the next run repairs it;
- changes no other column (`updatedAt` keeps its value);
- prints `Comment count recount: repaired recipe <id> (<stored> -> <counted>)` per repaired recipe,
  `Comment count recount: skipped recipe <id> (changed concurrently)` per skipped one and
  `Comment count recount: complete (scanned <n>, repaired <m>, skipped <k>)` at the end, and no
  other data;
- exits `0` on success and `1` after printing `Comment count recount failed: <message>` to stderr
  when a query fails;
- is idempotent: a run right after a run with no comment written in between repairs nothing.

`make db-recount-comments` runs it on its own in development.

#### Scenario: Drifted counts are repaired
- **WHEN** recipe A stores 7 and has one live top-level comment, one live reply to it and a deleted top-level comment whose reply is still live, and recipe B stores −1 and has one live top-level comment whose author's account was deleted
- **THEN** after the recount A's `commentCount` is 2 and B's is 1, both ids are printed with their old and new values, and neither row's `updatedAt` changed

#### Scenario: A reply stored under another recipe's comment is not counted
- **WHEN** a live reply stored with recipe R1 has its parent comment on recipe R2
- **THEN** neither R1's nor R2's counted comments include it

#### Scenario: A second run repairs nothing
- **WHEN** the recount runs again and no comment was written in between
- **THEN** it reports `repaired 0` and writes no row

#### Scenario: A concurrent counter change is not overwritten
- **WHEN** another request changes a drifted recipe's `commentCount` after the recount read its batch and before the repair
- **THEN** the compare-and-set update matches no row, the recipe is reported as skipped and keeps the value the other request wrote

#### Scenario: A fresh development seed needs no repair
- **WHEN** the recount runs right after the seed filled an empty development database
- **THEN** it repairs 0 recipes

## MODIFIED Requirements

### Requirement: Shared recipe-visibility predicate

The recipe module SHALL export a single reusable visibility predicate from
`apps/api/src/modules/recipe/service.ts`:

```ts
/** True when the caller may view the recipe. */
export function canViewRecipe(
  recipe: { visibility: string; authorId: string },
  userId?: string | null,
  isAdmin?: boolean,
): boolean;
```

encoding the semantics previously inlined (duplicated) in the recipe router:
`public`/`unlisted` → visible to any caller (including unauthenticated); `draft`/`private` →
visible only when `userId === recipe.authorId`, or when `isAdmin` is `true`. The admin bypass is an
explicit decision for the comment surface (the comment-reply rule already honours `isAdmin`) and
the caller-scoped private-note surface (`recipe-personal-notes`); those callers pass the caller's
admin flag.

The recipe GET routes SHALL call `canViewRecipe` without an admin flag: `GET /:slugOrId`,
`GET /:slug/versions`, `GET /:slug/versions/diff` and `GET /:slugOrId/collections` keep their 404
`'Recipe not found'` response for a `draft`/`private` recipe of another user, admins included
(the asymmetry is documented in the D99.9 ledger entry).

**Reason:** The canonical visibility logic existed only as duplicated inline expressions in the
recipe router — there was no reusable predicate, which is why the comment surface shipped ungated
(D99.9). A single exported function makes the gate reusable by the comment module (and by the
ledgered like/favourite/rate follow-ups) without a third copy of the rules.

#### Scenario: Predicate encodes the visibility matrix

- **WHEN** `canViewRecipe` is called for a `public` or `unlisted` recipe with `userId: null`
- **THEN** it returns `true`
- **AND** for a `draft` or `private` recipe it returns `true` only for `userId === authorId` or
  `isAdmin: true`, and `false` for any other caller

#### Scenario: Recipe GET routes preserve behaviour after the refactor

- **WHEN** a non-author requests `GET /api/v1/recipes/:slugOrId` or `GET /:slug/versions` for a
  `draft`/`private` recipe after the refactor
- **THEN** the response is still 404 `'Recipe not found'` (identical status, envelope code, and
  message to the pre-refactor inline check)

#### Scenario: Recipe GET routes give admins no bypass

- **WHEN** an admin who is not the author requests `GET /api/v1/recipes/:slugOrId`, `GET /:slug/versions` or `GET /:slug/versions/diff` for a `private` recipe
- **THEN** each response is 404 `'Recipe not found'`
