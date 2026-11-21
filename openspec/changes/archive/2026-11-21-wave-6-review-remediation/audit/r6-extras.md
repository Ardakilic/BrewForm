# r6-extras — problems found beyond the review (user decision 4: fix all of them)

Research notes for the extras E1–E8 listed in `audit/decisions.md` §4, plus the two notes (r3's
rollback floor, r5's locale-aware search). Every claim was re-checked against the working tree on
2026-11-21 (branch `wave-6-audit-remediation` @ `e18f2bd`). Line numbers are as of that commit.
Task ids use the track prefix `R6.`; the assembler renumbers.

| Extra | Verdict | Capability touched | Effort |
|---|---|---|---|
| E1 deleted top-level comment keeps its replies counted but hidden | **confirmed**; the admin path is the same function; account deletion causes no drift | `comment-authz` (ADDED, **replaces r1 §14's ADDED block**) | M |
| E2 Clear filters within 300 ms keeps the pending search | **confirmed** (only when the URL had no value for that input) | `web-url-state` (ADDED) | S |
| E3 coffee-variety list fields unbounded | **confirmed**: 5 fields, `text[]` columns, POST and admin routes | NEW `coffee-variety-write` (ADDED) | S |
| E4 soft-deleted taste note invisible and unremovable in the edit picker | **confirmed**, web only (the API detail already returns the note with `deletedAt`) | `recipe-write` (MODIFIED "Recipe edit page saves honestly") | S |
| E5 version diff passes the admin flag | **confirmed**: the code and the `version-diff` spec are wrong; `comment-authz`, `recipe-visibility`, `docs/api.md` and `docs/recipes.md` say author-only | `version-diff` (MODIFIED ×2), `comment-authz` (MODIFIED) | S |
| E6 `--text-tertiary` below 4.5:1 app-wide | **bigger**: also dark `--text-secondary` on raised surfaces, `--error`/`--success`/`--warning`/`--accent-secondary`/diff tokens, white-on-gold literals, two undefined tokens | `web-shared-components` (ADDED); text edits to r4's `chart-rendering` block | M |
| E7 logout not synced across tabs | **confirmed**; login is not mirrored either | `web-data-loading` (ADDED) | M |
| E8 sitemap past 50,000 URLs needs an index | **bigger**: Google ignores the recipe URLs of a sitemap under `/api/v1/` (scope rule), and deleted accounts' profiles are listed | `recipe-visibility` (MODIFIED + ADDED, **replaces r1 §33's ADDED block**), `container-deployment` (MODIFIED ×2); text edit to r3's `ci-image-publishing` block | L |
| Note: pre-wave-6 rollback floor | already covered by r3 (R3.15 + its MODIFIED "Restore, upgrade and rollback runbook"): no extra task | — | — |
| Note: locale-aware search (r5) | ledger idea only | — | — |

Library and protocol facts checked (cited again where used):

- **MDN** (Context7 `/mdn/content`, `web/api/window/storage_event`, `storageevent`): the `storage`
  event "fires when another document that shares the same storage area … updates that storage
  area. The event is _not_ fired on the window that made the change"; `newValue` is `null` after
  `removeItem`/`clear()`, and `key` is `null` after `clear()`.
- **MDN** (`/mdn/content`, `web/api/broadcastchannel`): a `BroadcastChannel` message is fired "at
  all `BroadcastChannel` objects listening to the channel, except the object that sent the
  message".
- **react-router** (Context7 `/remix-run/react-router`): `useRevalidator().revalidate` and the data
  router's `revalidate()` return `Promise<void>` and re-run all current loaders
  (`packages/react-router/lib/router/router.ts`, `revalidate()`); in data mode `navigate()`
  returns a `Promise<void>` (`docs/api/hooks/useNavigate.md`); a data router is created once
  outside React and its instance methods are used directly (`docs/api/data-routers/createBrowserRouter.md`).
- **Hono** (Context7 `/websites/hono_dev`, routing): regexp params (`/:filename{.+\.png}`) are
  possible; E8 avoids them (one literal path plus a validated query).
- **Caddy** (Context7 `/websites/caddyserver_caddyfile`, matchers): "Path matching is an exact
  match by default"; the `path` matcher matches "the path component of the request URI", so
  `/sitemap.xml` also matches `/sitemap.xml?part=recipes&page=2`; "Multiple paths will be OR'ed".
- **drizzle-orm** (Context7 `/drizzle-team/drizzle-orm-docs`, pg operators/select): `inArray(col,
  db.select({ data: t2.col }).from(t2))` compiles to `IN (SELECT …)`; `.orderBy(...).limit(n).offset(m)`
  is the documented limit/offset pagination ("order by is mandatory").
- **Zod 4** (Context7 `/colinhacks/zod/v4.3.6`): `trim()` is a mutation check (it stays a
  `ZodString`, so `z.toJSONSchema` still converts it; `auth.ts:30`/`admin.ts:15` already use
  `.trim()` in `jsonRequestBody` schemas); `.max()` maps to `maxLength`/`maxItems`.
- **sitemaps.org** (protocol page, read through the web-fetch agent): "Each Sitemap file … must have
  no more than 50,000 URLs and must be no larger than 50MB (52,428,800 bytes)"; an index "may not
  list more than 50,000 Sitemaps"; index structure `<sitemapindex>` → `<sitemap>` → `<loc>`
  (`<lastmod>` optional); "The location of a Sitemap file determines the set of URLs that can be
  included in that Sitemap"; "A Sitemap index file can only specify Sitemaps that are found on the
  same site"; values must be entity-escaped (`&` → `&amp;`), UTF-8.
- **Google Search Central** (build-sitemap and large-sitemaps pages, web-fetch agent): "unless you
  submit your sitemap through Search Console, a sitemap affects only descendants of the parent
  directory" (a `robots.txt` `Sitemap:` line is not named as an exception); index children "must be
  in the same directory as the sitemap index file, or lower in the site hierarchy"; "Google ignores
  `<priority>` and `<changefreq>` values".

---

## Extra E1: deleting a top-level comment leaves its replies counted but hidden

### 1. Verification

- `deleteComment` (`apps/api/src/modules/comment/service.ts:231-237`) soft-deletes only the row it
  was given and always decrements by one:

  ```ts
  const comment = await deps.model.findById(id);
  if (!comment) throw new Error('COMMENT_NOT_FOUND');
  if (!isAdmin && comment.authorId !== userId) throw new Error('FORBIDDEN');
  await deps.model.softDelete(id);
  await deps.recipeModel.decrementComments(comment.recipeId);
  ```

- The read path hides replies of a deleted parent: `findByRecipe` (`comment/model.ts:46-122`)
  pages only live top-level comments (`:47-51`) and loads replies only for the parents on the page
  (`:83-104`, `inArray(comments.parentCommentId, parentIds)`). Replies of a deleted parent are never
  returned, but they keep `deletedAt = null` and stay in `recipes.commentCount`.
- Failing case: top-level `C` + two replies → `commentCount` 3 (`createComment` increments once per
  row, `service.ts:107`). Delete `C` → `commentCount` 2, the thread shows nothing, and the replies
  can never be deleted through the UI (no button renders for them).
- **Admin path:** there is no separate admin comment delete. `DELETE /api/v1/comments/:id`
  (`comment/index.ts:175-215`) passes `isAdmin` into the same `deleteComment`; report resolution
  (`report/service.ts:46-60`) never deletes the reported entity. Same bug, same fix.
- **Account deletion:** `deleteAccount` (`user/service.ts:108-113`) soft-deletes only the user row
  (`user/model.ts:86-93`) after scrubbing private notes; admin `softDeleteUser`
  (`admin/model.ts:247-254`) the same. The user's comments keep `deletedAt = null`, stay listed (the
  author join `comment/model.ts:71` is a `leftJoin` without a `deletedAt` filter) and stay counted.
  So counts do not drift there. (The comments keep showing the deleted account's name: a product
  question, see Cross-track notes.)
- **Web:** `CommentSection.handleDelete` (`apps/web/src/components/recipe/CommentSection.tsx:308-326`)
  already removes the parent together with its nested `replies` and lowers the top-level `total`
  by one. The UI therefore already behaves as if the replies were deleted; only the API disagrees.
- **Specs:** `comment-authz` has no delete rule; r1 §14 ADDs "Deleting a comment decrements the
  comment count once". `comment-pagination` is web pagination only (its `total` is the top-level
  count, unaffected). `docs/comments.md:125-152` describes the delete as "the recipe's
  `commentCount` is decremented".
- Tests: none cover a top-level delete with replies (`comment/service.test.ts:614-650` exercises
  the inline copy that r1 R1.8 removes).

**Verdict: confirmed.**

### 2. Root cause

Deleting a top-level comment ends its thread on the read path but not on the write path, and the
counter moves by a fixed 1 instead of by the rows removed.

### 3. Fix design

**Decision: cascade.** Deleting a top-level comment soft-deletes its live replies on the same
recipe, and `commentCount` drops by exactly the number of rows this call soft-deleted.

Why cascade and not a "[deleted]" placeholder:
- The placeholder needs the read path to return deleted top-level rows (masked), a new output
  field, a web placeholder with i18n keys, a reply-form rule for deleted parents, an OpenAPI change
  and a change to the top-level `total`. The cascade changes two model functions and the service.
- The UI already removes the replies with the parent (`handleDelete`), so the cascade makes the
  API match what users already see.
- Replies can only be written by the recipe author or an admin (`service.ts:72-74`); they answer
  the deleted comment and have no meaning without it. Moderation deletes (admin) should remove
  replies that quote abuse.

Design, on top of r1 R1.9 (which makes the decrement conditional on `softDelete` returning a row):

```ts
// comment/model.ts
/**
 * Soft-delete every live reply to a top-level comment on the same recipe.
 * Returns the ids of the rows this call changed (a reply already deleted, or deleted
 * concurrently by another statement, is not returned).
 */
export async function softDeleteReplies(parentId: string, recipeId: string) {
  return db
    .update(comments)
    .set({ deletedAt: new Date() })
    .where(and(eq(comments.parentCommentId, parentId), eq(comments.recipeId, recipeId), isNull(comments.deletedAt)))
    .returning({ id: comments.id });
}
```

```ts
// recipe/model.ts — same D03 fragment, now with a bound amount
/** Atomically decrement a recipe's `commentCount` by `by` (default 1). Returns the updated row or null. */
export async function decrementComments(id: string, by = 1) {
  // D03 raw-SQL exception: atomic counter update, `.set()` has no decrement helper
  … .set({ commentCount: sql`${recipes.commentCount} - ${by}` }) …
}
```

```ts
// comment/service.ts#deleteComment (after r1 R1.9)
logger.debug({ userId, commentId: id }, 'deleteComment started');
const comment = await deps.model.findById(id);
if (!comment) throw new Error('COMMENT_NOT_FOUND');
if (!isAdmin && comment.authorId !== userId) throw new Error('FORBIDDEN');
const deleted = await deps.model.softDelete(id);
if (!deleted) throw new Error('COMMENT_NOT_FOUND'); // r1 R1.9: lost a concurrent delete
const replies = comment.parentCommentId === null
  ? await deps.model.softDeleteReplies(id, comment.recipeId)
  : [];
await deps.recipeModel.decrementComments(comment.recipeId, 1 + replies.length);
logger.debug({ userId, commentId: id, recipeId: comment.recipeId, removedReplies: replies.length }, 'deleteComment completed');
```

- `eq(comments.recipeId, recipeId)` keeps the cascade inside the thread, matching r1 #5's read
  filter (replies stored on another recipe before #5 are already invisible everywhere; they stay
  untouched and are covered by r1's risk note).
- Concurrency: each row is counted by the statement that changed it. A reply deleted by its author
  while the cascade runs is returned by exactly one of the two `UPDATE … WHERE deleted_at IS NULL
  RETURNING` statements (PostgreSQL READ COMMITTED re-evaluates the WHERE after the first commit;
  r1 §14 cites Context7 `/websites/postgresql` 13.2.1), so the count stays exact; the losing reply
  delete answers 404 (r1 R1.9).
- Known narrow race, accepted: a reply posted while its parent's cascade runs can be inserted after
  the cascade (its `findById` saw a live parent). It is then hidden but counted, the same class as
  the create crash window r1 §14 rejected fixing with a transaction. No transaction is added, to
  stay consistent with r1's decision.
- Registry: `decrementComments` keeps its single fragment, now with a bound value
  (`sql\`${col} - ${by}\``), which the registry rule allows ("interpolate only Drizzle … columns
  … and bound values"). r5's MODIFIED registry row text "Atomic ±1 counters" must say the comment
  decrement takes the number of removed rows (see §6).
- OpenAPI: the DELETE route's description (`comment/index.ts:180`) gains "Deleting a top-level
  comment also deletes its replies; the recipe's `commentCount` drops by the number of comments
  removed." No status change.
- Rejected: a "[deleted]" placeholder (above); recounting `commentCount` with `count()` after every
  delete (a read-then-write that reintroduces the race r1 §14 removed); a CHECK `comment_count >= 0`
  (r1 rejected it).

### 4. Tests (failing first; after r1 R1.8 converts `service.test.ts` to the real service)

- `apps/api/src/modules/comment/model.test.ts`, new `describe('softDeleteReplies')` (DB-backed):
  top-level `P` on recipe A with live replies `r1`, `r2`, an already-deleted reply `r3`, and a
  cross-recipe reply `x` (recipe B, parent `P`, inserted with `model.create`):
  `softDeleteReplies(P, A)` returns exactly `[r1, r2]` ids; `r3` keeps its old `deletedAt`; `x` stays
  live. Fails today (function missing).
- `apps/api/src/modules/comment/service.test.ts`, deps-stubbed real `deleteComment`:
  - top-level comment, `softDeleteReplies` stub returns two ids → `decrementComments` recorder gets
    `(recipeId, 3)`;
  - reply (`parentCommentId` set) → `softDeleteReplies` not called, recorder gets `(recipeId, 1)`;
  - lost race (`softDelete` returns `null`) → neither `softDeleteReplies` nor `decrementComments`
    is called (extends r1's R1.9 case).
  - Fails today: the recorder gets `(recipeId)` and no cascade happens.
- Same file, DB-backed (the file's `NoteFixtures` setup, r1 R1.9 style): create `C` and two replies
  through the real `createComment` as the recipe author (count 3); `deleteComment(author, C, false)`
  → `commentCount` 0, `findByRecipe(recipeId, 1, 20)` returns no comments, both replies have
  `deletedAt` set. Second case: delete one reply first (count 2), then `C` → count 0 (not −1). Third
  case: an admin (`isAdmin: true`, not the author) deletes `C` → same result.
- `apps/api/src/modules/recipe/model.test.ts`: `decrementComments(id, 3)` lowers `commentCount` by
  3; `decrementComments(id)` by 1.

### 5. Spec impact

`openspec/specs/comment-authz/spec.md` — ADDED. **This block replaces r1 §14.5's ADDED
"Deleting a comment decrements the comment count once"** (it keeps r1's two scenarios verbatim and
adds the cascade); do not ship both.

```markdown
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
that user's comments stay listed and counted.

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
```

### 6. Docs / ledger impact

- `docs/comments.md` "Admin Delete" (`:125-130`): "Deleting a top-level comment also soft-deletes
  its replies; the recipe's `commentCount` drops by the number of comments removed." Same sentence
  in the delete row of the routes table (`:206`).
- `docs/architecture.md:239`: append the cascade sentence to the "Deletions" bullet.
- OpenAPI description (§3) and regenerated `docs/api-reference.md`
  (`docker compose run --rm --no-deps app pnpm --filter @brewform/api run docs:api`).
- r5's MODIFIED `lint-style` registry row "Atomic ±1 counters": change its "Where" cell to
  "`forkCount` in `forkRecipe`, `commentCount` in `incrementComments` (+1) and `decrementComments`
  (minus the number of comments a delete removed, a bound value), `likeCount` in both branches of
  `toggleLike`". The `RAW_SQL_REGISTRY` count for `recipe/model.ts` is unchanged.
- No D99 entry closes. Optional: existing drift (top-level comments deleted before this change
  whose replies are still counted) is not repaired; same as r1 §14.8, a one-off recount is an
  operational task.

### 7. Draft tasks

- [ ] R6.1 Failing first (after R1.8/R1.9): add `describe('softDeleteReplies')` to
  `apps/api/src/modules/comment/model.test.ts`, the three deps-stubbed and three DB-backed
  `deleteComment` cases from audit/r6 E1 §4 to `comment/service.test.ts`, and the
  `decrementComments(id, 3)` case to `apps/api/src/modules/recipe/model.test.ts`; run
  `make test-specific filter=src/modules/comment` and
  `make test-specific filter=src/modules/recipe/model.test.ts` and see them fail.
- [ ] R6.2 Add `softDeleteReplies(parentId, recipeId)` (with docblock) to
  `apps/api/src/modules/comment/model.ts`; give `decrementComments` in
  `apps/api/src/modules/recipe/model.ts` a `by = 1` parameter (keep the one fragment and its D03
  comment; update the docblock); in `comment/service.ts#deleteComment` cascade for top-level
  comments and decrement by `1 + replies.length`, with the entry/exit debug logs
  (`{ userId, commentId, recipeId, removedReplies }`) and an updated docblock; extend the DELETE
  route description in `comment/index.ts`. Re-run R6.1 until green.
- [ ] R6.3 Update `docs/comments.md` and `docs/architecture.md:239` (audit/r6 E1 §6), fold the
  counter wording into r5's `lint-style` registry row, regenerate `docs/api-reference.md`.

### 8. Risks / migration notes

- Behaviour change: deleting your own top-level comment also removes the recipe author's replies to
  it (the UI already hid them). No data migration; already-orphaned replies stay counted (see §6).
- Rollback: reverting restores the old drift; nothing persistent depends on it.

---

## Extra E2: "Clear filters" within 300 ms of typing keeps the pending search

### 1. Verification

- `clearAll` (`apps/web/src/hooks/useListUrlState.ts:81-84`) only navigates to an empty query:
  `setSearchParams(new URLSearchParams(), { preventScrollReset: true })`.
- `useDebouncedUrlText` is a separate hook instance. Its re-sync effect (`:133-141`) runs only when
  its own `urlValue` changes: `if (urlValue === committedRef.current) return;`. When the URL had no
  `q`, clear-all changes nothing for this input (`''` → `''`), so the pending timer (`:154-169`)
  survives and later writes `?q=kenya` on top of the cleared URL.
- Failing case (r4 cross-track note 2): `/equipments`, type `kenya`, click "Clear filters" within
  300 ms → URL becomes `?q=kenya`, the box still shows `kenya`. Consumers with a clear-all button:
  `RecipeListView.tsx:200` (via `useRecipeFilters.ts:104`), `EquipmentCatalogPage.tsx:93,107`,
  `CoffeeVarietiesPage.tsx:94,108`.
- The existing test "clear-all empties the input along with the URL and drops a pending commit"
  (`useListUrlState.test.tsx:282-295`) starts from `/list?q=kenya`, so the URL value changes and the
  re-sync effect fires; the empty-URL case is untested.
- r4 #7 does not cover it: R4.2 leaves `clearAll` "unchanged", and after R4.2 the timer builds on
  `latest().params` (the cleared URL), so it still writes `?q=kenya`.

**Verdict: confirmed.**

### 2. Root cause

Clear-all has no way to reach the debounced inputs' timers; the only signal they get is a change of
their own URL value, which does not happen when that value was already empty.

### 3. Fix design

A module-private registry of pending text commits in `useListUrlState.ts`; `clearAll` runs them
before it clears the URL. No router timing is involved, so it composes with r4's
`useLatestSearchParams` (R4.2) without touching it.

```ts
/**
 * Resets of the debounced text inputs whose commit is still waiting. `clearAll` runs them first,
 * so a clear always beats text typed less than `delay` ms before it.
 */
const pendingTextCommits = new Set<() => void>();
```

In `useDebouncedUrlText`:

```ts
// Stable per instance (refs and the state setter are stable).
const resetForClear = useCallback(() => {
  if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  committedRef.current = '';
  setLocalValue('');
}, []);
```

- `setValue`: after scheduling the timer, `pendingTextCommits.add(resetForClear)`; the timer
  callback starts with `pendingTextCommits.delete(resetForClear)`.
- The re-sync effect: when it clears a timer it also calls `pendingTextCommits.delete(resetForClear)`.
- The unmount cleanup (`:143-148`) also deletes it.

In `useListUrlState.clearAll`:

```ts
log.debug({ pending: pendingTextCommits.size }, 'useListUrlState clearAll');
for (const reset of pendingTextCommits) reset();
pendingTextCommits.clear();
setSearchParams(new URLSearchParams(), { preventScrollReset: true });
```

- Dropping every pending commit is correct even with several debounced inputs or lists on one
  page: clear-all empties the whole query string, so any pending commit would write into the
  cleared URL.
- Inputs without a pending timer need nothing: their text equals the URL, and the existing re-sync
  effect empties them when their value was non-empty.
- A commit whose timer already fired but whose navigation is still loading is cancelled by the
  clear navigation (the later navigation wins), and the re-sync effect then sees
  `urlValue ('') !== committedRef ('kenya')` and empties the box. No extra code.
- The `useEffect` allowlist is not touched (no new effect; timers only).

Alternatives rejected:
- r4's outline (navigation `state: { listUrlCleared: true }` read through `useLocation()`): the
  marker must be compared per location key (the committed location keeps the state after the
  clear, which would drop every later commit), and while the clear navigation is still loading the
  timer sees only `useNavigation().location`; more moving parts than the registry.
- Re-syncing on every navigation (`location.key`): it would drop the text when a filter chip is
  clicked during the pause, breaking r4's scenario "A filter chosen during the typing pause is kept".
- A window `CustomEvent`: a new mechanism for an in-module call.

### 4. Tests (failing first; inside r4 R4.1's fake-timer describe in `apps/web/src/hooks/useListUrlState.test.tsx`)

1. "clear-all during the typing pause drops the text when the URL had none": `renderList('/list')`,
   `fireEvent.change(search, { target: { value: 'kenya' } })`, click `clear`, `await act(() =>
   vi.advanceTimersByTimeAsync(350))`, wait until settled: `router.state.location.search === ''`
   and the input value is `''`. Fails today (`?q=kenya`).
2. "typing after clear-all still commits" (the registry is cleaned): continue case 1, change the
   search to `ali`, advance 350 ms → `q=ali`.
3. "clear-all drops the pending text of two inputs" (uses r4's `author` input): type in both,
   click clear within 300 ms, advance → `search === ''`, both inputs empty.

### 5. Spec impact

`openspec/specs/web-url-state/spec.md` — ADDED (an ADDED block avoids a second MODIFIED of
"Text inputs debounce and replace history while typing", which r4 #7 already modifies):

```markdown
### Requirement: Clear-all cancels pending debounced text commits
`clearAll` SHALL cancel every debounced text commit that is still waiting and empty those inputs before it clears the URL, so text typed less than 300 ms before Clear Filters is never written to the URL afterwards, whether or not the URL already had a value for that input.

`useDebouncedUrlText` registers a reset for its pending commit in a module-private set in
`apps/web/src/hooks/useListUrlState.ts` while its timer runs and removes it when the timer fires,
when the URL re-syncs the input, or on unmount; `useListUrlState.clearAll` runs and clears that set
before navigating to the empty query.

#### Scenario: Clear during the typing pause on a URL without a search
- **WHEN** a user on `/equipments` (no `q` in the URL) types `kenya` and clicks Clear Filters within 300 ms
- **THEN** after the pause the URL has no search params and the search box is empty

#### Scenario: Typing after clear-all commits normally
- **WHEN** the same user then types `ali` and pauses
- **THEN** the URL is `?q=ali`
```

### 6. Docs / ledger impact

- AGENTS.md "Web data loading" → URL state bullet (r4 already edits it): append "Clear-all cancels
  pending debounced commits."
- No OpenAPI or D99 change.

### 7. Draft tasks

- [ ] R6.4 Failing first (after R4.1/R4.2): add the three clear-all cases from audit/r6 E2 §4 to the
  fake-timer describe of `apps/web/src/hooks/useListUrlState.test.tsx`; run
  `docker compose run --rm --no-deps app pnpm --filter @brewform/web exec vitest run src/hooks/useListUrlState.test.tsx`
  and see case 1 fail.
- [ ] R6.5 In `apps/web/src/hooks/useListUrlState.ts` add the module-private `pendingTextCommits`
  set (docblock), register/unregister `resetForClear` in `useDebouncedUrlText` (timer start, timer
  fire, re-sync, unmount), run the resets in `clearAll` before navigating, update both hook
  docblocks and the AGENTS.md URL-state bullet; re-run R6.4 until green.

### 8. Risks / migration notes

Web only. Module state is per page load; tests that render several routers share it, so each case
must end with its timers fired or the component unmounted (Testing Library's cleanup unmounts).

---

## Extra E3: coffee-variety list fields accept unbounded strings

### 1. Verification

- `CoffeeVarietyCreateSchema` (`packages/shared/src/schemas/coffee-variety.ts:11-39`) bounds every
  scalar string but not the five list fields: `processingCompatibility` (`:22`), `subVarieties`
  (`:27`), `notableFarms`, `notableRegions`, `regionalVariants` (`:35-37`), all
  `z.array(z.string()).optional()`. `CoffeeVarietyUpdateSchema` is `.partial()` of it (`:45`).
- Columns are unbounded `text[]` (`packages/db/src/schema.ts:558,563,570-572`).
- Routes using the schemas: `POST/PATCH /api/v1/coffee-varieties` (`coffee-variety/index.ts:102,121,171,198`,
  any verified user, custom varieties) and `POST/PATCH /api/v1/admin/coffee-varieties`
  (`admin/index.ts:600,611`). Failing case: `POST /api/v1/coffee-varieties` with
  `{ "name": "x", "category": "variety", "notableFarms": ["<900,000 chars>"] }` is stored (only the
  1 MB body limit applies), loaded on every variety page and in the admin list.
- No parameter blow-up (one array is one bound parameter), so storage and payload bloat only.
- Seed data (`packages/db/src/seed-coffee-varieties.ts`, 98 rows), measured with a script:

  | Field | rows using it | max items | longest item |
  |---|---|---|---|
  | `processingCompatibility` | 67 | 4 | 22 (`Natural (experimental)`) |
  | `subVarieties` | 3 | 4 | 14 |
  | `notableFarms` | 1 | 3 | 30 (`Hacienda La Esmeralda (Panama)`) |
  | `notableRegions` | 1 | 7 | 11 |
  | `regionalVariants` | 1 | 5 | 21 |

- Web: the only writer is `AdminCoffeeVarietiesPage.tsx:176-199`, which splits a comma list, trims
  and drops empty items (`stringToArr`, `:123-130`), so non-empty trimmed items are already the
  norm. The detail page joins the arrays (`CoffeeVarietyDetailPage.tsx:51-54`).
- Tests: `coffee-variety.test.ts` checks valid payloads only; no bound test. No spec covers the
  variety write schemas (`coffee-variety-type-consistency` is about the TS types).

**Verdict: confirmed.**

### 2. Root cause

The list fields were added without the per-field bounds every scalar sibling has.

### 3. Fix design

```ts
/** Most items in one coffee-variety list field (seed data uses at most 7). */
export const COFFEE_VARIETY_LIST_MAX_ITEMS = 20;
/** Longest list item, in characters (seed data uses at most 30). */
export const COFFEE_VARIETY_LIST_ITEM_MAX_LENGTH = 100;

/** A bounded coffee-variety list field: trimmed, non-empty items. */
const VarietyListSchema = z
  .array(z.string().trim().min(1).max(COFFEE_VARIETY_LIST_ITEM_MAX_LENGTH))
  .max(COFFEE_VARIETY_LIST_MAX_ITEMS);
```

and `processingCompatibility: VarietyListSchema.optional()` etc. for all five fields.

- Bounds: 20 × 100 characters = 2,000 characters per list, the same budget as the largest free-text
  siblings (`cupProfile`, `fermentation` are `max(2000)`), roughly 3× the seed's longest list and
  item. The columns stay `text[]`: no migration (a DB `varchar` array or CHECK would be a schema
  change with no extra safety, since the API is the only writer).
- `.trim()` normalises like the admin form already does; `.min(1)` rejects empty items (the form
  never sends them).
- The update schema inherits the bounds through `.partial()`.
- OpenAPI: `jsonRequestBody` converts the same schema, so the docs show `maxItems`/`maxLength`
  (Zod 4 fact above). Regenerate `docs/api-reference.md` (it lists parameters, so the table may not
  change; run the generator and commit any diff).
- Rejected: a single combined size cap (less clear errors); bounding only the user route (the admin
  route shares the schema, and admins make mistakes too).

### 4. Tests

`packages/shared/src/schemas/coffee-variety.test.ts`, failing first:
- an item of 101 characters in `notableFarms` → `success: false`, issue path `['notableFarms', 0]`;
- 21 items in `processingCompatibility` → `success: false`;
- `['']` and `['   ']` in `subVarieties` → `success: false`;
- `[' Washed ']` parses to `['Washed']`;
- the seed's widest row (`notableRegions` with 7 items) parses;
- the update schema rejects the same oversized list;
- `z.toJSONSchema(CoffeeVarietyCreateSchema)` shows `maxItems: 20` and item `maxLength: 100` for
  `regionalVariants` (guards the OpenAPI contract).
- `apps/api/src/modules/coffee-variety/index.test.ts` (existing route tests): a POST with a 101-char
  item answers 400 `VALIDATION_ERROR` with a `notableFarms` detail and creates nothing.

### 5. Spec impact

NEW capability `openspec/specs/coffee-variety-write/spec.md` (no existing capability covers the
variety write schemas) — ADDED; after archiving, replace the placeholder Purpose with: "Bounds and
validation of the coffee-variety create and update payloads shared by the user and admin routes."

```markdown
### Requirement: Coffee-variety list fields are bounded
The coffee-variety create and update schemas SHALL accept at most 20 items in each list field (`processingCompatibility`, `subVarieties`, `notableFarms`, `notableRegions`, `regionalVariants`), each a trimmed, non-empty string of at most 100 characters, and SHALL reject a longer list or item with 400 `VALIDATION_ERROR` before any write.

The limits are the exported constants `COFFEE_VARIETY_LIST_MAX_ITEMS` and
`COFFEE_VARIETY_LIST_ITEM_MAX_LENGTH` in `packages/shared/src/schemas/coffee-variety.ts`. They apply
to `POST`/`PATCH /api/v1/coffee-varieties` and `POST`/`PATCH /api/v1/admin/coffee-varieties`, which
validate with the same schemas. The columns stay `text[]`; the seed catalogue uses at most 7 items
of at most 30 characters.

#### Scenario: Oversized item is rejected
- **WHEN** a verified user posts a custom variety whose `notableFarms` holds a 101-character string
- **THEN** the response is 400 `VALIDATION_ERROR` with a `notableFarms` detail and no row is created

#### Scenario: Too many items are rejected
- **WHEN** an admin updates a variety with 21 `processingCompatibility` items
- **THEN** the response is 400 `VALIDATION_ERROR` and the stored variety is unchanged

#### Scenario: Seed-shaped lists are accepted
- **WHEN** a payload carries `notableRegions` with 7 items of at most 30 characters
- **THEN** it validates, and items are stored trimmed
```

### 6. Docs / ledger impact

- `docs/api-reference.md` regeneration (no hand edits). No D99 entry exists.
- Proposal: list the new capability `coffee-variety-write`.

### 7. Draft tasks

- [ ] R6.6 Failing first: add the schema cases from audit/r6 E3 §4 to
  `packages/shared/src/schemas/coffee-variety.test.ts` and the 400 case to
  `apps/api/src/modules/coffee-variety/index.test.ts`; run `make test-shared` and
  `make test-specific filter=src/modules/coffee-variety` and see them fail.
- [ ] R6.7 In `packages/shared/src/schemas/coffee-variety.ts` add
  `COFFEE_VARIETY_LIST_MAX_ITEMS`, `COFFEE_VARIETY_LIST_ITEM_MAX_LENGTH` (docblocks) and the private
  `VarietyListSchema`, use it for the five list fields, update the schema docblock; re-run R6.6
  until green; regenerate `docs/api-reference.md`.

### 8. Risks / migration notes

An existing row with more than 20 items or a longer item (only possible through direct API use) can
no longer be saved unchanged through the admin form; the admin trims it. No migration.

---

## Extra E4: a soft-deleted taste note is invisible in the recipe edit picker and cannot be removed

### 1. Verification

- The API already returns the note: `findById` loads `tasteNotes: { with: { tasteNote: true } }`
  without a `deletedAt` filter (`recipe/model.ts:447-475`), and `GET /:slugOrId` flattens it with
  its `deletedAt`, `name`, `depth`, `parentId` (`recipe/index.ts:627-633`;
  `RecipeDetailFlatTasteNoteSchema`, `packages/shared/src/schemas/responses/recipe.ts:223-235`). **No
  API change is needed.**
- The edit page seeds `tasteNoteIds` from `recipe.tasteNotes` (`RecipeEditPage.tsx:156-161`) and
  renders `<TasteAutocomplete selectedIds={tasteNoteIds} …/>` (`:513-518`).
- `TasteAutocomplete` renders chips only for notes in its catalog
  (`components/taste/TasteAutocomplete.tsx:237`, `allNotes.filter((n) => selectedIds.includes(n.id))`),
  and the catalog (`resources/taste-notes`, static cache) excludes deleted notes. So the linked
  deleted note stays selected (re-sent on save; after r1 R1.2 that is accepted), shows on the detail
  page, but has no chip and cannot be removed. Failing case: link note T, admin deletes T, author
  opens the edit form → no chip for T; saving keeps T.
- Equipment already handles this: `equipmentOptions` (`RecipeEditPage.tsx:93-103`) adds linked
  items missing from the lookup. The coffee variety too: its chip uses the stored
  `coffeeVarietyName` with a clear button (`CoffeeVarietyPicker.tsx:156-172`).
- Other users of the picker: `RecipeCreatePage.tsx:470` (nothing linked yet). Fork has no picker.
- Tests: `RecipeEditPage.test.tsx:21-33` mocks the picker; `TasteAutocomplete.test.tsx` has no
  linked-but-missing case.

**Verdict: confirmed** (web only).

### 2. Root cause

The picker derives chip data only from the live catalog; the recipe's own linked notes are not
passed to it.

### 3. Fix design

- `TasteAutocomplete` gains an optional prop:

  ```ts
  /** Notes already linked to the recipe; a linked note missing from the catalog (soft-deleted since) still gets a removable chip. */
  linkedNotes?: TasteNote[];
  ```

  Chips come from the catalog plus linked notes the catalog lacks, in the current order:

  ```ts
  const selectedNotes = useMemo(() => {
    const known = new Set(allNotes.map((n) => n.id));
    const missing = (linkedNotes ?? []).filter((n) => !known.has(n.id));
    return [...allNotes, ...missing].filter((n) => selectedIds.includes(n.id));
  }, [allNotes, linkedNotes, selectedIds]);
  ```

  The dropdown keeps using `allNotes` only, so a removed deleted note cannot be re-added (r1 #1: a
  newly added deleted note is rejected by the API).
- `RecipeEditPage` passes `linkedNotes={linkedTasteNotes}` where
  `const linkedTasteNotes = useMemo(() => recipe.tasteNotes.map(({ id, name, depth, parentId }) => ({ id, name, depth, parentId })), [recipe])`
  (same pattern as `pickableEquipment`).
- Removing the chip goes through the existing `toggleNote` (drops the id and its intensity), so the
  save sends `tasteNoteIds` without it; r1 R1.2 only re-checks new ids, so the save passes.
- Before the catalog loads, linked chips render immediately (they are "missing" until then); this
  is an improvement (chips no longer pop in late).
- Rejected: a "removed from catalog" marker on the chip (needs two i18n keys; equipment and variety
  show no marker either, so it would be inconsistent); loading deleted notes into the catalog
  (they would become selectable again).

### 4. Tests (failing first)

- `apps/web/src/components/taste/TasteAutocomplete.test.tsx`:
  - "shows a removable chip for a linked note missing from the catalog": `setup({ selectedIds:
    ['gone-1'], linkedNotes: [{ id: 'gone-1', name: 'Tobacco', depth: 2, parentId: 'mid-x' }] })`
    → `Remove Tobacco` button exists; clicking it calls `onSelectionChange([])`. Fails today (no
    chip).
  - "does not offer a linked-only note in the dropdown": focus the input → no option named
    `Tobacco`.
- `apps/web/src/pages/recipes/RecipeEditPage.test.tsx`: extend the picker mock to render one button
  per `linkedNotes` entry (`linked: Cocoa`) and assert the page passes `linkedNotes` built from
  `recipe.tasteNotes` (`id`, `name`, `depth`, `parentId`); add `depth`/`parentId` to the fixture's
  `tasteNotes` entry (`:108`).

### 5. Spec impact

`openspec/specs/recipe-write/spec.md` — MODIFIED (not touched by any other track):

```markdown
### Requirement: Recipe edit page saves honestly
The recipe edit page SHALL describe the version choice truthfully, SHALL send `null` or `[]` for values the user cleared, and SHALL let the author edit every persisted field it pre-fills, including equipment, coffee variety and taste notes, even when a linked catalog record was soft-deleted since.

The checkbox label SHALL read "Save as a new version" (`recipe.editPage.bumpVersion`) with a hint
that changes with its state: off, "Updates the current version (v{current}) in place"
(`recipe.editPage.bumpHint.off`); on, "Creates version v{next}; v{current} stays unchanged"
(`recipe.editPage.bumpHint.on`). Keys SHALL exist in `en.json` and `tr.json`. Cleared text, number,
date, rating and emoji inputs SHALL be sent as `null`; removing all taste notes or equipment SHALL
send `[]`; fields the page does not render (additional preparations, pre-infusion, vendor, bean,
photos) SHALL be omitted so they are kept. The page SHALL pre-populate and allow changing equipment
(reusing the create page's picker) and coffee variety (a typeahead over
`GET /api/v1/coffee-varieties/search`). A taste note or equipment item linked to the current
version but missing from the picker's lookup (soft-deleted since) SHALL still render as a selected,
removable entry (the taste picker's `linkedNotes`, the equipment picker's options), and SHALL NOT
be offered for re-selection once removed. API validation errors SHALL be shown inline, and the page
SHALL navigate away only on success. The page SHALL follow the web-data-loading capability (route
loader and action).

#### Scenario: Cleared grinder is saved without bumping (regression)
- **WHEN** the author clears the grinder input and saves with the checkbox off
- **THEN** the request carries `"grinder": null` and the recipe page shows no grinder

#### Scenario: Hint reflects the choice
- **WHEN** the current version is 3 and the author ticks the checkbox
- **THEN** the hint reads that version 4 will be created and version 3 stays unchanged

#### Scenario: Removing all taste notes clears them
- **WHEN** the author removes every taste note and saves
- **THEN** the request carries `"tasteNoteIds": []` and the recipe page shows no taste notes

#### Scenario: Author changes the coffee variety
- **WHEN** the author picks variety "Gesha" in the edit form and saves
- **THEN** the recipe detail page shows "Gesha" linked to `/coffee-varieties/<id>`

#### Scenario: A deleted linked taste note can be removed
- **WHEN** the current version links taste note T, an admin soft-deletes T, and the author opens the edit form
- **THEN** T shows as a selected chip with a remove button, T is not offered in the dropdown, and after removing it and saving the request's `tasteNoteIds` no longer contains T
```

### 6. Docs / ledger impact

None (no route or doc describes the picker internals). No D99 entry exists.

### 7. Draft tasks

- [ ] R6.8 Failing first: add the two `TasteAutocomplete.test.tsx` cases and the
  `RecipeEditPage.test.tsx` `linkedNotes` assertion from audit/r6 E4 §4; run
  `docker compose run --rm --no-deps app pnpm --filter @brewform/web exec vitest run src/components/taste src/pages/recipes/RecipeEditPage.test.tsx`
  and see them fail.
- [ ] R6.9 Add the `linkedNotes` prop (docblock on the prop and an updated component docblock) to
  `apps/web/src/components/taste/TasteAutocomplete.tsx` with the memoised `selectedNotes` from
  audit/r6 E4 §3, and pass `linkedNotes` from `RecipeEditPage.tsx` (memoised from
  `recipe.tasteNotes`); re-run R6.8 until green; `make check-web`.

### 8. Risks / migration notes

Web only, no data change.

---

## Extra E5: the version-diff route passes the admin flag

### 1. Verification

What contradicts what:

| Source | Says |
|---|---|
| Code `recipe/index.ts:518` (diff) | `canViewRecipe(recipe, c.get('userId'), c.get('user')?.isAdmin)` → admin bypass |
| Code `recipe/index.ts:433` (versions), `:600` (detail), `:567` (collections) | no admin flag → author-only |
| `comment-authz` "Shared recipe-visibility predicate" | "the recipe GET routes have no admin bypass"; names only detail and versions (the diff route came later) |
| `recipe-visibility` "Visibility values have one meaning…" table | Direct link class, incl. "version diff": "`draft` and `private` for the author" |
| `version-diff` "Diff endpoint" | "private/draft only by author or admin" |
| `version-diff` "Authorization" | "`canViewRecipe(recipe, userId, isAdmin)` … same as sibling `/:slug/versions` route" + scenario "Admin views private recipe diff → 200" (the sibling passes no flag, so the sentence contradicts itself) |
| `docs/api.md:329`, `docs/recipes.md:250` | author-only ("viewable by the caller, as for the recipe detail") |
| Test `diff.route.test.ts:233-242` | "admin can diff a private recipe" → 200 |

- Effect: an admin gets 404 on a private recipe's detail and version list but 200 on its diff, which
  exposes the private version fields (`preparationNotes`, `personalNotes`, …). There is no UI path
  to it (the diff page is reached from the versions page, which 404s for the admin). Admin
  moderation of private recipes goes through `/api/v1/admin/*`.
- Other admin-flag users: `comment/service.ts:61,224` and `recipe-note/service.ts:49` pass
  `isAdmin` deliberately (`comment-authz`; `recipe-personal-notes` says the admin may pass the gate
  but reads only their own note). They are not recipe GET routes and stay as they are.

**Verdict: confirmed.** The code and the `version-diff` spec are wrong; every other source says
author-only.

### 2. Root cause

The diff route copied the comment surface's call instead of its sibling recipe routes', and the
`version-diff` spec recorded that as "same as sibling".

### 3. Fix design

- `recipe/index.ts:518`: `service.canViewRecipe(recipe, c.get('userId'))` (drop the third argument).
- `canViewRecipe` docblock (`recipe/service.ts:985-1003`): name the callers that pass the flag
  ("the comment and private-note surfaces") and say the recipe GET routes (detail, versions, diff,
  collections) pass none.
- MODIFY `version-diff` "Diff endpoint" (auth bullet) and "Authorization"; MODIFY `comment-authz`
  "Shared recipe-visibility predicate" to name all four recipe GET routes.
- Rejected: giving the admin bypass to every recipe GET route (contradicts the `recipe-visibility`
  meaning of private, and admins already have `/api/v1/admin/*`); changing only the spec to bless
  the bypass (keeps the asymmetry and the private-field exposure).
- `recipe-visibility`'s Direct link row also omits the comment/notes admin exception that
  `comment-authz` and `recipe-personal-notes` define; not changed here (those capabilities are
  explicit and more specific). Optional follow-up only.

### 4. Tests

- `apps/api/src/modules/recipe/diff.route.test.ts:233-242`: rename to "admin cannot diff another
  user's private recipe" and expect 404 `NOT_FOUND` "Recipe not found" (failing first; today 200).
  Keep the author-can-diff case (exists) and add "an admin who authored the private recipe can diff
  it" only if the fixtures allow it cheaply (optional).

### 5. Spec impact

`openspec/specs/version-diff/spec.md` — MODIFIED (scenarios converted to the WHEN/THEN form while
the block is replaced; their content is unchanged except the admin one):

```markdown
### Requirement: Diff endpoint

The system SHALL expose `GET /api/v1/recipes/:slug/versions/diff?v1=<uuid>&v2=<uuid>`.

- Auth: optional (public and unlisted recipes viewable by anyone; private/draft only by the author, with no admin bypass, as for the recipe detail)
- The endpoint SHALL return a JSON envelope with the diff payload
- Query params `v1` and `v2` MUST be required UUIDs identifying two `recipe_version` rows
- Both versions MUST belong to the recipe identified by `:slug`
- The endpoint SHALL reject `v1 === v2` with 400 VALIDATION_ERROR
- Response SHALL be `VersionDiffOutputSchema` wrapped in `successEnvelope`
- The route MUST be registered BEFORE the catch-all `/:slugOrId` route (same ordering as `/:slug/versions`)

#### Scenario: Public recipe diff by anonymous user
- **WHEN** an anonymous user requests the diff between v1 and v3 of a public recipe with 3 versions
- **THEN** the response is 200 with the full diff payload

#### Scenario: Private recipe diff by non-author
- **WHEN** user B requests a version diff of a private recipe owned by user A
- **THEN** the response is 404 NOT_FOUND (existence-hiding)

#### Scenario: Missing query params
- **WHEN** a request for a public recipe omits `v2`
- **THEN** the response is 400 VALIDATION_ERROR

#### Scenario: Same version requested twice
- **WHEN** a request for a public recipe sets both `v1` and `v2` to the same UUID
- **THEN** the response is 400 VALIDATION_ERROR
```

```markdown
### Requirement: Authorization

The system SHALL authorize the diff with `canViewRecipe(recipe, userId)` and no admin flag, exactly like the sibling `GET /:slug/versions` and `GET /:slugOrId` routes, so `draft` and `private` recipes are diffable only by their author.
Non-visible recipes SHALL return 404 (existence-hiding), not 403.

#### Scenario: Admin cannot diff another user's private recipe
- **WHEN** an admin who is not the author requests a version diff of a private recipe
- **THEN** the response is 404 `NOT_FOUND` "Recipe not found", the same answer the recipe detail and version list give that admin

#### Scenario: Author diffs their own private recipe
- **WHEN** the author requests a version diff of their private recipe
- **THEN** the response is 200 with the diff payload
```

`openspec/specs/comment-authz/spec.md` — MODIFIED (r1 only ADDs to this capability). The outer
fence below has four backticks because the block contains the spec's own ```` ```ts ```` fence:

````markdown
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
````

Note for the assembler: copy the block without the four-backtick fence; the inner ```` ```ts ````
fence is the one the current `openspec/specs/comment-authz/spec.md` already has.

### 6. Docs / ledger impact

- `docs/api.md:329` and `docs/recipes.md:250` already say author-only: no change.
- OpenAPI: no status change (404 documented). D99.9 text says the GET routes have no admin bypass:
  still true.

### 7. Draft tasks

- [ ] R6.10 Failing first: change `apps/api/src/modules/recipe/diff.route.test.ts:233` to "admin
  cannot diff another user's private recipe" expecting 404 `NOT_FOUND`; run
  `make test-specific filter=src/modules/recipe/diff.route.test.ts` and see it fail.
- [ ] R6.11 Drop the admin argument at `apps/api/src/modules/recipe/index.ts:518`; update the
  `canViewRecipe` docblock in `recipe/service.ts` (callers with and without the flag); re-run R6.10
  until green; write the two `version-diff` and the `comment-authz` MODIFIED blocks from audit/r6
  E5 §5.

### 8. Risks / migration notes

Admins lose an undocumented, UI-unreachable way to read private recipe versions. No data change.

---

## Extra E6: app-wide text tokens below 4.5:1 outside charts

### 1. Verification

Tokens (`apps/web/src/styles/globals.css`: light `:root` `:38-63`, `.dark` `:65-90`, `.coffee`
`:92-117`). Surfaces: `--bg-primary` (page, inputs, dropdowns), `--bg-secondary` (`.card`),
`--bg-tertiary` (chips, `.btn-secondary`, popups of `TasteNotesFilter`/`CoffeeVarietyPicker`/
`useCoffeeVarietyFilter`, comment reply boxes, hover states). WCAG ratios computed with the same
formula as `utils/chart/contrast.test.ts` (scripts in the scratchpad; values rounded):

| Text token / surface | light | dark | coffee | Where it is used as text (grep) |
|---|---|---|---|---|
| `--text-tertiary` / bp, bs | **2.52**, **2.31** | **3.65**, **3.16** | 6.18, 5.30 | 112 uses in 53 files: meta lines, labels, timestamps, empty states, help text (`Field.tsx`), placeholders |
| `--text-tertiary` / bt | **2.01** | **2.14** | **4.35** | reply timestamp (`CommentSection.tsx:437`), popup group labels and empty text (`TasteNotesFilter.tsx:241,247,318`), no-results (`CoffeeVarietyPicker.tsx:150`), chip remove "×" (`TasteAutocomplete.tsx:283`), hover labels (`EquipmentSection.tsx:80,110`) |
| `--text-secondary` / bt | 6.08 | **4.07** | 6.22 | reply body (`CommentSection.tsx:440`), taste chips (`TasteNotesPage.tsx:117-121`), badges (`MetadataBadges.tsx:85`) |
| `--error` / bs, `--error-bg` | **4.43**, **4.41** | **4.03**, **4.29** | 6.25, 6.98 | card errors (`OwnedItemCard.tsx:40`, `RecipeNotesSection.tsx:163,186`, danger zone `SettingsPage.tsx:293`, admin tables), **every `ErrorState` banner** (`ErrorState.tsx:24-25`) |
| `--success` / bp, bs | **3.30**, **3.02** | 7.68, 6.66 | ok | password checklist (`RegisterPage.tsx:167-197`), `OnboardingWizard.tsx:192`, `AdminUsersPage.tsx:171` |
| `--warning` / bp, bs | **3.19**, **2.92** | ok | ok | `AdminTasteNotesPage.tsx:110`, `AdminUsersPage.tsx:241` |
| `--warning` / `var(--warning-bg, #fffbeb)` | **3.07** | **2.07** | **1.61** | `AdminUserDetailPage.tsx:95`: `--warning-bg` is **not defined**, so the light fallback is used in every theme |
| `--accent-secondary` / bs, on `--diff-highlight` | **4.31**, **4.15** | 5.20, **3.65** | ok | `DiffHighlighter.tsx:45` (compare page "differs"), `MergeSelector.tsx:58`, `RecipeComparePage.tsx:140` |
| `--diff-added-text` / `--diff-added-bg` over bs | **4.15** | 5.13 | 6.36 | `VersionDiffPage.tsx:58`, `DiffHighlighter.tsx:16` |
| `--diff-removed-text` / `--diff-removed-bg` over bs | 5.10 | **3.42** | 4.88 | `VersionDiffPage.tsx:67`, `DiffHighlighter.tsx:17` |
| white / black literal on token fills | `#000` on warning 6.59 | white on accent **2.24**, on error **3.76**, on success **2.28** | white on accent **2.24**, on success **1.40** | `TypeBadge.tsx:10`, `CategoryTabs.tsx:28`, `NotificationBell.tsx:108`, `RecipeVersionsPage.tsx:85`, `SessionRestoreBanner.tsx:48`, `SettingsPage.tsx:138`, `AdminCompatibilityPage.tsx:106`, `AdminCoffeeVarietiesPage.tsx:496,516,523` |
| `var(--accent-tertiary)` | — | — | — | `AdminCoffeeVarietiesPage.tsx:89`: **not defined**, so the `market_name` badge has no background (white text on the card) |

- `--text-primary` passes everywhere (≥ 9.04). `--accent-primary` as link text passes on bp and bs
  (≥ 5.30). Text on `.btn-primary`/`.badge`/`.btn-danger` uses `var(--bg-primary)` and passes.
- The white-literal sites violate the existing `web-shared-components` requirement "Accent and
  danger actions use the shared button classes" (scenario: `grep "color: 'white'"` → zero hits on
  accent or error backgrounds); `TypeBadge` itself, created by that requirement, hard-codes white.
- r4 #19 covers only the four chart files (and moves the timeline header and vote count off
  `--text-tertiary`); its contrast test checks `--text-secondary` on `--bg-secondary` only.

**Verdict: bigger** than "`--text-tertiary` on cards".

### 2. Root cause

Token values were picked by eye; nothing tests text tokens outside charts, and a third text level
cannot reach 4.5:1 on the mid-tone `--bg-tertiary` (dark `#44403c`) without collapsing into
`--text-secondary`.

### 3. Fix design

**Rule.** Every text token meets 4.5:1 on every surface it is allowed on; `--text-primary` and
`--text-secondary` are allowed on all three surfaces, `--text-tertiary` only on `--bg-primary` and
`--bg-secondary` (page and card). On raised surfaces (`--bg-tertiary`: chips, popups, reply boxes,
hover states) the lowest text level is `--text-secondary`. Text on accent or status fills uses
`var(--bg-primary)` (as `.btn-primary`, `.badge`, `.btn-danger` already do), never a literal.

Why not make `--text-tertiary` pass on `--bg-tertiary` too: in dark it would need ≥ `#b5afaa`
(4.73 on bt), i.e. the same colour as `--text-secondary`, so the hierarchy collapses; in light it
would need `#6b6560` (1.33:1 against secondary). The surface rule keeps three visible levels.

**New token values** (only these change; hierarchy kept: light secondary/tertiary 1.48:1, dark
1.40:1):

| Token | light | dark | coffee |
|---|---|---|---|
| `--text-secondary` | `#57534e` (unchanged) | `#a8a29e` → **`#b5afaa`** (bp 8.06, bs 6.99, bt 4.73) | unchanged |
| `--text-tertiary` | `#a8a29e` → **`#736c67`** (bp 5.16, bs 4.73) | `#78716c` → **`#99938e`** (bp 5.76, bs 5.00) | `#c9a96e` unchanged (6.18, 5.30) |
| `--error` | `#dc2626` → **`#b91c1c`** (bp 6.47, bs 5.93, on error-bg 5.91) | `#ef4444` → **`#f87171`** (bp 6.32, bs 5.48, error-bg 5.84) | unchanged |
| `--success` | `#16a34a` → **`#15803d`** (bp 5.02, bs 4.60) | unchanged | unchanged |
| `--warning` | `#d97706` → **`#b45309`** (bp 5.02, bs 4.60, warning-bg 4.84) | unchanged | unchanged |
| `--warning-bg` (new) | **`#fffbeb`** | **`#451a03`** (warning 6.97) | **`#4a3510`** (warning 6.96) |
| `--accent-secondary` | `#8b6f47` → **`#7d6240`** (bp 5.69, bs 5.21, on highlight/bs 5.02) | `#b8914f` → **`#d4b483`** (bp 8.87, bs 7.70, highlight/bs 5.41) | unchanged |
| `--diff-added-text` | `#15803d` → **`#166534`** (on added-bg/bs 5.89) | unchanged | unchanged |
| `--diff-removed-text` | unchanged | `#ef4444` → **`#f87171`** (on removed-bg/bs 4.65) | unchanged |

Fills with `var(--bg-primary)` text after the change: accent 7.44/7.81/6.18, accent-secondary
5.69/8.87/8.84, error 6.47/6.32/7.28, success 5.02/7.68/9.84, warning 5.02/8.14/8.28,
text-secondary (market_name badge) 7.63/8.06/8.84. Darker light `--error` also darkens
`.btn-danger` (white text 6.47, better) and its hover mix; `--success`/`--warning` fills with
`--bg-primary` text improve. Marks drawn in `--text-tertiary` (`IntensityDots` empty border, empty
star stroke, `TasteNotesPage` icon) stay ≥ 3:1 on bs (4.73/5.00/5.30).

**Site changes:**
- `--text-tertiary` → `--text-secondary` on raised surfaces: `CommentSection.tsx:437`;
  `TasteNotesFilter.tsx:241,247,318`; `CoffeeVarietyPicker.tsx:150`; `TasteAutocomplete.tsx:283`;
  `EquipmentSection.tsx:80,110`; `BeanSection.tsx:150` (an emoji, so no visual change, but it trips
  the guard). The scroll-arrow icons (`TasteNotesFilter.tsx:221,325`) are marks (≥ 3:1) and stay.
- White/black literals → `var(--bg-primary)` (`text-[color:var(--bg-primary)]` in classes):
  `SessionRestoreBanner.tsx:48`, `NotificationBell.tsx:108`, `CategoryTabs.tsx:28`,
  `TypeBadge.tsx:10`, `SettingsPage.tsx:138`, `AdminCompatibilityPage.tsx:106`,
  `AdminCoffeeVarietiesPage.tsx:496,516,523`, `RecipeVersionsPage.tsx:85`.
- `AdminCoffeeVarietiesPage.tsx:89` `market_name: 'var(--accent-tertiary)'` →
  `'var(--text-secondary)'`; `AdminUserDetailPage.tsx:95` `var(--warning-bg, #fffbeb)` →
  `var(--warning-bg)`.

**Tests as the contract** (extend `apps/web/src/utils/chart/contrast.test.ts`, after r4 R4.10 adds
its `blend` helper; one parser, already excluded from the web tsconfig):
- a `themeAlphaTokens(selector)` parser for the `rgba(r, g, b, a)` tokens (the existing
  `themeTokens` parses `#rrggbb` only), composited over `--bg-primary`/`--bg-secondary` with r4's
  `blend`;
- a `TEXT_PAIRS` table checked for each theme (≥ 4.5):

  | fg | surfaces |
  |---|---|
  | `--text-primary`, `--text-secondary` | bp, bs, bt |
  | `--text-tertiary`, `--accent-primary`, `--accent-secondary`, `--success` | bp, bs |
  | `--error` | bp, bs, `--error-bg` |
  | `--warning` | bp, bs, `--warning-bg` |
  | `--diff-added-text`/`--diff-removed-text`/`--diff-modified-text` | their `--diff-*-bg` over bp and bs |
  | `--accent-secondary` | `--diff-highlight` over bp and bs |
  | `--bg-primary` (text on fills) | `--accent-primary`, `--accent-secondary`, `--error`, `--success`, `--warning`, `--text-secondary` |

- locked values so a token edit is noticed: `contrast(--text-tertiary, --bg-secondary)` ≈ 4.73 /
  5.00 / 5.30 (`toBeCloseTo(_, 1)`).

**Usage guard**, new `apps/web/src/styles/theme-usage.test.ts` (Node source scan with
`test-utils/source-scan.ts`; add the file to `apps/web/tsconfig.json` `exclude`):
1. no `'white'`, `'black'`, `'#fff'`, `'#ffffff'`, `'#000'`, `'#000000'` string literal and no
   `text-white`/`text-black` class in production `.tsx`;
2. no single element that sets a `--bg-tertiary` background and a `--text-tertiary` text colour:
   checked per `style={{ … }}` object literal, per `className="…"`/template literal, and per
   `className={[ … ].join(' ')}` array (un-prefixed `bg-[color:var(--bg-tertiary)]` or
   `bg-[var(--bg-tertiary)]` together with `text-[color:var(--text-tertiary)]`/`text-[var(--text-tertiary)]`).
   Nested cases (a child inside a raised container) cannot be found by a scan; the AGENTS.md rule
   covers them, and the site list above fixes today's.

Rejected: moving every `--text-tertiary` use to `--text-secondary` (loses the third level and
touches ~110 sites); darkening `--bg-tertiary` (changes every chip, button and popup surface).

**Coordination with r4 #19** (its `chart-rendering` MODIFIED block quotes old numbers): replace in
that block
- "Timeline tick labels SHALL use `--text-secondary` (6.99, 6.01 and 7.59:1) instead of
  `--text-tertiary` (2.31:1 in light)" → "Timeline tick labels SHALL use `--text-secondary` (6.99,
  6.99 and 7.59:1 against `--bg-secondary`)";
- "Chart components SHALL NOT use `--text-tertiary` as a text colour (2.31:1 in light and 3.16:1 in
  dark against `--bg-secondary`)" → "Chart components SHALL NOT use `--text-tertiary` as a text
  colour (it is reserved for page and card surfaces, see `web-shared-components` "Theme text tokens
  meet WCAG AA on the surfaces they are drawn on", and chart text sits on in-chart fills)";
- "while `--text-secondary` measured only 3.34, 2.09 and 3.26:1" → "while `--text-secondary`
  measures only 3.34, 2.43 and 3.26:1".
r4's locked phase-label values (7.65 / 5.04 / 4.73) are unaffected (`--text-primary`,
`--accent-primary` and `--bg-tertiary` do not change).

### 4. Tests (failing first)

- `apps/web/src/utils/chart/contrast.test.ts`: the `TEXT_PAIRS` describe and the locked
  `--text-tertiary` values (fail today: 2.31/3.16 etc.); define-every-token check extended with
  `--text-tertiary`, `--error`, `--error-bg`, `--success`, `--warning`, `--warning-bg`,
  `--accent-secondary`, `--bg-primary`, `--bg-tertiary` (fails today: no `--warning-bg`).
- `apps/web/src/styles/theme-usage.test.ts`: both rules (fail today on the ten literal sites and on
  `BeanSection.tsx:150`).
- Run: `docker compose run --rm --no-deps app pnpm --filter @brewform/web exec vitest run src/utils/chart/contrast.test.ts src/styles/theme-usage.test.ts`.
- Snapshot/text tests that assert inline colours (grep `'white'` in `*.test.tsx`, for example
  `TypeBadge.test.tsx` if present) are updated to `var(--bg-primary)`.

### 5. Spec impact

`openspec/specs/web-shared-components/spec.md` — ADDED:

```markdown
### Requirement: Theme text tokens meet WCAG AA on the surfaces they are drawn on
Every text colour token in `apps/web/src/styles/globals.css` SHALL measure at least 4.5:1 against every surface it is allowed on, in the light, dark and coffee themes, and `apps/web/src/utils/chart/contrast.test.ts` SHALL lock the allowed pairs.

- `--text-primary` and `--text-secondary` are allowed on `--bg-primary`, `--bg-secondary` and
  `--bg-tertiary`. `--text-tertiary` is allowed only on `--bg-primary` and `--bg-secondary`; chips,
  popups, reply boxes and hover states on `--bg-tertiary` use `--text-secondary` as their lowest
  text level.
- `--accent-primary`, `--accent-secondary` and `--success` are allowed on `--bg-primary` and
  `--bg-secondary`; `--error` also on `--error-bg`, `--warning` also on `--warning-bg` (defined in
  all three themes); each `--diff-*-text` on its `--diff-*-bg` and `--accent-secondary` on
  `--diff-highlight`, composited over `--bg-primary` and `--bg-secondary`.
- Text on an accent or status fill (`--accent-primary`, `--accent-secondary`, `--error`,
  `--success`, `--warning`, `--text-secondary`) uses `var(--bg-primary)`; production `.tsx` SHALL
  NOT contain a `white`, `black`, `#fff` or `#000` colour literal or a `text-white`/`text-black`
  class, and no single element SHALL combine a `--bg-tertiary` background with a `--text-tertiary`
  text colour (both enforced by `apps/web/src/styles/theme-usage.test.ts`). Every `var(--…)`
  colour a component uses SHALL be defined in all three theme blocks.

#### Scenario: Token matrix passes in every theme
- **WHEN** the contrast unit test parses the light, dark and coffee blocks of `globals.css`
- **THEN** every allowed text/surface pair, every diff composite and every `--bg-primary`-on-fill pair is at least 4.5:1, and `--text-tertiary` on `--bg-secondary` measures about 4.73, 5.00 and 5.30

#### Scenario: Error banners are readable in dark mode
- **WHEN** an `ErrorState` banner renders in the dark theme
- **THEN** its text (`--error` on `--error-bg`) measures at least 4.5:1

#### Scenario: No literal white text on a gold fill
- **WHEN** the usage guard scans `apps/web/src/**/*.tsx`
- **THEN** it finds no `white`/`black` colour literal and no `text-white` class, and `TypeBadge`, `CategoryTabs` and the notification badge render their text in `var(--bg-primary)`

#### Scenario: Tertiary text stays off raised surfaces
- **WHEN** the usage guard scans the same files
- **THEN** no style object, class string or class array sets both a `--bg-tertiary` background and a `--text-tertiary` text colour
```

Plus the three text edits to r4's `chart-rendering` MODIFIED block (§3).

### 6. Docs / ledger impact

- AGENTS.md "Code style": new bullet "**Theme colours:** text tokens meet 4.5:1 on the surface they
  sit on (`utils/chart/contrast.test.ts` locks the pairs). `--text-tertiary` only on page and card
  surfaces, never on `--bg-tertiary` chips, popups, reply boxes or hover states; text on accent or
  status fills is `var(--bg-primary)`, never `white`, `black` or a hex literal; a new colour token
  is defined in all three theme blocks (`styles/theme-usage.test.ts`)."
- Ledger: do **not** add r4's proposed D99 entry for `--text-tertiary` (cross-track note 3); it is
  fixed here.

### 7. Draft tasks

- [ ] R6.12 Failing first (after R4.10/R4.11): extend `apps/web/src/utils/chart/contrast.test.ts`
  with `themeAlphaTokens`, the `TEXT_PAIRS` matrix, the diff/highlight composites, the
  `--bg-primary`-on-fill pairs and the locked `--text-tertiary` values (update the file header); add
  `apps/web/src/styles/theme-usage.test.ts` with the two guard rules from audit/r6 E6 §3 and list it
  in `apps/web/tsconfig.json` `exclude`; run both files and see them fail.
- [ ] R6.13 In `apps/web/src/styles/globals.css` apply the token table from audit/r6 E6 §3 (incl. the
  new `--warning-bg` in all three blocks); move the nine `--text-tertiary` raised-surface sites to
  `--text-secondary`; replace the ten white/black literals with `var(--bg-primary)`; fix
  `AdminCoffeeVarietiesPage.tsx:89` and `AdminUserDetailPage.tsx:95`; update any test asserting the
  old inline colours; re-run R6.12 until green, then `make check-web`, `make lint` and `make test-web`.
- [ ] R6.14 Apply the three text edits to r4's `chart-rendering` block, add the
  `web-shared-components` ADDED requirement from audit/r6 E6 §5 and the AGENTS.md "Theme colours"
  bullet.

### 8. Risks / migration notes

Visible change in all themes: light tertiary text darker, dark secondary/tertiary text lighter,
light error/success/warning darker, dark accent-secondary lighter, badges on gold show dark text.
Re-run manual check 19.27 (themes at 320–1280 px) with a pass over cards, popups and the compare and
diff pages. No data change.

---

## Extra E7: logout (and login) are not synced across tabs

### 1. Verification

- Session: httpOnly auth cookies shared by all tabs (`api/client.ts:127-160`, `credentials:
  'include'`, one shared refresh). `AuthContext` keeps `user` in React state per tab
  (`contexts/AuthContext.tsx:48-167`); `logout()` (`:140-148`) clears cookies on the server and this
  tab's state only.
- Failing case (r4 cross-track note 4): open a private collection in tabs A and B, log out in A →
  B keeps rendering the collection and the signed-in navbar until its next navigation (then loaders
  get 401 and redirect to `/login?next=…`). Reverse case: log in in A while B is signed out → B keeps
  showing "Log in" and public-only data although its requests now carry A's cookies.
- No cross-tab code exists for auth. The pattern exists for the static cache:
  `invalidateStaticCache` writes `brewform-static-cache-bust` in `localStorage` inside try/catch
  (`api/static-cache.ts:93-99`), `useStaticCacheSync` listens to `storage` and never re-writes the
  marker (`hooks/useStaticCacheSync.ts:17-36`), mounted once in `App.tsx:25-26`
  (`static-cache` spec "Cache invalidation propagates across browser tabs").
- r4 #22 (R4.14/R4.15): `logout(leave?)` = server logout → `leave()` (navigate `/` with `replace`)
  → `setUser(null)`, through `useSignOut()`; sign-out always lands on `/` (decisions.md).
- Admin routes are a separate top-level route (`router.tsx:532`), not under `Layout`, so a listener
  inside `Layout` would miss `/admin/*` and the root error boundary.

**Verdict: confirmed** (sign-in is not mirrored either).

### 2. Root cause

The session store is per tab and never tells the other tabs that the shared cookies changed.

### 3. Fix design

**Mechanism: the `storage` event**, reusing the static-cache pattern (MDN: fires only in the other
documents of the origin; never in the writer, so no ping-pong). `BroadcastChannel` has the same
"not to the sender" semantics, but the storage event is already the repo's pattern, its jsdom
testing is established (`useStaticCacheSync.test.ts:53`), and it needs no channel lifecycle.

1. New `apps/web/src/utils/auth-broadcast.ts` (no React):

   ```ts
   /** localStorage key whose changes tell other tabs that this tab signed in or out. */
   export const AUTH_CHANGE_KEY = 'brewform-auth-change';
   /** A session change one tab announces to the others. */
   export type AuthChange = 'login' | 'logout';
   /** Writes `<change>:<Date.now()>` (a new value every time, so the event always fires); best-effort in private mode. */
   export function broadcastAuthChange(change: AuthChange): void {
     try { localStorage.setItem(AUTH_CHANGE_KEY, `${change}:${Date.now()}`); } catch { /* best-effort */ }
   }
   /** The change carried by a `storage` event, or `null` for other keys, removals and `clear()`. */
   export function readAuthChange(e: StorageEvent): AuthChange | null {
     if (e.key !== AUTH_CHANGE_KEY || !e.newValue) return null;
     const match = /^(login|logout):\d+$/.exec(e.newValue);
     return match ? (match[1] as AuthChange) : null;
   }
   ```

   The value holds no user id or PII.
2. `AuthContext.tsx` broadcasts: `login` and `register` call `broadcastAuthChange('login')` after
   `setUser(response.user)`; `logout(leave)` (r4's version) calls `broadcastAuthChange('logout')`
   right after the server logout settles (success or failure), before `leave()`. `refreshUser`, the
   bootstrap and a failed login never broadcast. `AuthContextType` does not change.
3. New `apps/web/src/hooks/useAuthTabSync.ts`:

   ```ts
   /** The data-router methods {@link useAuthTabSync} needs (a `createBrowserRouter`/`createMemoryRouter` instance satisfies it). */
   export interface AuthSyncRouter {
     navigate(to: string, opts?: { replace?: boolean }): Promise<void>;
     revalidate(): Promise<void>;
   }
   /**
    * Mirrors a sign-in or sign-out made in another tab. Sign-out: navigate to `/` (replace), then
    * re-read the session (the cookies are gone, so `user` becomes `null`); the order keeps render
    * guards from bouncing to `/login`. Sign-in: re-read the session, then revalidate the current
    * route so its loaders run with the new cookies. Never writes the marker. Mount once in `App.tsx`.
    */
   export function useAuthTabSync(router: AuthSyncRouter): void {
     const { refreshUser } = useAuth();
     useEffect(() => {
       log.debug({}, 'useAuthTabSync mounted');
       function onStorage(e: StorageEvent) {
         const change = readAuthChange(e);
         if (!change) return;
         log.info({ change }, 'useAuthTabSync session changed in another tab');
         void (change === 'logout'
           ? router.navigate('/', { replace: true }).then(refreshUser)
           : refreshUser().then(() => router.revalidate()));
       }
       globalThis.addEventListener('storage', onStorage);
       return () => { log.debug({}, 'useAuthTabSync unmounted'); globalThis.removeEventListener('storage', onStorage); };
     }, [router, refreshUser]);
   }
   ```

   `refreshUser` is a stable `useCallback` (`AuthContext.tsx:99`). Re-reading the session instead of
   blindly clearing it also handles a stale event (another tab signed out and back in): the tab
   adopts whatever the cookies say.
4. `App.tsx`: a private component `function AuthTabSync() { useAuthTabSync(getAppRouter()); return null; }`
   rendered inside `<AppProviders>` before the `Suspense`/`RouterProvider` (it needs `useAuth`, so it
   must be under `AuthProvider`; the router singleton's `navigate`/`revalidate` work outside the
   router tree). One mount covers `/admin/*` and error screens.

- `useEffect` allowlist (AGENTS.md): subscribing to the `storage` browser event; the handler
  navigates and revalidates (allowlisted) and asks the session store (the documented exception) to
  re-read the session. The hook imports no API client, so `architecture.test.ts` and
  `data-loading.enforcement.test.ts` stay green.
- Edge cases: an unsaved form in the other tab is left on sign-out (the session is gone; a save
  would fail anyway). Signing in as another user in A while B shows the first user's owner-only page:
  B revalidates and that loader now answers 404 (no data leak). `localStorage` unavailable: the
  broadcast is skipped, the local sign-out still completes.
- Rejected: `BroadcastChannel` (second mechanism, above); a hook inside `Layout` and `AdminLayout`
  (two mount points, misses the root error boundary); clearing `user` directly (needs a new context
  method and would trust a stale event).

### 4. Tests (failing first)

- New `apps/web/src/utils/auth-broadcast.test.ts`: `broadcastAuthChange('logout')` writes
  `logout:<digits>`; two calls write different values; a throwing `setItem` is swallowed;
  `readAuthChange` returns `null` for other keys, `newValue: null` and malformed values.
- New `apps/web/src/hooks/useAuthTabSync.test.tsx`: real `AuthProvider` with `../api/index.ts`
  mocked (`userApi.me`, `authApi.*`), a memory router with `/` (home text), `/collections/c1`
  (loader returning `{ name: 'Secret beans' }`), `/settings` (`<RequireAuth>`), `/recipes/r1`
  (loader counting calls), and a harness `function Harness({ router }) { useAuthTabSync(router);
  return <RouterProvider router={router} />; }`. Dispatch
  `new StorageEvent('storage', { key: AUTH_CHANGE_KEY, newValue: 'logout:1' })` on `window`.
  1. signed in on `/collections/c1`, `me` then rejects with `ApiError(401)` → pathname `/`,
     "Secret beans" gone, a `useAuth()` probe shows signed out;
  2. signed in on `/settings` → ends on `/`, never `/login` (`router.state.location.search === ''`);
  3. signed out on `/recipes/r1`, `me` then resolves a user, event `login:2` → probe shows the user
     and the loader ran once more;
  4. other key / `newValue: null` / `clear()` (`key: null`) → no navigation, `me` not called again.
- `apps/web/src/contexts/AuthContext.test.tsx` (mock `../utils/auth-broadcast.ts`): `login` and
  `register` success broadcast `'login'` once; a failed login does not; `logout` broadcasts
  `'logout'` even when `authApi.logout` rejects, before `leave` runs (r4's order test extended).
- Fails today: the hook and helper do not exist; `AuthContext` never writes the key.

### 5. Spec impact

`openspec/specs/web-data-loading/spec.md` — ADDED (next to r4's ADDED "Signing out leaves no private
data on screen"):

```markdown
### Requirement: Sign-in and sign-out are mirrored in every open tab
Signing in, registering or signing out in one tab SHALL write a `brewform-auth-change` marker to `localStorage`, and every other open tab of the app SHALL react to the resulting `storage` event: after a sign-out it SHALL navigate with `replace` to `/` and then re-read the session, and after a sign-in it SHALL re-read the session and revalidate the current route.

`broadcastAuthChange(change)` in `apps/web/src/utils/auth-broadcast.ts` writes `<change>:<Date.now()>`
inside a `try/catch` (a throwing `setItem` is ignored and the local action still completes);
`AuthContext` calls it after a successful login or registration and after the server logout
settles, and never from `refreshUser` or the session bootstrap. `useAuthTabSync(router)` in
`apps/web/src/hooks/useAuthTabSync.ts`, mounted once in `App.tsx` under the app providers, listens to
the `storage` event, ignores other keys, removals and malformed values, and never writes the marker,
so tabs cannot ping-pong (the event does not fire in the tab that wrote it). The marker carries no
user id. Navigating before the session is re-read keeps render guards from redirecting a signed-out
tab to `/login`.

#### Scenario: Logout in one tab clears a private page in another
- **WHEN** tabs A and B show the user's private collection and the user logs out in tab A
- **THEN** tab B shows `/`, no longer renders the collection, and shows the signed-out navbar

#### Scenario: A guarded page in another tab does not bounce to login
- **WHEN** tab B is on `/settings` and the user logs out in tab A
- **THEN** tab B lands on `/`, not on `/login?next=%2Fsettings`

#### Scenario: Login in one tab signs the other tab in
- **WHEN** tab B is signed out on a public recipe page and the user logs in in tab A
- **THEN** tab B shows the signed-in navbar and its recipe loader runs again with the session

#### Scenario: Unrelated storage changes are ignored
- **WHEN** another key changes in `localStorage`, or `localStorage.clear()` runs in another tab
- **THEN** no tab navigates or re-reads the session
```

### 6. Docs / ledger impact

- AGENTS.md "Web data loading" → Auth bullet (after r4's sign-out sentence): "Sign-in and sign-out
  broadcast `brewform-auth-change` through `localStorage`; `useAuthTabSync` (mounted once in
  `App.tsx`) mirrors them in the other tabs."
- `docs/architecture.md` near `:472` (the session-store paragraph): the same sentence; `docs/auth.md`
  "Logout" (`:240-247`): "Other open tabs follow: they leave the page for `/` and re-read the session."
- Ledger: do **not** add r4's proposed D99 entry for cross-tab session sync (cross-track note 4).

### 7. Draft tasks

- [ ] R6.15 Failing first (after R4.14/R4.15): add `apps/web/src/utils/auth-broadcast.test.ts`,
  `apps/web/src/hooks/useAuthTabSync.test.tsx` (four cases) and the broadcast assertions in
  `apps/web/src/contexts/AuthContext.test.tsx` from audit/r6 E7 §4; run
  `docker compose run --rm --no-deps app pnpm --filter @brewform/web exec vitest run src/utils/auth-broadcast.test.ts src/hooks/useAuthTabSync.test.tsx src/contexts/AuthContext.test.tsx`
  and see them fail.
- [ ] R6.16 Add `apps/web/src/utils/auth-broadcast.ts` and `apps/web/src/hooks/useAuthTabSync.ts`
  (docblocks, module loggers, mount/unmount debug logs, an info log with `{ change }` only), call
  `broadcastAuthChange` from `login`, `register` and `logout` in `contexts/AuthContext.tsx` (update
  their docblocks), render the `AuthTabSync` component in `App.tsx` (update the `App` docblock);
  re-run R6.15 until green; `make check-web`, `make lint`, `make test-web`; update AGENTS.md,
  `docs/architecture.md` and `docs/auth.md` per audit/r6 E7 §6.

### 8. Risks / migration notes

Web only. A tab in the middle of a form loses its unsaved input when another tab signs out
(intended: the session is gone). Older tabs still running the previous bundle after a deploy do not
listen until reloaded.

---

## Extra E8: the sitemap needs a sitemap index past 50,000 URLs

### 1. Verification

- `apps/api/src/routes/sitemap.ts`: one `<urlset>` at `/api/v1/sitemap.xml` (mounted
  `routes/index.ts:48`) with the 5 static pages, every listable recipe (`:54-64`, no `limit`) and
  every distinct author of a listable recipe (`:65-75`, no `limit`, no order); cached as one string
  for 24 h (`:14-17,162-199`). Past 50,000 URLs the file breaks the protocol limit and search
  engines reject it (review #33). r1 §33 only caps the lists (silently dropping the rest).
- **Bigger 1 — location scope.** Google: "unless you submit your sitemap through Search Console, a
  sitemap affects only descendants of the parent directory"; the `robots.txt` reference is not an
  exception. Today's sitemap lives in `/api/v1/`, is announced only through `robots.txt`
  (`apps/web/public/robots.txt`, `vite.config.ts:27-45`), and lists `/recipes/…` and `/u/…`, which
  are not under `/api/v1/`. So Google ignores every recipe and profile URL unless the operator
  submits it in Search Console. Index children must also sit "in the same directory as the sitemap
  index file, or lower". A correct index therefore lives at the site root, with its pages at the
  root too.
- **Bigger 2 — deleted accounts.** `getActiveUsers` does not filter `users.deletedAt`; a deleted
  account's public recipes stay listable (account deletion soft-deletes only the user row), so its
  `/u/<username>` is listed although `findByUsername` (`user/model.ts:63-67`) filters `deletedAt` and
  the profile answers 404.
- Proxying: the web edge proxies `/api/*`, `/uploads/*`, `/share/*` and `/health`
  (`docker-web-entrypoint.sh:99`); the Vite dev server proxies `/api` only (`vite.config.ts:70-75`);
  the API already serves a root-level route outside `/api/v1` (`/share`, `routes/index.ts:47`).
  `crawlerMiddleware` (`middleware/crawler.ts:13,56`) only handles `/recipes/:slug`; share pages are
  unaffected.
- Callers and tests: `routes/sitemap.test.ts` (unit with `deps` stubs `:8-169`, DB-backed visibility
  `:171-200`); `openapi.coverage.test.ts:58-79` (`IN_SCOPE_BASE_PATHS` has `/api/v1/sitemap.xml`) and
  `:280-286` (first op whose path contains `sitemap` must be `application/xml`);
  `scripts/ci/smoke-images.sh:246-252` (`$WEB/api/v1/sitemap.xml` → 200, `<urlset`);
  `scripts/ci/web-entrypoint.test.sh:205-206` (robots line) and `:220-221` (`/api/*` proxied, using
  the sitemap path); `apps/web/src/robots.test.ts` (rules only).
- Specs naming the path: `container-deployment` "Web edge reverse-proxies API paths when an upstream
  is configured" (scenario uses `/api/v1/sitemap.xml`) and "Web image applies the public app URL at
  runtime" (robots line); `recipe-visibility` "Discovery surfaces list only public recipes" (deps
  table); r3's MODIFIED `ci-image-publishing` block (smoke step).

**Verdict: bigger.**

### 2. Root cause

The sitemap was built as one unbounded document under the API prefix, which is outside the
directory its URLs live in.

### 3. Fix design

**Shape.** One API route at the site root, `GET /sitemap.xml`, with a validated query:

- no `part` → the **sitemap index** (`<sitemapindex>`), listing `…/sitemap.xml?part=static`, then
  `…/sitemap.xml?part=recipes&page=1..R` and `…/sitemap.xml?part=users&page=1..U`, where `R`/`U` are
  `ceil(count / SITEMAP_PAGE_SIZE)` from two `count()` queries (a part with no rows is omitted;
  `static` is always listed). `<loc>` values are entity-escaped (`&` → `&amp;`, existing
  `escapeXml`); no `<lastmod>` (optional; would cost a query per page).
- `part=static` → `<urlset>` of the 5 static pages (`page` must be 1).
- `part=recipes&page=N` / `part=users&page=N` → `<urlset>` of at most `SITEMAP_PAGE_SIZE = 50_000`
  URLs.
- A page with no rows (or `static` with `page > 1`) → 404 `NOT_FOUND` "Sitemap page not found"
  (not cached). An invalid query → 400 `VALIDATION_ERROR` (`zValidator` + `zodValidationHook`).
- `GET /api/v1/sitemap.xml` → **301** to `${baseUrl}/sitemap.xml` (keeps Search Console submissions
  and old `robots.txt` files working; the index cannot stay under `/api/v1/` because its children
  live higher up).

Why query pages instead of `/sitemap-recipes-2.xml` files: one literal path (no regexp route, one
`describeRoute`, one exact Caddy/Vite proxy path), the children stay in the root directory (Google's
rule), and query-string sitemap URLs are valid (`<loc>` just needs `&amp;`).

Why always an index (not "an index only when needed"): one code path and one test matrix; Google
accepts an index wherever a sitemap is expected; a small site costs crawlers three extra small
requests.

**Bounded reads** (AGENTS.md), all in the existing `deps` of `routes/sitemap.ts` (still the
route-level query file `recipe-visibility` names):

```ts
/** Most URLs in one sitemap page (sitemaps.org: 50,000 URLs and 50 MB per file). */
export const SITEMAP_PAGE_SIZE = 50_000;

export const deps = {
  countPublicRecipes: async () => …select({ count: count() }).from(recipes).where(listableRecipeCondition(null)),
  countListedAuthors: async () => …select({ count: count() }).from(users).where(listedAuthorCondition(db)),
  getPublicRecipes: async (page: number, pageSize = SITEMAP_PAGE_SIZE) =>
    …select({ slug: recipes.slug, updatedAt: recipes.updatedAt }).from(recipes)
      .where(listableRecipeCondition(null))
      .orderBy(asc(recipes.createdAt), asc(recipes.id))
      .limit(pageSize).offset((page - 1) * pageSize),
  getListedAuthors: async (page: number, pageSize = SITEMAP_PAGE_SIZE) =>
    …select({ username: users.username, updatedAt: users.updatedAt }).from(users)
      .where(listedAuthorCondition(db))
      .orderBy(asc(users.createdAt), asc(users.id))
      .limit(pageSize).offset((page - 1) * pageSize),
};

/** Non-deleted users who author at least one listable recipe. */
function listedAuthorCondition(db: typeof DbType): SQL {
  return and(
    isNull(users.deletedAt),
    inArray(users.id, db.select({ id: recipes.authorId }).from(recipes).where(listableRecipeCondition(null))),
  ) as SQL;
}
```

- `inArray(col, subquery)` replaces `selectDistinct` + join (Drizzle fact above), so ordering and
  counting need no `DISTINCT` and no raw SQL.
- Stable order by `(createdAt, id)` ascending: new public recipes land on the last page, so earlier
  pages rarely change between crawls; `recipe_created_at_id_idx` (`schema.ts:230`, `created_at DESC,
  id DESC`) serves the ordered scan backwards. Offset paging is fine at this scale (one bounded
  query per page per 24 h); keyset would need per-page boundary keys in the index.
- Size by construction: 50,000 × (≈ 110 fixed bytes + base URL + slug or username ≤ 255 chars,
  `schema.ts:106,165`) ≈ 25 MB worst case with a 100-character base URL, under 50 MB; slugs and
  usernames need no entity escaping beyond `escapeXml`. Index entries: 1 + R + U ≤ 50,000 for any
  catalogue under ~1.2 billion rows; the query schema caps `page` at 50,000.

**Caching.** Each document is cached separately for 24 h through the injected `CacheProvider`: keys
`['sitemap', 'index']` and `['sitemap', part, String(page)]` (exported
`sitemapCacheKey(part?, page?)`), with one in-flight build per key (a `Map<string, Promise<…>>`
replacing `inFlightSitemapBuildPromise`). A 404 result is not cached. Total cached bytes equal
today's single document (today's unbounded string is the same URLs in one entry), so memory does
not regress; with `CACHE_DRIVER=redis` the pages go to Valkey. The index and pages can disagree for
up to 24 h (an emptied last page answers 404; new rows past the last page appear after the index
refresh): the same staleness as today.

**Routing and proxying.**
- `routes/sitemap.ts` registers `GET /sitemap.xml` and `GET /api/v1/sitemap.xml` (301) on one
  router mounted at `/` in `routes/index.ts` (replacing `routes.route('/api/v1/sitemap.xml', …)`).
  `baseUrl` stays `config.PUBLIC_APP_URL || config.APP_URL`; after r2 R2.17 the env schema strips the
  trailing slash, so no local trim (E8's tasks come after R2.17).
- Query schema in `packages/shared/src/schemas/sitemap.ts` (AGENTS.md: controllers validate with
  shared schemas): `SitemapQuerySchema = z.object({ part: z.enum(['static', 'recipes', 'users']).optional(), page: z.coerce.number().int().min(1).max(50_000).default(1) })`,
  exported from the schemas barrel with a docblock and a co-located test.
- Web edge: `docker-web-entrypoint.sh:99` matcher `@api path /api/* /uploads/* /share/* /health /sitemap.xml`
  (exact path; Caddy matches the path component and passes the query, facts above), plus the
  comment (`:14-16`) and log line (`:115`); `apps/web/Caddyfile:7-8` header comment.
- Vite dev: `vite.config.ts` `server.proxy` gains `'/sitemap.xml': { target: apiProxyTarget, changeOrigin: true }`.
- `robots.txt`: `public/robots.txt` → `Sitemap: /sitemap.xml`; the `build-robots-txt` plugin →
  `${vitePublicAppUrl}/sitemap.xml` (or `/sitemap.xml`). The entrypoint's `PUBLIC_APP_URL` rewrite
  replaces only the origin (`docker-web-entrypoint.sh:150-183`), so it needs no change.
- Split-domain topology (Coolify without `API_UPSTREAM`): `/sitemap.xml` on the web origin returns
  the SPA, exactly like `/api/v1/sitemap.xml` today. D99.58 stays open; its text changes to the new
  path.
- `make preview` (static root `Caddyfile`) behaves as today (no API proxy).

**OpenAPI.** `describeRoute` for `GET /sitemap.xml` (tags `['Sitemap']`; summary "Get the sitemap
index or one sitemap page"; description of the parts, the 50,000-URL page size and why it is served
at the root; `parameters` for `part` (enum) and `page` (integer 1–50,000, default 1); responses 200
`application/xml` (no JSON envelope), 400 and 404 `resolver(ErrorEnvelopeSchema)`), and for the
legacy path (`deprecated: true`, summary "Redirect to /sitemap.xml", response 301 with a `Location`
header). `openapi.coverage.test.ts`: add `'/sitemap.xml'` to `IN_SCOPE_BASE_PATHS`; the XML test
targets the exact path `/sitemap.xml`; a new test checks the legacy op documents 301. Regenerate
`docs/api-reference.md`.

**Logging.** `export const log = createLogger('sitemap')`; `log.debug({ part, page }, 'sitemap build started')`,
`log.debug({ part, page, urlCount }, 'sitemap build completed')`, `log.debug({ part, page }, 'sitemap page not found')`.

**How this combines with r1 #33:** E8 supersedes it completely. Drop r1's tasks R1.20/R1.21, its
constants (`SITEMAP_MAX_URLS`, `SITEMAP_USER_LIMIT`, `SITEMAP_RECIPE_LIMIT`), its truncation warn and
its ADDED requirement "The sitemap stays within the sitemap protocol limit". Kept from r1: the
`STATIC_PAGES` module constant, the `log` export, ordered and limited `deps` (now paged instead of
truncated), the DB-backed "limit 1" style test (adapted to `pageSize = 1`), and r1's AGENTS.md
"Bounded reads" wording.

Rejected: r1's cap-and-warn (drops URLs and still leaves the directory-scope problem); path-style
child files `/sitemap-recipes-<n>.xml` (regexp route, wildcard proxy rule, same outcome); keeping
the index under `/api/v1/` (Google would ignore the URLs); keyset paging (needs boundary keys);
serving the sitemap from the web image (the web container has no database).

### 4. Tests (failing first)

- `apps/api/src/routes/sitemap.test.ts` (rewrite the unit block; `deps` stubs via `vi.spyOn`):
  1. `GET /sitemap.xml` with `countPublicRecipes → 100_001`, `countListedAuthors → 0` returns
     `<sitemapindex`, `Content-Type: application/xml; charset=utf-8`, the `static` loc, recipe pages
     1–3 (`?part=recipes&amp;page=3`) and no users loc.
  2. `?part=static` lists the 5 static pages; `?part=static&page=2` → 404.
  3. `?part=recipes&page=2` calls `getPublicRecipes(2)` and lists its rows with `lastmod`; an empty
     result → 404 and nothing cached.
  4. `?part=bogus`, `?page=0`, `?page=50001` → 400 `VALIDATION_ERROR`.
  5. `GET /api/v1/sitemap.xml` → 301 with `Location: <base>/sitemap.xml`.
  6. Cache: a second request for the index and for `recipes/1` returns the cached XML without
     calling `deps`; keys differ per part/page (adapt the three existing cache tests).
  7. `SITEMAP_PAGE_SIZE === 50_000`, and `buildUrlsetXml` for 50,000 entries with 255-character
     slugs and a 100-character base URL is under 52,428,800 bytes.
- Same file, DB-backed block (existing `VisibilityFixtures`):
  - a public fixture recipe with `createdAt = 2000-01-01T00:00:00Z` is the single row of
    `deps.getPublicRecipes(1, 1)` and absent from `deps.getPublicRecipes(2, 1)` (fails today: no
    paging);
  - `deps.countPublicRecipes()` grows by 1 after a public fixture and not after an unlisted one;
  - a soft-deleted author of a public recipe is in neither `deps.getListedAuthors(1)` nor
    `deps.countListedAuthors()` (fails today);
  - the existing unlisted-author case moves to `getListedAuthors`.
- `packages/shared/src/schemas/sitemap.test.ts`: defaults (`page` 1), coercion, bounds, enum.
- `apps/api/src/routes/openapi.coverage.test.ts`: `IN_SCOPE_BASE_PATHS` + the exact-path XML test +
  the 301 test.
- `apps/web/src/robots.test.ts`: both sources end their `Sitemap:` line with `/sitemap.xml` and
  contain no `/api/v1/sitemap.xml`.
- `scripts/ci/web-entrypoint.test.sh`: the expected robots line becomes
  `Sitemap: https://brew.example.org/sitemap.xml`; add
  `assert_contains "/sitemap.xml is proxied with its query" "$(fetch edge '/sitemap.xml?part=recipes&page=2')" "uri=/sitemap.xml?part=recipes&page=2"`.
- `scripts/ci/smoke-images.sh:246-252`: fetch `$WEB/sitemap.xml` (200, XML, body contains
  `<sitemapindex`) and assert `$WEB/api/v1/sitemap.xml` answers `301` with a `location:` header
  ending in `/sitemap.xml`.

### 5. Spec impact

`openspec/specs/recipe-visibility/spec.md` — ADDED. **Replaces r1 §33.5's ADDED "The sitemap stays
within the sitemap protocol limit".**

```markdown
### Requirement: The sitemap is a root-level sitemap index with bounded pages
`GET /sitemap.xml` SHALL answer, without a `part` query, a sitemaps.org sitemap index that lists `?part=static` and one `?part=recipes&page=N` and `?part=users&page=N` entry per 50,000 rows, and with `part` that page as a `<urlset>` of at most 50,000 URLs read with a SQL `limit` and `offset` in a stable order.

- The route is served by the API at the site root and proxied by the web edge, so the index, its
  pages and the `/recipes/…` and `/u/…` URLs they list share the root directory (search engines
  apply a sitemap only to URLs under its own directory, and index children must sit in the index's
  directory or lower). `robots.txt` announces `<public origin>/sitemap.xml`.
  `GET /api/v1/sitemap.xml` answers 301 to it.
- Page counts come from `count()` queries with the same conditions as the rows. Recipe pages order
  by `createdAt`, then `id`; user pages by the user's `createdAt`, then `id`. `SITEMAP_PAGE_SIZE`
  (50,000) is a module constant of `apps/api/src/routes/sitemap.ts`, and `page` is capped at
  50,000 by `SitemapQuerySchema` in `packages/shared/src/schemas/sitemap.ts`.
- A page without rows answers 404 `NOT_FOUND`; an invalid query answers 400 `VALIDATION_ERROR`.
- The index and every page are cached separately for 24 hours through the injected
  `CacheProvider`, with one in-flight build per document.

#### Scenario: Large catalogue is split into pages
- **WHEN** 120,000 public recipes exist and a crawler requests `GET /sitemap.xml`
- **THEN** the index lists the static page, recipe pages 1, 2 and 3, and the user pages, and `GET /sitemap.xml?part=recipes&page=3` returns a `<urlset>` with the last 20,000 recipes

#### Scenario: Every page stays within the protocol limits
- **WHEN** any `?part=recipes` or `?part=users` page is requested
- **THEN** it lists at most 50,000 URLs and is smaller than 50 MB

#### Scenario: A page past the end is not found
- **WHEN** `GET /sitemap.xml?part=recipes&page=4` is requested for that catalogue
- **THEN** the response is 404 `NOT_FOUND`

#### Scenario: The old sitemap URL redirects
- **WHEN** a crawler requests `GET /api/v1/sitemap.xml`
- **THEN** the response is 301 with `Location: <public origin>/sitemap.xml`
```

`openspec/specs/recipe-visibility/spec.md` — MODIFIED (no other track modifies this block):

```markdown
### Requirement: Discovery surfaces list only public recipes

The system SHALL return only non-deleted `public` recipes, for every viewer including the recipe's author, from each discovery surface, and each surface's query SHALL use `listableRecipeCondition(null)`.

| Surface | Query |
|---|---|
| `GET /api/v1/recipes` (non-admin, offset and cursor; every filter, sort and search) and the home grids | `buildListRecipesWhere` in `recipe/model.ts`, executed by `findListPage`/`findCursor` |
| Follow feed (offset and cursor) | `getFeed` in `recipe/model.ts` |
| `GET /api/v1/equipment/:id/recipes` | `getRecipesUsingEquipment` in `equipment/model.ts` |
| `GET /api/v1/coffee-varieties/:id/recipes` | `getRecipesUsingVariety` in `coffee-variety/model.ts` |
| `GET /api/v1/users/:username` `recipes` and `recipeCount` | `getUserPublicRecipes` and `getUserStats` in `user/model.ts` |
| `GET /sitemap.xml` recipe and user pages and the index's page counts | `deps.getPublicRecipes`, `deps.countPublicRecipes`, `deps.getListedAuthors` and `deps.countListedAuthors` in `routes/sitemap.ts` |

- Totals and counts SHALL use the same condition as the rows they count.
- `buildListRecipesWhere` keeps one exemption: when an admin passes `visibility`, it filters on that
  value (marked `// visibility-exempt: admin filter`). An admin without a filter gets the public list.
- The sitemap lists a user only when they have at least one listable recipe and their account is
  not soft-deleted.

#### Scenario: Search never finds an unlisted recipe

- **WHEN** anyone, including U's author, sends `GET /api/v1/recipes?search=<U's exact title>` or `GET /api/v1/recipes?authorId=<A>`
- **THEN** U is not in `data` and is not counted in `meta.pagination.total`

#### Scenario: Category pages exclude unlisted recipes

- **WHEN** U's current version uses equipment E and coffee variety V
- **THEN** `GET /api/v1/equipment/<E>/recipes` and `GET /api/v1/coffee-varieties/<V>/recipes` omit U and their `total` excludes it

#### Scenario: Feed excludes unlisted recipes

- **WHEN** B follows A and requests the feed in offset mode and in cursor mode
- **THEN** neither response contains U

#### Scenario: Profile shows public recipes to everyone, including the owner

- **WHEN** an anonymous visitor, B and A each request `GET /api/v1/users/<A's username>`
- **THEN** every response's `recipes` omits U, and `recipeCount` counts only A's non-deleted public recipes

#### Scenario: Sitemap skips unlisted recipes and their authors

- **WHEN** user C's only recipe is unlisted
- **THEN** no sitemap page contains that recipe's `/recipes/<slug>` URL or `/u/<C's username>`

#### Scenario: Sitemap skips deleted accounts

- **WHEN** user D has public recipes and deletes their account
- **THEN** no sitemap page contains `/u/<D's username>`, and D's public recipes stay listed
```

`openspec/specs/container-deployment/spec.md` — MODIFIED (r3 modifies other requirements of this
capability, not these two):

```markdown
### Requirement: Web edge reverse-proxies API paths when an upstream is configured
When `API_UPSTREAM` is set to a valid `host:port`, the web container SHALL reverse-proxy every request whose path starts with `/api/`, `/uploads/` or `/share/`, and requests for the exact paths `/health` and `/sitemap.xml`, to that upstream with the original path and query preserved, and when `API_UPSTREAM` is unset it SHALL serve only static files exactly as before.

`/health` is proxied so an external uptime monitor can check the API's liveness through the single
public origin. `/sitemap.xml` is proxied because the sitemap index and its pages must live at the
site root (capability `recipe-visibility`). `/ready` is NOT proxied: readiness is for the
orchestrator on the internal network. The web container's own `/healthz` is always answered
locally.

The entrypoint SHALL validate `API_UPSTREAM` against a `host[:port]` allowlist; an invalid value is
logged as a warning and ignored (static-only mode). On proxied requests the edge SHALL:
- resolve the client IP by trusting incoming forwarding headers only from the ranges in
  `TRUSTED_PROXIES` (unset: trust no proxy; `private_ranges` and CIDR lists accepted), parsing
  `X-Forwarded-For` right-to-left
- send the upstream exactly one `X-Forwarded-For` entry and an `X-Real-IP`, both equal to that
  resolved client IP, replacing any client-supplied values. The API therefore always sees the edge
  as one trusted hop (`TRUST_PROXY=hops`, `TRUST_PROXY_HOPS=1` in the `api-rate-limiting`
  capability), whatever proxies sit in front of the edge
- reject request bodies larger than `EDGE_MAX_BODY_SIZE` (default `16MB`) with `413`
- return `502` for proxied paths while the upstream is unreachable, while still serving the SPA

Unset `API_UPSTREAM` keeps the split-domain topology used by Coolify (web and API on separate
domains) unchanged.

#### Scenario: API request is proxied same-origin
- **WHEN** the web container runs with `API_UPSTREAM=api:8000` and the browser requests `GET /sitemap.xml?part=static` from the web origin
- **THEN** the response is the API's sitemap XML, not `index.html`
- **AND** `GET /api/v1/sitemap.xml` from the web origin is answered by the API (its 301 to `/sitemap.xml`)

#### Scenario: Uploads and share paths are proxied
- **WHEN** `GET /uploads/<file>` and `GET /share/<slug>` are requested from the web origin with `API_UPSTREAM` set
- **THEN** both are answered by the API service

#### Scenario: API liveness is reachable through the edge
- **WHEN** `GET /health` is requested from the web origin with `API_UPSTREAM` set and the API running
- **THEN** the response is the API's `200` `{"status":"ok"}`
- **AND** `GET /ready` from the web origin is not forwarded to the API

#### Scenario: Static-only mode without an upstream
- **WHEN** the web container runs without `API_UPSTREAM`
- **THEN** `GET /api/v1/anything` and `GET /sitemap.xml` return the SPA `index.html` as before
- **AND** the entrypoint logs that the API proxy is disabled

#### Scenario: Invalid upstream is ignored
- **WHEN** the web container starts with `API_UPSTREAM="api:8000; rm -rf /"`
- **THEN** the entrypoint logs a warning and starts in static-only mode

#### Scenario: Spoofed client IP headers are overwritten
- **WHEN** a client connecting directly (not from `TRUSTED_PROXIES`) sends `X-Real-IP: 1.2.3.4` and `X-Forwarded-For: 1.2.3.4` to a proxied path
- **THEN** the upstream receives `X-Real-IP` and a single-entry `X-Forwarded-For`, both set to the client's actual address

#### Scenario: Client IP behind a trusted outer proxy is preserved
- **WHEN** `TRUSTED_PROXIES=private_ranges` and a proxy at `10.0.0.5` forwards a request with `X-Forwarded-For: 1.2.3.4, 203.0.113.9`
- **THEN** the upstream receives `X-Forwarded-For: 203.0.113.9` and `X-Real-IP: 203.0.113.9` (the right-most untrusted address)

#### Scenario: Oversized request body is rejected at the edge
- **WHEN** a client sends a 20 MB body to `/api/v1/photos` with the default `EDGE_MAX_BODY_SIZE`
- **THEN** the edge responds `413` without forwarding the full body

#### Scenario: Upstream outage does not break the SPA
- **WHEN** the API container is stopped
- **THEN** proxied paths return `502`
- **AND** `GET /` still returns `index.html` and `GET /healthz` still returns `200`
```

```markdown
### Requirement: Web image applies the public app URL at runtime
When `PUBLIC_APP_URL` is set to a valid absolute `http(s)` origin, the web entrypoint SHALL replace the build-time public origin in `index.html` (the `og:image` and `twitter:image` meta tags) and in `robots.txt` (the `Sitemap:` line) with that origin before Caddy starts; when it is unset or invalid, the build-time values SHALL remain.

The value SHALL be validated against a strict origin allowlist (scheme, host, optional port and
path made of URL-safe characters, no trailing slash) before substitution. Self-hosted deployments
that pull the published image therefore advertise their own domain instead of the maintainer's or
`http://localhost:8080`.

#### Scenario: Runtime public URL rewrites social and sitemap URLs
- **WHEN** the web container starts with `PUBLIC_APP_URL=https://brew.example.org`
- **THEN** `index.html` contains `https://brew.example.org/og-default.png` in its `og:image` and `twitter:image` tags
- **AND** `robots.txt` contains `Sitemap: https://brew.example.org/sitemap.xml`

#### Scenario: Unset public URL keeps build-time values
- **WHEN** the web container starts without `PUBLIC_APP_URL`
- **THEN** `index.html` and `robots.txt` are byte-identical to the built files
```

r3's MODIFIED `ci-image-publishing` "Pull requests build and smoke-test both images without
publishing" (`audit/r3-deploy-ops-seed.md:1419-1420`): replace "and `GET /api/v1/sitemap.xml`
returns the API's XML through the edge" with "`GET /sitemap.xml` returns the API's XML sitemap
index through the edge, and `GET /api/v1/sitemap.xml` answers `301` to it". r3 §12's note "checks
that `/api/v1/sitemap.xml` is an XML `<urlset`" (`:903-904`) becomes "`/sitemap.xml` is an XML
`<sitemapindex`" (the `static` part is always listed, so a production install without demo content
still passes).

### 6. Docs / ledger impact

- `docs/seo.md` "Sitemap" (`:121-131`): rewrite for the index, the three parts, the 50,000-URL pages,
  the root location and why (search engines' directory scope), the 301 from the old path, caching
  per document; "robots.txt" (`:133-142`): `Sitemap: /sitemap.xml` and
  `${VITE_PUBLIC_APP_URL}/sitemap.xml`; `:189` proxied list.
- `README.md:30`: "`/sitemap.xml` (a sitemap index) lists public recipes…".
- `docs/api.md:17`: `/sitemap.xml` and `/share/*` are served at the API root (proxied by the edge);
  `/api/v1/sitemap.xml` is a deprecated 301. `docs/request-lifecycle.md:28`: the new path.
- Proxied-path lists: `AGENTS.md:421`, `compose.production.yml:35`, `docs/deployment_compose.md:43`,
  `docs/deployment_coolify.md:206,360`, `apps/web/.env.example:49`, `apps/web/Caddyfile:7-8`,
  `docker-web-entrypoint.sh:14-16,115` add `/sitemap.xml`.
- AGENTS.md "Bounded reads": "every list or search query in `model.ts` (and the sitemap's `deps` in
  `apps/api/src/routes/sitemap.ts`) applies `limit`".
- OpenAPI metadata + regenerated `docs/api-reference.md` (new `GET /sitemap.xml` row, legacy row
  301).
- Ledger: D99.58 stays open; change its evidence and fix lines from `/api/v1/sitemap.xml` to
  `/sitemap.xml`. Do not add r5's "Sitemap index past 50,000 URLs" entry (built here).

### 7. Draft tasks

- [ ] R6.17 Failing first (replaces r1 R1.20; after r2 R2.17): add
  `packages/shared/src/schemas/sitemap.test.ts`, rewrite `apps/api/src/routes/sitemap.test.ts` with
  the seven unit cases and the four DB-backed cases from audit/r6 E8 §4, and update
  `apps/api/src/routes/openapi.coverage.test.ts` (`IN_SCOPE_BASE_PATHS`, exact-path XML test, 301
  test); run `make test-shared`, `make test-specific filter=src/routes/sitemap.test.ts` and
  `make test-specific filter=src/routes/openapi.coverage.test.ts` and see them fail.
- [ ] R6.18 (replaces r1 R1.21) Add `SitemapQuerySchema` (docblock, barrel export) in
  `packages/shared/src/schemas/sitemap.ts`. Rewrite `apps/api/src/routes/sitemap.ts`:
  `SITEMAP_PAGE_SIZE`, `STATIC_PAGES`, `SITEMAP_CACHE_TTL`, `sitemapCacheKey`, the four paged/count
  `deps` with `listedAuthorCondition`, `buildIndexXml`/`buildUrlsetXml` (replacing `buildXml`), the
  per-key in-flight map, `GET /sitemap.xml` with `zValidator('query', SitemapQuerySchema, zodValidationHook)`
  and `GET /api/v1/sitemap.xml` (301), both with `describeRoute`, the exported `log` and the debug
  logs, docblocks on every export; mount it at `/` in `apps/api/src/routes/index.ts`. Re-run R6.17
  until green; regenerate `docs/api-reference.md`.
- [ ] R6.19 Web and edge: `vite.config.ts` (`/sitemap.xml` dev proxy, robots plugin URL),
  `apps/web/public/robots.txt`, `docker-web-entrypoint.sh` (matcher, comment, log line),
  `apps/web/Caddyfile` comment; add the robots assertion to `apps/web/src/robots.test.ts`; update
  `scripts/ci/web-entrypoint.test.sh` and `scripts/ci/smoke-images.sh` per audit/r6 E8 §4. Run
  `docker compose run --rm --no-deps app pnpm --filter @brewform/web exec vitest run src/robots.test.ts`,
  `sh -n scripts/ci/*.sh` and `make prod-smoke` (or the `images` CI job).
- [ ] R6.20 Docs and specs: the docs list in audit/r6 E8 §6 (incl. AGENTS.md proxied paths and
  "Bounded reads", D99.58 text); write the `recipe-visibility` ADDED and MODIFIED blocks and the two
  `container-deployment` MODIFIED blocks from audit/r6 E8 §5; apply the text edit to r3's
  `ci-image-publishing` block; drop r1's §33 spec block; `make docs-check`.

### 8. Risks / migration notes

- Deploy the API and web images together (the web edge must proxy `/sitemap.xml`). An older web
  image in front of a new API still serves the old `robots.txt` → `/api/v1/sitemap.xml` → 301 →
  `/sitemap.xml`, which an old edge does not proxy (SPA). Same-tag deploys (the compose and Coolify
  guides) avoid it.
- Operators who submitted `/api/v1/sitemap.xml` in Search Console are redirected; they should
  resubmit `/sitemap.xml`. Rollback: an older image pair restores the old single document; crawlers
  re-read `robots.txt`.
- No data change.

---

## Note: r3's pre-wave-6 rollback floor

Already covered by r3, so no task here: Finding 2 §6 (`docs/deployment_compose.md` §12 floor
sentence, §14 dump name), task R3.15, and r3's MODIFIED `production-operations` "Restore, upgrade and
rollback runbook", whose Rollback bullet says "this compose file runs only images that support the
`migrate` entrypoint mode (wave 6 and later); an older release needs its own
`compose.production.yml` from git". Decision 4's "docs + spec" is satisfied by those. The release
notes for PR #172 should repeat the sentence (r3 cross-track note 1).

## Note: locale-aware search (r5, ledger idea only)

r5 (`audit/r5-specs-ledger-process.md:383`) found that the wave-6 risk "A Turkish collation is a
follow-up" was never ledgered. After r2 #26 (both sides lowered in SQL) identifiers are consistent
on any database locale, but substring search (`ilike` after r2 #4) still folds case by the database
ctype, so on an `en_US` database `İstanbul`/`istanbul` and `I`/`ı` do not match the way Turkish
users expect. If the assembler wants it recorded: D99.63 (P4) "Locale-aware case folding for search
(Turkish I/ı)", with no code in this change.

---

## Cross-track notes

1. **NEW (i18n, concrete): `TasteAutocomplete` hard-codes English.** Failing case: switch to `tr`
   and open the recipe create or edit form: the picker shows "Loading taste notes..."
   (`TasteAutocomplete.tsx:316`), "No taste notes found." (`:406`), "Click intensity dots on
   selected notes to adjust (1–3)." and "SCAA Flavor Wheel Reference" (`:413,420`), and the
   intensity button's `title` is "Intensity N/3 — click to change" (`:261`, a template literal the
   attribute guard misses). E4 touches this file; a task could be: add `taste.autocomplete.loading`,
   `.empty`, `.intensityHint`, `.flavorWheel` and `a11y.taste.intensityTitle` (`{level}`) to
   `en.json`/`tr.json`, use `t()` with `.replace`, and add a `tr` render assertion to
   `TasteAutocomplete.test.tsx`.
2. **NEW (bounded reads, concrete): the replies query of `findByRecipe` has no `limit`**
   (`comment/model.ts:84-104`). A recipe author can post any number of replies to one comment, and
   every list request loads all of them for each top-level comment on the page. Belongs with the
   comment track (r1); a cap per parent (for example the newest 50, with a "load more" later) needs
   a product decision, or a ledger entry.
3. **Product note (no failing count): comments of a deleted account stay visible with that
   account's name** (`comment/model.ts:71`, `leftJoin(users)` without a `deletedAt` filter) and link
   to a 404 profile. Not a count drift (E1); the account-deletion spec says "permanently remove …
   their personal data", while `deleteAccount` says further anonymisation is out of scope. Candidate
   for a D99 entry if the assembler wants it.
4. **For the assembler:**
   - Replace r1 §14.5's ADDED block with E1's merged block, and r1 §33's ADDED block plus R1.20/R1.21
     with E8 (R6.17–R6.20).
   - Order: R6.1–R6.3 after R1.8/R1.9; R6.4–R6.5 after R4.1/R4.2; R6.12–R6.14 after R4.10/R4.11;
     R6.15–R6.16 after R4.14/R4.15; R6.17–R6.20 after R2.17.
   - Fold E1's counter wording into r5's `lint-style` registry row; apply E6's three number edits to
     r4's `chart-rendering` block and E8's sentence edits to r3's `ci-image-publishing` block.
   - New capability `coffee-variety-write` (E3) joins r3's `database-seed` in the proposal; both need
     their placeholder Purpose replaced after archiving.
   - Do not add r4's two proposed D99 entries (text-tertiary, cross-tab sync) or r5's sitemap-index
     entry: E6, E7 and E8 fix them.
   - No fix here needs a migration or an ADR.
