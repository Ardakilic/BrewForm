## 1. D36 Cluster 1 — HomePage adopts the shared RecipeCard

- [x] 1.1 Open `apps/web/src/pages/HomePage.tsx`. Delete the local `RecipeCard` function (lines
      103–137). Add `import { RecipeCard } from '../components/recipe-list/';` (or from the barrel
      `../components/recipe-list/index.ts`). Verify the two usage sites (lines 75 and 88 — the
      "Latest Recipes" and "Popular Recipes" sections) render `<RecipeCard recipe={r} />` with the
      shared import.
- [x] 1.2 Remove the now-unused `AUTHOR_BUTTON_STYLE` import (line 8) — the shared `RecipeCard`
      imports it itself. Remove `useNavigate` from the `react-router` import (line 2) IF no other
      usage remains in `HomePage.tsx` (check: `useNavigation` is a different hook and stays; only
      `useNavigate` was used by the local `RecipeCard`).
- [x] 1.3 Run `make test-web` — `HomePage.test.tsx` MUST pass unchanged. The test asserts on
      author buttons and titles, which the shared `RecipeCard` renders identically. Mock data
      without `currentVersion` renders nothing extra via the shared card's `recipe.currentVersion
      &&` guard.
- [x] 1.4 Run `make check-web` and `make lint` — must pass with zero type errors and no new
      lint suppressions.

## 2. D36 Cluster 2 — BanDialog component + useBanUser hook

- [x] 2.1 Create `apps/web/src/components/admin/BanDialog.tsx`. Controlled dialog with props
      `{ user, open, onClose, onConfirm, processing }`. Render modal overlay, title with
      `displayName || username`, reason `<textarea>` (required), Cancel + Confirm Ban buttons.
      Use `t()` for all strings: `t('admin.users.banDialogTitle')` (note: `t()` is single-arg with
      no interpolation support — for the title with the user's name, use string concatenation:
      `${t('admin.users.banDialogTitle')}: ${name}` or `t('admin.users.banDialogTitle').replace(
      '{name}', name)`), `t('admin.users.banReason')`, `t('admin.users.banReasonPlaceholder')`,
      `t('common.cancel')`, `t('admin.users.confirmBan')` / `t('admin.users.banning')`. Create
      module-scoped logger via `createLogger('BanDialog')`. Add JSDoc on the component and props
      interface.
- [x] 2.2 Create `apps/web/src/hooks/useBanUser.ts`. Hook taking `onSuccess(userId, isBanned)`
      callback. Returns `{ banDialogUser, reason, processing, error, openBanDialog, setReason,
      confirmBan, unban, clearError, closeDialog }`. Call `adminApi.banUser`/`unbanUser` from
      `../api/index.ts`. Create module-scoped logger via `createLogger('useBanUser')`. Emit
      `log.debug` on `confirmBan`/`unban` entry/exit, `log.error({ err, userId }, 'useBanUser
      confirmBan failed')` on failure. Add JSDoc on the hook and return type.
- [x] 2.3 Edit `apps/web/src/pages/admin/AdminUsersPage.tsx`. Replace inline ban dialog state
      (lines 27–33), handlers (lines 72–94), and markup (lines 324–369) with `useBanUser` hook
      (passing `onSuccess = (userId, isBanned) => setUsers((prev) => prev.map((u) => u.id ===
      userId ? { ...u, isBanned } : u))`) and `<BanDialog>`. Render `error` from the hook in the
      existing error banner (lines 107–114). Keep the `handleBan`/`handleUnban` button onClick
      handlers but have them call `openBanDialog(user)` / `unban(user.id)`.
- [x] 2.4 Edit `apps/web/src/pages/admin/AdminUserDetailPage.tsx`. Replace inline ban dialog state
      (lines 20–25), handlers (lines 49–67), and markup (lines 280–325) with `useBanUser` hook
      (passing `onSuccess = (userId, isBanned) => setUser((prev) => prev ? { ...prev, isBanned } :
      prev)`) and `<BanDialog>`. **Add an error-display element** near the ban/unban buttons (the
      page previously had none — the silent-swallow bug's root cause). Render `error` from the hook
      in it. This fixes the pre-existing silent-swallow bug.
- [x] 2.5 Create `apps/web/src/components/admin/BanDialog.test.tsx`. Component test: renders user
      name (displayName || username); reason textarea present and empty; confirm disabled when
      reason empty; typing reason + clicking confirm calls `onConfirm` with reason; clicking
      cancel calls `onClose`; `processing: true` disables buttons and shows "Banning..." (mock
      `useTranslation` to return `t = (k) => k` for the processing label). Follow the
      `RecipeCard.test.tsx` pattern (vitest, @testing-library/react, @testing-library/user-event,
      vi.hoisted logger mock).
- [x] 2.6 Create `apps/web/src/hooks/useBanUser.test.ts`. Hook test: mock `adminApi.banUser`/
      `unbanUser` via `vi.mock('../api/index.ts', ...)`. Use `renderHook` from
      `@testing-library/react` (or a test harness component). Cover: `openBanDialog(user)` sets
      `banDialogUser` + clears state; `confirmBan()` success (mock resolves → `onSuccess` called
      with `(userId, true)`, dialog closes, `processing: false`, `error: null`);
      `confirmBan()` failure (mock rejects → `error` set, `processing: false`, dialog stays open);
      `unban(userId)` success → `onSuccess(userId, false)`; `unban(userId)` failure → `error` set;
      `clearError()` clears `error`.
- [x] 2.7 Run `make test-web` — `BanDialog.test.tsx` and `useBanUser.test.ts` MUST pass. Run
      `make check-web` and `make lint` — must pass.

## 3. D36 Cluster 3 — Section/Field form primitives

- [x] 3.1 Create `apps/web/src/components/form/Section.tsx`. Export `Section({ title, children })`
      rendering `<div className='card'><h2 className='font-semibold mb-4' style={{ color:
      'var(--text-primary)' }}>{title}</h2>{children}</div>`. Add JSDoc.
- [x] 3.2 Create `apps/web/src/components/form/Field.tsx`. Export `Field({ label, required,
      children })` rendering `<div><label className='block text-sm font-medium mb-1' style={{
      color: 'var(--text-secondary)' }}>{label}{required && ' *'}</label>{children}</div>`. Add
      JSDoc.
- [x] 3.3 Create `apps/web/src/components/form/index.ts` re-exporting `Section` from `./Section.tsx`
      and `Field` from `./Field.tsx`.
- [x] 3.4 Edit `apps/web/src/pages/recipes/RecipeCreatePage.tsx`. Delete local `Section` (line 535)
      and `Field` (line 545). Add `import { Section, Field } from '../components/form/';`. Verify
      all call sites (`<Section title='Basic Info'>`, `<Field label='Title' required>`, etc.) still
      work unchanged (the props signatures are identical).
- [x] 3.5 Edit `apps/web/src/pages/recipes/RecipeEditPage.tsx`. Delete local `EditSection` (line
      462) and `EditField` (line 471). Add `import { Section, Field } from '../components/form/';`.
      Rename ALL call sites: `<EditSection>` → `<Section>`, `<EditField>` → `<Field>` (approximately
      27 call sites across lines 206–440). Verify the JSX renders identically (the bodies were
      byte-for-byte identical).
- [x] 3.6 Run `make test-web` — existing `RecipeCreatePage.test.tsx` MUST pass unchanged (it tests
      mount/unmount logging, not Section/Field directly, but the real components are rendered via
      the page under test). Run `make check-web` and `make lint` — must pass.

## 4. D37 — Consolidate error pages

- [x] 4.1 Edit `apps/web/src/pages/ErrorPage.tsx`. Add `<SEOHead title={String(statusCode)} noIndex
      />` to the internal `ErrorPage` base component (so all variants get `noIndex`). Un-export the
      base `ErrorPage` (remove the `export` keyword — make it an internal helper). Delete the
      `ForbiddenPage` export and its definition. Keep `NotFoundPage` and `ServerErrorPage` as the
      only two exports. Verify both use `t('error.404')`/`t('error.500')` + `t('common.goHome')`
      (already present — no change to the i18n calls).
- [x] 4.2 Delete `apps/web/src/pages/NotFoundPage.tsx`.
- [x] 4.3 Edit `apps/web/src/router.tsx`. Change the `NotFoundPage` import (line 7) from
      `'./pages/NotFoundPage.tsx'` to `'./pages/ErrorPage.tsx'`. Verify the `*` catch-all route
      (line 238) still renders `<NotFoundPage />`.
- [x] 4.4 Edit `apps/web/src/components/ErrorBoundary.tsx`. Inside the `isRouteErrorResponse` block
       (currently lines 24–51, which has the 404 check INLINE in the `<p>` text as a ternary —
       restructure to early-returns):
       - Add `if (error.status === 404) return <NotFoundPage />;` as an early return at the TOP of
         the `isRouteErrorResponse` block (before the existing inline ternary). This delegates the
         404 case to the canonical component and kills the duplicated prose at lines 34–36.
       - Add `if (error.status >= 500) return <ServerErrorPage />;` as the next early return.
       - Remove the now-dead inline 404 ternary and the generic `<p>` fallback for route errors
         (both 404 and 5xx are now handled by early returns; any other route error status like 403
         falls through to the generic fallback below).
       - Add `import { NotFoundPage, ServerErrorPage } from '../pages/ErrorPage.tsx';` at the top.
       - Add `import { useTranslation } from '../contexts/I18nContext.tsx';` and use `t()` for the
         generic fallback chrome: `t('common.goHome')` for the Go Home link, `t('error.boundary.reload')`
         for the Reload Page button, `t('error.boundary.oops')` for the Oops heading,
         `t('error.boundary.genericMessage')` for the fallback message. (These new keys are added in
         task 5.1.)
       - Keep the `log.error({ err, componentStack }, 'ErrorBoundary caught render error')` call
         (per `web-page-logging` spec).
- [x] 4.5 Edit `apps/web/src/pages/ErrorPage.test.tsx`. Remove the `ForbiddenPage` describe block.
      Remove the `ErrorPage` base describe block (the base is now un-exported) OR test it indirectly
      through the variants. Add an assertion that `NotFoundPage` renders `<SEOHead>` with `noIndex`
      (mock `SEOHead` or assert on `document.title` / meta tags).
- [x] 4.6 Create `apps/web/src/components/ErrorBoundary.test.tsx`. Use `createMemoryRouter` +
      `RouterProvider` (pattern from `RequireAuth.test.tsx:62-84`). Define a test route with
      `errorElement: <RootErrorBoundary />` and a `loader` that throws `new Response(null, { status:
      404 })` → assert `NotFoundPage` renders (404 message appears). Another test route with a
      `loader` that throws `new Response(null, { status: 500 })` → assert `ServerErrorPage` renders
      (500 message appears). Optional: a loader that throws `new Error('boom')` → assert the generic
      fallback renders. Logger mock via `vi.hoisted`.
- [x] 4.7 Run `make test-web` — `ErrorPage.test.tsx` and `ErrorBoundary.test.tsx` MUST pass. Run
      `make check-web` and `make lint` — must pass.
- [x] 4.8 Grep gate: `grep -rn "from './pages/NotFoundPage" apps/web/src` (and `../pages/NotFoundPage`)
      → no matches. `grep -rn "ForbiddenPage" apps/web/src` → no definition (only test references,
      which were removed).

## 5. D40 — Locale files and parity test

- [x] 5.1 Add the following new keys to BOTH `packages/shared/src/i18n/en.json` and `tr.json`
      (Turkish translations for each — machine-draft + review is acceptable per the D40 plan;
      mark drafts for review if uncertain):
      - `error.boundary.reload`, `error.boundary.oops`, `error.boundary.genericMessage` (for
        ErrorBoundary generic fallback — D37 task 4.4 references these).
      - `compare.brewMethod`, `compare.drinkType`, `compare.dose`, `compare.yield`, `compare.time`,
        `compare.temperature`, `compare.ratio`, `compare.rating`, `compare.tasteNotes`,
        `compare.equipment`, `compare.loading`, `compare.notFound` (RecipeComparePage).
      - `verifyEmail.verifying`, `verifyEmail.verified`, `verifyEmail.verifiedDescription`,
        `verifyEmail.failed`, `verifyEmail.failedDescription`, `verifyEmail.noToken`,
        `verifyEmail.goHome` (VerifyEmailPage).
      - `legal.privacy.title`, `legal.terms.title`, `legal.lastUpdated`, `legal.notice`,
        `legal.privacy.section1` through `section6`, `legal.terms.section1` through `section6`
        (Privacy/Terms headers + notice; legal body stays English).
      - `recipe.create.section.basicInfo`, `recipe.create.section.brewConfiguration`,
        `recipe.create.section.equipmentSetup`, `recipe.create.section.coffeeIdentity`,
        `recipe.create.section.brewParameters`, `recipe.create.section.tasteRating`,
        `recipe.create.section.preparationNotes`, `recipe.create.section.personalNotes`
        (RecipeCreatePage section titles).
      - `recipe.create.field.title`, `recipe.create.field.visibility`, `recipe.create.field.brewMethod`,
        `recipe.create.field.drinkType`, `recipe.create.field.setup`, `recipe.create.field.equipment`,
        `recipe.create.field.productName`, `recipe.create.field.coffeeBrand`,
        `recipe.create.field.processing`, `recipe.create.field.roastDate`,
        `recipe.create.field.packageOpenDate`, `recipe.create.field.grindDate`,
        `recipe.create.field.grinder`, `recipe.create.field.grindSize`,
        `recipe.create.field.mainBrewer`, `recipe.create.field.dose`,
        `recipe.create.field.extractionTime`, `recipe.create.field.yield`,
        `recipe.create.field.temperature`, `recipe.create.field.rating`,
        `recipe.create.field.taste` (RecipeCreatePage field labels — normalized with Edit page).
      - `recipe.create.placeholder.title`, `recipe.create.placeholder.processing`,
        `recipe.create.placeholder.equipment`, `recipe.create.placeholder.preparationNotes`,
        `recipe.create.placeholder.personalNotes`, `recipe.create.placeholder.select`
        (RecipeCreatePage placeholders).
      - `recipe.create.button.create`, `recipe.create.button.creating`,
        `recipe.create.error.failed`, `recipe.create.error.equipmentLoad`,
        `recipe.create.error.setupLoad` (RecipeCreatePage buttons/errors).
      - `recipe.edit.section.*` (mirror of create sections), `recipe.edit.field.*` (mirror of create
        fields — normalized to the SAME keys where labels are identical, separate keys only where
        Edit genuinely differs e.g. `recipe.edit.field.bumpVersion`), `recipe.edit.placeholder.*`,
        `recipe.edit.button.save`, `recipe.edit.button.saving`, `recipe.edit.error.failed`,
        `recipe.edit.error.noVersions`, `recipe.edit.error.loadFailed` (RecipeEditPage).
      - Per-admin-page keys: `admin.users.title`, `admin.users.searchPlaceholder`,
        `admin.users.newUser`, `admin.users.noResults`, `admin.users.noMatch`,
        `admin.users.roleAdmin`, `admin.users.roleUser`, `admin.users.statusBanned`,
        `admin.users.statusActive`, `admin.users.view`, `admin.users.edit`, `admin.users.ban`,
        `admin.users.unban`, `admin.users.removeAdmin`, `admin.users.makeAdmin`,
        `admin.users.pageOf` (for "Page {page} of {total}"), `admin.users.banDialogTitle`,
        `admin.users.banReason`, `admin.users.banReasonPlaceholder`, `admin.users.confirmBan`,
        `admin.users.banning`, `admin.users.deleteConfirm`, `admin.users.deleteConfirmText`,
        `admin.users.errorLoad`, `admin.users.errorBan`, `admin.users.errorUnban`,
        `admin.users.errorRemoveAdmin`, `admin.users.errorMakeAdmin`
        (and equivalent for the other 14 admin pages — see the research report's per-page string
        lists for the exact literals to convert). Reuse `common.*` for Save/Cancel/Delete/Edit/
        Search/Loading/Previous/Next/Yes/No/Confirm/Back wherever the admin string matches.
      - Wire the existing unused `admin.*` nav keys into `AdminLayout.tsx` (already in en/tr —
        `admin.dashboard`, `admin.users`, `admin.recipes`, `admin.equipment`, `admin.vendors`,
        `admin.tasteNotes`, `admin.compatibility`, `admin.badges`, `admin.auditLog`,
        `admin.flushCache`, `admin.title`, `admin.banUser`, `admin.unbanUser`).
- [x] 5.2 Edit `packages/shared/src/i18n/i18n.test.ts`. Replace (or supplement) the sampled
      one-directional property test with a deterministic bidirectional equality check:
      `expect(Object.keys(enJson).sort()).toEqual(Object.keys(trJson).sort())`. Add a value-type
      assertion: every value in both files is a string.
- [x] 5.3 Run `make test-shared` — the strengthened parity test MUST pass (current state is exact
      parity, 504=504; after adding new keys, both files must have the same new keys).
- [x] 5.4 Run `make check` and `make lint` — must pass with zero type errors.

## 6. D40 — User-facing pages (5 zero-t() pages)

- [x] 6.1 Edit `apps/web/src/pages/recipes/RecipeComparePage.tsx`. Import `useTranslation`,
      destructure `t`. Replace all literals: title → `t('recipe.compareTitle')`, row labels →
      `t('compare.brewMethod')` etc., loading → `t('compare.loading')`, not-found →
      `t('compare.notFound')`. Keep the SEO title interpolation (`Compare: {a} vs {b}`) — translate
      the "Compare" prefix via `t('recipe.compare')` if appropriate, or keep the SEO title
      structural.
- [x] 6.2 Edit `apps/web/src/pages/auth/VerifyEmailPage.tsx`. Import `useTranslation`. Replace all
      literals with `t('verifyEmail.*')`. **Fix the log-message drift**: change `log.error({ err },
      'VerifyEmailPage token verification failed')` (line ~41) to `log.error({ err }, 'VerifyEmailPage
      verifyEmail failed')` per the `web-page-logging` spec. Keep the existing mount/unmount logs.
- [x] 6.3 Edit `apps/web/src/pages/PrivacyPage.tsx`. Import `useTranslation`. Replace title →
      `t('legal.privacy.title')`, "Last updated" → `t('legal.lastUpdated')`, 6 section headers →
      `t('legal.privacy.section1')` etc. Add the translated notice at the top: `t('legal.notice')`.
      Keep the legal body paragraphs in English. Add mount/unmount `log.debug` logs (the page
      currently lacks them — pre-existing `web-page-logging` gap). Add a `createLogger('PrivacyPage')`.
- [x] 6.4 Edit `apps/web/src/pages/TermsPage.tsx`. Same pattern as PrivacyPage with
      `t('legal.terms.*')`. Add mount/unmount logs + `createLogger('TermsPage')`.
- [x] 6.5 `NotFoundPage.tsx` — if D37 has landed (task 4.2), this is a NO-OP (the consolidated
      `ErrorPage.tsx` `NotFoundPage` already uses `t('error.404')` + `t('common.goHome')`). Verify
      by inspecting `ErrorPage.tsx`'s `NotFoundPage`. If D37 is deferred, convert the routed
      `NotFoundPage.tsx` in place: import `useTranslation`, replace the 3 literals with
      `t('error.404')` (for the prose, or add a new `error.404.prose` key if the coffee-themed line
      should be kept), `t('common.goHome')`, and `t('error.404')` for the SEO title.
- [x] 6.6 Run `make test-web` — existing tests for these pages (if any) MUST pass. Run
      `make check-web` and `make lint`.

## 7. D40 — Partial recipe pages (2 pages, ~30 strings each)

- [x] 7.1 Edit `apps/web/src/pages/recipes/RecipeCreatePage.tsx`. Complete the i18n conversion:
      replace all remaining literals with `t('recipe.create.section.*')`,
      `t('recipe.create.field.*')`, `t('recipe.create.placeholder.*')`,
      `t('recipe.create.button.*')`, `t('recipe.create.error.*')`, `t('common.cancel')`,
      `t('visibility.*')` (reuse existing visibility keys if present). Section titles and field
      labels are passed as `title`/`label` props to the shared `Section`/`Field` components (from
      D36 task 3.4) — pass `t('...')` results as those props.
- [x] 7.2 Edit `apps/web/src/pages/recipes/RecipeEditPage.tsx`. Same conversion with
      `t('recipe.edit.*')` keys. **Normalize divergent labels**: use the SAME key for Dose
      (`recipe.field.dose` or `recipe.create.field.dose` — pick one and use it in both pages),
      Extraction Time, Yield. The unit suffix (g vs grams) goes in the key value, not in separate
      keys. Section titles and field labels passed to the shared `Section`/`Field` (from D36 task
      3.5) as `t('...')` results.
- [x] 7.3 Run `make test-web` — existing `RecipeCreatePage.test.tsx` MUST pass (it tests
      mount/unmount logging; the i18n conversion doesn't affect that). Run `make check-web` and
      `make lint`.

## 8. D40 — Admin pages (15 pages)

- [x] 8.1 Edit `apps/web/src/pages/admin/AdminLayout.tsx`. Import `useTranslation`. Replace `Admin
      Panel` → `t('admin.title')`, nav labels → `t('admin.dashboard')` etc. (existing keys),
      `← Back to Site` → `t('common.back')` or a new `admin.backToSite` key, `Logged in as
      {username}` → `t('admin.loggedInAs')` (with interpolation). This is the highest-value admin
      page (nav labels appear on every admin screen).
- [x] 8.2 Edit `apps/web/src/pages/admin/AdminDashboard.tsx`. Replace `Admin Dashboard` (SEO) →
      `t('admin.dashboard')` (or a new `admin.dashboard.title`), `Dashboard` → `t('admin.dashboard')`,
      `Loading stats...` → `t('common.loading')` (or a specific key), StatCard labels →
      `t('admin.dashboard.totalUsers')` etc., `Failed to load stats.` →
      `t('admin.dashboard.errorLoad')`.
- [x] 8.3 Edit `apps/web/src/pages/admin/AdminUsersPage.tsx`. Replace all literals: `User
      Management` → `t('admin.users.title')`, `+ New User` → `t('admin.users.newUser')`, search
      placeholder → `t('admin.users.searchPlaceholder')`, table headers → `t('admin.users.username')`
      etc. (or reuse `common.*`), status badges → `t('admin.users.roleAdmin')` etc., action buttons
      → `t('admin.users.view')`, `t('common.edit')`, `t('admin.users.ban')`, `t('admin.users.unban)`,
      `t('admin.users.removeAdmin')`, `t('admin.users.makeAdmin')`, pagination →
      `t('common.previous')`, `t('common.next')`, `t('admin.users.pageOf')`, ban dialog (now shared
      `BanDialog` from D36 — strings already translated there), errors → `t('admin.users.errorLoad)`
      etc.
- [x] 8.4 Edit `apps/web/src/pages/admin/AdminUserDetailPage.tsx`. Replace all literals: `Failed to
      Load`, `User Not Found`, `Back to Users`, field labels, `Admin`/`User`, `Banned`/`Active`,
      `Recipes`/`Followers`/`Following`, `Edit User`, `Unban User`/`Ban User`, `Delete User`,
      delete confirm, `This is your own account...` — all via `t('admin.userDetail.*')` or reuse
      `common.*`/`admin.users.*` where identical. The ban dialog strings are in the shared
      `BanDialog` (D36).
- [x] 8.5 Edit `apps/web/src/pages/admin/AdminUserEditPage.tsx`. Replace all literals: `User Not
      Found`, `Back to Users`, `Back to User`, `Edit User: {name}`, `User Updated Successfully`,
      `Redirecting...`, field labels, `Admin`/`Banned`, `Saving...`/`Save Changes`, `Cancel`,
      `Leave password blank...`, errors — via `t('admin.userEdit.*')` or reuse.
- [x] 8.6 Edit `apps/web/src/pages/admin/AdminUserCreatePage.tsx`. Replace `Back to Users`, `Create
      User`, field labels, `Admin`/`Banned`, `Creating...`/`Create User`, `Cancel`, errors — via
      `t('admin.userCreate.*')` or reuse.
- [x] 8.7 Edit `apps/web/src/pages/admin/AdminRecipesPage.tsx`. Replace `Recipe Management`,
      `Loading...`, table headers, visibility `<option>`s (`Draft`/`Private`/`Unlisted`/`Public` →
      `t('visibility.*')`), `Delete this recipe?`, `Delete` — via `t('admin.recipes.*')` or reuse.
- [x] 8.8 Edit `apps/web/src/pages/admin/AdminEquipmentPage.tsx`. Replace `Equipment Management`,
      `+ Add Equipment`, `Edit Equipment`/`Add Equipment`, field labels, `Saving...`/`Save`,
      `Cancel Edit`, `Loading...`, table headers, delete confirm, `Edit`/`Delete` — via
      `t('admin.equipment.*')` or reuse. Preserve `invalidateStaticCache()` calls per `static-cache`
      spec. Preserve mount/unmount logs.
- [x] 8.9 Edit `apps/web/src/pages/admin/AdminVendorsPage.tsx`. Replace `Vendor Management`,
      `+ Add Vendor`, field labels, `Saving...`/`Save`, table headers, delete confirm, `Edit`/
      `Delete` — via `t('admin.vendors.*')` or reuse.
- [x] 8.10 Edit `apps/web/src/pages/admin/AdminTasteNotesPage.tsx`. Replace `Taste Notes`,
       `+ Add Taste Note`, `Add Taste Note`, `Name *`, `Parent (optional)`, `None (top-level)`,
       `Creating...`/`Create`, cache-flush notice, `Loading...`, delete confirm, `Delete` — via
       `t('admin.tasteNotes.*')` or reuse. Preserve `invalidateStaticCache()` calls. Preserve
       mount/unmount logs.
- [x] 8.11 Edit `apps/web/src/pages/admin/AdminCoffeeVarietiesPage.tsx`. This is the largest admin
       page (637 lines). Replace `Coffee Varieties`, `+ Add Coffee Variety`, category/search
       options, `Edit`/`Add Coffee Variety`, the `fieldLabel()` map (28 labels), `Comma-separated
       values`, `Saving...`/`Save`, `Cancel Edit`, table headers, `System`/`Custom` badges,
       `Edit`/`Delete`, pagination, delete confirm — via `t('admin.coffeeVarieties.*')` or reuse.
- [x] 8.12 Edit `apps/web/src/pages/admin/AdminCompatibilityPage.tsx`. Replace `Compatibility
       Matrix`, `Flush Cache` (reuse `admin.flushCache`), `Loading...`, headers, `Yes`/`No` — via
       `t('admin.compatibility.*')` or reuse `common.*`.
- [x] 8.13 Edit `apps/web/src/pages/admin/AdminBadgesPage.tsx`. Replace `Badges`, `Loading...`,
       `No badges found.` — via `t('admin.badges.*')` or reuse.
- [x] 8.14 Edit `apps/web/src/pages/admin/AdminAuditLogPage.tsx`. Replace `Audit Log`,
       `<option>`s (entity filter), `Loading...`, table headers, `Previous`/`Next` — via
       `t('admin.auditLog.*')` or reuse `admin.audit.*` (existing keys: `admin.audit.action`,
       `admin.audit.entity`, `admin.audit.user`, `admin.audit.timestamp`).
- [x] 8.15 Edit `apps/web/src/pages/admin/AdminCachePage.tsx`. Replace `Cache Management`,
       `Flush Cache`, body text, `Flushing...`/`Flush All Cache`, `Cache flushed successfully!`,
       `Failed to flush cache.`, `Cache Info`, body, `Cache prefixes:`, bullet items — via
       `t('admin.cache.*')` or reuse.
- [x] 8.16 Run `make test-web` — existing `AdminEquipmentPage.test.tsx` and
       `AdminTasteNotesPage.test.tsx` MUST pass (they mock `useTranslation`; the conversion
       doesn't break them if the mock returns `t = (k) => k`). Run `make check-web` and `make lint`.
- [x] 8.17 Grep gate: `grep -rL "useTranslation\|I18nContext" apps/web/src/pages/admin/` → no
       `.tsx` files returned (every admin page imports `useTranslation`).

## 9. D40 — Per-page tr-locale spot-check tests

- [x] 9.1 For each of the 22 converted pages (15 admin + 5 user-facing + 2 partial recipe), add or
       extend a component test that renders under the tr locale and asserts at least one known
       Turkish string appears. Pattern:
       ```typescript
       const trT = (k: string) => trJson[k] ?? k;
       mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });
       render(<PageUnderTest />);
       expect(screen.getByText(trJson['<some.key>'])).toBeInTheDocument();
       ```
       For pages with existing tests (`AdminEquipmentPage`, `AdminTasteNotesPage`, `HomePage`),
       extend with a tr-locale case. For pages without tests, add a minimal spot-check test file
       (`<PageName>.test.tsx`).
- [x] 9.2 Run `make test-web` — all per-page tr-locale spot-check tests MUST pass.

## 10. Final verification

- [x] 10.1 Run `make check` — type-check all workspaces. Must pass with zero type errors.
- [x] 10.2 Run `make lint` — lint all apps and packages. Must pass with no new suppressions.
- [x] 10.3 Run `make fmt` — apply `deno fmt` (lineWidth 100, indentWidth 2, singleQuote,
       semiColons). The agent's symbolic edits may not match Deno's exact whitespace rules; a final
       `make fmt` is mandatory before commit/PR.
- [x] 10.4 Run `make test` — all tests via Docker with `--allow-all`. Includes: new BanDialog/
       useBanUser tests, new ErrorBoundary test, updated ErrorPage test, strengthened parity test,
       all per-page tr-locale spot-check tests, and all pre-existing tests (zero regressions).
- [x] 10.5 Grep gates:
       - `grep -rL "useTranslation\|I18nContext" apps/web/src/pages/admin/` → no `.tsx` files
         (every admin page uses i18n).
       - `grep -rn "from './pages/NotFoundPage" apps/web/src` → no matches (D37 deleted it).
       - `grep -rn "function RecipeCard" apps/web/src/pages/` → no matches (no local RecipeCard
         forks).
       - `grep -rn "function EditSection\|function EditField" apps/web/src/pages/` → no matches
         (D36 deleted them).
       - `grep -rn "ForbiddenPage" apps/web/src` → no definition (only test references, removed).
       - `grep -n "export function ErrorPage\b" apps/web/src/pages/ErrorPage.tsx` → no matches (the
         base `ErrorPage` is un-exported per Decision 9; only `NotFoundPage` and `ServerErrorPage`
         are exported).
       - `grep -n '"notFound\.' packages/shared/src/i18n/en.json packages/shared/src/i18n/tr.json`
         → no matches (no `notFound.*` namespace — using `error.404`).
- [x] 10.6 Manual verification (optional but recommended):
       - Switch language to Turkish; walk the admin nav and the 5 user-facing pages — verify
         Turkish text appears.
       - Ban + unban a user from both `AdminUsersPage` and `AdminUserDetailPage` — verify the
         shared `BanDialog` works and errors surface on both pages.
       - Navigate to an unknown path (`/nonexistent`) — verify the 404 page renders with Turkish
         text + `noindex` meta.
       - Trigger a 500 (stop the API container, load a page with a loader) — verify
         `ServerErrorPage` renders via the boundary.
       - Create a recipe via `RecipeCreatePage` — verify the shared `Section`/`Field` render
         correctly with translated labels.
- [x] 10.7 Update `plans/ROADMAP.md` — mark D36, D37, D40 as resolved under "Wave 3".
- [x] 10.8 Update `plans/TECHNICAL_DEBT.md` — mark §4.1 (D36), §4.2/§6.5 (D37), §4.5 (D40) as
       resolved with the date and change name.