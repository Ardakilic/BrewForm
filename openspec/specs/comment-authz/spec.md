# comment-authz Specification

## Purpose

Defines who may create and list comments on a recipe. Both operations are gated by the shared
recipe-visibility predicate, a recipe the caller may not view answers 404 rather than 403, and
@mention side effects never fire for a rejected comment. A test matrix pins every role and
visibility combination.
## Requirements
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

### Requirement: Comment creation is gated by recipe visibility

`createComment` (`apps/api/src/modules/comment/service.ts:48-110`) SHALL load the target recipe
before any other logic — via a new `comment/model.ts` helper `getRecipeForAccessCheck(recipeId)`
returning `{ authorId, visibility }` with `isNull(recipes.deletedAt)` (mirroring
`getRecipeForNotification` at `model.ts:144-155`) — and SHALL throw
`new Error('RECIPE_NOT_FOUND')` when the recipe is missing OR `!canViewRecipe(recipe, userId,
isAdmin)`. Only users who can view the recipe may comment: owner/admin for `draft`/`private`,
anyone (link-holders) for `unlisted`, everyone for `public`.

The loaded `authorId` SHALL be reused for the existing reply-permission check
(`service.ts:62-65`), replacing the separate `getRecipeAuthorId` query. The POST route handler
(`comment/index.ts:97-118`) SHALL map `'RECIPE_NOT_FOUND'` →
`error(c, 'NOT_FOUND', 'Recipe not found', 404)` and its `describeRoute` responses (`:65-68`,
currently documenting only `'Parent comment not found'`) SHALL gain the 404 `'Recipe not found'`
variant.

**Reason:** Today the only recipe query in `createComment` is `getRecipeAuthorId` inside the reply
branch — any authenticated verified-email user holding a recipe UUID can comment on draft/private
recipes, and commenting on a nonexistent recipe hits an FK error via `incrementComments` instead of
a clean 404. This is the D99.9 write-path hole.

#### Scenario: Non-owner cannot comment on a private recipe

- **WHEN** an authenticated non-owner POSTs a comment for a `private` (or `draft`) recipe UUID
- **THEN** the response is 404 with envelope code `NOT_FOUND` and message `'Recipe not found'`
- **AND** no comment row is created and `incrementComments` is not called

#### Scenario: Owner and admin can comment on a draft recipe

- **WHEN** the recipe's author (or an admin) POSTs a comment on a `draft` recipe
- **THEN** the response is 201 and the comment is created

#### Scenario: Nonexistent recipe UUID gets a clean 404

- **WHEN** an authenticated user POSTs a comment for a UUID that matches no live recipe (missing or
  soft-deleted)
- **THEN** the response is 404 `'Recipe not found'` — not the current FK-violation 500

### Requirement: Comment listing is gated by recipe visibility

The comment list surface SHALL apply the same gate as creation: `GET /recipe/:recipeId`
(`comment/index.ts:123-157`, currently mounted with NO auth middleware) SHALL gain
`optionalAuthMiddleware` (imported from `../../middleware/auth.ts`, as used at
`recipe/index.ts:311`), and `listComments` (`service.ts:187-189`) SHALL accept `userId`/`isAdmin`,
perform the `getRecipeForAccessCheck` + `canViewRecipe` gate, and throw
`new Error('RECIPE_NOT_FOUND')` for invisible or missing recipes. The route SHALL map the code to
404 and document the 404 variant in its OpenAPI responses.

**Reason:** Gating only creation still leaks content: `listComments` and its auth-less route let
anyone read all comments on any private/draft recipe by UUID. Create and list must move together or
the gate is decorative.

#### Scenario: Anonymous caller cannot list comments on a private recipe

- **WHEN** an unauthenticated request hits `GET /api/v1/comments/recipe/:recipeId` for a `private`
  or `draft` recipe
- **THEN** the response is 404 with envelope code `NOT_FOUND` and message `'Recipe not found'`

#### Scenario: Owner lists comments on their own draft

- **WHEN** the recipe's author (authenticated) lists comments for their `draft` recipe
- **THEN** the response is 200 with the comment list

#### Scenario: Public recipes remain anonymously listable

- **WHEN** an unauthenticated request lists comments for a `public` recipe
- **THEN** the response is 200 — behaviour for public recipes is unchanged by the gate

### Requirement: Invisible recipes return 404, not 403

Both comment surfaces (create and list) SHALL respond to an invisible recipe with
404 `'Recipe not found'` (envelope code `NOT_FOUND`) — never 403 — matching the existence-hiding
convention of the recipe GET surfaces (`recipe/index.ts:251/283/318`, `share.ts:76`). The response
for a recipe the caller cannot see SHALL be indistinguishable from the response for a recipe that
does not exist.

**Reason:** The codebase convention is split (GET surfaces use 404; some mutation surfaces use
403), but the comment surface takes an arbitrary UUID: a 403 on a "nonexistent" recipe confirms
existence — exactly the oracle the draft/private semantics exist to prevent. Comments are an
extension of the recipe GET surface, so they follow its convention (design.md Decision 6).

#### Scenario: 404 for invisible and missing recipes is indistinguishable

- **WHEN** the same non-owner requests comments for (a) another user's `private` recipe and (b) a
  random UUID with no recipe
- **THEN** both responses have identical status 404, envelope code `NOT_FOUND`, and message
  `'Recipe not found'`

#### Scenario: No 403 escapes the comment surface for visibility failures

- **WHEN** any comment create/list request fails the visibility gate
- **THEN** the response status is 404 — grep of the comment module shows no `FORBIDDEN`/403 mapping
  on the visibility path (403 remains only where it already exists, e.g. the reply-permission rule)

### Requirement: Mention side-effects never fire for rejected comments

The F04 mention/notification side-effects SHALL execute only after comment creation has passed the
visibility gate. The side-effects — `createMentionNotifications` + `notifyRecipeCommented`
(`comment/service.ts:100-105`) load `title`/`slug` via `comment/model.ts:144-155` and forward
them in-app (`notification/service.ts:113`, metadata `{recipeSlug, recipeTitle}`) and by email
(`utils/notify/index.ts:206-213`). A rejected creation SHALL invoke none of:
`deps.model.create`, `deps.recipeModel.incrementComments`, mention notifications, or notification
emails. No second visibility check SHALL be added inside the notification path: the side-effects
already run only inside successful creation, so gating creation closes the disclosure vector.

**Reason:** The mention side-effect is the disclosure vector from the D99.9 ledger entry — it leaks
a private/draft recipe's `title` and `slug` to any mentioned user in-app and by email. Gating
creation upstream is the single load-bearing fix; a duplicate check inside the notification path
would be dead code that rots.

#### Scenario: Rejected comment produces zero side-effects

- **WHEN** `createComment` throws `RECIPE_NOT_FOUND` for a mention-bearing comment body on an
  invisible recipe
- **THEN** `deps.model.create`, `deps.recipeModel.incrementComments`,
  `deps.createMentionNotifications`, and `deps.notifyRecipeCommented` are never invoked (asserted
  via the existing deps proxy stubs, `comment/service.ts:25-31`)

#### Scenario: Accepted comment still delivers mentions

- **WHEN** the recipe's author posts a comment mentioning another user on their own `draft` recipe
- **THEN** the mention notification fires exactly as before the change (the gate does not break the
  F04 feature for visible-to-caller recipes)

### Requirement: Comment authz test matrix

The gate SHALL be covered by a visibility × role test matrix:

- `comment/service.test.ts` (stubbing via the existing deps proxy, `comment/service.ts:25-31`):
  `createComment` and `listComments` across visibility `{draft, private, unlisted, public}` ×
  caller `{non-owner, owner, admin}` (plus `{anonymous}` for `listComments`), asserting
  `RECIPE_NOT_FOUND` rejections on invisible combinations and that `deps.model.create`,
  `deps.recipeModel.incrementComments`, and the mention side-effects are never invoked on
  rejection.
- `comment/index.test.ts`: POST returns the 404 envelope for an invisible recipe (non-owner) and
  201 for owner-on-draft; GET returns 404 for an invisible recipe when anonymous and 200 for the
  owner with an auth token.

**Reason:** A visibility gate with untested combinations is where the next regression hides — the
matrix is small (4 visibilities × ≤4 roles × 2 operations) and pins both the service contract and
the HTTP mapping.

#### Scenario: Service matrix passes

- **WHEN** `make test-api` runs the extended `comment/service.test.ts`
- **THEN** every visibility × caller combination asserts the expected outcome (`RECIPE_NOT_FOUND`
  throw or success) with zero failures

#### Scenario: Route tests pin the HTTP mapping

- **WHEN** `make test-api` runs the extended `comment/index.test.ts`
- **THEN** POST/GET return 404 envelopes for invisible recipes and 201/200 for permitted callers,
  and the OpenAPI coverage test (`openapi.coverage.test.ts`) still passes with the new documented
  404 responses

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

