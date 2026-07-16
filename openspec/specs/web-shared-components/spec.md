# web-shared-components Specification

## Purpose

This spec defines the single-source reusable building blocks for `apps/web`: shared presentational
components (e.g. `RecipeCard`, `BanDialog`, error pages) and companion hooks (e.g. `useBanUser`)
extracted from duplicated page-level implementations. It covers their props/API shape, i18n,
logging, and testing expectations.

## Requirements
### Requirement: HomePage renders the shared RecipeCard component

The `HomePage` component in `apps/web/src/pages/HomePage.tsx` SHALL render the shared `RecipeCard`
from `apps/web/src/components/recipe-list/` for both the "Latest Recipes" and "Popular Recipes"
sections. The local `RecipeCard` function (previously at lines 103–137) SHALL be deleted. The
`AUTHOR_BUTTON_STYLE` import (previously line 8) and the `useNavigate` import (if no other usage
remains) SHALL be removed.

The shared `RecipeCard` (`apps/web/src/components/recipe-list/RecipeCard.tsx:14`) has the **same
props signature** (`{ recipe: RecipeListItem }`) as the deleted local fork. Adopting it adds the
`currentVersion` badge row (brewMethod • drinkType • ★ rating) to the home page — a behavioural
improvement. The shared card guards the badge row with `recipe.currentVersion &&`, so recipes
without a current version render unchanged.

**Reason:** The local fork was a stale copy missing the `currentVersion` badge row — not an
intentional compact variant. Any card styling/behaviour change must be made in one place
(`components/recipe-list/RecipeCard.tsx`), not two. This is the D36 plan's Cluster 1.

#### Scenario: HomePage imports the shared RecipeCard

- **WHEN** the source of `apps/web/src/pages/HomePage.tsx` is inspected
- **THEN** it imports `RecipeCard` from `../components/recipe-list/` (or the barrel
  `../components/recipe-list/index.ts`) and contains NO local `function RecipeCard` definition

#### Scenario: HomePage renders the currentVersion badge row

- **WHEN** `HomePage` is rendered with loader data where recipes have `currentVersion` populated
  (with `brewMethod`, `drinkType`, `rating`)
- **THEN** each card renders the badge row (brew method • drink type • ★ rating) — the shared
  `RecipeCard` behaviour

#### Scenario: HomePage test passes unchanged

- **WHEN** `make test-web` is executed (or `deno task --cwd apps/web test src/pages/HomePage.test.tsx`)
- **THEN** the existing `HomePage.test.tsx` suite passes — assertions on author buttons, titles, and
  counts still hold because the shared `RecipeCard` has the same `<button>` + `<Link>` structure

### Requirement: BanDialog component is the single source for the ban-user modal

The file `apps/web/src/components/admin/BanDialog.tsx` SHALL exist and SHALL export a controlled
`BanDialog` component with the props:

```typescript
interface BanDialogProps {
  user: { id: string; username: string; displayName: string | null };
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  processing: boolean;
}
```

The component SHALL render a modal overlay with:
- A title displaying the target user's name (`displayName || username`).
- A reason `<textarea>` (required — the confirm button is disabled when the reason is empty or
  whitespace-only).
- A "Cancel" button that calls `onClose`.
- A "Confirm Ban" button that calls `onConfirm(reason)`. When `processing` is true, the button is
  disabled and displays "Banning..." instead of "Confirm Ban".

`BanDialog` SHALL reset its local reason state whenever the dialog closes or the selected user
changes.

All user-visible strings in `BanDialog` SHALL use `t()` from `useTranslation()` — coordination with
D40 (the ban dialog strings are translated once here, not in each admin page).

**Reason:** The ban dialog markup was duplicated in `AdminUsersPage.tsx` (lines 324–369) and
`AdminUserDetailPage.tsx` (lines 280–325) with identical structure but drifting error handling.
D36 extracts it to a single controlled component. This is the D36 plan's Cluster 2.

#### Scenario: BanDialog renders user name and reason field

- **WHEN** `BanDialog` is rendered with `{ user: { id, username: 'alice', displayName: 'Alice A' },
  open: true, ... }`
- **THEN** the title displays "Alice A" (the displayName) and the reason textarea is present and
  empty

#### Scenario: BanDialog requires a reason

- **WHEN** the reason textarea is empty or whitespace-only
- **THEN** the "Confirm Ban" button is disabled

#### Scenario: BanDialog confirm calls onConfirm with the reason

- **WHEN** the user types "Spam" in the reason field and clicks "Confirm Ban"
- **THEN** `onConfirm` is called with the string `"Spam"`

#### Scenario: BanDialog cancel calls onClose

- **WHEN** the user clicks "Cancel"
- **THEN** `onClose` is called

#### Scenario: BanDialog processing state disables buttons

- **WHEN** `processing` is true
- **THEN** the "Confirm Ban" button is disabled and displays "Banning..." (or the tr equivalent),
  and the "Cancel" button is disabled

### Requirement: useBanUser hook owns the ban/unban state machine and API calls

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

The hook SHALL:
- `openBanDialog(user)` — set `banDialogUser`, clear `error`, set `processing: false`.
- `confirmBan(reason)` — if no `banDialogUser` or empty reason, return early. Set `processing: true`, call
  `adminApi.banUser(banDialogUser.id, reason)`. On success: call `onSuccess(banDialogUser.id, true)`,
  close the dialog, clear `error`. On failure: set `error` to the error message (or a fallback),
  reset `processing: false`, keep the dialog open.
- `unban(userId)` — call `adminApi.unbanUser(userId)`. On success: call `onSuccess(userId, false)`,
  clear `error`. On failure: set `error`.
- `clearError()` — set `error: null`.
- `closeDialog()` — set `banDialogUser: null`, clear `error`, set `processing: false`.

The hook SHALL surface errors on BOTH call sites — it SHALL NOT silently swallow ban/unban failures.
This fixes the pre-existing bug where `AdminUserDetailPage` silently swallowed errors via
`catch {}`.

**Reason:** The ban/unban mutation logic was duplicated in `AdminUsersPage.tsx` (lines 72–94) and
`AdminUserDetailPage.tsx` (lines 49–67) with drifting error handling. The hook unifies the state
machine and API calls; the `onSuccess` callback lets each page apply the result to its own state
container (list array vs single object). This is the D36 plan's Cluster 2.

#### Scenario: useBanUser open → confirm → closed on success

- **WHEN** `openBanDialog(user)` is called, then `confirmBan('Spam')` is called
  and `adminApi.banUser` resolves
- **THEN** `onSuccess` is called with `(user.id, true)`, `banDialogUser` becomes null,
  `processing` is false, `error` is null

#### Scenario: useBanUser surfaces error on ban failure

- **WHEN** `confirmBan('Spam')` is called and `adminApi.banUser` rejects with an error
- **THEN** `error` is set to the error message, `processing` is reset to false, `banDialogUser`
  remains set (dialog stays open)

#### Scenario: useBanUser unban calls onSuccess with false

- **WHEN** `unban(userId)` is called and `adminApi.unbanUser` resolves
- **THEN** `onSuccess` is called with `(userId, false)`, `error` is null

#### Scenario: useBanUser unban surfaces error on failure

- **WHEN** `unban(userId)` is called and `adminApi.unbanUser` rejects
- **THEN** `error` is set to the error message

### Requirement: AdminUsersPage uses BanDialog and useBanUser with list-array refresh

The `AdminUsersPage` component in `apps/web/src/pages/admin/AdminUsersPage.tsx` SHALL replace its
inline ban dialog state (lines 27–33), handlers (lines 72–94), and markup (lines 324–369) with the
shared `BanDialog` component and `useBanUser` hook. The `onSuccess` callback SHALL patch the
`users` list array via `setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, isBanned } : u))`.

The existing error banner (lines 107–114) SHALL render `error` from `useBanUser` alongside any
page-level errors.

**Reason:** This is one of the two call sites for the shared BanDialog. The list-array refresh is
the intentional difference from the detail page (which patches a single object).

#### Scenario: AdminUsersPage imports BanDialog and useBanUser

- **WHEN** the source of `AdminUsersPage.tsx` is inspected
- **THEN** it imports `BanDialog` from `../../components/admin/BanDialog.tsx` and `useBanUser` from
  `../../hooks/useBanUser.ts`, and contains NO inline ban dialog state/handlers/markup

#### Scenario: AdminUsersPage ban success updates the list array

- **WHEN** a user is banned via the dialog
- **THEN** the `users` array is optimistically patched (`isBanned: true` for the banned user) — no
  server re-fetch

### Requirement: AdminUserDetailPage uses BanDialog and useBanUser with single-object refresh and error display

The `AdminUserDetailPage` component in `apps/web/src/pages/admin/AdminUserDetailPage.tsx` SHALL
replace its inline ban dialog state (lines 20–25), handlers (lines 49–67), and markup (lines
280–325) with the shared `BanDialog` component and `useBanUser` hook. The `onSuccess` callback
SHALL patch the single `user` object via `setUser((prev) => prev ? { ...prev, isBanned } : prev)`.

The page SHALL add an error-display element (e.g. a `<div>` near the ban/unban buttons) that
renders `error` from `useBanUser` when set. The page previously had NO error-display element for
ban actions — the root cause of the silent-swallow bug. Adding it is a bug fix folded into the
extraction.

**Reason:** This is the second call site. The single-object refresh is the intentional difference
from the list page. The error-display addition fixes the pre-existing silent-swallow bug.

#### Scenario: AdminUserDetailPage imports BanDialog and useBanUser

- **WHEN** the source of `AdminUserDetailPage.tsx` is inspected
- **THEN** it imports `BanDialog` and `useBanUser`, contains NO inline ban dialog
  state/handlers/markup, AND contains an error-display element that renders `error` when set

#### Scenario: AdminUserDetailPage ban success updates the user object

- **WHEN** the user is banned via the dialog
- **THEN** the `user` state object is optimistically patched (`isBanned: true`) — no server re-fetch

#### Scenario: AdminUserDetailPage surfaces ban errors

- **WHEN** a ban or unban fails
- **THEN** the error is displayed in the error-display element (NOT silently swallowed)

### Requirement: Section and Field form-layout primitives live in components/form/

The directory `apps/web/src/components/form/` SHALL exist and SHALL export `Section` and `Field`
components from `apps/web/src/components/form/index.ts`:

```typescript
// Section.tsx
export function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element;

// Field.tsx
export function Field(
  { label, required, children }: { label: string; required?: boolean; children: React.ReactNode },
): React.JSX.Element;
```

- `Section` renders a `<div className='card'>` containing an `<h2 className='font-semibold mb-4'>`
  with `style={{ color: 'var(--text-primary)' }}` showing `{title}`, followed by `{children}`.
- `Field` renders a `<div>` containing a `<label className='block text-sm font-medium mb-1'>` with
  `style={{ color: 'var(--text-secondary)' }}` showing `{label}` followed by `{required && ' *'}`,
  then `{children}`.

Both components accept already-translated strings as props (the caller passes `t()` results) — the
components themselves do NOT call `t()`. This is coordination with D40.

**Reason:** `Section`/`Field` were duplicated as local helpers in `RecipeCreatePage.tsx` (lines 535,
545) and — contrary to the original D36 plan's claim — also in `RecipeEditPage.tsx` as `EditSection`
(line 462) / `EditField` (line 471), byte-for-byte identical in body. Extracting to
`components/form/` makes them reusable and translatable via props. This is the D36 plan's Cluster 3.

#### Scenario: components/form/ exports Section and Field

- **WHEN** `apps/web/src/components/form/index.ts` is inspected
- **THEN** it re-exports `Section` from `./Section.tsx` and `Field` from `./Field.tsx`

#### Scenario: Section renders a card with title

- **WHEN** `<Section title='Basic Info'>...</Section>` is rendered
- **THEN** the output contains a `<div className='card'>` with an `<h2>` showing "Basic Info"
  followed by the children

#### Scenario: Field renders a label with required indicator

- **WHEN** `<Field label='Title' required>...</Field>` is rendered
- **THEN** the output contains a `<label>` showing "Title *" (with the required indicator) followed
  by the children

### Requirement: RecipeCreatePage and RecipeEditPage import Section and Field from components/form/

`apps/web/src/pages/recipes/RecipeCreatePage.tsx` SHALL delete its local `Section` (line 535) and
`Field` (line 545) definitions and import them from `../components/form/`.

`apps/web/src/pages/recipes/RecipeEditPage.tsx` SHALL delete its local `EditSection` (line 462) and
`EditField` (line 471) definitions, import `Section` and `Field` from `../components/form/`, and
rename all call sites from `EditSection`→`Section` and `EditField`→`Field` (approximately 27 call
sites across lines 206–440).

**Reason:** Both pages had byte-for-byte identical copies of the same form-layout primitives
(RecipeEditPage's were named `EditSection`/`EditField` but rendered identical JSX). This is the D36
plan's Cluster 3 — the plan incorrectly claimed RecipeEditPage had no copies; the research confirmed
it does.

#### Scenario: RecipeCreatePage imports shared Section and Field

- **WHEN** the source of `RecipeCreatePage.tsx` is inspected
- **THEN** it imports `Section` and `Field` from `../components/form/` and contains NO local
  `function Section` or `function Field` definition

#### Scenario: RecipeEditPage imports shared Section and Field

- **WHEN** the source of `RecipeEditPage.tsx` is inspected
- **THEN** it imports `Section` and `Field` from `../components/form/`, contains NO local
  `function EditSection` or `function EditField` definition, and all form-layout JSX uses
  `<Section>` and `<Field>` (not `<EditSection>`/`<EditField>`)

### Requirement: AdminRecipesPage table is NOT extracted (stretch rejected)

The `AdminRecipesPage` component MUST NOT be forced into the shared `RecipeCard`.
(`apps/web/src/pages/admin/AdminRecipesPage.tsx`) uses a `<table>` (lines 67–131) with
admin-specific affordances (inline visibility `<select>`, delete button, plain text title — no
`<Link>`, no `<button>` for author). This is structurally a table row, NOT a card. The shared
`RecipeCard` is a `<Link>` wrapper with author buttons and `currentVersion` badges.

Forcing it would require a `variant='admin'` prop with `onVisibilityChange`, `onDelete`, and
table-row rendering — bloat that violates the shared card's "thin leaf component" intent.

**Reason:** The D36 plan flagged this as an optional stretch ("extraction may not pay off; evaluate,
don't force"). The research confirms it doesn't pay off — the admin list is a table, not cards.

#### Scenario: AdminRecipesPage continues to use a table

- **WHEN** the source of `AdminRecipesPage.tsx` is inspected
- **THEN** it renders a `<table>` with `<tr>` rows (not `<RecipeCard>` components) — unchanged from
  the pre-D36 state

### Requirement: New shared components have Vitest test coverage

The following test files SHALL exist:

- `apps/web/src/components/admin/BanDialog.test.tsx` — covers: renders user name (displayName ||
  username); reason textarea is present and empty; confirm button disabled when reason is empty;
  typing a reason + clicking confirm calls `onConfirm` with the reason; clicking cancel calls
  `onClose`; `processing: true` disables buttons and shows "Banning..." (or tr equivalent).
- `apps/web/src/hooks/useBanUser.test.ts` — covers: `openBanDialog(user)` sets `banDialogUser` and
  clears state; `confirmBan()` success path (mock `adminApi.banUser` resolves → `onSuccess` called
  with `(userId, true)`, dialog closes, `processing: false`, `error: null`);
  `confirmBan()` failure path (mock rejects → `error` set, `processing: false`, dialog stays open);
  `unban(userId)` success → `onSuccess(userId, false)`; `unban(userId)` failure → `error` set;
  `clearError()` clears `error`.

Tests SHALL follow the existing Vitest convention: imports from `vitest`, `@testing-library/react`
(`render`, `screen`, `waitFor`), `@testing-library/user-event` (`userEvent`). Logger mock via
`vi.hoisted` + `vi.mock('@/utils/logger.ts', () => ({ createLogger: () => mockLogger }))`. Mock
`adminApi` via `vi.mock('../../api/index.ts', ...)` with stubbed `banUser`/`unbanUser`. Hook tests
use `renderHook` from `@testing-library/react` (or a test harness component).

**Reason:** D36's acceptance criterion: "New shared components have tests." The `BanDialog` and
`useBanUser` are the new shared pieces; the `Section`/`Field` primitives are presentational and
exercised through the existing `RecipeCreatePage.test.tsx` / `RecipeEditPage` tests (which mock the
surrounding context but render the real `Section`/`Field` via the page under test).

#### Scenario: BanDialog test passes

- **WHEN** `make test-web` is executed (or `deno task --cwd apps/web test src/components/admin/BanDialog.test.tsx`)
- **THEN** the `BanDialog.test.tsx` suite passes, covering name render, reason requirement, confirm
  callback, cancel callback, and processing state

#### Scenario: useBanUser test passes

- **WHEN** `make test-web` is executed
- **THEN** the `useBanUser.test.ts` suite passes, covering open, confirm success/failure, unban
  success/failure, and clearError

### Requirement: New shared components follow project logging conventions

`BanDialog.tsx` and `useBanUser.ts` SHALL create a module-scoped logger via
`createLogger('<Name>')` (from `@/utils/logger.ts`) and emit `log.debug` on key lifecycle events:
- `BanDialog`: `log.debug({}, 'BanDialog rendered')` is optional (presentational component —
  logging is low-value here; if added, follow the `web-page-logging` pattern).
- `useBanUser`: `log.debug({ userId }, 'useBanUser confirmBan started')` on `confirmBan` entry,
  `log.debug({ userId }, 'useBanUser confirmBan completed')` on success,
  `log.error({ err, userId }, 'useBanUser confirmBan failed')` on failure, same for `unban`.

`Section.tsx` and `Field.tsx` are pure presentational primitives and do NOT require loggers (no
state, no async, no lifecycle).

**Reason:** AGENTS.md mandates structured logging for new features/codepaths. The `useBanUser` hook
owns async mutation logic and MUST log entry/exit/error. `BanDialog` is presentational (no async);
logging is optional. `Section`/`Field` are pure layout — no logging needed.

#### Scenario: useBanUser logs confirmBan lifecycle

- **WHEN** `confirmBan()` is called and succeeds
- **THEN** the logger emits `debug` on start and completion (with `userId`)

#### Scenario: useBanUser logs confirmBan failure

- **WHEN** `confirmBan()` is called and `adminApi.banUser` rejects
- **THEN** the logger emits `error` with `{ err, userId }` and message 'useBanUser confirmBan failed'

