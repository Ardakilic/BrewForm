# Track r4: web data loading, URL state, optimistic UI and charts

Findings 7, 8, 9, 19, 21, 22, 23, 24, 25 and the `symmetricX` part of 34, from `audit/review.md`.
All work is web-only (`apps/web`, plus i18n keys in `packages/shared/src/i18n/{en,tr}.json`). No API,
schema, migration, env or OpenAPI change.

| # | Verdict | Capability touched | Effort |
|---|---|---|---|
| 7 | bigger: the discrete setters have the same root cause during a slow load, and a pending commit also cancels a link click | web-url-state | M |
| 8 | bigger: once it stops throwing, the stars still do not roll back (StarRating's draft comes back), and a failed action re-runs the detail loader | optimistic-rollback, web-data-loading | M |
| 9 | confirmed: 5 non-page handlers are wrapped in `requireAuth`, and the client skips refresh for every `/auth/*` endpoint | web-data-loading | M |
| 19 | bigger: all three themes fail on the gradient, and two more chart texts use `--text-tertiary` | chart-rendering | S |
| 21 | bigger: the positive-exponent branch hangs too, huge values give duplicate ticks, and an overflowing range returns `[NaN]` | chart-rendering | S |
| 22 | confirmed: also, a plain "navigate after logout" races `RequireAuth`, and the `/settings` account-deletion flow probably hits that race today | web-data-loading (ADDED) | S |
| 23 | confirmed: also FavouriteButton, follow stays stuck after a 409, none of the three buttons toasts on failure, and FollowButton has hard-coded English | optimistic-rollback | M |
| 24 | confirmed | web-data-loading | S |
| 25 | confirmed | brew-journal | S |
| 34 (`symmetricX`) | confirmed | chart-rendering (signature only) | S |

Library facts checked with Context7:

- `/remix-run/react-router` (`packages/react-router/lib/dom/lib.tsx`, `docs/api/hooks/useSearchParams.md`):
  - `setSearchParams` is `useCallback(…, [navigate, searchParams])`, and a functional update calls
    `nextInit(new URLSearchParams(searchParams))` with the params from the render that created the
    callback.
  - The docs warn that the function form "does not support the queueing logic that React's
    `setState` implements".
  - It navigates with `navigate("?" + params, options)`, and `navigate` is stable in data mode.
- `/remix-run/react-router` (`__tests__/router/revalidate-test.ts`, `docs/api/hooks/useRouterState.md`):
  - During a navigation, `router.state.location` (what `useLocation()` returns) keeps the old
    location until the loaders finish.
  - `useNavigation().location` holds the pending target.
- `/remix-run/react-router` (`docs/api/hooks/useNavigate.md`): in data mode `navigate()` returns a
  `Promise` that resolves when the navigation completes.
- `/remix-run/react-router` (`docs/how-to/fetchers.md`, address-book tutorial): for optimistic UI
  the docs show `fetcher.formData ? submitted : loaderData`, and the UI "reverts to the real data"
  when the submission fails.
- `/vitest-dev/vitest/v5.0.3`:
  - `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })` fakes only those two timers.
  - With fake timers, `vi.waitFor` calls `vi.advanceTimersByTime(interval)` between attempts.
  - `vi.advanceTimersByTimeAsync(ms)` also runs timers that are set asynchronously.

---

## Finding 7: debounced URL commit uses a stale `setSearchParams`

### 1. Verification

`apps/web/src/hooks/useListUrlState.ts:150-172`: the timer calls the `setSearchParams` from the
render in which the user typed. That callback builds `prev` from that render's params:

```ts
timerRef.current = setTimeout(() => {
  …
  setSearchParams(
    (prev) => { const params = withParams(prev, { [key]: trimmed }); … },
    { replace: true, preventScrollReset: true },
  );
}, delay);
```

- **Chip clicked during the pause.** Type `latte` (the timer starts with `prev = ''`), then select
  brew method `v60` within 300 ms (the URL becomes `?brewMethod=v60`). The re-sync effect
  (`:133-141`) does not drop the timer, because `urlValue` (the `search` param) is still `''`. The
  timer then writes `?search=latte` and drops `brewMethod`. Confirmed.
- **Two debounced boxes.** `RecipeListView.tsx:110-111` creates two `useDebouncedUrlText` instances
  (`search`, `author`). The second box's timer holds a setter from a render before the first commit,
  so it wipes the first box's text. Confirmed.
- **Bigger: discrete setters during a slow load.** `setFilters` (`:56-63`) and `setPage` (`:76`)
  also use the function form. React Router keeps `useLocation()` (and so `prev`) on the old URL
  until the loaders finish. Two quick clicks while the first loader is still running (chip A, then
  chip B) build B on the pre-A URL, so A is lost. For the same reason the review's fix (keep the
  latest setter in a ref) is not enough when the loader takes longer than the typing pause: that
  latest setter still reads the committed URL, and its `replace` navigation cancels the pending
  chip navigation.
- **Bigger: a pending commit cancels a link click.** Type, then click a recipe card within 300 ms
  while the recipe loader is still running. The list page is still mounted, so the timer fires and
  `navigate('?search=…')` cancels the card navigation. The user stays on `/recipes`.
- **Same pattern elsewhere.** `apps/web/src/pages/recipes/useCoffeeVarietyFilter.tsx:73-89`
  (`new URLSearchParams(searchParams)` from render) and
  `apps/web/src/pages/users/UserProfilePage.tsx:87` (function form) behave the same way during a
  pending navigation.
- **Consumers.** All 12 consumers (`grep useListUrlState|useDebouncedUrlText`) render inside data
  routers. Every test that renders them uses `createMemoryRouter`, so `useNavigation()` is safe.
- **Tests.** `useListUrlState.test.tsx` has no test for typing then selecting a filter, for two
  debounced inputs, or for a slow loader.

Verdict: **bigger**.

### 2. Root cause

Every search-param write builds on params captured earlier: the render-time `searchParams` inside
`setSearchParams`'s closure, or `useLocation()`. Neither is the URL the user is about to see while
a navigation is still loading.

### 3. Fix design

Add one exported helper in `useListUrlState.ts` that every write uses. It reads a ref refreshed on
each render, so a timer or a second click sees the latest value:

```ts
/** What {@link useLatestSearchParams} returns: the params to build on, and whether the user is leaving. */
export interface LatestSearch { params: URLSearchParams; leaving: boolean }

/**
 * Returns a getter for the search params a URL write should build on: the target of a navigation
 * still loading on the current path (React Router commits a location only after its loaders), else
 * the current URL. `leaving` is true while a navigation to another path is loading. The getter
 * reads a ref refreshed on every render, so timers and quick successive clicks never build on the
 * params captured when they were created.
 */
export function useLatestSearchParams(): () => LatestSearch {
  const location = useLocation();
  const navigation = useNavigation();
  const ref = useRef({ search: location.search, leaving: false });
  const pending = navigation.state === 'loading' ? navigation.location : undefined;
  ref.current =
    pending && pending.pathname === location.pathname
      ? { search: pending.search, leaving: false }
      : { search: location.search, leaving: pending !== undefined };
  return useCallback(
    () => ({ params: new URLSearchParams(ref.current.search), leaving: ref.current.leaving }),
    [],
  );
}
```

Writing the ref during render follows the existing pattern in `hooks/useActionFeedback.ts:37-38`
(`optionsRef.current = options`). The helper uses no effect, so the `useEffect` allowlist does not
apply.

Use it everywhere:

- `setFilters`: `const next = withParams(latest().params, updates, defaults); next.delete(pageKey);`
  then `setSearchParams(next, { preventScrollReset: true })`. This is the value form; the stale
  closure's `searchParams` is never read, and `navigate` is stable.
- `setPage`: `setSearchParams(withParams(latest().params, { [pageKey]: n > 1 ? n : null }))`.
- `clearAll`: unchanged (it does not build on `prev`).
- The debounced commit in `useDebouncedUrlText`:
  ```ts
  const { params: base, leaving } = latest();
  if (leaving) return; // the user is going elsewhere: drop the commit
  ```
  Then build `withParams(base, { [key]: trimmed })`, delete the legacy keys and `pageKey`, and call
  `setSearchParams(params, { replace: true, preventScrollReset: true })`.
- `useCoffeeVarietyFilter.select/clear`: start from `latest().params` instead of
  `new URLSearchParams(searchParams)`.
- `UserProfilePage.tsx:87`: `setSearchParams(withParams(latest().params, { [key]: nextPage > 1 ? nextPage : null }))`.

Discrete setters ignore `leaving`: a click on this page is an explicit choice, and its navigation
cancels the pending one.

Alternatives considered:

- Keep only the latest setter in a ref (the review's suggestion). This fixes the case where the
  loader is faster than the typing pause. It fails when the loader is slower (see Verification), and
  it leaves the discrete setters broken.
- Read `window.location`. The browser router pushes history only after the loaders finish, so the
  value is just as stale, and memory routers (the tests) do not update it.
- `unstable_useRouterState().pending`. It is unstable; `useNavigation()` gives the same data.

Edge cases:

- A commit that fires during a pending same-path navigation cancels it with a `replace`. The final
  URL has both params, but the intermediate pushed entry is lost, so Back skips it. Accepted.
- A `submitting` navigation (a POST form) is ignored: only `state === 'loading'` counts. No list
  page posts to itself through a navigation; they all use fetchers.
- Two writes in the same tick still read the same base, as React Router documents. No UI does that.

### 4. Tests

Add these to `apps/web/src/hooks/useListUrlState.test.tsx`, failing first. Extend the test page with
a second debounced input (`useDebouncedUrlText('author')`, aria-label `author`) and a loader that
can be held open:

```ts
let gate: Promise<void> | null = null;
function listLoader({ request }) {
  loaderCalls.push(…);
  return gate ? gate.then(() => null) : null;
}
```

Hold the loader open with `gate = new Promise((r) => (release = r))`. The new describe uses
`vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })`, `fireEvent` (not `userEvent`),
`await act(() => vi.advanceTimersByTimeAsync(350))` and `vi.waitFor` (it advances the fake timers).
`afterEach` calls `vi.useRealTimers()`. Compare params as sets: build
`new URLSearchParams(router.state.location.search)`, then check `.get(...)`.

1. "a filter chosen during the typing pause is kept": change search to `latte`, change category to
   `arabica`, advance 350 ms. Expect `q=latte` and `category=arabica`. Today: only `q=latte`.
2. "two debounced inputs keep each other's text": change search to `kenya`, advance 100 ms, change
   author to `ali`, advance 350 ms. Expect both. Today: `author=ali` only.
3. "a filter selected while a slow load runs is kept when the pause ends": set `gate`, change
   search, change category (its loader is now pending), advance 350 ms, `release()`, wait until
   settled. Expect both. This fails with the ref-only fix too.
4. "two quick discrete changes during a slow load keep both": set `gate`, change category, change
   sort to `rating` before `release()`. Expect `category=arabica&sort=rating`.
5. "leaving the page drops a pending commit": add an `/elsewhere` link in the page and give
   `/elsewhere` a gated loader. Change search, click the link, advance 350 ms, `release()`. Expect
   pathname `/elsewhere` and no `q` written to the list entry (`router.state.location.pathname ===
   '/elsewhere'`).

The existing real-timer tests stay as they are, so the behaviour they cover does not change.

### 5. Spec impact: `web-url-state`

MODIFIED `### Requirement: Text inputs debounce and replace history while typing` (full block):

```markdown
### Requirement: Text inputs debounce and replace history while typing
Free-text selections (search, author, and similar) SHALL be committed to the URL only after the user has stopped typing for 300 ms, and each commit SHALL replace the current history entry instead of pushing a new one; the input SHALL re-sync from the URL when the URL changes externally (Back/Forward, clear-all, shared link).

Discrete selections (selects, toggles, tab buttons, pagination) SHALL push a history entry so that
Back/Forward step through them. Every search-param update SHALL use `preventScrollReset` where the
page keeps its scroll position.

Every search-param update (a debounced commit, a discrete selection or a page change) SHALL build on
the URL as it is when the update runs, never on the URL captured when its callback or timer was
created: the target of a navigation that is still loading on the same path, otherwise the current
URL (`useLatestSearchParams` in `apps/web/src/hooks/useListUrlState.ts`). A debounced commit SHALL be
dropped when a navigation to another path is loading, because the user is leaving the page.

#### Scenario: Typing does not flood history or the API
- **WHEN** a user types `kenya` into the `/recipes` search box at normal speed
- **THEN** the loader runs once (after the 300 ms pause) and one API request is sent
- **AND** pressing Back once leaves `/recipes` entirely rather than stepping through `k`, `ke`, `ken`, `keny`

#### Scenario: Input follows Back
- **WHEN** a user commits search `kenya`, then selects brew method `v60`, then presses Back
- **THEN** the brew method select is cleared and the search box still shows `kenya`

#### Scenario: Clear-all resets the input
- **WHEN** a user clicks Clear Filters while the search box shows `kenya`
- **THEN** the search box is emptied along with the URL

#### Scenario: A filter chosen during the typing pause is kept
- **WHEN** a user types `latte` into the `/recipes` search box and selects brew method `v60` within 300 ms
- **THEN** after the pause the URL contains both `search=latte` and `brewMethod=v60`

#### Scenario: Two debounced inputs keep each other's text
- **WHEN** a user types `kenya` into the `/recipes` search box and, within 300 ms, `ali` into the author box
- **THEN** the URL ends with both `search=kenya` and `author=ali`

#### Scenario: Quick selections during a slow load are all kept
- **WHEN** a user selects brew method `v60` and, before its loader has finished, selects sort `rating`
- **THEN** the URL ends with both `brewMethod=v60` and `sortBy=rating`

#### Scenario: Leaving the page drops a pending commit
- **WHEN** a user types `latte` and, within 300 ms, clicks a recipe card whose page is still loading when the pause ends
- **THEN** the user lands on the recipe page and the list URL is not rewritten
```

### 6. Docs / ledger impact

- AGENTS.md, "Web data loading" → URL state bullet: add "Every write builds on the latest URL
  (`useLatestSearchParams`), never on the render-time `searchParams`."
- `docs/architecture.md` (URL state bullet, about line 456): the same sentence.
- No D99 entry.

### 7. Draft tasks

- [ ] R4.1 Failing tests first. In `apps/web/src/hooks/useListUrlState.test.tsx`:
  - Extend the test page with an `author` debounced input, an `/elsewhere` link and a gated loader.
  - Add a fake-timer describe with the five cases from §4 (chip during pause, two debounced inputs,
    slow-load chip, two quick discrete changes, leaving drops the commit).
  - Run `docker compose run --rm --no-deps app pnpm --filter @brewform/web exec vitest run src/hooks/useListUrlState.test.tsx`
    and confirm cases 1–5 fail.
- [ ] R4.2 Add the exported `useLatestSearchParams` (with `LatestSearch`, both with docblocks) to
  `apps/web/src/hooks/useListUrlState.ts`:
  - Rewrite `setFilters` and `setPage` to the value form built from `latest().params`.
  - Make the debounced commit read `latest()` at fire time and return early when `leaving`.
  - Update the hook docblocks.
  - Re-run the file until green.
- [ ] R4.3 Apply the same rule in `apps/web/src/pages/recipes/useCoffeeVarietyFilter.tsx`
  (`select`, `clear`) and `apps/web/src/pages/users/UserProfilePage.tsx:87`. Then run
  `docker compose run --rm --no-deps app pnpm --filter @brewform/web exec vitest run src/pages/recipes src/pages/users`.

### 8. Risks / migration notes

Web only, no data change. Back/Forward behaviour is unchanged except in the race described above:
a debounced commit merges into a pending push. Re-run manual check 16.9 (see the end of this file).

---

## Finding 8: `rateAction` throws, so a failed rating replaces the page

### 1. Verification

- `apps/web/src/routes/rate.ts:12-32`:
  - No try/catch around `await recipeApi.rate(id, rating)`, so any API or network error throws to
    the `/recipes/:id/rate` route.
  - That route has no `errorElement` (`router.tsx:467`), so the error goes to the nearest boundary.
  - It returns the raw `RateResponse` without `ok`.
  - It does not pass `request.signal`.
  - It does not use `withDataLog`.
  - A missing id or a non-numeric rating throws a 400 `Response`.
- `rate.test.ts:70-76` asserts that the error propagates, so the bug is locked in by a test.
- `RecipeDetailPage.tsx:62-63,349-375`:
  - Untyped `useFetcher()`, no `useActionFeedback`, so no toast.
  - The rating is written into a hidden input through `querySelector`, then `requestSubmit()`.
- **Bigger: no rollback even after the action stops throwing.**
  - `StarRating.tsx:179-184` (`commit`) and `:261-267` (click) keep a committed draft
    `{ value: new, base: saved, dirty: false }` that stays active while `draft.base === saved`.
  - After a failure the loader value (`saved`) is unchanged, so the draft stays active and the slider
    keeps showing the new value. A plain `{ ok: false }` alone would leave the wrong stars on screen.
- **Bigger: a failed action re-runs the detail loader.**
  - `RecipeDetailPage.data.ts:95-108` returns `defaultShouldRevalidate` for any failed action, and
    the rating fetcher form does not opt out. So a failed rating re-runs the 3-request detail loader.
  - On a network blip that loader also fails, and the route `errorElement` shows "load failed".
  - `RecipeDetailPage.data.test.ts:47-49` asserts "revalidates after a failed social action".
- **Siblings.**
  - The brief assumed `like.ts`/`favourite.ts` use `toActionFailure`, `withDataLog` and
    `request.signal`. They do not: `like.ts:24-33`, `favourite.ts:20-27` and `follow.ts:20-34` catch
    everything, pass no signal and use no `withDataLog`.
  - The correct reference pattern is `routes/resources/notifications.ts:93-126`.
  - Finding 23 converts the three toggle actions to the same pattern.

Verdict: **bigger**.

### 2. Root cause

`rateAction` was never converted to the action contract. The slider's committed draft and the
detail page's revalidation rule both assume the rating never fails.

### 3. Fix design

`apps/web/src/routes/rate.ts`:

```ts
/** Result of {@link rateAction}: the saved rating and the new community figures, or the failure. */
export type RateResult = ({ ok: true } & RateResponse) | ActionFailure;

/** … `{ ok: true, rating, avgRating, ratingCount }` or `{ ok: false, error, code? }`; never throws except for an abort … */
export const rateAction = async ({ params, request }: ActionFunctionArgs): Promise<RateResult> => {
  const id = params.id ?? '';
  const form = await request.formData();
  const parsed = RecipeRateSchema.safeParse({ rating: Number(formString(form, 'rating')) });
  if (!id || !parsed.success) {
    logger.debug({ id }, 'rateAction invalid input');
    return { ok: false, error: 'Invalid rating', code: 'VALIDATION_ERROR' };
  }
  const { rating } = parsed.data;
  try {
    const result = await withDataLog(logger, 'rateAction', { id, rating }, () =>
      recipeApi.rate(id, rating, { signal: request.signal }),
    );
    return { ok: true, ...result };
  } catch (err) {
    return toActionFailure(err, []); // a resource route never redirects (finding 9)
  }
};
```

`RecipeRateSchema` (`packages/shared/src/schemas/recipe.ts:382`, an integer from 1 to 10) is already
exported from `@brewform/shared/schemas`. A 401 returns `code: 'UNAUTHORIZED'`, following the
finding 9 rule.

`apps/web/src/components/recipe/StarRating.tsx`: drop a committed (non-dirty) draft when `busy`
goes from true to false. Use React's "store information from previous renders" pattern (no effect):

```ts
const [wasBusy, setWasBusy] = useState(busy);
if (wasBusy !== busy) {
  setWasBusy(busy);
  if (wasBusy) setDraft((d) => (d && !d.dirty ? null : d));
}
```

Results:

- While pending, the draft shows the submitted value.
- After a failure, `saved` is still the old value, so the slider shows the old rating: the rollback.
- After a success, the fetcher stays non-idle through the revalidation, so by the time it is idle
  `saved` is the new loader value.
- The existing test "busy: … until it clears" still passes: after the clear it expects `ArrowRight`
  from 2 to commit 4.

`apps/web/src/pages/recipes/RecipeDetailPage.tsx`:

- Use `const ratingFetcher = useFetcher<typeof rateAction>()` with a type-only import from
  `../../routes/rate.ts`.
- Add `useActionFeedback(ratingFetcher, { errorKey: 'recipe.rating.saveError' })`.
- Replace the hidden-input form, `ratingFormRef` and the `querySelector` call with
  `ratingFetcher.submit({ rating: String(rating) }, { method: 'post', action: `/recipes/${recipe.id}/rate` })`.
  This deletes the `useRef` and the DOM query.
- Keep `busy={ratingFetcher.state !== 'idle'}`, so focus is kept (task 19.17's test).

`apps/web/src/pages/recipes/RecipeDetailPage.data.ts` `shouldRevalidate`: before the self-settling
check, add

```ts
if (formAction && actionResult?.ok === false) {
  log.debug({ formAction }, 'RecipeDetailPage revalidation skipped after a failed action');
  return false; // a failed action changed nothing
}
```

A successful rating still revalidates, because `rate` is not in `SELF_SETTLING_ACTION_RE`: the
community average comes from the loader. That matches the current spec text and
`RecipeDetailPage.revalidation.test.tsx:224-250`.

`apps/web/src/hooks/useActionFeedback.ts`: when `data.code === 'UNAUTHORIZED'`, toast
`error.unauthorized` (an existing key in en and tr) instead of `errorKey`. This is shared with
finding 9.

i18n: add `recipe.rating.saveError` with en "Could not save your rating. Please try again." and tr
"Puanınız kaydedilemedi. Lütfen tekrar deneyin."

Alternatives considered:

- Settle the average locally from the rate response instead of revalidating. That needs the page
  to merge `avgRating`/`ratingCount` into loader data: more code, and the current revalidation is
  spec'd and tested. Rejected.
- An optimistic `value` from `fetcher.formData`. It does not help: when `saved` flips back on
  failure, the draft whose `base` equals `saved` becomes active again.

### 4. Tests (failing first)

- `apps/web/src/routes/rate.test.ts` (rewrite):
  - Success returns `{ ok: true, rating, avgRating, ratingCount }` and calls `rate('recipe-1', 8, { signal })`.
  - A missing or empty id, `'abc'`, `'0'` and `'11'` return `{ ok: false, code: 'VALIDATION_ERROR' }`
    without calling the API.
  - `ApiError` 500, 429 (keeps `retryAfterSeconds`) and 401 return `{ ok: false, code }` and do not
    throw.
  - `TypeError('Failed to fetch')` returns `{ ok: false, error: 'Failed to fetch' }`.
  - An `AbortError` is rethrown.
  - The logger spy sees `rateAction started` and `rateAction failed` with `{ err, id, rating }`.
- `apps/web/src/components/recipe/StarRating.test.tsx`, new test "drops a committed draft when busy
  clears": render `value={6}`, press `{ArrowRight}{Enter}` (commits 8). Rerender with
  `busy value={6}`: `aria-valuenow` is 8. Rerender with `busy={false} value={6}`: 6 (rollback).
  Then rerender with `busy`, then `busy={false} value={8}`: 8 (success).
- `apps/web/src/pages/recipes/RecipeDetailPage.data.test.ts`:
  - Change "revalidates after a failed social action" to `false`.
  - Add `'/recipes/recipe-1/rate'` with `{ ok: false }` → `false`.
  - Keep `rate` with `{ ok: true }` → `true`.
- `apps/web/src/pages/recipes/RecipeDetailPage.revalidation.test.tsx`, new test "a failed rating
  keeps the page, restores the stars and sends no reload". Make the stub answer
  `POST /recipes/:id/rate` with 500. Then:
  - Key `4` + `Enter` on the slider, then wait until idle.
  - `requests` equals `['POST /recipes/<id>/rate']`.
  - The slider's `aria-valuenow` is back to the loader's `userRating`.
  - The `recipe.rating.saveError` text is visible.
  - `RouteErrorState` is not rendered.
  - A variant with `fetch` rejecting with a `TypeError` for that URL gives the same result.

### 5. Spec impact

Covered by the MODIFIED blocks under finding 23:

- `optimistic-rollback` → "Resource route actions return error data instead of throwing" (adds rate).
- `optimistic-rollback` → "Optimistic UI rollback on action failure" (adds the rating rule and the
  toast).

Plus `web-data-loading` → "Revalidation after actions is scoped to affected data" (finding 24
block below: failed actions do not revalidate; a successful rating does).

### 6. Docs / ledger impact

- `docs/architecture.md` "Writes" bullet: add "a failed action (`ok: false`) never revalidates the
  recipe detail loader".
- Add the new i18n key to en and tr.

### 7. Draft tasks

- [ ] R4.4 Failing tests first: rewrite `apps/web/src/routes/rate.test.ts`, and add the StarRating
  draft test, the `shouldRevalidate` cases and the revalidation-harness failure test from §4. Also
  add a test to `apps/web/src/hooks/useActionFeedback.test.tsx`: `{ ok: false, code: 'UNAUTHORIZED' }`
  with an `errorKey` toasts `error.unauthorized`. Run
  `docker compose run --rm --no-deps app pnpm --filter @brewform/web exec vitest run src/routes/rate.test.ts src/components/recipe/StarRating.test.tsx src/pages/recipes`
  and confirm the new cases fail.
- [ ] R4.5 Rewrite `apps/web/src/routes/rate.ts`:
  - Export `RateResult`.
  - Use `RecipeRateSchema`, `withDataLog`, `request.signal` and `toActionFailure(err, [])`, and
    update the docblock.
- [ ] R4.6 Other edits:
  - `StarRating.tsx`: the busy-transition draft drop, with an updated component docblock.
  - `RecipeDetailPage.tsx`: typed fetcher, `useActionFeedback`, `ratingFetcher.submit` instead of
    the hidden input, ref and `querySelector`.
  - `RecipeDetailPage.data.ts`: the `ok === false` early return, with updated docblocks.
  - `useActionFeedback.ts`: the `UNAUTHORIZED` → `error.unauthorized` mapping, with its docblock.
  - Add `recipe.rating.saveError` to `packages/shared/src/i18n/en.json` and `tr.json`.
  - Re-run the files from R4.4 and `make test-shared` (i18n parity).

### 8. Risks / migration notes

- The 400 `Response` for a malformed rating becomes `{ ok: false }`, which the UI can never produce.
- No data change.
- Re-run the manual check 19.27 item "keyboard-only rating … focus retained during submit".

---

## Finding 9: background actions redirect to `/login?next=/resources/...`, and `/auth/*` skips refresh

### 1. Verification

`apps/web/src/routes/auth-guards.ts:11-15` builds `next` from `request.url`. A fetcher action's
request URL is the action route itself, which has no element.

Inventory: every route without an element in `router.tsx:464-526`, and whether its handler is
wrapped.

| Route | Handler (file:line) | Wrapped today | Submitted by | After |
|---|---|---|---|---|
| `resources/auth/send-verification` | `sendVerificationAction` (`routes/resources/auth.ts:22`) | `requireAuth` | `EmailVerificationBanner` | unwrap, `toActionFailure(err, [])` |
| `resources/notifications/:id/read` | `markReadAction` (`routes/resources/notifications.ts:93`) | `requireAuth` | `NotificationItem` | unwrap |
| `resources/notifications/read-all` | `markAllReadAction` (`…/notifications.ts:114`) | `requireAuth` | `NotificationDropdown` | unwrap |
| `resources/photos` | `uploadPhotoAction` (`routes/resources/photos.ts:45`) | `requireAuth` | `PhotoUpload` | unwrap |
| `collections/:id/reorder` | `reorderAction` (`pages/collections/CollectionDetailPage.data.ts:101`) | `requireAuth` | `CollectionRecipeList` | unwrap, move to `routes/resources/collections.ts` |
| `recipes/:id/like`, `/favourite`, `follow/:userId` | `routes/{like,favourite,follow}.ts` | no (catch-all) | buttons | `toActionFailure(err, [])` (finding 23) |
| `recipes/:id/rate` | `routes/rate.ts` | no (throws) | detail page | `toActionFailure(err, [])` (finding 8) |
| `comments/recipe/:recipeId`, `comments/:id` | `routes/comments.ts` | no, `toActionFailure(err, [])` | `CommentSection` | already compliant |
| `resources/recipes/:id/notes`, `resources/collections/mine`, `resources/notifications[/unread-count]`, `resources/brew-logs/*`, `resources/taste-notes`, `resources/coffee-varieties/search`, `resources/qrcode/*` | `routes/resources/*.ts` | no, `toActionFailure(err, [])` | various | already compliant |

Page-route actions that fetchers submit from another page, such as `useBanUser`
(`/admin/users/:id` from the `/admin/users` list): `next` is still a real page (the user's detail
page), so the redirect is not blank. Accepted under the rule below.

API client: `apps/web/src/api/client.ts:149` checks `!endpoint.startsWith('/auth/')`. The web
calls eight `/auth/*` endpoints through `authApi` (`api/index.ts:107-125`), plus `/auth/refresh`
through raw `fetch` in `refreshSession`. Their 401 behaviour, from the API's nine auth routes
(`apps/api/src/modules/auth/index.ts`):

| Endpoint | Auth | Can answer 401 | Refresh on 401? |
|---|---|---|---|
| `POST /auth/login` | public | yes (`INVALID_CREDENTIALS`) | **skip**: wrong password, not an expired session; a retry repeats the credentials and counts a second failure against the limits |
| `POST /auth/register` | public | no | skip (harmless) |
| `POST /auth/refresh` | refresh cookie | yes | **skip**: must not recurse (the client calls it with raw `fetch` anyway) |
| `POST /auth/logout` | none | no | **skip**: must never revive a session |
| `POST /auth/send-verification` | `authMiddleware` (`:333-335`) | yes (expired access token) | **refresh** (today skipped: the bug) |
| `POST /auth/forgot-password`, `reset-password`, `verify-email`, `GET /auth/registration-status` | public, token in body | no (400s) | irrelevant (no 401) |
| `/users/me` (`me`, update, delete) | auth | yes | refresh (not under `/auth/`, unchanged) |

There is no change-password endpoint. Passwords change through `/auth/reset-password` with a token.

Path today: `send-verification` with an access token older than 15 minutes gets a 401 with no
refresh. `toActionFailure` rethrows the 401, `requireAuth` redirects to
`/login?next=%2Fresources%2Fauth%2Fsend-verification`, and after login `navigate(next)` lands on an
element-less route: a blank page under the navbar.

Tests:

- `routes/resources/notifications.test.ts:148-156` asserts the redirect.
- `api/client.test.ts` has no test for the `/auth` skip.

Verdict: **confirmed**.

### 2. Root cause

The guard assumes the request URL is a page, which is false for fetcher actions. The client's
refresh skip covers a whole path prefix when only three endpoints need it.

### 3. Fix design

Rule (one rule, applied everywhere): **only page routes redirect a final 401. An element-less
resource route never redirects. It returns `toActionFailure(err, [])`, which gives
`{ ok: false, error, code: 'UNAUTHORIZED' }` (the API's `unauthorized()` helper always sends that
code), and the component shows `error.unauthorized`.**

Why not make `loginRedirect` use the page URL instead:

- React Router builds the client-side `Request` itself, and it carries no `Referer`.
- The only source of the page URL is `window.location`. In the browser router it holds the
  committed page during a fetcher, but memory routers (tests) do not update it, and route modules
  would then depend on browser globals.
- The resource-route pattern (comments, notes, collections, the toggles) already returns
  `{ ok: false }` for 401s. Adopting it for the five stragglers is consistent and needs no new
  mechanism.

Edits:

1. Unwrap `sendVerificationAction`, `markReadAction`, `markAllReadAction` and `uploadPhotoAction`,
   and pass `[]` to `toActionFailure`. Update each docblock ("a final 401 returns
   `{ ok: false, code: 'UNAUTHORIZED' }`; resource routes never redirect").
2. Move `reorderAction`, `CollectionReorderInput` and `CollectionReorderResult` from
   `CollectionDetailPage.data.ts:87-117` to `apps/web/src/routes/resources/collections.ts`. Unwrap
   it and use `toActionFailure(err, [])`. Update the imports in `router.tsx:37,497` and the type
   imports in `CollectionRecipeList.tsx` and `CollectionRecipeList.test.tsx`. This keeps every
   element-less handler under `apps/web/src/routes/`, which is what the static rule checks.
3. UI for the `UNAUTHORIZED` code:
   - `useActionFeedback` maps it (finding 8), which covers `NotificationItem`,
     `NotificationDropdown` and `CollectionRecipeList` reorder.
   - `uploadErrorKey` (`routes/resources/photos.ts:26`) adds `UNAUTHORIZED` →
     `'error.unauthorized'`. The `.replace('{name}', …)` is then a harmless no-op.
   - `EmailVerificationBanner.tsx:26-30` shows `t('error.unauthorized')` when
     `failureToError(result)` is an `ApiError` with code `UNAUTHORIZED`. It stays silent for other
     non-rate-limit failures, as today.
4. `apps/web/src/api/client.ts`:
   ```ts
   /** Auth endpoints whose 401 is not an expired access token (or must not revive a session): no refresh-and-retry. */
   const NO_REFRESH_ENDPOINTS: ReadonlySet<string> = new Set([
     '/auth/login', '/auth/register', '/auth/refresh', '/auth/logout',
   ]);
   …
   if (response.status === 401 && !NO_REFRESH_ENDPOINTS.has(endpoint.split('?', 1)[0])) { … }
   ```
   Update the `sendWithRefresh` docblock ("retries once after the shared session refresh on a 401,
   except from login, register, refresh and logout").
5. Static rule, in `apps/web/src/routes/auth-guards.test.ts`: use
   `import.meta.glob(['./**/*.ts', '!./**/*.test.ts', '!./auth-guards.ts'], { query: '?raw', import: 'default', eager: true })`
   (the pattern from `utils/chart/chart-guards.test.ts`) and assert that no source matches
   `/\brequire(?:Auth|Admin)\(/`.

### 4. Tests (failing first)

- `apps/web/src/api/client.test.ts`:
  - "refreshes and retries `POST /auth/send-verification` on a 401": first answer 401, then
    `/auth/refresh` 200, then 200. Expect 3 fetches, the last one to send-verification.
  - `it.each(['/auth/login','/auth/register','/auth/refresh','/auth/logout'])` "does not refresh
    on a 401 from %s": exactly 1 fetch, and an `ApiError` 401 is thrown.
- `apps/web/src/routes/resources/notifications.test.ts`: replace `:148-156` with "markRead returns
  `{ ok: false, code: 'UNAUTHORIZED' }` on a final 401 (no redirect)", and add the same for
  `markAllRead`.
- New `apps/web/src/routes/resources/auth.test.ts`: success returns `{ ok: true }` and passes
  `{ signal }`; a 429 keeps `retryAfterSeconds`; a 401 returns `{ ok: false, code: 'UNAUTHORIZED' }`;
  an abort is rethrown.
- `apps/web/src/routes/resources/photos.test.ts`: a 401 returns
  `{ ok: false, code: 'UNAUTHORIZED', errorKey: 'error.unauthorized' }`.
- `apps/web/src/routes/resources/collections.test.ts`: reorder success, failure, 401 → `ok: false`,
  and the JSON body is forwarded with `{ signal }`.
- `apps/web/src/hooks/useActionFeedback.test.tsx`: `{ ok: false, code: 'UNAUTHORIZED' }` with an
  `errorKey` toasts `error.unauthorized` (added in R4.4, shared with finding 8).
- `apps/web/src/components/EmailVerificationBanner.test.tsx`: a 401 result shows the
  `error.unauthorized` text.
- `apps/web/src/routes/auth-guards.test.ts`: the static rule (it fails today on auth, notifications
  and photos).

### 5. Spec impact: `web-data-loading`

MODIFIED `### Requirement: Auth-guarded loaders redirect to login with a return path`:

```markdown
### Requirement: Auth-guarded loaders redirect to login with a return path
Every loader and action of an auth-guarded page route SHALL be wrapped by a shared `requireAuth` helper that converts a final HTTP 401 from the API into `redirect('/login?next=<encoded pathname+search>')`, and every admin page route SHALL use a `requireAdmin` helper that additionally redirects HTTP 403 to `/`; element-less resource routes SHALL NOT be wrapped and SHALL return `{ ok: false, error, code: 'UNAUTHORIZED' }` for a final 401 instead of redirecting.

`RequireAuth` SHALL remain as the render-time guard for routes whose loaders call only public
endpoints, and SHALL navigate with `replace` to `/login?next=<encoded pathname+search>`. The helpers
SHALL live in `apps/web/src/routes/auth-guards.ts` with unit tests, and SHALL log redirects at
`debug` without logging user identifiers beyond ids.

Resource routes are the routes without an element: every route under `/resources/`, plus
`recipes/:id/like`, `recipes/:id/favourite`, `recipes/:id/rate`, `follow/:userId`,
`comments/recipe/:recipeId`, `comments/:id` and `collections/:id/reorder`. Their request URL is not
a page, so a login redirect built from it would land the user on an empty route after login. Their
handlers SHALL live under `apps/web/src/routes/` and SHALL convert errors with
`toActionFailure(err, [])` (rethrowing only an aborted request); the submitting component SHALL show
`error.unauthorized` for the `UNAUTHORIZED` code (`useActionFeedback` maps it for every fetcher
toast). No module under `apps/web/src/routes/` other than `auth-guards.ts` SHALL call `requireAuth`
or `requireAdmin`, and a static test SHALL enforce it.

#### Scenario: Expired session on settings redirects to login
- **WHEN** a signed-out user opens `/settings` and `GET /preferences` returns 401 after the refresh attempt
- **THEN** the router redirects to `/login?next=%2Fsettings`
- **AND** the "Oops!" error page is not shown

#### Scenario: Non-admin on an admin route
- **WHEN** a signed-in non-admin opens `/admin/audit-log` and the API returns 403
- **THEN** the router redirects to `/`

#### Scenario: Render guard does not trap the back button
- **WHEN** a signed-out user opens `/recipes/new`
- **THEN** `RequireAuth` replaces the history entry with `/login?next=%2Frecipes%2Fnew`
- **AND** pressing Back does not return to `/recipes/new`

#### Scenario: An expired session during a background action keeps the page
- **WHEN** a user whose session can no longer be refreshed marks a notification read from the navbar dropdown
- **THEN** `markReadAction` returns `{ ok: false, code: 'UNAUTHORIZED' }`, the current page stays rendered and the toast says "You need to be logged in to do that"
- **AND** the browser is not sent to `/login?next=%2Fresources%2Fnotifications%2F…`
```

MODIFIED `### Requirement: API client supports cancellation, single-flight refresh and defensive parsing`:

```markdown
### Requirement: API client supports cancellation, single-flight refresh and defensive parsing
The web API client SHALL accept an optional `{ signal }` on every verb helper and domain-client method and pass it to `fetch`, SHALL share a single in-flight `POST /auth/refresh` among all concurrent requests that receive HTTP 401, and SHALL convert non-JSON or empty error bodies into an `ApiError` carrying the HTTP status.

Aborted requests SHALL be rethrown unchanged (an `AbortError`) and logged at `debug`, not `error`.
The shared refresh SHALL NOT be bound to any single caller's signal; each original request is
retried once with its own signal after the refresh settles. The client SHALL keep logging request
start/completion at `debug` without logging tokens or bodies.

Only `POST /auth/login`, `POST /auth/register`, `POST /auth/refresh` and `POST /auth/logout` SHALL
skip the refresh-and-retry on a 401: a 401 from login means wrong credentials, the refresh must not
recurse, and logout must never revive a session. Every other endpoint, including the token-guarded
`POST /auth/send-verification`, SHALL refresh and retry once. The public auth endpoints
(`forgot-password`, `reset-password`, `verify-email`, `registration-status`) never answer 401.

#### Scenario: Concurrent 401s refresh once
- **WHEN** three requests issued in parallel each receive HTTP 401
- **THEN** exactly one `POST /auth/refresh` is sent
- **AND** each original request is retried once after it succeeds

#### Scenario: Abort is not an error
- **WHEN** a loader's `request.signal` is aborted mid-request
- **THEN** the client rejects with an `AbortError`
- **AND** no `error`-level "API request failed" log is emitted

#### Scenario: Proxy HTML error page
- **WHEN** the API responds 502 with an HTML body
- **THEN** the client throws `ApiError` with `status` 502 and a non-JSON-body code
- **AND** no `SyntaxError` escapes to the UI

#### Scenario: Resend verification after the access token expired
- **WHEN** a signed-in user whose access token has expired but whose refresh cookie is valid clicks "Resend verification"
- **THEN** the client sends `POST /auth/refresh`, retries `POST /auth/send-verification` once, and the banner shows the sent state

#### Scenario: A wrong password is not retried
- **WHEN** `POST /auth/login` answers 401
- **THEN** no `POST /auth/refresh` is sent and the login request is not repeated
```

### 6. Docs / ledger impact

- AGENTS.md, "Web data loading" → Auth bullet: append "Resource routes (element-less: `resources/*`,
  the like, favourite, rate and follow routes, `comments/*`, `collections/:id/reorder`) are never
  wrapped. They return `{ ok: false, code: 'UNAUTHORIZED' }` on a final 401, and the component toasts
  `error.unauthorized` (`useActionFeedback` does it)."
- `docs/architecture.md` "Cancellation and auth" bullet: the same sentence, plus "the client
  refreshes on every 401 except from login, register, refresh and logout".
- ADR-018 (`docs/decisions.md:503`) stays accurate for page routes. Leave it (ADRs are history).
- No D99 entry. D99.38 (session revocation) is unrelated.

### 7. Draft tasks

- [ ] R4.7 Failing tests first, in `apps/web/src/api/client.test.ts`: the send-verification
  refresh-and-retry case and the `it.each` no-refresh cases for login, register, refresh and logout.
  Then replace the prefix check at `apps/web/src/api/client.ts:149` with `NO_REFRESH_ENDPOINTS`
  (with a docblock), update the `sendWithRefresh` docblock, and run
  `docker compose run --rm --no-deps app pnpm --filter @brewform/web exec vitest run src/api/client.test.ts`.
- [ ] R4.8 Failing tests first: the static `requireAuth`/`requireAdmin` rule in
  `apps/web/src/routes/auth-guards.test.ts`, the 401 → `{ ok: false, code: 'UNAUTHORIZED' }` cases
  in `routes/resources/notifications.test.ts` (replacing the redirect test), the new
  `routes/resources/auth.test.ts`, the 401 case in `routes/resources/photos.test.ts`, the reorder
  cases in `routes/resources/collections.test.ts`, and the `EmailVerificationBanner` 401 test. The
  `useActionFeedback` mapping test was added in R4.4.
- [ ] R4.9 Implement:
  - Unwrap `sendVerificationAction`, `markReadAction`, `markAllReadAction` and
    `uploadPhotoAction`, switching them to `toActionFailure(err, [])`.
  - Move `reorderAction` and its two types into `apps/web/src/routes/resources/collections.ts`,
    unwrapped, and fix the imports in `router.tsx`, `CollectionRecipeList.tsx` and
    `CollectionRecipeList.test.tsx`.
  - Map `UNAUTHORIZED` in `uploadErrorKey` and `EmailVerificationBanner`.
  - Update every touched docblock.
  - Run `make test-web`.

### 8. Risks / migration notes

- UX change: a dead session during a background action now gives a toast instead of a redirect.
  The next navigation to a guarded page still redirects to login.
- The navbar does not switch to signed-out until a page loader or `RequireAuth` notices, the same
  as today for like and comment failures.
- No data change.
- Re-run manual check 16.9.

---

## Finding 19: BrewTimeline phase titles fail contrast

### 1. Verification

`apps/web/src/components/recipe/BrewTimeline.tsx`:

- Phase titles: `:219`, `text-[color:var(--text-secondary)]`, 11 px semibold uppercase.
- Their backgrounds:
  - `:171`: `--bg-secondary`.
  - `:175`: `--bg-tertiary` over the pre-infusion zone.
  - `:164-167,179`: an `--accent-primary` gradient under the curve. Its opacity runs from 0.5 at
    the top of the fill's bounding box (the plateau, y = 12 of 120) to 0.1 at the bottom.
- Geometry:
  - Chart height 80 px. Label stack (title 13.75 px + gap 2 px + value 22.5 px) centred, so the
    title line box covers y = 31.3 to 51.9 in viewBox units.
  - Gradient opacity under the title is 0.43 down to 0.35.
  - In the extraction phase the whole title sits on the gradient.
  - In the pre-infusion phase the title sits above the curve (plain `--bg-tertiary`), except near the
    phase's right edge (the curve reaches title height at x ≈ 0.80–0.91 of the phase).

The existing `utils/chart/contrast.test.ts:56-81` only checks `--bg-secondary`.

Recomputed WCAG ratios (compositing in sRGB, script logic as in `contrast.test.ts`):

| Text / background | light | dark | coffee |
|---|---|---|---|
| `--text-secondary` / `--bg-tertiary` (pre-infusion) | 6.08 | **4.07** | 6.22 |
| `--text-secondary` / accent@0.35–0.43 over `--bg-secondary` (extraction) | **4.05–3.49** | **2.96–2.49** | **3.99–3.47** |
| `--text-secondary` / accent@0.43 over `--bg-tertiary` (pre-infusion right edge) | **3.16** | **1.99** | **3.11** |
| `--text-primary` / accent@0.43 over `--bg-tertiary` (worst real case today) | 7.24 | 4.81 | **4.52** (no margin) |
| `--text-primary` / accent@0.40 over `--bg-tertiary` (proposed worst case) | 7.65 | 5.04 | 4.73 |
| `--text-primary` / accent@0.40 over `--bg-secondary` | 8.45 | 6.40 | 5.28 |
| `--text-primary` / `--bg-tertiary`, `--bg-secondary` | 13.93 / 16.03 | 9.84 / 14.52 | 9.04 / 11.02 |
| `--text-tertiary` / `--bg-secondary` | **2.31** | **3.16** | 5.30 |

The review reported only dark mode. The extraction-area titles fail in all three themes.

Same token misuse in other chart components (`grep` over the four files that `chart-guards.test.ts`
scans):

- `BrewTimeline.tsx:135`: the "BREW TIMELINE" header title uses `--text-tertiary` on the card.
- `StarRating.tsx:142`: the vote-count line ("12 community votes") uses `--text-tertiary`.

Both are chart text: 2.31:1 in light and 3.16:1 in dark. `ScaaRadarChart` labels use
`--text-secondary` on the card (6.99 / 6.01 / 7.59), which is fine. The `IntensityDots` empty-dot
border and the empty-star stroke (`--text-tertiary`) are marks, not text. The spec requires 3:1
only for filled stars and data marks, so they are left alone.

Verdict: **bigger**.

### 2. Root cause

The token was chosen for the card background, but the labels sit on darker in-chart fills. The test
checks only the card background.

### 3. Fix design

- Phase titles: `--text-primary` (the values already use it).
- Lower the gradient's top stop from 0.5 to 0.4, so `--text-primary` has a margin in coffee (4.73
  instead of 4.52). This lets the test check the gradient's maximum opacity, with no font-metric
  geometry in the test. Export the stops as a constant and use it in the component:

```ts
/** Opacity of the accent gradient under the timeline curve (top of the fill → bottom). Phase labels are contrast-tested against `top`. */
export const TIMELINE_GRADIENT_OPACITY = { top: 0.4, bottom: 0.1 } as const;
```

  Put it in `apps/web/src/utils/brew-timeline.ts`. `BrewTimeline.tsx:165-166` then uses
  `stopOpacity={TIMELINE_GRADIENT_OPACITY.top|bottom}`.
- Header title (`BrewTimeline.tsx:135`) and `StarRating.tsx:142` vote count: `--text-secondary`.

Rejected: keeping 0.5 and computing the title band from font metrics in the test. That is fragile
(a font or padding change silently invalidates it) and gives no margin in coffee.

### 4. Tests (failing first)

- `apps/web/src/utils/chart/contrast.test.ts`: add a `blend(fg, bg, alpha)` helper (per-channel
  `alpha*fg + (1-alpha)*bg`, rounded) and a describe "brew timeline phase labels against their real
  backgrounds". For each theme, assert `contrast(--text-primary, bg) >= 4.5` for `bg` in
  - `--bg-tertiary`
  - `--bg-secondary`
  - `blend(--accent-primary, --bg-tertiary, TIMELINE_GRADIENT_OPACITY.top)`
  - `blend(--accent-primary, --bg-secondary, TIMELINE_GRADIENT_OPACITY.top)`

  Add one locked value per theme so a token change is noticed:
  `contrast(tp, blend(acc, bg3, 0.4))` ≈ 7.65 / 5.04 / 4.73 (`toBeCloseTo(_, 1)`).
  Add `--bg-tertiary` and `--text-primary` to the "defines every chart token" list.
- `apps/web/src/utils/chart/chart-guards.test.ts`: add a violation for `--text-tertiary` used as a
  text colour, matching
  `/text-\[color:var\(--text-tertiary\)\]|color:\s*['"]var\(--text-tertiary\)['"]/`. It fails on
  `BrewTimeline.tsx:135` and `StarRating.tsx:142` and allows the `stroke`/`border` uses.
- `apps/web/src/components/recipe/BrewTimeline.test.tsx`: the phase title spans (`[data-phase] span:first-child`)
  have a class containing `var(--text-primary)`, and the gradient stops' `stop-opacity` equal
  `TIMELINE_GRADIENT_OPACITY`.

### 5. Spec impact: `chart-rendering`

MODIFIED `### Requirement: Chart colours come from theme tokens and meet contrast minimums`:

```markdown
### Requirement: Chart colours come from theme tokens and meet contrast minimums

Chart and rating marks and text SHALL take every colour from theme tokens defined for the light, dark and coffee themes in `apps/web/src/styles/globals.css`, with no hex literals in chart components. Chart text (titles, labels, ticks, values and counts) SHALL meet 4.5:1, and data marks and filled rating stars SHALL meet 3:1, against every background the text or mark is drawn on in every theme: the card background (`--bg-secondary`) for most chart text, and for the brew timeline's in-chart phase labels the pre-infusion zone and the accent gradient as well. Guides and gridlines are decorative and exempt.

A `--rating-star` token SHALL be added (for example light `#b45309`, dark `#f59e0b`, coffee
`#fbbf24`, measured at 4.60, 7.06 and 7.11:1 against `--bg-secondary`). Timeline tick labels SHALL
use `--text-secondary` (6.99, 6.01 and 7.59:1) instead of `--text-tertiary` (2.31:1 in light).
Chart components SHALL NOT use `--text-tertiary` as a text colour (2.31:1 in light and 3.16:1 in dark
against `--bg-secondary`); the timeline header title and the rating vote count use
`--text-secondary`.

The brew timeline's phase titles and values SHALL use `--text-primary`, and the top opacity of the
accent gradient under its curve (`TIMELINE_GRADIENT_OPACITY.top` in
`apps/web/src/utils/brew-timeline.ts`) SHALL be at most 0.4. Against the worst of those backgrounds
(`--accent-primary` at that opacity over `--bg-tertiary`), `--text-primary` measures 7.65 (light),
5.04 (dark) and 4.73:1 (coffee), while `--text-secondary` measured only 3.34, 2.09 and 3.26:1.

#### Scenario: No hardcoded chart colours

- **WHEN** the chart guard test scans `ScaaRadarChart.tsx`, `BrewTimeline.tsx`, `StarRating.tsx` and `IntensityDots.tsx` for `#[0-9a-fA-F]{3,8}` colour literals and for `--text-tertiary` used as a text colour
- **THEN** it finds none

#### Scenario: Token contrast is verified

- **WHEN** the contrast unit test parses the `--rating-star`, `--text-secondary`, `--accent-primary` and `--bg-secondary` values for each theme block in `globals.css`
- **THEN** every chart text pair is at least 4.5:1 and every data-mark and star pair is at least 3:1

#### Scenario: Timeline phase labels are verified against their real backgrounds

- **WHEN** the contrast unit test composites `--accent-primary` at `TIMELINE_GRADIENT_OPACITY.top` over `--bg-tertiary` and over `--bg-secondary` for each theme
- **THEN** `--text-primary` is at least 4.5:1 against both composites and against plain `--bg-tertiary` and `--bg-secondary`
```

### 6. Docs / ledger impact

- AGENTS.md "Charts" bullet: add "test text against the background it is actually drawn on (in-chart
  fills and gradients included); no `--text-tertiary` for chart text".
- A new D99 entry is proposed for app-wide `--text-tertiary` text (see Cross-track notes).

### 7. Draft tasks

- [ ] R4.10 Failing tests first: the real-background describe in `contrast.test.ts`, the
  `--text-tertiary` text rule in `chart-guards.test.ts`, and the phase-title class and stop-opacity
  assertions in `BrewTimeline.test.tsx`. Run `docker compose run --rm --no-deps app pnpm --filter @brewform/web exec vitest run src/utils/chart src/components/recipe/BrewTimeline.test.tsx`.
- [ ] R4.11 Then:
  - Add `TIMELINE_GRADIENT_OPACITY` (with a docblock) to `apps/web/src/utils/brew-timeline.ts`
    and use it for the two `<stop>`s in `BrewTimeline.tsx`.
  - Switch the phase-title span (`:219`) to `--text-primary` and the header title (`:135`) to
    `--text-secondary`.
  - Switch `StarRating.tsx:142` to `--text-secondary`.
  - Re-run until green.

### 8. Risks / migration notes

- Visual change: the gradient is slightly lighter, and the titles are darker in light and lighter
  in dark and coffee.
- Re-run manual check 19.27 (timeline in all three themes, at 320–1280 px, en and tr).

---

## Finding 21: `niceTicks` infinite loop

### 1. Verification

`apps/web/src/utils/chart/ticks.ts:35-59` (`multiplesInRange`) loops
`for (let k = first; k <= last; k++)`. For `niceTicks(0.3, 0.1 + 0.2, 4)` the range is 5.6e-17:

- The candidate exponent −17 with m = 2 gives `first = 1.5e16`, past `2^53`, so `k++` rounds back
  to `k`.
- `last - first + 1 = 3 <= 4` passes the count check.
- The loop pushes forever until the array length throws or the tab runs out of memory.

The review did not cover these:

- **The positive-exponent branch hangs the same way.** Example:
  `niceTicks(2 ** 60, 2 ** 60 + 256, 4)` reaches step 100, `first ≈ 1.15e16`, count 3.
- **Duplicates.** Even after a safe-integer guard, at magnitudes where the step is below one ulp,
  `k * step` values can round to equal doubles.
- **Overflowing range.** `niceTicks(-1e308, 1e308, 8)`: `hi - lo` is `Infinity`, the exponent
  becomes `Infinity`, the step is `Infinity`, and the function returns `[NaN]`.

There are no production callers (`grep niceTicks` finds only `index.ts:56` and tests). The existing
property test (`ticks.test.ts:52-79`) samples [-1e6, 1e6] with a gap above 1e-6, so it never hits
these inputs.

Verdict: **bigger**.

### 2. Root cause

Integer stepping with no precision guard, and no check that the range width is finite.

### 3. Fix design

In `multiplesInRange`, in both branches:

```ts
// Past 2^53, k++ cannot advance and k * step loses the step: try a larger step.
if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) return null;
… build out …
for (let i = 1; i < out.length; i++) if (!(out[i] > out[i - 1])) return null; // step below float resolution
```

In `niceTicks`, after the swap: `if (!Number.isFinite(hi - lo)) return [];`. Update the docblock:
"an overflowing range returns `[]`; it always terminates".

Returning `null` makes the caller try the next mantissa or decade. The existing 40-decade guard is
enough: an accepted step must be at least about one ulp of `lo`, and that is reached within 2–3
decades of the starting exponent, because the range is at least one ulp.
`niceTicks(0.3, 0.1+0.2, 4)` then returns `[0.3]` at exponent −16.

### 4. Tests (failing first)

In `apps/web/src/utils/chart/ticks.test.ts`, describe "niceTicks terminates on near-equal and huge
bounds":

- `niceTicks(0.3, 0.1 + 0.2, 4)` → `[0.3]`.
- `niceTicks(2 ** 60, 2 ** 60 + 256, 4)`: 1–4 strictly ascending finite values in bounds.
- `niceTicks(0, Number.MIN_VALUE, 4)` → `[0]`.
- `niceTicks(-Number.MAX_VALUE, Number.MAX_VALUE, 8)` → `[]`.
- `niceTicks(Number.MAX_VALUE / 2, Number.MAX_VALUE, 8)`: finite, ascending, in bounds.
- Property:
  - `a = fc.double({ noNaN: true, noDefaultInfinity: true })`.
  - `b` is `fc.oneof` of another such double, or `a` moved by `n ∈ [1, 1000]` ulps (a
    `Float64Array`/`BigInt64Array` view; `fc.pre(Number.isFinite(b) && a !== b)`).
  - `maxCount ∈ [1, 12]`.
  - Assert: either `!Number.isFinite(hi - lo)` and the result is `[]`, or the result has 1 to
    `maxCount` values, each finite, strictly ascending, in `[lo, hi]` (eps `(hi - lo) * 1e-9`).
  - 1000 runs.

The first case hangs before the fix, so confirm the failure with a wall-clock limit:
`docker compose run --rm --no-deps app timeout 60 pnpm --filter @brewform/web exec vitest run src/utils/chart/ticks.test.ts -t "terminates"`
should exit 124 or be killed.

### 5. Spec impact: `chart-rendering`

MODIFIED `### Requirement: Shared chart primitives module` (full block; this also removes the
`symmetricX` option from finding 34):

```markdown
### Requirement: Shared chart primitives module

The web app SHALL provide one shared chart utility module at `apps/web/src/utils/chart/` (`scale.ts`, `ticks.ts`, `text.ts`, `layout.ts`, re-exported from `index.ts`) that every chart, meter and rating display uses for value sanitizing, clamping, tick generation, text-width estimation, label wrapping and bounding-box geometry, and chart components SHALL NOT reimplement these helpers locally.

The module SHALL export at least:

- `sanitizeNumber(value, fallback = 0)`: returns `fallback` for `NaN`, `±Infinity`, `null`,
  `undefined` and non-numbers, and otherwise returns the number.
- `clamp(value, min, max)`: sanitizes first, swaps `min`/`max` when they are reversed, and never
  returns a value outside `[min, max]`.
- `clampPct(value)`: equivalent to `clamp(value, 0, 100)`.
- `niceTicks(min, max, maxCount)`: numeric ticks at a power of ten × {1, 2, 5}, never more than
  `maxCount`, finite, strictly ascending and inside `[min, max]`. It SHALL return for every finite
  input, including bounds one floating-point step apart and magnitudes beyond 2^53, and SHALL return
  `[]` when `max - min` overflows to infinity.
- `durationTicks(totalSeconds, options)`: see "Duration axes use bounded nice ticks".
- `estimateTextWidth(text, fontSizePx, { bold?, letterSpacingPx? })`: a deterministic,
  conservative width estimate.
- `wrapLabel(text, maxWidthPx, fontSizePx)`: splits after `/`, keeping the slash on the first
  line, and at whitespace when a segment is still too wide.
- Box helpers: `labelBox`, `unionBox`, `isInside`, `overlaps`, `fitViewBox(content, margin = 0)`.

Every exported function SHALL have co-located Vitest unit tests (`*.test.ts`).

#### Scenario: Non-finite input is sanitized

- **WHEN** `clamp(NaN, 0, 3)`, `clamp(Infinity, 0, 3)`, `clamp(-Infinity, 0, 3)` and `clamp(undefined, 0, 3)` are called
- **THEN** they return `0`, `3`, `0` and `0` respectively, and `clampPct(-12)` returns `0` and `clampPct(140)` returns `100`

#### Scenario: Numeric nice ticks respect the maximum count

- **WHEN** `niceTicks(0, 1234, 8)` is called
- **THEN** it returns at most 8 ascending values, each a multiple of one step from {1, 2, 5} × 10^k, all within `[0, 1234]`

#### Scenario: Near-equal and huge bounds terminate

- **WHEN** `niceTicks(0.3, 0.1 + 0.2, 4)`, `niceTicks(2 ** 60, 2 ** 60 + 256, 4)` and `niceTicks(-Number.MAX_VALUE, Number.MAX_VALUE, 8)` are called
- **THEN** they return `[0.3]`, at most 4 strictly ascending values inside the bounds, and `[]` respectively, and none of them loops

#### Scenario: Width estimate is conservative against measured system-font widths

- **WHEN** the estimate test runs over the measured fixture in `apps/web/src/utils/chart/measured-widths.fixture.ts` (the en and tr radar labels, timeline titles, tick labels and stat values measured in SF Pro, recorded in `openspec/changes/archive/2026-11-21-wave-6-audit-remediation/audit/t6-charts.md` §8)
- **THEN** `estimateTextWidth` returns a width greater than or equal to the measured width for every fixture row

#### Scenario: Labels wrap after the slash

- **WHEN** `wrapLabel('Green/Vegetative', 60, 10)` is called
- **THEN** it returns `['Green/', 'Vegetative']`, and a label with no `/` and no whitespace is returned as a single line
```

### 6. Docs / ledger impact

None.

### 7. Draft tasks

- [ ] R4.12 Failing tests first: the "terminates" describe and the property in
  `apps/web/src/utils/chart/ticks.test.ts`. Confirm with the `timeout 60` command from §4 that the
  run hangs.
- [ ] R4.13 In `apps/web/src/utils/chart/ticks.ts`:
  - Add the safe-integer and strictly-ascending guards to both branches of `multiplesInRange`.
  - Add the overflowing-range guard to `niceTicks`.
  - Update both docblocks.
  - Run `docker compose run --rm --no-deps app pnpm --filter @brewform/web exec vitest run src/utils/chart`.

### 8. Risks / migration notes

None. There is no production caller.

---

## Finding 22: logout leaves private loader data on screen

### 1. Verification

- `AuthContext.tsx:140-148`: `logout()` calls `authApi.logout()`, then `setUser(null)`. Nothing
  touches the router.
- `Navbar.tsx:286` (`onClick={logout}`) and `:456-459` call it. Loader data from the old session
  stays in router state.
- A private collection (`/collections/:id`, no render guard), an owner's private or draft recipe
  (`/recipes/:slug`) and the profile tabs keep showing private data. Confirmed.
- Pages wrapped in `RequireAuth` (`RequireAuth.tsx:24-26`) re-render with `user = null` and are
  replaced with `/login?next=<page>`. That is an odd landing place after a voluntary logout, but the
  data does disappear.
- **The naive fix has a race.** `await logout(); navigate('/')` (exactly what
  `SettingsPage.tsx:85-88` does after account deletion):
  1. `setUser(null)` is queued before `navigate('/')` runs.
  2. The home loader keeps the old location committed.
  3. `RequireAuth` on the guarded page renders `<Navigate to="/login?next=…">`.
  4. Its effect cancels the `/` navigation.

  So the account-deletion flow very likely ends on `/login?next=%2Fsettings` today. I found this by
  reading the code; the new test will confirm it.
- **Static cache.** `api/static-cache.ts` holds only the public equipment catalog and taste notes,
  so nothing private needs clearing.
- **Fetchers.** Keyed fetchers (`like-…`, `follow-…`) are cleaned up when they unmount, which a
  navigation to `/` causes.
- **Login as another user.** `LoginPage.tsx:43-44` always navigates with
  `navigate(getSafeNext(…) ?? '/', { replace: true })`, so the target page's loaders run with the
  new session. With logout also leaving the page, user B never sees A's loader data. The root loader
  (`routes/root.ts`) holds only the public registration flag. Another tab is not covered (see
  Cross-track notes).

Verdict: **confirmed**.

### 2. Root cause

The session store sits above the router (`App.tsx:28-33`), so `logout` cannot navigate. The callers
do not navigate either, or they navigate after clearing the user.

### 3. Fix design

Order: clear the cookies, then leave the private page, then clear the user. Then no loader runs
with the old session, and no render guard ever sees a signed-out user on a guarded page.

`AuthContext.tsx`:

```ts
/** … `leave` runs after the server logout and before the user is cleared (callers navigate away in it). */
async function logout(leave?: () => Promise<void> | void) {
  log.info({}, 'AuthContext user logged out');
  try { await authApi.logout(); } catch { /* cookies may already be cleared */ }
  try { await leave?.(); } finally { setUser(null); }
}
```

The type in `AuthContextType` becomes `logout: (leave?: () => Promise<void> | void) => Promise<void>`.
The `AppProviders` fixed-auth type follows automatically.

New `apps/web/src/hooks/useSignOut.ts` (inside the router tree):

```ts
/** Signs out and replaces the current page with `/` before the user is cleared, so no private page or loader data stays on screen and render guards never bounce to `/login`. */
export function useSignOut(): () => Promise<void> {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return useCallback(() => logout(() => navigate('/', { replace: true })), [logout, navigate]);
}
```

In data mode `navigate` returns a promise that resolves when the navigation completes (Context7,
`useNavigate.md`).

Callers:

- `Navbar.tsx:286`: `onClick={() => void signOut()}`.
- `Navbar.tsx:456-459`: `setIsMenuOpen(false); void signOut();`.
- `SettingsPage.tsx:85-88` (`finishDeletion`): `await signOut()`, and drop the separate
  `navigate('/')`.

TypeScript then rejects any leftover `onClick={logout}`, because a `MouseEvent` is not assignable to
`leave`, so `make check` catches missed call sites.

Logging out on `/` re-runs the home loader (same-URL navigation) with public data. That is
harmless.

Rejected:

- Revalidating the current page. A guarded page's loader then redirects to `/login?next=…`, and a
  public page re-renders without private data but keeps the user on, say, an owner-only draft URL
  that now 404s.
- A logout route action plus a window event to reach `AuthContext`. That adds a new mechanism.

### 4. Tests (failing first)

- `apps/web/src/contexts/AuthContext.test.tsx`, "logout runs leave between the server logout and
  clearing the user": record the order with mocks; `user` is still set inside `leave`; `user` is
  `null` after it; `leave` throwing still clears the user.
- New `apps/web/src/hooks/useSignOut.test.tsx`: real `AuthProvider` (mock `../api/index.ts`, with
  `userApi.me` returning a user and `authApi.logout` resolving), and a memory router with:
  - `/` (home text),
  - `/settings` (element `<RequireAuth><p>private settings</p></RequireAuth>` plus a loader),
  - `/collections/c1` (loader returning `{ name: 'Secret beans' }`, no guard),
  - a button that calls `useSignOut()`.

  Cases:
  1. From `/collections/c1`: after the click, wait for the pathname to be `/`; "Secret beans" is
     not in the document.
  2. From `/settings`: the pathname ends at `/` and never at `/login` (assert
     `router.state.location.pathname === '/'` after settling, with
     `router.state.location.search === ''`).
  3. `authApi.logout` rejecting still navigates and clears the user.

  Case 2 fails today in the `SettingsPage`-style ordering.
- `apps/web/src/components/layout/Navbar.test.tsx`: both Logout buttons call the sign-out path,
  landing on `/` (with the fixed-auth `logout` mock invoking `leave`).
- `apps/web/src/pages/settings/SettingsPage.test.tsx`: the account-deletion success lands on `/`.

### 5. Spec impact: `web-data-loading`

ADDED requirement:

```markdown
### Requirement: Signing out leaves no private data on screen
Signing out SHALL clear the session cookies, then navigate with `replace` to `/`, and only after that navigation settles clear the signed-in user, so that no loader data, fetcher data or page loaded with the old session stays rendered and no render guard redirects a signing-out user to `/login`.

The session store (`AuthContext`) sits above the router, so the navigation SHALL be done by a hook
inside the router tree, `useSignOut()` in `apps/web/src/hooks/useSignOut.ts`, and
`AuthContext.logout(leave)` SHALL await `leave()` between the server logout and clearing the user.
Every sign-out control (the navbar's desktop and mobile Logout buttons and the account-deletion
flow on `/settings`) SHALL use it. The static lookup cache holds only public data and is not cleared.
Logging in always navigates (to `next` or `/`), so a second user on the same tab never sees the
first user's loader data.

#### Scenario: Logout from a private collection
- **WHEN** a signed-in user viewing their private collection `/collections/:id` clicks Logout
- **THEN** the app shows `/` and the collection's name and items are no longer rendered

#### Scenario: Logout from a guarded page does not bounce to login
- **WHEN** a signed-in user on `/settings` clicks Logout, or deletes their account there
- **THEN** the app lands on `/`, not on `/login?next=%2Fsettings`

#### Scenario: The next user starts clean
- **WHEN** user A logs out on a recipe page and user B logs in on the same tab
- **THEN** every page B sees is loaded with B's session (B's own like and rating state), not A's
```

### 6. Docs / ledger impact

- AGENTS.md, "Web data loading" → Auth bullet: "Sign-out goes through `useSignOut()` (navigate to
  `/` before the session store clears the user); never call `useAuth().logout` from a component."
- `docs/architecture.md`: the same sentence near the auth bullet.
- A new D99 entry is proposed for cross-tab session sync (see Cross-track notes).

### 7. Draft tasks

- [ ] R4.14 Failing tests first: the `AuthContext.test.tsx` order test, the new
  `apps/web/src/hooks/useSignOut.test.tsx` (three cases), and the `Navbar.test.tsx` and
  `SettingsPage.test.tsx` landing assertions.
- [ ] R4.15 Implement:
  - `logout(leave?)` in `AuthContext.tsx`, with its type and docblock.
  - `apps/web/src/hooks/useSignOut.ts`, with a docblock and a debug log
    `useSignOut leaving private page`.
  - Switch both Navbar Logout handlers and `SettingsPage.finishDeletion` to it.
  - Run `make check-web` and `make test-web`.

### 8. Risks / migration notes

- Signing out now always lands on `/`, even from a public page. That is intended.
- No data change.
- Add a logout step to manual check 16.9.

---

## Finding 23: Follow and Like roll back to `initial*`, not the last confirmed value

### 1. Verification

- `LikeButton.tsx:26-29`: `liked = optimisticLiked ?? settledLiked ?? initialLiked`, and
  `settledLiked` is `null` when `fetcher.data.ok` is false.
- `FavouriteButton.tsx:25-31` and `FollowButton.tsx:25-29` behave the same. So a success followed
  by a failure falls back to the page-load value. Confirmed for all three.
- `FollowButton.tsx:59-62` calls `onToggleRollback(initialFollowing)`.
- **Follow gets stuck.**
  - The API answers 409 to `POST /follow/:id` when the user already follows
    (`apps/api/src/modules/follow/index.ts:73-74`) and 404 to `DELETE` when the user does not
    (`:115-116`).
  - After a wrong rollback ("Follow" shown, the server follows), every click POSTs, gets a 409 and
    rolls back again until the page reloads.
- **Like and favourite** are server-side toggles, so they do not get stuck. A wrong rollback just
  inverts the user's next click.
- **No failure feedback.** None of the three uses `useActionFeedback` or a toast, which AGENTS.md
  ("shows the failure with `useToast()`") requires.
- **Action pattern.**
  - The actions (`like.ts`, `favourite.ts`, `follow.ts`) catch everything, pass no
    `request.signal`, use no `withDataLog`, and return no `code`.
  - So a 401 cannot be told apart, which finding 9 needs.
- **NEW (not in the review): hard-coded English.** `FollowButton.tsx:82` renders the literals
  `'Following'` and `'Follow'`, so the tr locale shows English on `/u/:username`.
  `follow.follow` exists. `follow.following` is "Takip Edilenler" in tr, the noun for the profile
  tab, so the button needs its own key.
- **Other optimistic UIs are correct.** `CollectionRecipeList` reorder rolls back to a snapshot
  (`:98-118`). `AddToCollectionModal` rows roll back to the pre-click membership (`:110`).
  `CommentSection` delete restores from a snapshot.
- **Mirror tests.** `FollowButton.exploration.test.ts` and `FollowButton.preservation.test.ts`
  test a hand-written copy of a pre-fetcher state machine, not the component (the D99.13 pattern).
  Their premise that a 409 is an error contradicts the idempotent follow below.

Verdict: **confirmed**, with the extra items listed.

### 2. Root cause

The failure result carries no state, so the components can only fall back to their props.

### 3. Fix design

A failed toggle returns the state the user had before the click, which is the last confirmed state.
The submitted form already carries the requested value (`liked`, `favourited`, `following`), so
the previous state is its opposite. The components then use the returned state whether the result
is ok or not:

```ts
// like.ts (favourite.ts identical with `favourited`)
export const likeAction = async ({ params, request }: ActionFunctionArgs): Promise<LikeResult> => {
  const id = params.id ?? '';
  if (!id) return { ok: false, error: 'Missing or invalid route parameter: id' };
  const requested = formString(await request.formData(), 'liked');
  try {
    const { liked } = await withDataLog(logger, 'likeAction', { id }, () =>
      recipeApi.like(id, { signal: request.signal }),
    );
    return { ok: true, liked };
  } catch (err) {
    const failure = toActionFailure(err, []);
    return requested ? { ...failure, liked: requested !== 'true' } : failure;
  }
};
```

`follow.ts`:

- Use the same `withDataLog`, `request.signal` and `toActionFailure(err, [])` shape.
- On failure return `following: request.method === 'DELETE'` (the pre-click state).
- Make it idempotent: an `ApiError` with status 409 on POST →
  `{ ok: true, following: true }`; status 404 on DELETE → `{ ok: true, following: false }`. Log
  each at debug as `followAction already in requested state`.

Components:

- `settledLiked = typeof settled?.liked === 'boolean' ? settled.liked : null` (drop the
  `settled?.ok &&` guard). Same for favourite and follow.
- `FollowButton` calls `onToggleRollback(fetcher.data.following ?? initialFollowing)`.
- Each button adds `useActionFeedback(fetcher, { errorKey })` with `recipe.like.error`,
  `recipe.favourite.error` or `follow.error`. The `UNAUTHORIZED` mapping comes from finding 8.
- `FollowButton` labels use `t('follow.follow')` and the new `t('follow.followingState')`.

i18n (en / tr):

- `recipe.like.error`: "Could not update your like. Please try again." / "Beğeniniz güncellenemedi. Lütfen tekrar deneyin."
- `recipe.favourite.error`: "Could not update your starred recipes. Please try again." / "Yıldızlı tarifleriniz güncellenemedi. Lütfen tekrar deneyin."
- `follow.error`: "Could not update the follow. Please try again." / "Takip durumu güncellenemedi. Lütfen tekrar deneyin."
- `follow.followingState`: "Following" / "Takip ediliyor"

Also delete `apps/web/src/components/user/FollowButton.exploration.test.ts` and
`FollowButton.preservation.test.ts`.

Alternatives rejected:

- A component-side ref of the last submitted value, read during render. It needs reset logic when
  the `userId`/`recipeId` prop changes, because the component instance is reused across
  `/u/alice` → `/u/bob`.
- Component state synced from `fetcher.data` in an effect. The `useEffect` allowlist forbids storing
  network results in state.

### 4. Tests (failing first)

- `apps/web/src/routes/like.test.ts` and `favourite.test.ts`:
  - Requests become `new Request(url, { method: 'POST', body: form })` carrying `liked` /
    `favourited`.
  - A failure with `liked=false` returns `{ ok: false, error, code, liked: true }`.
  - Without the field it returns no `liked`.
  - A 401 returns `code: 'UNAUTHORIZED'`.
  - An abort is rethrown.
  - The API is called with `{ signal }`.
  - The logger spy sees `{ err, id }` with `likeAction failed`.
  - A non-Error rejection gives `error: 'Request failed'`.
- `apps/web/src/routes/follow.test.ts`:
  - POST + 409 → `{ ok: true, following: true }`.
  - DELETE + 404 → `{ ok: true, following: false }`.
  - POST + 500 → `{ ok: false, …, following: false }`.
  - DELETE + 500 → `following: true`.
  - Plus the signal and logging checks.
- `apps/web/src/components/recipe/LikeButton.test.tsx`, `FavouriteButton.test.tsx` and
  `components/user/FollowButton.test.tsx`:
  - Switch to `renderWithAppProviders` (`apps/web/src/test-utils/render.tsx`), because the buttons
    now need the i18n and toast providers.
  - Add the two-step test: the action mock resolves `{ ok: true, liked: true }`, then
    `{ ok: false, error: 'x', liked: true }`. After two settled clicks the count shows 4 (initial 3)
    and the error toast text is visible.
  - FollowButton: "Following" after a failed unfollow; the next click sends `DELETE`; and
    `onToggleRollback` is called with `true`. Text assertions use the i18n values.

### 5. Spec impact: `optimistic-rollback` (four MODIFIED blocks)

MODIFIED `### Requirement: Resource route actions return error data instead of throwing`:

```markdown
### Requirement: Resource route actions return error data instead of throwing

The four resource route actions for recipe social state (like, favourite, rate, follow) SHALL return a plain JavaScript object `{ ok: false, error: string, code?: string }` on any failure instead of throwing an `Error` or `Response`, built with `toActionFailure(err, [])` (which rethrows only an aborted request), and SHALL return `{ ok: true, ...state }` on success (`liked`, `favourited`, `following`, or the rate result `rating`, `avgRating` and `ratingCount`).

This includes the following failure cases:
- Invalid or missing route parameters (`params.id`, `params.userId`) or an invalid rating value
- API errors from the backend (`ApiError` with `code`, `message`, `status`), including a final 401, which returns `code: 'UNAUTHORIZED'` and never redirects
- Network errors (e.g., `TypeError: Failed to fetch`)
- Unknown error types (non-`Error` values thrown)

A failed toggle (like, favourite, follow) SHALL also return the state the user had before the click
(`liked`, `favourited` or `following`: the opposite of the submitted value, or for follow the state
implied by the method), so the button falls back to the last confirmed state. The follow action
SHALL treat a 409 on follow (already following) as `{ ok: true, following: true }` and a 404 on
unfollow (not following) as `{ ok: true, following: false }`. Each action SHALL pass
`request.signal` to its API call.

#### Scenario: Invalid parameter returns error object

- **WHEN** `likeAction` is called with an empty or missing `params.id`
- **THEN** the action SHALL return `{ ok: false, error: 'Missing or invalid route parameter: id' }`
- **AND** the action SHALL NOT throw a `Response` or `Error`

#### Scenario: API failure returns error object with the previous state

- **WHEN** a user who has liked a recipe submits an unlike (`liked=false`) and `recipeApi.like(id)` throws an `ApiError` with code `INTERNAL_ERROR` and message "Internal server error"
- **THEN** `likeAction` SHALL return `{ ok: false, error: 'Internal server error', code: 'INTERNAL_ERROR', liked: true }`
- **AND** the action SHALL NOT re-throw the error

#### Scenario: Network failure returns error object

- **WHEN** `recipeApi.favourite(id)` throws a `TypeError: Failed to fetch` for a `favourited=true` submission
- **THEN** `favouriteAction` SHALL return `{ ok: false, error: 'Failed to fetch', favourited: false }`
- **AND** the action SHALL NOT re-throw the error

#### Scenario: A failed rating returns error data

- **WHEN** `recipeApi.rate(id, 8)` rejects with an `ApiError` 429 `RATE_LIMITED`
- **THEN** `rateAction` SHALL return `{ ok: false, error, code: 'RATE_LIMITED', retryAfterSeconds }` and SHALL NOT throw

#### Scenario: Success returns ok object

- **WHEN** `followApi.follow(userId)` resolves successfully
- **THEN** `followAction` SHALL return `{ ok: true, following: true }`
- **AND** the action SHALL NOT return `null`

#### Scenario: Follow is idempotent

- **WHEN** `followApi.follow(userId)` rejects with a 409 `CONFLICT`, or `followApi.unfollow(userId)` rejects with a 404
- **THEN** `followAction` SHALL return `{ ok: true, following: true }` or `{ ok: true, following: false }` respectively

#### Scenario: Unknown error type returns fallback message

- **WHEN** an API call throws a non-Error value (e.g., a primitive string)
- **THEN** the action SHALL return `{ ok: false, error: 'Request failed' }`, plus the previous state for a toggle
- **AND** the action SHALL NOT re-throw
```

MODIFIED `### Requirement: Actions log structured entry, exit, and error events`:

```markdown
### Requirement: Actions log structured entry, exit, and error events

Each resource route action (like, favourite, rate, follow) SHALL wrap its API call in `withDataLog(logger, '<actionName>', ids, fn)` (`apps/web/src/routes/data-logging.ts`), which logs:

- **Entry** (debug): `{ id }` (`{ id, rating }` for rate) or `{ userId, method }` with the message `"<actionName> started"`
- **Exit** (debug): the same ids with the message `"<actionName> completed"`
- **Error** (error): `{ err, ...ids }` with the message `"<actionName> failed"`; an aborted request is not logged as an error

Each file SHALL create exactly one module-scoped logger at the top level via `const logger = createLogger('<module-name>')`. Invalid input SHALL be logged at `debug` with ids only and SHALL NOT reach the API.

#### Scenario: Like action logs entry and success

- **WHEN** `likeAction` is called with a valid `params.id` and the API succeeds
- **THEN** `logger.debug({ id }, 'likeAction started')` SHALL be called before the API call
- **AND** after API success, `logger.debug({ id }, 'likeAction completed')` SHALL be called before returning

#### Scenario: Like action logs entry and error

- **WHEN** `likeAction` is called and the API fails with an `ApiError`
- **THEN** `logger.debug({ id }, 'likeAction started')` SHALL be called before the API call
- **AND** `logger.error({ err, id }, 'likeAction failed')` SHALL be called before returning the error object

#### Scenario: Favourite action logs entry and success

- **WHEN** `favouriteAction` is called with a valid `params.id` and the API succeeds
- **THEN** `logger.debug({ id }, 'favouriteAction started')` SHALL be called before the API call
- **AND** after API success, `logger.debug({ id }, 'favouriteAction completed')` SHALL be called before returning

#### Scenario: Favourite action logs entry and error

- **WHEN** `favouriteAction` is called and the API fails with a network error
- **THEN** `logger.debug({ id }, 'favouriteAction started')` SHALL be called before the API call
- **AND** `logger.error({ err, id }, 'favouriteAction failed')` SHALL be called before returning the error object

#### Scenario: Rate action logs entry and error

- **WHEN** `rateAction` is called with a valid id and rating and the API fails
- **THEN** `logger.debug({ id, rating }, 'rateAction started')` and `logger.error({ err, id, rating }, 'rateAction failed')` SHALL be called

#### Scenario: Follow action logs entry and success

- **WHEN** `followAction` is called with a valid `params.userId` and the API succeeds
- **THEN** `logger.debug({ userId, method: request.method }, 'followAction started')` SHALL be called before the API call
- **AND** after API success, `logger.debug({ userId, method: request.method }, 'followAction completed')` SHALL be called before returning

#### Scenario: Follow action logs entry and error

- **WHEN** `followAction` is called with a valid `params.userId` and the API fails with a status other than the idempotent 409/404
- **THEN** `logger.debug({ userId, method: request.method }, 'followAction started')` SHALL be called before the API call
- **AND** `logger.error({ err, userId, method: request.method }, 'followAction failed')` SHALL be called before returning the error object
```

MODIFIED `### Requirement: Optimistic UI rollback on action failure`:

```markdown
### Requirement: Optimistic UI rollback on action failure

When a resource route action accessed via `useFetcher` returns `{ ok: false, error: '...' }` (does not throw), the following SHALL occur:

1. `fetcher.formData` SHALL clear to `null`
2. `fetcher.state` SHALL transition to `'idle'`
3. `fetcher.data` SHALL be set to the returned `{ ok: false, error, ... }`
4. Neither the root `RootErrorBoundary` nor the route `errorElement` SHALL be triggered
5. The page SHALL remain fully usable (navbar, layout, all content visible)
6. The button SHALL show the last confirmed state: the pre-click state the failed action returns, which is the last successful result or, when there was none, the loader's `initial*` value
7. An error toast SHALL be shown through `useActionFeedback` (`error.unauthorized` for the `UNAUTHORIZED` code)
8. The recipe detail loader SHALL NOT be revalidated, because the failed action changed nothing

On success (action returns `{ ok: true, ... }`):

1. `fetcher.formData` SHALL clear to `null`
2. `fetcher.state` SHALL transition to `'idle'`
3. `fetcher.data` SHALL be set to the returned object, and the like, favourite and follow buttons SHALL show the state it carries without a loader revalidation (they submit with `defaultShouldRevalidate: false`)

The interactive rating SHALL follow the same rule: while the rate action is pending it shows the
submitted value; when it settles with `{ ok: false }` it shows the saved rating from the loader again
(the slider drops its committed draft when `busy` clears); on `{ ok: true }` it shows the value from
the revalidated loader.

#### Scenario: Like button reverts on API failure

- **WHEN** a user clicks the Like button (optimistic state shows heart filled, count incremented by +1)
- **AND** `likeAction` returns `{ ok: false, error: 'server error', liked: false }`
- **THEN** the Like button SHALL revert to its pre-click state (not liked, count from `initialCount`)
- **AND** the button SHALL NOT remain disabled, an error toast SHALL be shown, and the full page (Layout, navbar) SHALL remain visible

#### Scenario: A failed unlike keeps the confirmed like

- **WHEN** a user likes a recipe (`{ ok: true, liked: true }`) and then clicks again to unlike, and the unlike fails
- **THEN** the Like button SHALL show liked with the incremented count, not the loader's `initialLiked`

#### Scenario: Favourite button reverts on API failure

- **WHEN** a user clicks the Favourite button (optimistic state shows star filled, count incremented by +1)
- **AND** `favouriteAction` returns `{ ok: false, error: 'server error', favourited: false }`
- **THEN** the Favourite button SHALL revert to its pre-click state (`☆`, `initialCount`)
- **AND** the button SHALL NOT remain disabled
- **AND** the full page SHALL remain visible

#### Scenario: A failed unfollow keeps the confirmed follow

- **WHEN** a user follows (`{ ok: true, following: true }`) and then the unfollow fails
- **THEN** the Follow button SHALL show "Following", and the next click SHALL send an unfollow (DELETE), not a follow

#### Scenario: A failed rating restores the saved rating

- **WHEN** a user whose saved rating is 6 commits 8 and the rate action returns `{ ok: false }`
- **THEN** the rating slider SHALL show 6 again and an error toast SHALL be shown

#### Scenario: Fetcher data contains actionable error object on failure

- **WHEN** an action accessed via `useFetcher` returns `{ ok: false, error: 'server error' }`
- **THEN** `fetcher.data` SHALL be an object with both `ok` and `error` properties
- **AND** `'error' in fetcher.data` SHALL evaluate to `true`
- **AND** consumers SHALL be able to branch on `fetcher.data.ok === false` for inline error display
```

MODIFIED `### Requirement: Error path test coverage for button components`:

```markdown
### Requirement: Error path test coverage for button components

Each button component test file SHALL include a test case that verifies the error rollback path. The test SHALL:

1. Mount the component with `renderWithAppProviders` (`apps/web/src/test-utils/render.tsx`, which supplies the router, i18n and toast providers) with a resource route action that returns `{ ok: false, error: 'server error' }` plus the pre-click state
2. Simulate a user click on the button using `userEvent.setup()`
3. Assert that after the action settles, the button is not disabled (fetcher transitioned to idle) using `waitFor`
4. Assert that the button displays the pre-click count or state (not stuck in the optimistic state) and that an error toast is shown

Each button test file SHALL also include a two-step test: a first click whose action succeeds, then a second click whose action fails, asserting that the button shows the state confirmed by the first click.

For FollowButton, the error rollback test SHALL additionally verify that the `onToggleRollback` callback (if provided as a `vi.fn()` mock) is called with the pre-click following state returned by the action. The test SHALL create its own router with the error-returning action and SHALL NOT reuse the shared `renderWithRouter` helper (which uses a hanging action).

#### Scenario: LikeButton error rollback test

- **WHEN** a test renders `LikeButton` with `initialLiked=false, initialCount=3` with a `recipes/:id/like` action that returns `{ ok: false, error: 'server error', liked: false }`
- **AND** the simulated user clicks the button
- **THEN** after the action settles (`waitFor`), the button SHALL NOT be disabled
- **AND** the button textContent SHALL contain "3" (the original count, NOT the optimistically incremented "4")

#### Scenario: LikeButton keeps the confirmed like after a failed unlike

- **WHEN** a test renders `LikeButton` with `initialLiked=false, initialCount=3`, the first action call returns `{ ok: true, liked: true }` and the second returns `{ ok: false, error: 'server error', liked: true }`
- **AND** the simulated user clicks twice, waiting for each click to settle
- **THEN** the button textContent SHALL contain "4"

#### Scenario: FavouriteButton error rollback test

- **WHEN** a test renders `FavouriteButton` with `initialFavourited=false, initialCount=5` with a `recipes/:id/favourite` action that returns `{ ok: false, error: 'server error', favourited: false }`
- **AND** the simulated user clicks the button
- **THEN** after the action settles, the button SHALL NOT be disabled
- **AND** the button textContent SHALL contain "5" (the original count)

#### Scenario: FollowButton error rollback test (visual)

- **WHEN** a test renders `FollowButton` with `userId='user-1', initialFollowing=false` with a `follow/:userId` action that returns `{ ok: false, error: 'server error', following: false }`
- **AND** the simulated user clicks the button
- **THEN** after the action settles, the button SHALL NOT be disabled
- **AND** the button textContent SHALL be the `follow.follow` text (the original state, NOT the `follow.followingState` text or "...")

#### Scenario: FollowButton onToggleRollback callback fires on error

- **WHEN** a test renders `FollowButton` with `userId='user-1', initialFollowing=false, onToggleRollback={vi.fn()}` with an action that returns `{ ok: false, error: 'server error', following: false }`
- **AND** the simulated user clicks the button
- **THEN** after the action settles, the `onToggleRollback` mock SHALL have been called exactly once with `false`
- **AND** the `onToggle` mock (if provided) SHALL NOT have been called

#### Scenario: FollowButton keeps the confirmed follow after a failed unfollow

- **WHEN** a test renders `FollowButton` with `initialFollowing=false`, the first action call returns `{ ok: true, following: true }` and the second returns `{ ok: false, error: 'server error', following: true }`
- **AND** the simulated user clicks twice, waiting for each click to settle
- **THEN** the button SHALL show the `follow.followingState` text and `onToggleRollback` SHALL have been called once with `true`
```

### 6. Docs / ledger impact

- `docs/architecture.md` "Writes" bullet: "a failed toggle returns the pre-click state, so the button
  falls back to the last confirmed value".
- Five new i18n keys in en and tr.
- The deleted mirror tests touch D99.13 (coverage integrity, already resolved). Mention them in
  the PR, no ledger change.

### 7. Draft tasks

- [ ] R4.16 Failing tests first:
  - Rewrite `apps/web/src/routes/like.test.ts`, `favourite.test.ts` and `follow.test.ts` per §4
    (form-carrying requests, previous state on failure, follow 409/404 idempotency, `code`,
    `{ signal }`, `withDataLog` log shape).
  - Switch `LikeButton.test.tsx`, `FavouriteButton.test.tsx` and `FollowButton.test.tsx` to
    `renderWithAppProviders`, and add the two-step and toast tests.
- [ ] R4.17 Implement:
  - Rewrite `like.ts`, `favourite.ts` and `follow.ts` with `withDataLog`, `request.signal`,
    `toActionFailure(err, [])`, the previous-state field, the follow idempotency, and exported
    result types with docblocks.
  - Update the three buttons: settled state regardless of `ok`, `useActionFeedback` with the new
    error keys, i18n labels in FollowButton, and `onToggleRollback(previous)`.
  - Add `recipe.like.error`, `recipe.favourite.error`, `follow.error` and `follow.followingState`
    to `packages/shared/src/i18n/en.json` and `tr.json`.
  - Delete `apps/web/src/components/user/FollowButton.exploration.test.ts` and
    `FollowButton.preservation.test.ts`.
  - Run `make test-web` and `make test-shared`.

### 8. Risks / migration notes

- A 409/404 from follow is no longer shown as an error. That is intended (idempotent).
- The `likeAction` error log changes shape from `{ errorType, errorMessage, id }` to `{ err, id }`,
  the same as every other action.
- No data change.

---

## Finding 24: the "In collections" card goes stale after the add-to-collection modal

### 1. Verification

- Every submission from the modal passes `defaultShouldRevalidate: false`:
  `AddToCollectionModal.tsx:121-124` (row toggles) and `:254-257` (create).
- The recipe page's card (`RecipeDetailPage.tsx:397-419`) renders `collections` from the detail
  loader (`RecipeDetailPage.data.ts:71-76`). Nothing refreshes it.
- After adding the recipe to a collection and closing the modal, the card still lacks it. After
  removing the last one, the card still shows it. Confirmed.
- `SELF_SETTLING_ACTION_RE` (`RecipeDetailPage.data.ts:86-87`) does not include
  `resources/collections/mine`, but the `defaultShouldRevalidate: false` passed by the submissions
  wins anyway.
- `AddToCollectionButton` (`AddToCollectionButton.tsx:37-42`) is the only user of the modal, and it
  appears only on the detail page (`RecipeDetailPage.tsx:203`).
- `CommentSection` merges a revalidated first page (`CommentSection.tsx:149-159`), so a revalidation
  keeps the loaded comment pages, as the rating already proves
  (`RecipeDetailPage.revalidation.test.tsx:224-250`).

Verdict: **confirmed**.

### 2. Root cause

The modal settles its own list for each click, and nothing tells the page that the membership it
displays has changed.

### 3. Fix design

Rule: **no revalidation for each click. When the modal closes after at least one confirmed
membership change, the detail page revalidates once.**

A confirmed change is:

- a row toggle that returned `ok: true`,
- an `add` that returned 409 `CONFLICT` (the server has the recipe; the card may lack it),
- a successful `create` (it creates the collection and adds the recipe).

A create whose add failed (`!ok && collectionId`) does not change this recipe's membership.

Changes:

- `AddToCollectionModal`:
  - `onClose` becomes `(changed: boolean) => void`, with an updated props docblock.
  - Add `const changedRef = useRef(false)`.
  - `CollectionToggleRow` gets an `onConfirmed: () => void` prop, called in its `onSuccess` and in
    the 409-kept branch.
  - The create `onSuccess` sets `changedRef.current = true`.
  - `handleClose()` reads and resets the ref, logs
    `log.debug({ recipeId, changed }, 'AddToCollectionModal closed')`, and calls `onClose(changed)`.
  - `<Modal onClose>` and the × button both use `handleClose`.
- `AddToCollectionButton`:

  ```ts
  const revalidator = useRevalidator();
  onClose={(changed) => {
    setOpen(false);
    if (changed) {
      log.debug({ recipeId }, 'AddToCollectionButton revalidating after collection changes');
      void revalidator.revalidate();
    }
  }}
  ```

  Calling `revalidator.revalidate()` from an event handler is not an effect, so the `useEffect`
  allowlist does not apply.
- Which loaders run: only the detail loader. The root loader and every resource fetcher on the page
  (brew logs and stats, notes, notifications, QR) declare `shouldRevalidate` → `false`.

Rejected:

- Revalidating after each toggle (3 GETs per click).
- Moving the card to its own resource route, or overlaying local membership state on the page.
  Both mean more code.

### 4. Tests (failing first)

- `apps/web/src/components/collections/AddToCollectionModal.test.tsx`:
  - "closing after a confirmed add calls `onClose(true)`".
  - "closing after a failed add, or with no change, calls `onClose(false)`".
  - "a 409 add counts as a change".
  - "a successful create counts as a change".
- New `apps/web/src/components/collections/AddToCollectionButton.test.tsx`:
  - Use a memory router with a page route that has a counting loader and the
    `resources/collections/mine` loader and action backed by a mocked `collectionApi`.
  - Open the modal, toggle one row, close: the page loader ran exactly once more.
  - Open and close with no change: no extra run.
- Optional end-to-end variant: extend `RecipeDetailPage.revalidation.test.tsx` with the stubbed
  `GET /collections?recipeId=…` and `POST /collections/:id/recipes`. After closing, `requests`
  contains exactly one `GET /recipes/<slug>`, and the card lists the collection.

### 5. Spec impact: `web-data-loading`

MODIFIED `### Requirement: Revalidation after actions is scoped to affected data` (this block also
carries finding 8's rules):

```markdown
### Requirement: Revalidation after actions is scoped to affected data
Routes SHALL declare `shouldRevalidate` (or submissions SHALL pass `defaultShouldRevalidate: false`) so that an action only re-runs loaders whose data it changed; social toggles (like, favourite, follow) and comment create/delete SHALL NOT re-run the recipe detail loader when they succeed, and an action that returns `{ ok: false }` SHALL NOT re-run the recipe detail loader at all, because it changed nothing.

Components that accumulate fetcher-loaded data (comment "Load more" pages) SHALL merge revalidated
loader data instead of resetting to the first page.

A successful rating SHALL re-run the recipe detail loader once (the community average and count come
from it). Membership changes made in the add-to-collection modal SHALL NOT revalidate per click; when
the modal closes after at least one confirmed change (an added or removed membership, a 409 "already
in the collection", or a newly created collection holding the recipe), the recipe detail page SHALL
revalidate once so that its "In collections" card is current.

#### Scenario: Liking a recipe issues one request
- **WHEN** a user clicks Like on `/recipes/:slug` and the like action returns `{ ok: true }`
- **THEN** exactly one HTTP request (the like) is sent
- **AND** the recipe, comments and collections GETs are not re-issued

#### Scenario: Loaded comment pages survive an action
- **WHEN** a user has loaded comment pages 1-3 and then favourites the recipe
- **THEN** all three pages of comments remain visible

#### Scenario: A failed rating keeps the page and sends no reload
- **WHEN** a signed-in user rates a recipe and `POST /recipes/:id/rate` fails (HTTP 500, 429, a final 401 or a network error)
- **THEN** `rateAction` returns `{ ok: false, error, code? }`, the recipe page stays rendered, the stars return to the previous rating and an error toast is shown
- **AND** the recipe, comments and collections GETs are not re-issued

#### Scenario: A successful rating refreshes the community average
- **WHEN** the rate action returns `{ ok: true }`
- **THEN** the recipe detail loader runs once and the community average shows the new value

#### Scenario: The In collections card follows the modal
- **WHEN** a user adds the recipe to a collection in the add-to-collection modal and closes the modal
- **THEN** the recipe detail loader runs exactly once after the close and the "In collections" card lists that collection
- **AND** closing the modal without a confirmed change runs no loader
```

### 6. Docs / ledger impact

`docs/architecture.md` "Writes" bullet: one clause, "the add-to-collection modal revalidates the
recipe page once on close after a change".

### 7. Draft tasks

- [ ] R4.18 Failing tests first: the four `onClose(changed)` cases in
  `AddToCollectionModal.test.tsx`, and the new `AddToCollectionButton.test.tsx` (one revalidation
  after a change, none without one).
- [ ] R4.19 Implement:
  - In `AddToCollectionModal.tsx`: `changedRef`, the row's `onConfirmed` prop, `handleClose`, and
    `onClose(changed)` with updated docblocks.
  - In `AddToCollectionButton.tsx`: `useRevalidator` and the conditional `revalidate()`.
  - Run the two files and `make test-web`.

### 8. Risks / migration notes

One extra detail-page GET batch after a modal session that changed something. No data change.

---

## Finding 25: "Brew again" for a deleted recipe shows "load failed"

### 1. Verification

- `apps/web/src/pages/brew-logs/BrewLogFormPage.data.ts:63-70`: in create mode the loader calls
  `recipeApi.get(recipeId, opts)` directly.
- An API 404 rethrows as an `ApiError`. `RouteErrorState` renders the not-found page only for a 404
  `Response` (`RouteErrorState.tsx:21`), so the user sees "This page could not be loaded", and
  `withDataLog` logs an error.
- Edit mode already maps its 404 (`:47-55`, redirect to `/brew-logs`).
- `getRecipeOr404` (`pages/recipes/recipe-common.data.ts:11-23`) already exists. It is used by the
  Fork, Edit and Compare loaders and tested in `recipe-common.data.test.ts:18-41`.
- Entry point: "Brew again" (`BrewHistorySection.tsx:43`) and stale brew-log links.
- Sibling loaders (`CoffeeVarietyDetailPage.data.ts`, `EquipmentDetailPage.data.ts`) already map
  404.

Verdict: **confirmed**.

### 2. Root cause

The create-mode branch was not converted to the shared 404 helper.

### 3. Fix design

Replace `() => recipeApi.get(recipeId, opts)` with `() => getRecipeOr404(recipeId, opts)`, imported
from `../recipes/recipe-common.data.ts`. A data module importing another data module is allowed by
`data-loading.enforcement.test.ts` ("accepts the data layer: `*.data.ts`"). Drop the now-unused
`recipeApi` import, and update the loader docblock ("a missing recipe in create mode renders the
not-found page").

`withDataLog` does not log a thrown `Response` as an error.

Rejected: redirecting to `/recipes/unavailable` (the QR page). That page's copy is about QR visits,
and the review asks for the not-found page.

### 4. Tests (failing first)

`apps/web/src/pages/brew-logs/BrewLogFormPage.test.tsx` (the loader describe, `:149-212`), new test
"throws a 404 Response when the create-mode recipe is gone": `mockGetRecipe` rejects with
`ApiError('NOT_FOUND', …, 404)`, and the thrown value is a `Response` with `status === 404`.

### 5. Spec impact: `brew-journal`

MODIFIED `### Requirement: Brew log form page with create, edit, and prefill`:

```markdown
### Requirement: Brew log form page with create, edit, and prefill

The system SHALL add `BrewLogFormPage` serving both `/brew-logs/new` and `/brew-logs/:id/edit`
(both `RequireAuth`, both with loaders). The shared `BrewLogForm` component SHALL provide fields
for `brewedAt` (native date/datetime input), `yieldActual`, `doseActual`, `notes`, and
`personalRating` (1–10), with client-side constraints matching the shared schemas. On create, the
loader SHALL read `recipeId` (required) and `recipeVersionId` (optional) from the URL search
params, fetch the recipe, and pre-fill `doseActual`/`yieldActual` from the version's parameters as
starting points; a recipe that no longer exists (API 404) SHALL render the not-found page through
`getRecipeOr404`, not the generic load-failed state. On edit, the loader SHALL fetch the existing log
and reject non-owners. Submit SHALL POST/PATCH via `brewLogApi` and navigate back to the brew log
list on success.

#### Scenario: Brew Again prefill

- **WHEN** an authenticated user opens `/brew-logs/new?recipeId=<id>&recipeVersionId=<vid>` from a
  recipe whose current version specifies 15g dose / 250g yield
- **THEN** the form shows that recipe with `doseActual` pre-filled to 15 and `yieldActual` to 250,
  both editable

#### Scenario: Brew Again for a deleted recipe

- **WHEN** an authenticated user opens `/brew-logs/new?recipeId=<id>` for a recipe that has been deleted
- **THEN** the route renders the not-found page and no error is logged

#### Scenario: Edit round-trip

- **WHEN** the owner opens `/brew-logs/:id/edit`, changes the rating, and submits
- **THEN** a PATCH is sent with only the form values and the user lands on the updated list
```

### 6. Docs / ledger impact

None.

### 7. Draft tasks

- [ ] R4.20 Failing test first: the create-mode 404 case in
  `apps/web/src/pages/brew-logs/BrewLogFormPage.test.tsx`. Then switch the create branch of
  `BrewLogFormPage.data.ts` to `getRecipeOr404` (remove the unused `recipeApi` import, update the
  docblock) and run
  `docker compose run --rm --no-deps app pnpm --filter @brewform/web exec vitest run src/pages/brew-logs`.

### 8. Risks / migration notes

None.

---

## Finding 34 (part): unused `symmetricX` option of `fitViewBox`

### 1. Verification

- `apps/web/src/utils/chart/layout.ts:134-158` declares `FitViewBoxOptions.symmetricX` and its
  branch.
- `index.ts:36` re-exports `type FitViewBoxOptions`.
- `grep -rn symmetricX` finds only `layout.ts` and `layout.test.ts:150-158,162`. No production
  caller.
- Note: `fitViewBox` itself has no production caller either (only tests and the re-export). The
  `chart-rendering` spec lists it as a required box helper, and AGENTS.md "Charts" points future
  charts at the layout helpers, so keep the function and delete only the option.

Verdict: **confirmed**.

### 2. Root cause

The option was speculative and never adopted.

### 3. Fix design

- `fitViewBox(content: Box, margin = 0): Box`: delete the `options` parameter, the
  `FitViewBoxOptions` interface and its docblock paragraph.
- Remove `type FitViewBoxOptions` from `index.ts`.
- Delete the "centres x on 0 with the symmetric-x option" test, and the `symmetricX` line in
  "contains the content box".

### 4. Tests

The remaining `fitViewBox` tests (margin, default, contains) still pass. After the change,
`grep -rn "symmetricX\|FitViewBoxOptions" apps/web/src` must return nothing.

### 5. Spec impact

Covered by the finding 21 MODIFIED block (`fitViewBox(content, margin = 0)` in the box-helper
bullet). The spec never mentioned the option.

### 6. Docs / ledger impact

None. The archived wave-6 task 18.6 mentions the option, and archives are not edited.

### 7. Draft tasks

- [ ] R4.21 Remove the `symmetricX` option:
  - From `apps/web/src/utils/chart/layout.ts`: the `FitViewBoxOptions` interface, the `options`
    parameter and the branch.
  - From `apps/web/src/utils/chart/index.ts`: the `type FitViewBoxOptions` re-export.
  - From `apps/web/src/utils/chart/layout.test.ts`: the two `symmetricX` assertions.
  - Run `docker compose run --rm --no-deps app pnpm --filter @brewform/web exec vitest run src/utils/chart`
    and confirm `grep -rn "symmetricX\|FitViewBoxOptions" apps/web/src` is empty.

### 8. Risks / migration notes

None.

---

## Group check and manual checks

- [ ] R4.22 Docs:
  - AGENTS.md, "Web data loading": the Auth bullet (resource routes never redirect, they return
    `UNAUTHORIZED`; sign-out through `useSignOut()`) and the URL state bullet (writes build on
    `useLatestSearchParams`).
  - AGENTS.md "Charts": test text against its real background; no `--text-tertiary` for chart text.
  - The matching bullets in `docs/architecture.md` (about lines 448-460).
  - Then run `make fmt`, `make check`, `make lint` (read the warnings), `make test-web`,
    `make test-shared` (i18n parity, lint policy) and `make docs-check`, checking each exit code
    separately.
- [ ] R4.23 Manual checks in `make dev`, recorded in the PR description. These re-run or extend the
  open wave-6 checks:
  - **16.9 (re-run in full):** each of the five admin pages opens; `/recipes` Next/Prev keeps the
    filters and Back/Forward works; typing in search produces one history entry; `/settings` while
    signed out redirects to `/login?next=%2Fsettings` and returns after login. **Add:**
    - Type in the `/recipes` search and click a brew-method chip within 300 ms: both stay in the URL.
    - Type in search and then in author quickly: both stay.
    - Log out from a private collection and from `/settings`: you land on `/`, not on `/login`.
    - In DevTools delete the `brewform_access_token` cookie, then click "Resend verification": the
      email is sent with no logout.
    - With DevTools offline, mark a notification read: a toast appears, with no redirect and no
      blank page.
  - **19.27 (re-run the affected items):**
    - The espresso recipes with pre-infusion (28s/5s, 27s/6s) and `blue-mountain-cold-brew` in
      light, dark and coffee at 320, 375, 768, 1024 and 1280 px, en and tr: phase titles readable,
      the gradient change looks right.
    - Keyboard-only rating with focus kept during submit.
    - VoiceOver over the read-only and community ratings (vote count colour changed).
    - **Add:** with DevTools offline, commit a rating: the stars return to the saved value, a toast
      appears, the page stays.
    - **Add:** add the recipe to a collection in the modal and close it: the "In collections" card
      updates.
  - Checks 10.36 and 17.22 are not affected by this track.

---

## Cross-track notes

1. **NEW: FollowButton labels are hard-coded English** (`FollowButton.tsx:82`, `'Following'` /
   `'Follow'`). Failing case: switch to tr and open `/u/<someone>`: the button reads "Follow". The
   i18n literal guard (`i18n-literals.test.ts`) checks only attributes, so it misses text nodes.
   Folded into R4.17 (`follow.follow`, plus the new `follow.followingState` because tr's
   `follow.following` is the noun "Takip Edilenler").

2. **NEW: Clear-all during the typing pause does not drop an uncommitted search when the URL had no
   `q`.** Failing case: on `/equipments`, type `kenya` and click "Clear filters" within 300 ms. The
   URL then becomes `?q=kenya`, because `useDebouncedUrlText`'s re-sync effect
   (`useListUrlState.ts:133-141`) fires only when its own param changes, and `''` → `''` is no
   change. That breaks the literal spec scenario "Clear-all resets the input" (which says "while
   the search box shows kenya", not "after it was committed").

   Suggested fix (about 10 lines, not in R4's tasks unless the assembler adds it):
   - `clearAll` navigates with `state: { listUrlCleared: true }`.
   - `useDebouncedUrlText` reads `useLocation()` and, on a new `location.key` whose
     `state?.listUrlCleared` is set, clears the timer and the input.
   - Test: type, click clear within 300 ms, advance 350 ms: the URL is `''` and the input is
     empty.

3. **NEW (ledger): app-wide `--text-tertiary` text is below 4.5:1** on cards in light (2.31:1) and
   dark (3.16:1). It sits outside the chart spec's scope, so finding 19 does not fix it. Failing
   cases:
   - `StatCards.tsx:32` labels.
   - `RecipeBrewStats.tsx:39,47` labels.
   - The `recipe.communityAvg` and rate captions in `RecipeDetailPage.tsx:335,350`.
   - The "BREW TIMELINE" header and the vote count are fixed by R4.11.

   Propose a new D99 entry (next free number): "Text in `--text-tertiary` fails WCAG AA on
   `--bg-secondary` in light and dark; raise the token or move text to `--text-secondary`".

4. **NEW (ledger): no cross-tab session sync.** Failing case: open a private collection in two
   tabs and log out in tab A. Tab B keeps rendering the collection until its next navigation.
   Propose a new D99 entry: a `storage`-event broadcast (like `useStaticCacheSync`) that calls
   `useSignOut` in other tabs.

5. **Stale `optimistic-rollback` spec text outside my MODIFIED blocks.** "Success path test coverage
   for button components" still describes actions that return `{ ok: true }` without state, and
   asserts that the button falls back to `initial*` after success. That matches the current tests,
   which use `{ ok: true }` mocks, so it is not contradictory. No change is proposed, but whoever
   assembles the `optimistic-rollback` delta should not "fix" it in a way that conflicts with R4.16.

6. **For the assembler.** R4.4 and R4.6 (the test and the implementation of the `UNAUTHORIZED` →
   `error.unauthorized` mapping in `useActionFeedback`) are shared by findings 8, 9 and 23. Keep
   them ahead of R4.9 and R4.17, as numbered, or merge the three findings into one group.
