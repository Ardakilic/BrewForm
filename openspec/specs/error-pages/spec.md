# error-pages Specification

## Purpose
TBD - created by archiving change wave-3-frontend-structure. Update Purpose after archive.
## Requirements
### Requirement: ErrorPage.tsx is the canonical error-page module

The file `apps/web/src/pages/ErrorPage.tsx` SHALL be the single source for error-page components.
It SHALL export exactly two components:

- `NotFoundPage` — the 404 page, composing the internal `ErrorPage` base with
  `statusCode={404}`, `message={t('error.404')}`, `illustration='🫥'`.
- `ServerErrorPage` — the 500 page, composing the internal `ErrorPage` base with
  `statusCode={500}`, `message={t('error.500')}`, `illustration='💔'`.

The base `ErrorPage` component (the generic `{ statusCode, message, illustration }` renderer) SHALL
be a **non-exported internal helper** — it is used only by `NotFoundPage` and `ServerErrorPage`
internally and is NOT reachable from the router or boundary directly. This satisfies the "no dead
exports" criterion: every export is reachable from the router (`NotFoundPage` via the `*`
catch-all) or the error boundary (`ServerErrorPage` via the 5xx branch).

`ForbiddenPage` SHALL be **deleted**. It had no clean trigger — `RequireAuth` redirects non-admin
users to `/` rather than throwing a 403 route error, and no loader throws 403. Wiring it would
require changing `RequireAuth`'s admin-guard UX (silent redirect → 403 page), which is a product
decision out of scope for a dead-code consolidation. The `error.403` i18n key MAY remain in the
locale files (harmless; a future 403 page might use it).

**Reason:** Two files exported overlapping error-page components. `ErrorPage.tsx` (i18n'd, dead in
production) vs `NotFoundPage.tsx` (zero `t()`, routed, has SEO) — plus a third copy of the 404
prose in `ErrorBoundary.tsx`. Consolidating to `ErrorPage.tsx` as canonical kills the duplication
and makes D40's NotFoundPage conversion a no-op (the canonical module already uses `t()`). This is
the D37 plan's core consolidation.

#### Scenario: ErrorPage.tsx exports exactly NotFoundPage and ServerErrorPage

- **WHEN** the source of `apps/web/src/pages/ErrorPage.tsx` is inspected
- **THEN** it exports exactly two components: `NotFoundPage` and `ServerErrorPage`. The base
  `ErrorPage` is NOT exported (it's an internal helper). `ForbiddenPage` is NOT present.

#### Scenario: No ForbiddenPage definition exists

- **WHEN** `grep -rn "ForbiddenPage" apps/web/src` is run
- **THEN** no definition of `ForbiddenPage` exists (only references in test files, if any, which
  SHALL be removed)

### Requirement: NotFoundPage.tsx is deleted and the router imports from ErrorPage.tsx

The file `apps/web/src/pages/NotFoundPage.tsx` SHALL be **deleted**. The router
(`apps/web/src/router.tsx`) SHALL import `NotFoundPage` from `./pages/ErrorPage.tsx` instead of
`./pages/NotFoundPage.tsx`. The `*` catch-all route (previously `router.tsx:238`) SHALL render the
consolidated `NotFoundPage`.

**Reason:** `NotFoundPage.tsx` was the zero-`t()` page the router used. Deleting it and importing
the i18n'd variant from `ErrorPage.tsx` removes the duplicate and advances D40 (the 404 page is
now i18n-complete).

#### Scenario: NotFoundPage.tsx does not exist

- **WHEN** the filesystem is inspected at `apps/web/src/pages/NotFoundPage.tsx`
- **THEN** the file does NOT exist

#### Scenario: Router imports NotFoundPage from ErrorPage.tsx

- **WHEN** the source of `apps/web/src/router.tsx` is inspected at the `NotFoundPage` import
- **THEN** it imports from `./pages/ErrorPage.tsx` (NOT `./pages/NotFoundPage.tsx`)

#### Scenario: Grep gate for deleted module

- **WHEN** `grep -rn "from './pages/NotFoundPage" apps/web/src` (and variants with `../`) is run
- **THEN** no matches are returned — no file imports from the deleted `NotFoundPage.tsx`

### Requirement: ErrorPage base renders SEOHead with noIndex

The internal `ErrorPage` base component MUST render `<SEOHead title={String(statusCode)} noIndex />`
(the generic `{ statusCode, message, illustration }` renderer) so that all error pages
(404, 500, and any future variants) emit `<meta name="robots" content="noindex, nofollow">` and set
the document title. This ports the `<SEOHead noIndex>` behaviour from the deleted
`NotFoundPage.tsx` (which had it) into the canonical module.

**Reason:** The deleted `NotFoundPage.tsx` had `<SEOHead title='Page Not Found' noIndex />` at
line 8. The `ErrorPage.tsx` variants previously lacked it. Without porting it, the 404 page
regresses from `noindex` to indexable. The D37 plan's step 2 ("port SEO/meta from routed to
ErrorPage.tsx") covers this; this requirement codifies it.

#### Scenario: NotFoundPage renders SEOHead with noIndex

- **WHEN** `NotFoundPage` is rendered
- **THEN** a `<SEOHead>` component is rendered with `noIndex` set, and the document title includes
  the status code (404)

#### Scenario: ServerErrorPage renders SEOHead with noIndex

- **WHEN** `ServerErrorPage` is rendered
- **THEN** a `<SEOHead>` component is rendered with `noIndex` set, and the document title includes
  the status code (500)

### Requirement: ErrorBoundary renders ServerErrorPage for 5xx route errors

The `RootErrorBoundary` component in `apps/web/src/components/ErrorBoundary.tsx` SHALL, within the
`isRouteErrorResponse` branch (where `useRouteError()` returns a route error response), render
`<ServerErrorPage />` when `error.status >= 500`. This SHALL occur before the generic fallback.

The existing 404 branch (which duplicated the 404 prose string from `NotFoundPage.tsx`) SHALL be
replaced with `return <NotFoundPage />` (imported from `../pages/ErrorPage.tsx`) — delegating to
the canonical component kills the third copy of the 404 prose.

The boundary SHALL retain its existing `log.error({ err, componentStack }, 'ErrorBoundary caught
render error')` logging per the `web-page-logging` spec requirement "Error boundary component logs
render errors."

**Reason:** `ErrorBoundary.tsx` is wired as `errorElement` at 8 route sites
(`router.tsx:45, 51, 62, 72, 102, 139, 149, 255`). It already branches on
`error.status === 404` but renders a generic "Something went wrong." for 5xx. Wiring
`ServerErrorPage` for 5xx makes the polished 500 page reachable for every loader 5xx failure with
no router changes. Delegating the 404 branch to `<NotFoundPage />` kills the prose duplication
(`ErrorBoundary.tsx:34-36` duplicated `NotFoundPage.tsx:10-12` verbatim).

#### Scenario: ErrorBoundary renders NotFoundPage for 404 route errors

- **WHEN** a route loader throws `new Response(null, { status: 404 })` and the boundary catches it
- **THEN** `<NotFoundPage />` (from `ErrorPage.tsx`) is rendered — NOT the boundary's inline 404
  markup

#### Scenario: ErrorBoundary renders ServerErrorPage for 500 route errors

- **WHEN** a route loader throws `new Response(null, { status: 500 })` and the boundary catches it
- **THEN** `<ServerErrorPage />` (from `ErrorPage.tsx`) is rendered

#### Scenario: ErrorBoundary renders ServerErrorPage for 502/503 route errors

- **WHEN** a route loader throws `new Response(null, { status: 503 })` and the boundary catches it
- **THEN** `<ServerErrorPage />` is rendered (any `status >= 500`)

#### Scenario: ErrorBoundary logs the error before rendering the page

- **WHEN** the boundary catches any route error
- **THEN** it emits `log.error({ err, componentStack }, 'ErrorBoundary caught render error')`
  before rendering `NotFoundPage`/`ServerErrorPage` (per `web-page-logging` spec)

### Requirement: ErrorBoundary generic fallback uses t() for user-visible strings

The `RootErrorBoundary`'s generic fallback MUST use `t()` from `useTranslation()` for its
user-visible strings (the non-`isRouteErrorResponse` path, rendered for non-route `Error` throws):
"Go Home" (link label), "Reload Page" (button), "Oops" (heading), "Something went wrong."
(fallback message). New i18n keys SHALL be added under the `error.boundary.*` namespace in both
`en.json` and `tr.json`.

The "Reload Page" button (which calls `globalThis.location.reload()`) SHALL be retained on the
generic fallback path. The 5xx path (which renders `<ServerErrorPage />`) does NOT have a reload
button — accepted (the user can refresh manually).

**Reason:** The boundary's generic fallback was zero-`t()` (all hardcoded English). D37 touches
the boundary during restructuring; converting its chrome to `t()` is natural and advances D40.
This is D40 scope but lands with D37 because the boundary is being restructured.

#### Scenario: ErrorBoundary generic fallback uses t() for Go Home

- **WHEN** the boundary renders the generic fallback (non-route error)
- **THEN** the "Go Home" link label is rendered via `t('common.goHome')` (or a new
  `error.boundary.goHome` key), NOT a hardcoded English string

#### Scenario: ErrorBoundary generic fallback uses t() for Reload Page

- **WHEN** the boundary renders the generic fallback
- **THEN** the "Reload Page" button label is rendered via `t('error.boundary.reload')` (or similar
  new key), NOT a hardcoded English string

### Requirement: ErrorPage.test.tsx is updated for the consolidation

The file `apps/web/src/pages/ErrorPage.test.tsx` SHALL be updated:
- The `ForbiddenPage` describe block SHALL be removed (the component is deleted).
- The `NotFoundPage` and `ServerErrorPage` describe blocks SHALL be retained.
- The `ErrorPage` base describe block SHALL be removed if the base is un-exported (test the base
  indirectly through the variants instead), OR retained if the base remains exported for testing.
- A new assertion SHALL verify that `NotFoundPage` renders `<SEOHead>` with `noIndex` (the ported
  SEO behaviour).

**Reason:** The test file was the only consumer of `ErrorPage.tsx`. D37's consolidation (deleting
`ForbiddenPage`, un-exporting the base, adding `<SEOHead>`) requires the test to be updated in
lockstep.

#### Scenario: ErrorPage.test.tsx has no ForbiddenPage tests

- **WHEN** `ErrorPage.test.tsx` is inspected
- **THEN** no `describe('ForbiddenPage', ...)` block exists

#### Scenario: ErrorPage.test.tsx asserts SEOHead on NotFoundPage

- **WHEN** `ErrorPage.test.tsx` is inspected at the `NotFoundPage` describe block
- **THEN** it contains an assertion that `<SEOHead>` is rendered with `noIndex` when `NotFoundPage`
  is rendered

### Requirement: ErrorBoundary.test.tsx exists and covers 404/500 route errors

The file `apps/web/src/components/ErrorBoundary.test.tsx` SHALL exist and SHALL cover:
- A test route whose `loader` throws `new Response(null, { status: 404 })` → the boundary renders
  `NotFoundPage` (assert the 404 message appears).
- A test route whose `loader` throws `new Response(null, { status: 500 })` → the boundary renders
  `ServerErrorPage` (assert the 500 message appears).
- (Optional) A test route whose `loader` throws a generic `Error('boom')` → the boundary renders
  the generic fallback (assert "Oops" or the translated equivalent appears).

Tests SHALL use `createMemoryRouter` + `RouterProvider` (pattern from
`RequireAuth.test.tsx:62-84`) with a test route that has `errorElement: <RootErrorBoundary />`.
Logger mock via `vi.hoisted`.

**Reason:** The boundary is wired at 8 route sites but has zero tests. D37's wiring of
`ServerErrorPage` for 5xx and delegation of 404 to `NotFoundPage` needs regression coverage.

#### Scenario: ErrorBoundary test passes

- **WHEN** `make test-web` is executed (or `deno task --cwd apps/web test src/components/ErrorBoundary.test.tsx`)
- **THEN** the `ErrorBoundary.test.tsx` suite passes, covering 404 → NotFoundPage and 500 →
  ServerErrorPage rendering via the boundary

### Requirement: Error pages use existing `error.*` i18n keys (no `notFound.*` namespace)

The consolidated error pages SHALL use the existing flat-key i18n convention:
- `NotFoundPage` uses `t('error.404')` for the message and `t('common.goHome')` for the link.
- `ServerErrorPage` uses `t('error.500')` for the message and `t('common.goHome')` for the link.
- `ErrorBoundary` generic fallback uses new `error.boundary.*` keys (e.g.
  `error.boundary.oops`, `error.boundary.reload`) and `t('common.goHome')`.

A `notFound.*` namespace SHALL NOT be introduced — the existing `error.404` key (present in both
`en.json` and `tr.json`) is the canonical 404 message. The D40 plan's proposal of a `notFound.*`
namespace is superseded by this requirement (see design Decision 6).

**Reason:** The locale files are flat-keyed (`error.404`, `recipe.list.title`, etc. — no nested
JSON objects). `ErrorPage.tsx` already uses `error.404`/`error.500`/`error.403`. Introducing a
parallel `notFound.*` namespace would duplicate the existing key and break the convention.

#### Scenario: NotFoundPage uses error.404 key

- **WHEN** the source of `ErrorPage.tsx`'s `NotFoundPage` is inspected
- **THEN** it calls `t('error.404')` for the message (NOT `t('notFound.message')` or similar)

#### Scenario: No notFound.* keys are added to locale files

- **WHEN** `grep -n '"notFound\.' packages/shared/src/i18n/en.json packages/shared/src/i18n/tr.json`
  is run
- **THEN** no matches are returned — the `notFound.*` namespace is not introduced

