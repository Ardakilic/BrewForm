# comment-authz Specification

## Purpose
TBD - created by archiving change wave-5-debt-clearance. Update Purpose after archive.
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

encoding the semantics currently inlined (duplicated) at `recipe/index.ts:316-319` and `:281-284`:
`public`/`unlisted` → visible to any caller (including unauthenticated); `draft`/`private` →
visible only when `userId === recipe.authorId`, or when `isAdmin` is `true`. The admin bypass is an
explicit decision: the recipe GET routes have no admin bypass today, but the comment-reply rule at
`comment/service.ts:63` already honours `isAdmin` — the predicate supports it, and the comment
surface passes the caller's admin flag.

Both recipe GET surfaces (`GET /:slugOrId` at `recipe/index.ts:316-319` and `GET /:slug/versions`
at `:281-284`) SHALL be refactored to call `canViewRecipe` behaviour-preservingly: they keep their
404 `'Recipe not found'` response and do NOT gain the admin bypass (they pass no admin flag; the
asymmetry is documented in the D99.9 ledger entry).

**Reason:** The canonical visibility logic exists only as duplicated inline expressions in the
recipe router — there is no reusable predicate, which is why the comment surface shipped ungated
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

