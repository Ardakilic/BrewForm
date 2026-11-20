## MODIFIED Requirements

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

- **WHEN** `make test-web` is executed (or `pnpm --filter @brewform/web exec vitest run src/components/ErrorBoundary.test.tsx`)
- **THEN** the `ErrorBoundary.test.tsx` suite passes, covering 404 → NotFoundPage and 500 →
  ServerErrorPage rendering via the boundary
