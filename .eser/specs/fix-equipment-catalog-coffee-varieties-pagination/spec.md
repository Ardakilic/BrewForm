# Spec: fix-equipment-catalog-coffee-varieties-pagination

## Status: completed

## Concerns: well-engineered, beautiful-product, open-source

## Discovery Answers

### status_quo

These are confirmed production bugs causing real user pain: (1) Equipment catalog shows items but pagination is hidden because totalPages reads data.total (undefined) instead of data.meta.pagination.total, so totalPages always equals 1 when <=12 items returned. Users can only see the first page. (2) Coffee varieties pagination buttons exist but clicking Next/Previous calls updateFilter which unconditionally deletes the page param after setting it, so navigation silently resets to page 1. Browser also scrolls to top on each click. (3) URL /equipment/catalog is inconsistent with plural naming conventions used elsewhere (/recipes, /setups, /beans).

_-- Arda Kilicdagi_

### ambition

1-star: Fix the three bugs with minimal changes — correct totalPages calculation, fix updateFilter to preserve page param, add preventScrollReset, rename route and links. 10-star: Extract a reusable Pagination component shared across all listing pages, add comprehensive pagination tests for all pages, add pagination URL param validation, and ensure scroll position persistence across all filter changes.

_-- Arda Kilicdagi_

### reversibility

The URL change from /equipment/catalog to /equipments is a one-way door for bookmarked URLs. We should add a redirect from /equipment/catalog to /equipments to preserve existing bookmarks. Other changes (bug fixes) are fully reversible.

_-- Arda Kilicdagi_

### user_impact

Yes — this is a breaking change for anyone with /equipment/catalog bookmarked. The pagination fixes are purely additive (enabling functionality that was broken). Existing users will now be able to navigate through equipment and coffee variety pages properly.

_-- Arda Kilicdagi_

### verification

Unit tests with Vitest + @testing-library/react: (1) EquipmentCatalogPage — mock API with meta.pagination.total/totalPages, assert pagination shows correct totalPages and Next/Previous buttons appear; test clicking Next sets page param correctly. (2) CoffeeVarietiesPage — test clicking Next actually updates page param to 2 (not 1); test setSearchParams is called with preventScrollReset. (3) Navbar test — verify /equipments link is rendered. Run make check-web and make test-specific filter=path/to/test.tsx after changes.

_-- Arda Kilicdagi_

### scope_boundary

This feature should NOT: (1) Extract a reusable Pagination component yet — that is a follow-up refactor. (2) Change backend API behavior — the API already returns correct pagination metadata. (3) Add redirects on the backend — frontend router redirect is sufficient. (4) Modify other pages' pagination (recipes, setups, beans) — they may have similar bugs but are out of scope unless identical patterns exist.

_-- Arda Kilicdagi_

## Test Strategy (well-engineered)

_To be addressed during execution._

## Performance Considerations (well-engineered)

_To be addressed during execution._

## Observability Plan (well-engineered)

_To be addressed during execution._

## Error Handling (well-engineered)

_To be addressed during execution._

## Security & Threat Model (well-engineered)

_To be addressed during execution._

## Developer Ergonomics (well-engineered)

_To be addressed during execution._

## Design States (empty, loading, error, success) (beautiful-product)

_To be addressed during execution._

## Mobile Layout (beautiful-product)

_To be addressed during execution._

## Interaction Design (beautiful-product)

_To be addressed during execution._

## Accessibility (beautiful-product)

_To be addressed during execution._

## Decisions

| # | Decision | Choice | Promoted |
|---|----------|--------|----------|
| 1 | Split spec into separate areas? | Chose to keep as single spec despite multiple areas detected | no |

## Out of Scope

- This feature should NOT: (1) Extract a reusable Pagination component yet — that is a follow-up refactor. (2) Change backend API behavior — the API already returns correct pagination metadata. (3) Add redirects on the backend — frontend router redirect is sufficient. (4) Modify other pages' pagination (recipes, setups, beans) — they may have similar bugs but are out of scope unless identical patterns exist.

## Tasks

- [x] task-1: Fix EquipmentCatalogPage.tsx pagination — read totalPages from data.meta.pagination.totalPages instead of data.total. Files: `apps/web/src/pages/equipment/EquipmentCatalogPage.tsx`.
- [x] task-2: Fix CoffeeVarietiesPage.tsx pagination navigation — update updateFilter to only delete page param when key !== `page`, and pass { preventScrollReset: true } to setSearchParams. Files: `apps/web/src/pages/coffee-varieties/CoffeeVarietiesPage.tsx`.
- [x] task-3: Rename /equipment/catalog to /equipments — update router.tsx route path, Navbar.tsx nav link, EquipmentDetailPage.tsx breadcrumb and back link, and add redirect from old URL. Files: `apps/web/src/router.tsx`, `apps/web/src/components/layout/Navbar.tsx`, `apps/web/src/pages/equipment/EquipmentDetailPage.tsx`.
- [x] task-4: Update EquipmentCatalogPage.test.tsx — fix mock API responses to use meta.pagination structure, add test for clicking Next button that verifies page param is set correctly. Files: `apps/web/src/pages/equipment/EquipmentCatalogPage.test.tsx`.
- [x] task-5: Update CoffeeVarietiesPage.test.tsx — add test for clicking Next button that verifies page param updates to 2 (not 1), add test verifying setSearchParams called with preventScrollReset. Files: `apps/web/src/pages/coffee-varieties/__tests__/CoffeeVarietiesPage.test.tsx`.
- [x] task-6: Update Navbar.test.tsx — verify /equipments link is rendered (update from /equipment/catalog). Files: `apps/web/src/components/layout/Navbar.test.tsx`.
- [x] task-7: Run type-check and tests — `make check-web` and run affected test files.

## Verification

- Unit tests with Vitest + @testing-library/react: (1) EquipmentCatalogPage — mock API with meta.pagination.total/totalPages, assert pagination shows correct totalPages and Next/Previous buttons appear
- test clicking Next sets page param correctly. (2) CoffeeVarietiesPage — test clicking Next actually updates page param to 2 (not 1)
- test setSearchParams is called with preventScrollReset. (3) Navbar test — verify /equipments link is rendered
- Run make check-web and make test-specific filter=path/to/test.tsx after changes.

## Transition History

| From | To | User | Timestamp | Reason |
|------|----|------|-----------|--------|
| IDLE | DISCOVERY | Arda Kilicdagi | 2026-05-27T00:58:55.251Z | - |
