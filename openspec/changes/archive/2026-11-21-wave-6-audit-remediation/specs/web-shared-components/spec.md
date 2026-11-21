## ADDED Requirements

### Requirement: Every route renders under the app-wide providers
The application root SHALL render a single `AppProviders` component (`ThemeProvider` → `I18nProvider` → `ToastProvider` → `ConfirmProvider` → `AuthProvider`) around `RouterProvider`, and a router smoke test SHALL render every declared route through `createMemoryRouter` with that real `AppProviders` stack and no per-test provider wrappers, failing if any route renders an error boundary.

This fixes the user's top-10 item 6 (`audit/t5-web-state.md` §1 V1-V6 and §2). Today `/admin` is a
sibling of `/` (`apps/web/src/router.tsx:69-73` vs `:351-363`), `ToastProvider`/`ConfirmProvider`
are mounted only in `components/layout/Layout.tsx:23-24`, and `useToast()` throws outside its
provider (`components/ui/Toast.tsx:99-102`). Five admin pages call `useToast()` during render and
replace the whole admin screen with "Oops! useToast must be used within ToastProvider":
`/admin/recipes` (`AdminRecipesPage.tsx:26`), `/admin/vendors` (`AdminVendorsPage.tsx:18`),
`/admin/users/:id` (`AdminUserDetailPage.tsx:25`), `/admin/compatibility`
(`AdminCompatibilityPage.tsx:21`) and `/admin/coffee-varieties` (`AdminCoffeeVarietiesPage.tsx:124`).
Two more, `/admin/equipment` and `/admin/taste-notes`, fall back to a native `confirm()` showing a raw
i18n key (`components/ui/Modal.tsx:161-167`).

`apps/web/src/router.tsx` SHALL export the route tree as `routes` and a `createAppRouter()` factory
(so importing the module does not start a browser router); `App.tsx` SHALL create the browser
router once from it. The smoke test (`apps/web/src/router.smoke.test.tsx`) SHALL derive the list of
paths from `routes` by walking every nested route object, SHALL render every route that has an
`element`, `Component` or `lazy` component (action-only routes such as `recipes/:id/like` and
resource routes under `resources/` are skipped because they render nothing), SHALL substitute
fixture values for `:params`, SHALL stub the network layer with empty success envelopes, SHALL
render public routes signed-out and guarded and admin routes as a signed-in admin, and SHALL assert
that no `RootErrorBoundary` content (for example `error.boundary.oops`) is rendered. A route whose
loader turns the empty stub into a 404 MAY render the not-found page; that is not a failure. The
test SHALL also assert that its derived path list contains every one of the 14 admin routes that
exist today: `/admin`, `/admin/users`, `/admin/users/new`, `/admin/users/:id`,
`/admin/users/:id/edit`, `/admin/recipes`, `/admin/equipment`, `/admin/vendors`,
`/admin/taste-notes`, `/admin/coffee-varieties`, `/admin/compatibility`, `/admin/badges`,
`/admin/audit-log` and `/admin/cache` (a lower bound, so a broken route walk cannot silently skip
the admin tree; new routes are added automatically). Admin page tests SHALL use the shared test
utility (`apps/web/src/test-utils/render.tsx`, `renderWithAppProviders`) instead of wrapping
themselves in `ToastProvider`/`ConfirmProvider`, and no non-test module other than
`AppProviders.tsx` SHALL render `ToastProvider` or `ConfirmProvider`.

#### Scenario: The five crashing admin pages render under the real providers
- **WHEN** the smoke test renders `/admin/recipes`, `/admin/vendors`, `/admin/users/<id>`, `/admin/compatibility` and `/admin/coffee-varieties` as an admin
- **THEN** each renders its page heading inside `AdminLayout` (sidebar visible) and no error boundary

#### Scenario: Every admin route renders
- **WHEN** the smoke test runs
- **THEN** it renders all 14 admin routes listed above as a signed-in admin and none renders `error.boundary.oops`

#### Scenario: Every public and guarded route renders
- **WHEN** the smoke test runs
- **THEN** every element route under `/` (for example `/`, `/recipes`, `/recipes/<slug>`, `/settings`, `/collections/<id>/edit`, `/u/<username>`, `/taste-notes`, `/contact`) renders without `error.boundary.oops`

#### Scenario: Removing a provider breaks CI
- **WHEN** `ToastProvider` is removed from `AppProviders.tsx`
- **THEN** the router smoke test fails for every route whose page calls `useToast()`

#### Scenario: New routes are covered automatically
- **WHEN** a contributor adds a route to `routes` without adding a test
- **THEN** the smoke test renders it because the path list is derived from the route tree

## MODIFIED Requirements

### Requirement: Toast primitives provide app-wide mutation feedback

The app SHALL have a house-built, dependency-free toast system: a `ToastProvider` (React context +
reducer holding a small toast queue) rendered once at the application root by the shared
`AppProviders` component (`apps/web/src/AppProviders.tsx`, inside `I18nProvider` and above
`RouterProvider`, so the `/` and `/admin` route trees are both covered), and a `useToast()` hook
returning `toast.success(i18nKey)` / `toast.error(i18nKey)`. The API accepts **i18n keys, not
prebuilt strings** — the toast component resolves them via `useTranslation()`, so toasts are
translated by construction. Toasts SHALL auto-dismiss after a timeout, carry `role="status"` and
`aria-live="polite"`, and be styled exclusively with the existing CSS theme variables so all three
themes (light/dark/coffee) render correctly. No toast library (sonner, react-hot-toast, notistack)
SHALL be added.

`useToast` is the feedback channel for mutations that are currently silent: T6's 14 empty-catch
fixes use `toast.error(...)` for user-facing failures, and currently-silent successful mutations
(e.g. list deletes) gain `toast.success(...)`. The primitive SHALL ship with a Vitest suite (render,
auto-dismiss, queueing, key resolution). `Layout.tsx` SHALL NOT mount `ToastProvider`, and
`useToast()` SHALL keep throwing when no provider is mounted so a missing provider fails tests
loudly.

**Reason:** Zero toast infrastructure exists (rg for toast|snackbar → 0 hits); mutation feedback
ranges from silent navigation to full-page checkmark screens, and the T6 empty-catch fixes need a
way to surface failure that today does not exist (design.md Decision 2).

#### Scenario: Toast renders and auto-dismisses

- **WHEN** a component calls `toast.success('collection.created')`
- **THEN** a toast renders the translated string with `role="status"`/`aria-live="polite"` and is
  removed from the DOM after the dismiss timeout

#### Scenario: Toasts are themed

- **WHEN** the toast renders under the dark or coffee theme
- **THEN** its colors come from the CSS theme variables (no hardcoded hex, no hardcoded `white`
  text)

#### Scenario: No toast dependency added

- **WHEN** `apps/web/package.json` is inspected after the change
- **THEN** no toast/snackbar library has been added

#### Scenario: Admin pages can raise toasts

- **WHEN** an admin opens `/admin/recipes`, `/admin/vendors`, `/admin/users/:id`,
  `/admin/compatibility` or `/admin/coffee-varieties`
- **THEN** the page renders without throwing `useToast must be used within ToastProvider`
- **AND** a failed admin mutation shows a translated error toast

#### Scenario: Provider is mounted exactly once

- **WHEN** `grep -rn "<ToastProvider" apps/web/src --include=*.tsx` is run excluding test files
- **THEN** the only hit is `apps/web/src/AppProviders.tsx`

### Requirement: ConfirmDialog replaces native confirms and bespoke modal shells

A shared modal shell (`components/ui/Modal.tsx`) and a promise-based confirm primitive SHALL exist:
`useConfirm()` returns a function used as
`if (await confirm({ titleKey, bodyKey, danger: true })) { … }`, with a single dialog component
mounted by the provider alongside the toasts in the shared `AppProviders` component at the
application root (not in `Layout.tsx`), styled with `.card` / `.btn-danger`,
with focus trap and Escape-to-cancel handling. Like toasts, it takes **i18n keys** — eliminating the
`t(key) + '?'` concatenation anti-pattern.

All 9 `globalThis.confirm` sites SHALL migrate to `useConfirm()`: `EquipmentListPage.tsx:71`,
`SetupListPage.tsx:58`, `BeanListPage.tsx:61`, `SettingsPage.tsx:112`, `AdminRecipesPage.tsx:51`,
`AdminUserDetailPage.tsx:61`, `AdminVendorsPage.tsx:61`, `AdminTasteNotesPage.tsx:64`,
`AdminEquipmentPage.tsx:78`. The 3 hand-rolled overlay shells SHALL be consolidated:
`AdminCoffeeVarietiesPage.tsx:603-634` (inline delete-confirm modal) is replaced by `useConfirm()`;
`BanDialog.tsx:46-50` and `AddToCollectionModal.tsx:128-135` (which collect input, not just
confirmation) rebase their overlay markup on the shared `Modal` shell while keeping their own
content and existing props contracts (the BanDialog requirements in this spec remain satisfied). The
primitives SHALL ship with Vitest suites (confirm resolves true/false, Escape cancels, danger
styling). `useConfirm()` SHALL throw `useConfirm must be used within ConfirmProvider` when no
provider is mounted; the former `window.confirm(opts.bodyKey)` fallback, which displayed raw i18n
keys, SHALL be removed and tests SHALL render through the shared provider test utility instead.

**Reason:** Delete confirmation currently splits three ways (native `confirm()` — unthemeable,
main-thread-blocking, and the source of the `t(key)+'?'` concatenation — plus two bespoke modal
styles) for identical destructive actions. One promise-hook primitive fixes UX consistency, theming,
and i18n at once (design.md Decision 2).

#### Scenario: Zero native confirms remain

- **WHEN** `grep -rn "globalThis.confirm" apps/web/src` is run
- **THEN** zero hits are returned

#### Scenario: Confirm flow resolves the promise

- **WHEN** a delete button triggers `await confirm({ titleKey, bodyKey, danger: true })` and the
  user clicks the confirm button
- **THEN** the promise resolves `true` and the dialog closes; clicking cancel or pressing Escape
  resolves `false` and no mutation runs

#### Scenario: One overlay shell

- **WHEN** `grep -rn "fixed inset-0" apps/web/src` is run
- **THEN** overlay-shell markup exists only in `components/ui/Modal.tsx` — `BanDialog`,
  `AddToCollectionModal`, and the confirm dialog all compose it

#### Scenario: Admin delete confirmation is translated

- **WHEN** an admin clicks Delete on `/admin/equipment` or `/admin/taste-notes`
- **THEN** the themed confirm dialog shows the translated title and body
- **AND** no native `window.confirm` dialog showing a raw key such as `admin.equipment.deleteConfirm`
  appears

#### Scenario: Missing provider fails loudly

- **WHEN** a component calls `useConfirm()` with no `ConfirmProvider` above it
- **THEN** the hook throws `useConfirm must be used within ConfirmProvider`

### Requirement: HomePage renders the shared RecipeCard component

The `HomePage` component in `apps/web/src/pages/HomePage.tsx` SHALL render the shared `RecipeCard`
from `apps/web/src/components/recipe-list/` for both the "Latest Recipes" and "Popular Recipes"
sections. The local `RecipeCard` function (previously at lines 103–137) SHALL be deleted. The
`AUTHOR_BUTTON_STYLE` import (previously line 8) and the `useNavigate` import (if no other usage
remains) SHALL be removed.

The shared `RecipeCard` (`apps/web/src/components/recipe-list/RecipeCard.tsx`) accepts the list
item shape the deleted local fork accepted (`{ recipe }`), plus optional `hideAuthor` and
`version` props. It renders the brew-method • drink-type • ★ rating strip only when a `version`
prop is passed explicitly. `GET /api/v1/recipes` list items carry no version payload (the
`advanced-search` requirement "List items carry no version payload"), so the home page passes no
`version` and its cards render title, author and counts without the strip.

**Reason:** The local fork duplicated the shared card. Any card styling/behaviour change must be
made in one place (`components/recipe-list/RecipeCard.tsx`), not two. This is the D36 plan's
Cluster 1.

#### Scenario: HomePage imports the shared RecipeCard

- **WHEN** the source of `apps/web/src/pages/HomePage.tsx` is inspected
- **THEN** it imports `RecipeCard` from `../components/recipe-list/` (or the barrel
  `../components/recipe-list/index.ts`) and contains NO local `function RecipeCard` definition

#### Scenario: HomePage cards render without a version strip

- **WHEN** `HomePage` is rendered with loader data from `GET /api/v1/recipes` (list items without
  versions)
- **THEN** each card renders the title, author and counts through the shared `RecipeCard`, and no
  brew-method • drink-type • ★ rating strip is rendered

#### Scenario: HomePage test passes unchanged

- **WHEN** `make test-web` is executed (or `make test-specific filter=apps/web/src/pages/HomePage.test.tsx`)
- **THEN** the existing `HomePage.test.tsx` suite passes — assertions on author buttons, titles, and
  counts still hold because the shared `RecipeCard` has the same `<button>` + `<Link>` structure

### Requirement: New shared components have Vitest test coverage

The following test files SHALL exist:

- `apps/web/src/components/admin/BanDialog.test.tsx` — covers: renders user name (displayName ||
  username); reason textarea is present and empty; confirm button disabled when reason is empty;
  typing a reason + clicking confirm calls `onConfirm` with the reason; clicking cancel calls
  `onClose`; `processing: true` disables buttons and shows "Banning..." (or tr equivalent).
- `apps/web/src/hooks/useBanUser.test.ts` — covers: `openBanDialog(user)` sets `banDialogUser` and
  clears state; `confirmBan()` success path (the admin user route action returns `{ ok: true }` →
  `onSuccess` called with `(userId, true)`, dialog closes, `processing: false`, `error: null`);
  `confirmBan()` failure path (the action returns `{ ok: false, error }` → `error` set,
  `processing: false`, dialog stays open); `unban(userId)` success → `onSuccess(userId, false)`;
  `unban(userId)` failure → `error` set; `clearError()` clears `error`; each submission is sent with
  `defaultShouldRevalidate: false`.
- `apps/web/src/pages/admin/AdminUserDetailPage.data.test.ts` (the admin user route action) —
  covers: intent `ban` calls `adminApi.banUser(id, reason, { signal })` and returns `{ ok: true }`;
  intent `unban` calls `adminApi.unbanUser`; a rejected call returns `{ ok: false, error }`.

Tests SHALL follow the existing Vitest convention: imports from `vitest`, `@testing-library/react`
(`render`, `screen`, `waitFor`), `@testing-library/user-event` (`userEvent`). Logger mock via
`vi.hoisted` + `vi.mock('@/utils/logger.ts', () => ({ createLogger: () => mockLogger }))`. Hook
tests render the hook inside a `createMemoryRouter` route whose `action` is a `vi.fn()` returning the
result under test (through `renderWithAppProviders`); only the action test mocks `adminApi` via
`vi.mock('../../api/index.ts', ...)`.

**Reason:** D36's acceptance criterion: "New shared components have tests." The `BanDialog` and
`useBanUser` are the new shared pieces; the `Section`/`Field` primitives are presentational and
exercised through the existing `RecipeCreatePage.test.tsx` / `RecipeEditPage` tests (which mock the
surrounding context but render the real `Section`/`Field` via the page under test).

#### Scenario: BanDialog test passes

- **WHEN** `make test-web` is executed (or `make test-specific filter=apps/web/src/components/admin/BanDialog.test.tsx`)
- **THEN** the `BanDialog.test.tsx` suite passes, covering name render, reason requirement, confirm
  callback, cancel callback, and processing state

#### Scenario: useBanUser test passes

- **WHEN** `make test-web` is executed
- **THEN** the `useBanUser.test.ts` suite passes, covering open, confirm success/failure, unban
  success/failure, and clearError

### Requirement: useBanUser hook owns the ban/unban state machine and submits through the admin user route action

The file `apps/web/src/hooks/useBanUser.ts` SHALL exist and SHALL export a `useBanUser` hook that
takes an `onSuccess(userId: string, isBanned: boolean) => void` callback and returns:

```typescript
interface UseBanUserReturn {
  banDialogUser: { id: string; username: string; displayName: string | null } | null;
  processing: boolean;
  error: string | null;
  openBanDialog: (user: { id: string; username: string; displayName: string | null }) => void;
  confirmBan: (reason: string) => Promise<void>;
  unban: (userId: string) => Promise<void>;
  clearError: () => void;
  closeDialog: () => void;
}
```

The hook SHALL NOT import the API client (`api/client.ts`, `api/index.ts`); it SHALL send ban and
unban requests with `useFetcher().submit()` to the `/admin/users/:id` route action
(`apps/web/src/pages/admin/AdminUserDetailPage.data.ts`), using
`{ method: 'post', action: '/admin/users/<id>', defaultShouldRevalidate: false }` and the form
fields `intent` (`ban` | `unban`) and `reason`. That action calls `adminApi.banUser` /
`adminApi.unbanUser` with `request.signal` and returns `{ ok: true }` or `{ ok: false, error }`
(the web-data-loading action contract). `defaultShouldRevalidate: false` keeps the "patch local
state, no server re-fetch" behaviour of `AdminUsersPage` and `AdminUserDetailPage`. The hook SHALL:
- `openBanDialog(user)` — set `banDialogUser`, clear `error`, set `processing: false`.
- `confirmBan(reason)` — if no `banDialogUser` or empty reason, return early. Set `processing: true`
  and submit intent `ban`. When the action returns `{ ok: true }`: call
  `onSuccess(banDialogUser.id, true)`, close the dialog, clear `error`. When it returns
  `{ ok: false, error }`: set `error` to the error message (or a fallback), reset
  `processing: false`, keep the dialog open.
- `unban(userId)` — submit intent `unban` for `userId`. On `{ ok: true }`: call
  `onSuccess(userId, false)`, clear `error`. On `{ ok: false }`: set `error`.
- `clearError()` — set `error: null`.
- `closeDialog()` — set `banDialogUser: null`, clear `error`, set `processing: false`.

The hook SHALL surface errors on BOTH call sites — it SHALL NOT silently swallow ban/unban failures.
This keeps the fix for the pre-existing bug where `AdminUserDetailPage` silently swallowed errors
via `catch {}`.

**Reason:** The ban/unban mutation logic was duplicated in `AdminUsersPage.tsx` and
`AdminUserDetailPage.tsx` with drifting error handling. The hook unifies the state machine; the
`onSuccess` callback lets each page apply the result to its own state container (list array vs
single object). Wave 6 moves the request itself into a route action so the web app has one
data-loading paradigm (`web-data-loading`).

#### Scenario: useBanUser open → confirm → closed on success

- **WHEN** `openBanDialog(user)` is called, then `confirmBan('Spam')` is called
  and the `/admin/users/:id` action returns `{ ok: true }`
- **THEN** `onSuccess` is called with `(user.id, true)`, `banDialogUser` becomes null,
  `processing` is false, `error` is null

#### Scenario: useBanUser surfaces error on ban failure

- **WHEN** `confirmBan('Spam')` is called and the action returns `{ ok: false, error }`
- **THEN** `error` is set to the error message, `processing` is reset to false, `banDialogUser`
  remains set (dialog stays open)

#### Scenario: useBanUser unban calls onSuccess with false

- **WHEN** `unban(userId)` is called and the action returns `{ ok: true }`
- **THEN** `onSuccess` is called with `(userId, false)`, `error` is null

#### Scenario: useBanUser unban surfaces error on failure

- **WHEN** `unban(userId)` is called and the action returns `{ ok: false, error }`
- **THEN** `error` is set to the error message

#### Scenario: The hook does not call the API client

- **WHEN** `apps/web/src/hooks/useBanUser.ts` is scanned by `apps/web/src/data-loading.enforcement.test.ts`
- **THEN** it has no value import from `api/client.ts` or `api/index.ts`, and a ban sends no request other than the route action submission (no loader revalidation)

### Requirement: New shared components follow project logging conventions

`BanDialog.tsx` and `useBanUser.ts` SHALL create a module-scoped logger via
`createLogger('<Name>')` (from `@/utils/logger.ts`) and emit `log.debug` on key lifecycle events:
- `BanDialog`: presentational, no logging required; if a log is added it follows the
  `web-page-logging` pattern.
- `useBanUser`: `log.debug({ userId }, 'useBanUser confirmBan started')` on `confirmBan` entry,
  `log.debug({ userId }, 'useBanUser confirmBan completed')` when the action returns `{ ok: true }`,
  `log.error({ err, userId }, 'useBanUser confirmBan failed')` when it returns `{ ok: false, error }`
  (with `err` set to the returned error), same for `unban`.
- The `/admin/users/:id` route action logs entry, exit and failure per the web-data-loading action
  rules (`log.error({ err, userId })`, no reason text).

`Section.tsx` and `Field.tsx` are pure presentational primitives and do NOT require loggers (no
state, no async, no lifecycle).

**Reason:** AGENTS.md mandates structured logging for new features/codepaths. The `useBanUser` hook
owns async mutation state and MUST log entry/exit/error. `BanDialog` is presentational (no async).
`Section`/`Field` are pure layout — no logging needed.

#### Scenario: useBanUser logs confirmBan lifecycle

- **WHEN** `confirmBan()` is called and succeeds
- **THEN** the logger emits `debug` on start and completion (with `userId`)

#### Scenario: useBanUser logs confirmBan failure

- **WHEN** `confirmBan()` is called and the route action returns `{ ok: false, error }`
- **THEN** the logger emits `error` with `{ err, userId }` and message 'useBanUser confirmBan failed'

## RENAMED Requirements

- FROM: `### Requirement: useBanUser hook owns the ban/unban state machine and API calls`
- TO: `### Requirement: useBanUser hook owns the ban/unban state machine and submits through the admin user route action`
