# Wave 3 — Frontend Structure (D36 + D37 + D40)

## Why

Wave 3 of the debt roadmap bundles three frontend-structure items that the `ROADMAP.md` explicitly
sequences together because **the order matters**: D36 dedupes UI before D40 translates it (so each
string is touched once), and D37 settles which error pages exist before D40 localizes them. Bundling
them into one change keeps the sequencing coherent, lets the i18n work (D40) land its key sets
correctly the first time, and produces a single spec archive that documents the frontend structural
shift as one unit.

- **D36 — Extract duplicated UI.** Three UI clusters are duplicated across pages, each already
  drifting or at risk of drifting: (1) `HomePage.tsx` re-implements `RecipeCard` (lines 103–137) as
  a stale fork of the canonical `components/recipe-list/RecipeCard.tsx` (missing the
  `currentVersion` badge row — a behavioural regression, not an intentional compact variant); (2)
  ban dialog + ban mutation duplicated across `AdminUsersPage.tsx` and `AdminUserDetailPage.tsx`
  with identical state machines but **drifting error handling** (the detail page silently swallows
  ban/unban errors via `catch {}` while the list page surfaces them); (3) `Section`/`Field` form
  helpers stranded as local copies in `RecipeCreatePage.tsx` (`:535`,`:545`) and — contrary to the
  D36 plan's claim — **also duplicated in `RecipeEditPage.tsx`** as `EditSection` (`:462`) /
  `EditField` (`:471`), byte-for-byte identical in body. Deduping before D40 means each string lives
  in one component and is translated once.

- **D37 — Consolidate error pages.** Two files export overlapping error-page components.
  `ErrorPage.tsx` exports `ErrorPage`/`NotFoundPage`/`ServerErrorPage`/`ForbiddenPage` — all already
  i18n'd with `t('error.404')`/`t('error.500')`/`t('error.403')`/`t('common.goHome')` — but **no
  production code imports it** (only `ErrorPage.test.tsx` does). `NotFoundPage.tsx` exports its own
  `NotFoundPage` — zero `t()`, has `<SEOHead noIndex>`, different visual style — and is the one the
  router actually uses (`router.tsx:7,238`). Meanwhile `ErrorBoundary.tsx` (wired as `errorElement`
  at 8 route sites) already branches on `error.status === 404` with a **third copy of the 404 prose
  string**, but never renders `ServerErrorPage` or `ForbiddenPage`. Consolidating to a single module
  and wiring `ServerErrorPage` into the boundary kills three copies of the 404 string, makes the
  polished 500 page reachable, and means D40's `NotFoundPage` conversion is a no-op (the canonical
  module already uses `t()`).

- **D40 — Complete i18n coverage.** 20 pages render hardcoded English despite `t()` being
  available: all 15 admin pages (zero `t()` calls each), plus `RecipeComparePage`,
  `VerifyEmailPage`, `PrivacyPage`, `TermsPage`, and `NotFoundPage` (zero `t()` each). Two more
  pages — `RecipeCreatePage` and `RecipeEditPage` — are partially converted (2 `t()` calls each, for
  the TDS field only; ~30 remaining hardcoded strings each). The i18n infrastructure
  (`I18nContext`, `useTranslation`, en/tr locale files with 504 keys each at exact parity) is in
  place and used across the main product surface — this change finishes the tail. Key finding: the
  `admin.*` namespace (24 keys) and `common.*` vocabulary (Save/Cancel/Delete/Edit/Search/Loading/
  etc.) **already exist** in both locales but are **completely unused** by any admin page — D40 wires
  existing keys and adds the missing per-page CRUD keys.

| Concern | Current state | Wave 3 fix |
|---|---|---|
| HomePage `RecipeCard` | Local fork (lines 103–137), missing `currentVersion` badge row | Delete local; import shared `RecipeCard` from `components/recipe-list/` — behavioural improvement, no variant prop needed |
| Ban dialog + mutation | Duplicated in AdminUsersPage + AdminUserDetailPage; detail page silently swallows errors | Extract `BanDialog` + `useBanUser` to `components/admin/` + `hooks/`; surface errors on both call sites |
| `Section`/`Field` helpers | Local copies in RecipeCreatePage (`Section`/`Field`) AND RecipeEditPage (`EditSection`/`EditField`) — 4 identical bodies | Extract to `components/form/`; both pages import from there |
| Error page module | `ErrorPage.tsx` (i18n'd, dead) vs `NotFoundPage.tsx` (zero `t()`, routed, has SEO) — plus 3rd 404 prose copy in `ErrorBoundary` | Merge into `ErrorPage.tsx` as canonical; port `<SEOHead noIndex>`; delete `NotFoundPage.tsx`; wire `ServerErrorPage` into `ErrorBoundary` for 5xx |
| `ForbiddenPage` | Dead export, no trigger (`RequireAuth` redirects, doesn't throw 403) | Delete (no clean trigger without changing `RequireAuth` UX — out of scope) |
| 15 admin pages i18n | Zero `t()` calls; `admin.*` namespace (24 keys) exists but unused | Wire existing nav keys; add per-page CRUD keys; reuse `common.*` vocabulary |
| 5 user-facing pages i18n | Zero `t()` calls | Full conversion (legal pages: translate headers + keep legal body in English with translated notice — see design Decision 7) |
| 2 partial recipe pages | 2 `t()` calls each (TDS field only); ~30 hardcoded strings each | Complete conversion; normalize divergent labels (`Dose (grams)` vs `Dose (g)`) |
| Locale parity test | Exists (`i18n.test.ts`) but one-directional (en→tr) and sampled (100 random keys of 504) | Replace with deterministic bidirectional `expect(Object.keys(en)).toEqual(Object.keys(tr))` |

## What Changes

**D36 — Extract duplicated UI (land first):**

- `apps/web/src/pages/HomePage.tsx` — delete the local `RecipeCard` function (lines 103–137); import
  `RecipeCard` from `../components/recipe-list/`. Remove the now-unused `AUTHOR_BUTTON_STYLE` import
  (line 8) and `useNavigate` from the react-router import (line 2, if no other usage). Adopting the
  shared card adds the `currentVersion` badge row to the home page — a behavioural improvement, not
  a regression (the shared card guards it with `recipe.currentVersion &&`). The existing
  `HomePage.test.tsx` assertions (author buttons, titles, counts) still pass because the shared card
  has the same `<button>` + `<Link>` structure; mock data without `currentVersion` renders nothing
  extra via the guard.

- `apps/web/src/components/admin/BanDialog.tsx` — **new**. Controlled dialog taking
  `{ user, open, onClose, onConfirm(reason), processing }`. Renders the ban modal markup (overlay,
  title with user name, reason textarea, Cancel + Confirm Ban buttons). Uses `t()` for all strings
  (coordination with D40 — the ban dialog strings are translated once here).

- `apps/web/src/hooks/useBanUser.ts` — **new**. Owns the `{ user, reason, processing, error }`
  state, calls `adminApi.banUser`/`adminApi.unbanUser`, exposes `openBanDialog(user)`,
  `confirmBan()`, `unban(userId)`, `clearError()`. The hook's `onSuccess(userId, isBanned)`
  callback lets each page apply the result to its own state container (list array vs single object)
  — preserving the two intentional refresh-flow differences. The hook surfaces errors on BOTH call
  sites (fixing the detail page's silent-swallow bug).

- `apps/web/src/pages/admin/AdminUsersPage.tsx` — replace inline ban dialog state (lines 27–33),
  handlers (lines 72–94), and markup (lines 324–369) with `BanDialog` + `useBanUser`. The
  `onSuccess` callback patches the `users` list array via `setUsers((prev) => prev.map(...))`.

- `apps/web/src/pages/admin/AdminUserDetailPage.tsx` — same replacement (state lines 20–25,
  handlers lines 49–67, markup lines 280–325). The `onSuccess` callback patches the single `user`
  object via `setUser((prev) => prev ? {...prev, isBanned} : prev)`. **Add an error-display element**
  (the page currently has none for ban actions — the silent-swallow bug's root cause).

- `apps/web/src/components/form/Section.tsx`, `Field.tsx`, `index.ts` — **new**. Export `Section`
  and `Field` form-layout primitives from `components/form/`. `Section({ title, children })` renders
  a `<div className='card'>` with an `<h2>`. `Field({ label, required, children })` renders a
  `<label>` + children. Both accept already-translated strings as props (D40 passes `t()` results).

- `apps/web/src/pages/recipes/RecipeCreatePage.tsx` — delete local `Section` (line 535) and `Field`
  (line 545); import from `../components/form/`.

- `apps/web/src/pages/recipes/RecipeEditPage.tsx` — delete local `EditSection` (line 462) and
  `EditField` (line 471); import `Section`/`Field` from `../components/form/`. Rename all call sites
  `EditSection`→`Section`, `EditField`→`Field` (lines 206, 207, 215, 228, 230, 241, 255, 257, 265,
  273, 283, 291, 299, 310, 312, 320, 328, 337, 347, 355, 365, 374, 389, 391, 401, 430, 440).

- `apps/web/src/components/admin/BanDialog.test.tsx` — **new**. Component test: renders user name,
  requires reason, confirm calls `onConfirm` with reason, cancel calls `onClose`, `processing`
  disables confirm button.

- `apps/web/src/hooks/useBanUser.test.ts` — **new**. Hook test: mock `adminApi.banUser`/`unbanUser`;
  assert state transitions (open → processing → closed on success; processing reset + error surfaced
  on failure).

- **Stretch (NOT extracting):** `AdminRecipesPage.tsx` uses a `<table>` (not cards) with
  admin-specific affordances (visibility `<select>`, delete button, no `<Link>`). Forcing the shared
  `RecipeCard` to absorb these would bloat it with admin-only props. **Do not extract.**

**D37 — Consolidate error pages (land second):**

- `apps/web/src/pages/ErrorPage.tsx` — keep as canonical module. Merge `NotFoundPage.tsx`'s
  `<SEOHead title='Page Not Found' noIndex />` into the `NotFoundPage` export. Port the routed
  version's `text-6xl` + `accent-primary` visual style OR keep the composed version's `text-4xl` +
  emoji — **design Decision 2 chooses the composed version's style** (emoji + `text-primary`) and
  adds `<SEOHead>` to the base `ErrorPage` so all variants get `noIndex`. Delete the `ForbiddenPage`
  export (no clean trigger — see design Decision 3). Un-export the base `ErrorPage` (make it a
  non-exported internal helper) so every export is reachable from the router or boundary.

- `apps/web/src/pages/NotFoundPage.tsx` — **delete**. Update `router.tsx:7` to
  `import { NotFoundPage } from './pages/ErrorPage.tsx'`.

- `apps/web/src/components/ErrorBoundary.tsx` — inside the `isRouteErrorResponse` block (after the
  existing 404 branch), add `if (error.status >= 500) return <ServerErrorPage />;`. Delegate the 404
  branch to `<NotFoundPage />` from the consolidated module (kills the third copy of the 404 prose).
  Keep the "Reload Page" button for the generic fallback (non-route-error path) only — 5xx via
  `ServerErrorPage` doesn't have one (accepted; the user can refresh manually). Add `t()` to the
  generic fallback's chrome (Go Home, Reload Page, Oops, "Something went wrong.") — this is D40
  scope but the strings are touched here during boundary restructuring.

- `apps/web/src/pages/ErrorPage.test.tsx` — update: remove `ForbiddenPage` describe block; keep
  `ErrorPage`/`NotFoundPage`/`ServerErrorPage` tests; assert `<SEOHead noIndex>` on `NotFoundPage`.

- `apps/web/src/components/ErrorBoundary.test.tsx` — **new**. Throw 404/500 from test loaders via
  `createMemoryRouter` + `RouterProvider`; assert `NotFoundPage`/`ServerErrorPage` render via the
  boundary. Pattern from `RequireAuth.test.tsx`.

**D40 — Complete i18n (land third):**

- `packages/shared/src/i18n/en.json` and `tr.json` — add new keys for:
  - `admin.common.*` (or reuse existing `common.*` — **design Decision 5 chooses reusing `common.*`
    directly** for Save/Cancel/Delete/Edit/Search/Loading/etc. rather than duplicating into
    `admin.common.*`).
  - `admin.users.*`, `admin.dashboard.*`, `admin.recipes.*`, `admin.equipment.*`,
    `admin.vendors.*`, `admin.tasteNotes.*`, `admin.compatibility.*`, `admin.badges.*`,
    `admin.auditLog.*`, `admin.cache.*`, `admin.userDetail.*`, `admin.userCreate.*`,
    `admin.userEdit.*`, `admin.coffeeVarieties.*` — per-page CRUD keys (field labels, table headers,
    button labels, error messages, confirm dialogs).
  - `compare.*` — RecipeComparePage row labels (Brew Method, Drink Type, Dose, Yield, Time,
    Temperature, Ratio, Rating, Taste Notes, Equipment), loading/error strings.
  - `verifyEmail.*` — VerifyEmailPage strings (verifying, verified, failed, go home).
  - `legal.privacy.*`, `legal.terms.*` — section headers + "Last updated" label; **legal body stays
    in English** per design Decision 7 (translated notice above the English body).
  - `recipe.create.section.*`, `recipe.create.field.*`, `recipe.create.placeholder.*`,
    `recipe.create.button.*`, `recipe.create.error.*` — RecipeCreatePage remaining strings.
  - `recipe.edit.section.*`, `recipe.edit.field.*`, `recipe.edit.placeholder.*`,
    `recipe.edit.button.*`, `recipe.edit.error.*` — RecipeEditPage remaining strings. **Normalize
    divergent labels**: `Dose (grams)` (Create) vs `Dose (g)` (Edit) → one `recipe.field.dose` key.
  - Wire the existing unused `admin.*` nav-label keys (`admin.dashboard`, `admin.users`, etc.) into
    `AdminLayout.tsx`.
  - `error.boundary.*` — ErrorBoundary generic fallback chrome (Go Home, Reload Page, Oops,
    "Something went wrong.").

- `packages/shared/src/i18n/i18n.test.ts` — replace the one-directional sampled property test with
  a deterministic bidirectional equality check: `expect(Object.keys(en).sort()).toEqual(Object.keys
  (tr).sort())` + a value-type assertion (every value is a string). Keep the existing test as a
  secondary check if desired.

- **15 admin pages** — per page: import `useTranslation`, destructure `t`, replace every user-visible
  literal with `t('...')`. Reuse `common.*` for shared vocabulary. Preserve mount/unmount debug logs
  and all catch-block logging (do NOT fix pre-existing empty catches — out of scope, documented in
  design Decision 8).

- **5 user-facing pages** — full conversion:
  - `RecipeComparePage.tsx` — wire `recipe.compareTitle` for the title; add `compare.*` for rows.
  - `VerifyEmailPage.tsx` — add `verifyEmail.*` keys. Fix the log-message drift
    (`'token verification failed'` → `'verifyEmail failed'` per `web-page-logging` spec) while
    touching the file.
  - `PrivacyPage.tsx` / `TermsPage.tsx` — translate section headers + "Last updated" label; keep
    legal body in English with a translated notice ("This document is currently available in English
    only. / Bu belge şu anda yalnızca İngilizce olarak mevcuttur."). Add mount/unmount logs (these
    pages currently lack them — pre-existing `web-page-logging` gap).
  - `NotFoundPage.tsx` — **no-op if D37 landed** (the consolidated `ErrorPage.tsx` `NotFoundPage`
    already uses `t('error.404')` + `t('common.goHome')`). If D37 is deferred, convert the routed
    `NotFoundPage.tsx` in place.

- **2 partial recipe pages** — sweep `RecipeCreatePage.tsx` / `RecipeEditPage.tsx` for remaining
  literals: section titles (passed as `title` prop to shared `Section`), field labels (passed as
  `label` prop to shared `Field`), placeholders, button labels, error/toast messages. Normalize
  divergent labels into shared keys.

- **Per-page spot-check tests** — for each converted page, add or extend a component test that
  renders under the tr locale and asserts at least one known Turkish string appears. Follow the
  existing pattern: `mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t:
  trT })` where `trT = (k) => trJson[k] ?? k`.

- `apps/web/src/contexts/I18nContext.tsx` — **no change** (the provider/hook implementation stays;
  D40 only adds keys and converts pages). Preserve the locale-change debug log per
  `web-context-hook-logging` spec.

## Capabilities

### New Capabilities

- **web-shared-components**: D36's three dedup clusters — HomePage adopts the shared `RecipeCard`;
  `BanDialog` + `useBanUser` extracted to `components/admin/` + `hooks/`; `Section`/`Field` extracted
  to `components/form/`. References `recipe-list` (the established shared-card pattern) and
  `model-test-coverage` (Vitest conventions for the new component/hook tests).

- **error-pages**: D37's consolidation — `ErrorPage.tsx` is the canonical error-page module;
  `NotFoundPage.tsx` deleted (merged with `<SEOHead>` ported); `ErrorBoundary` renders
  `ServerErrorPage` for 5xx; `ForbiddenPage` deleted (no clean trigger). References `error-handling`
  (i18n key pattern for error messages) and `web-page-logging` (ErrorBoundary logging contract).

- **i18n**: D40's completion — locale files maintain en/tr parity (deterministic bidirectional test);
  all 22 pages (15 admin + 5 user-facing + 2 partial) use `t()` for user-visible strings; new keys
  follow the existing flat-key convention; legal pages keep English body with translated notice;
  converted pages preserve mount/unmount logging. References `web-page-logging` (page logging),
  `web-context-hook-logging` (I18nContext logging), `static-cache` (admin page cache invariants).

### Modified Capabilities

None. All three Wave 3 items add new capabilities and reference existing specs for cross-cutting
invariants. This matches the established OpenSpec pattern in this repo: `recipe-list` (D11),
`optimistic-rollback` (D18), `error-handling` (fix-error-swallowing) were all specced as new
capabilities rather than modifications of existing ones.

## Impact

**Files changed (50+):**

| File | Change type | Debt item |
|---|---|---|
| `apps/web/src/pages/HomePage.tsx` | edit — delete local RecipeCard, import shared | D36 |
| `apps/web/src/components/admin/BanDialog.tsx` | new — shared ban dialog | D36 |
| `apps/web/src/components/admin/BanDialog.test.tsx` | new — component test | D36 |
| `apps/web/src/hooks/useBanUser.ts` | new — ban/unban mutation hook | D36 |
| `apps/web/src/hooks/useBanUser.test.ts` | new — hook test | D36 |
| `apps/web/src/pages/admin/AdminUsersPage.tsx` | edit — use BanDialog + useBanUser | D36 |
| `apps/web/src/pages/admin/AdminUserDetailPage.tsx` | edit — use BanDialog + useBanUser + error display | D36 |
| `apps/web/src/components/form/Section.tsx`, `Field.tsx`, `index.ts` | new — form primitives | D36 |
| `apps/web/src/pages/recipes/RecipeCreatePage.tsx` | edit — import Section/Field from components/form/ | D36 |
| `apps/web/src/pages/recipes/RecipeEditPage.tsx` | edit — delete EditSection/EditField, import shared | D36 |
| `apps/web/src/pages/ErrorPage.tsx` | edit — canonical module, merge NotFoundPage, add SEOHead, delete ForbiddenPage | D37 |
| `apps/web/src/pages/NotFoundPage.tsx` | delete | D37 |
| `apps/web/src/pages/ErrorPage.test.tsx` | edit — remove ForbiddenPage tests, add SEOHead assertions | D37 |
| `apps/web/src/router.tsx` | edit — import NotFoundPage from ErrorPage.tsx | D37 |
| `apps/web/src/components/ErrorBoundary.tsx` | edit — wire ServerErrorPage for 5xx, delegate 404, add t() | D37 |
| `apps/web/src/components/ErrorBoundary.test.tsx` | new — boundary test for 404/500 | D37 |
| `apps/web/src/pages/admin/*.tsx` (15 files) | edit — replace literals with t() | D40 |
| `apps/web/src/pages/recipes/RecipeComparePage.tsx` | edit — full i18n conversion | D40 |
| `apps/web/src/pages/auth/VerifyEmailPage.tsx` | edit — full i18n + log message fix | D40 |
| `apps/web/src/pages/PrivacyPage.tsx` | edit — translate headers + notice, keep English body | D40 |
| `apps/web/src/pages/TermsPage.tsx` | edit — translate headers + notice, keep English body | D40 |
| `apps/web/src/pages/recipes/RecipeCreatePage.tsx` | edit — complete i18n (section titles, field labels, etc.) | D40 |
| `apps/web/src/pages/recipes/RecipeEditPage.tsx` | edit — complete i18n + normalize labels | D40 |
| `packages/shared/src/i18n/en.json` | edit — new keys (~150+) | D40 |
| `packages/shared/src/i18n/tr.json` | edit — mirror new keys | D40 |
| `packages/shared/src/i18n/i18n.test.ts` | edit — deterministic bidirectional parity | D40 |
| Per-page tr-locale spot-check tests (new or extended) | new/edit | D40 |

**No schema/migration changes.** No API changes. No shared-package schema changes. The change is
entirely within `apps/web/src/` and `packages/shared/src/i18n/`.

**Stakeholders:** Web (all touched files), shared (i18n locale files + parity test). API, DB,
deployment unaffected.

**Risk:** Medium. D36 is mechanical (delete-and-import) but the BanDialog extraction touches two
pages with different refresh flows and a pre-existing error-swallowing bug. D37 is low-cost but
changes the 404 visual style (product decision) and removes the "Reload Page" button from 5xx
(accepted). D40 is the largest scope (~22 pages, ~150+ new keys) but formulaic — the risk is key
naming drift and missed strings, mitigated by the per-page grep gate and tr-locale spot-check tests.

**Verification:** `make check` (type-check all workspaces), `make lint`, `make fmt`, `make test`
(runs the new BanDialog/useBanUser tests, the new ErrorBoundary test, the updated ErrorPage test,
the strengthened parity test, and all per-page tr-locale spot-checks via Docker with `--allow-all`).
Manual: switch language to Turkish, walk the admin nav and the 5 user-facing pages; ban + unban a
user from both the list and detail pages; navigate to an unknown path (404); trigger a 500 (e.g.
stop the API and load a page with a loader).