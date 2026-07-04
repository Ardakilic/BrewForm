# D37 — Consolidate Error Pages / Remove Dead ErrorPage Exports

**Severity:** Low
**Status:** Open (2026-07-04)
**Relationship:** Gives `TECHNICAL_DEBT.md` §4.2 and §6.5 their dedicated plan.

---

## Problem

Two files export overlapping error-page components, and one of them is entirely dead code:

- `apps/web/src/pages/ErrorPage.tsx` exports `ErrorPage` (`:10`), `NotFoundPage` (`:25`), `ServerErrorPage` (`:36`), and `ForbiddenPage` (`:47`).
- `apps/web/src/pages/NotFoundPage.tsx` exports its own `NotFoundPage`.
- `apps/web/src/router.tsx:7` imports `NotFoundPage` **only from `NotFoundPage.tsx`** (used for the `*` catch-all at `router.tsx:238`). Nothing imports from `ErrorPage.tsx`.

Consequences:

- Two components named `NotFoundPage` with different markup — developer confusion about which is canonical.
- `ServerErrorPage` and `ForbiddenPage` exist but are never rendered: 500s surface via `components/ErrorBoundary.tsx` and 403s have no dedicated page, so the polished error views are wasted.
- Dead code shows up in coverage/docblock inventories and invites accidental divergence.

---

## Proposed Fix

Consolidate to a single error-page module and decide the fate of the unused variants — **wire them up or delete them**:

1. **Pick the canonical module**: keep `ErrorPage.tsx` as the single source (it already has the generic `ErrorPage({ statusCode, message, illustration })` base the specific pages compose).
2. **Merge NotFoundPage**: diff the two `NotFoundPage` implementations; port anything the routed one (`NotFoundPage.tsx`) has that `ErrorPage.tsx`'s variant lacks (i18n keys, SEO/meta handling, layout wrapper) into `ErrorPage.tsx`'s version. Delete `pages/NotFoundPage.tsx` and update `router.tsx:7` to import from `./pages/ErrorPage.tsx`.
3. **Wire or delete `ServerErrorPage` / `ForbiddenPage`**:
   - *Wire (preferred)*: render `ServerErrorPage` from `components/ErrorBoundary.tsx` / the router `errorElement` when the caught error is a 5xx (react-router `isRouteErrorResponse`), and `ForbiddenPage` for 403 loader/route errors (e.g. non-admin hitting `/admin` via `RequireAuth`).
   - *Delete*: if wiring is deemed out of scope, delete both exports so the module only ships what renders.
   Record the choice in this plan when implementing.
4. **i18n**: the surviving error pages must use `t()` (coordinate with D40 — NotFoundPage is currently in its zero-`t()` list).
5. Run `make ci` and the web tests.

---

## Files to Change

| File | Change |
|------|--------|
| `apps/web/src/pages/ErrorPage.tsx` | Canonical module; merged `NotFoundPage`; wired or deleted `ServerErrorPage`/`ForbiddenPage` |
| `apps/web/src/pages/NotFoundPage.tsx` | **Delete** |
| `apps/web/src/router.tsx` | Import `NotFoundPage` from `ErrorPage.tsx`; add `errorElement` wiring if the "wire" option is chosen |
| `apps/web/src/components/ErrorBoundary.tsx` | Render `ServerErrorPage` for 5xx (wire option) |

---

## Test Plan

- Component tests for the consolidated module: `NotFoundPage` renders 404 copy + home link; `ServerErrorPage`/`ForbiddenPage` render their status codes (if kept).
- Router test / manual check: navigating to an unknown path renders the 404 page.
- If wired: throw a 500 from a test route/loader and assert `ServerErrorPage` renders via the error boundary; assert 403 path renders `ForbiddenPage`.
- Grep gate: `grep -rn "from './pages/NotFoundPage" apps/web/src` returns nothing; only one `NotFoundPage` definition exists in the codebase.

---

## Acceptance Criteria

- [ ] Exactly one module defines error pages; exactly one `NotFoundPage` exists.
- [ ] Every export of that module is reachable from the router or error boundary (no dead exports).
- [ ] 404 behaviour unchanged for users.
- [ ] `make ci` passes.

---

## Effort Estimate

**Low** — 1–3 hours. Delete-only path is trivial; the wire path adds ~2 hours for error-boundary integration and tests.
