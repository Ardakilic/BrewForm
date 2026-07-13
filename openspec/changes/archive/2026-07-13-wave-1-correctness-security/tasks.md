## 1. D41 — Add `isNull(deletedAt)` guards to the three primary admin user mutations

- [x] 1.1 Open `apps/api/src/modules/admin/model.ts` and locate `banUser` (L98-102). The current WHERE clause is `eq(users.id, userId)`. Replace with `and(eq(users.id, userId), isNull(users.deletedAt))`. `and` and `isNull` are already imported at L30 — no import changes needed.

  Update the JSDoc above `banUser` (L97) to state the active-row precondition:
  ```typescript
  /** Ban an active (non-deleted) user by setting `isBanned = true`. Returns the updated user, or null if the user is soft-deleted or not found. */
  ```

- [x] 1.2 Locate `unbanUser` (L105-109). Apply the same WHERE-clause change and update the JSDoc:
  ```typescript
  /** Unban an active (non-deleted) user by setting `isBanned = false`. Returns the updated user, or null if the user is soft-deleted or not found. */
  ```

- [x] 1.3 Locate `setUserAdminRole` (L112-115). Apply the same WHERE-clause change and update the JSDoc:
  ```typescript
  /** Set or clear the admin role on an active (non-deleted) user. Returns the updated user, or null if the user is soft-deleted or not found. */
  ```

- [x] 1.4 Run `make check-api` — must pass with zero new errors.

## 2. D41 — Add `isNull(deletedAt)` guards to the three sibling unguarded updates

- [x] 2.1 Locate `updateRecipeVisibility` (L227-235). The current WHERE clause is `eq(recipes.id, recipeId)` (L231-233). Replace with `and(eq(recipes.id, recipeId), isNull(recipes.deletedAt))`. Leave the `isValidVisibility` guard at L228 unchanged.

- [x] 2.2 Locate `updateEquipment` (L271-291). The current WHERE clause is `eq(equipment.id, id)` (L288). Replace with `and(eq(equipment.id, id), isNull(equipment.deletedAt))`.

- [x] 2.3 Locate `updateVendor` (L322-334). The current WHERE clause is `eq(vendors.id, id)` (L332). Replace with `and(eq(vendors.id, id), isNull(vendors.deletedAt))`.

- [x] 2.4 Run `make check-api` — must pass.

## 3. D41 — Fix the `PATCH /users/:id/admin` route's missing try/catch

- [x] 3.1 Open `apps/api/src/modules/admin/index.ts` and locate the `PATCH /users/:id/admin` route (L215-225). The current handler has no try/catch — the service `setUserAdminRole` throws `Error('USER_NOT_FOUND')` on a null model return, which propagates uncaught to the global error handler and becomes a 500. Wrap the handler in a try/catch mirroring the ban/unban route at L159-178:

  ```typescript
  admin.patch(
    '/users/:id/admin',
    describeRoute({ /* see task 4.2 */ }),
    zValidator('json', z.object({ isAdmin: z.boolean() })),
    async (c) => {
      const adminId = c.get('userId') as string;
      const userId = c.req.param('id')!;
      const { isAdmin } = c.req.valid('json');
      try {
        const user = await service.setUserAdminRole(adminId, userId, isAdmin);
        return success(c, user);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message === 'USER_NOT_FOUND') {
          return error(c, 'NOT_FOUND', 'User not found.', 404);
        }
        throw err;
      }
    },
  );
  ```

- [x] 3.2 Run `make check-api` — must pass.

## 4. D41 — Add `describeRoute` metadata to the two touched admin user routes

- [x] 4.1 Add `describeRoute` to the `POST /users/:id/ban` route (L159-178). The current imports in `admin/index.ts` (verified L1-29) are:
  - **Already imported:** `describeRoute` from `hono-openapi` (L3); `AdminBanUserSchema` from `@brewform/shared/schemas` (L7); `success, error, paginated, zodValidationHook` from `../../utils/response/index.ts` (L28).
  - **Must add to existing import on L3:** `resolver` — change `import { describeRoute } from 'hono-openapi';` to `import { describeRoute, resolver } from 'hono-openapi';`.
  - **Must add to the `@brewform/shared/schemas` import block (L6-25):** `ErrorEnvelopeSchema`, `successEnvelope`, `UserRowOutputSchema`. These are all re-exported from `@brewform/shared/schemas` (verified at `packages/shared/src/schemas/index.ts:66`). Add them inside the existing braces.
  - **Must add as a new import line after L28:** `import { jsonRequestBody } from '../../utils/openapi/index.ts';`.

  **Response schema:** Use `UserRowOutputSchema` (NOT `UserOutputSchema` — that name does not exist). `UserRowOutputSchema` is defined at `packages/shared/src/schemas/responses/user.ts:63` as `UserBaseSchema` — the bare `users` row minus `passwordHash`, with `z.string()` for timestamps (matching the JSON-serialised `Date` columns). This is the canonical match for the `db.update(users).returning()` row shape that `success(c, user)` serialises.

  The `describeRoute` metadata:
  ```typescript
  describeRoute({
    tags: ['Admin'],
    summary: 'Ban or unban a user',
    description: 'Sets the banned state of a user. Requires admin role. Returns 404 if the target user is soft-deleted or does not exist.',
    security: [{ bearerAuth: [] }],
    requestBody: jsonRequestBody(AdminBanUserSchema),
    responses: {
      200: { description: 'User updated', content: { 'application/json': { schema: resolver(successEnvelope(UserRowOutputSchema)) } } },
      401: { description: 'Unauthorized', content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } } },
      404: { description: 'User not found (or soft-deleted)', content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } } },
    },
  }),
  ```

  The `Admin` tag is already declared at `apps/api/src/routes/openapi.ts:63` as `{ name: 'Admin', description: 'Privileged admin operations (requires admin role)' }` — no new tag registration needed.

  Keep the existing `zValidator('json', AdminBanUserSchema, zodValidationHook)` as the request validator — do NOT replace it with `hono-openapi`'s validator (ADR-012).

- [x] 4.2 Add the same `describeRoute` metadata to the `PATCH /users/:id/admin` route (the one wrapped in try/catch in task 3.1). The request body schema is `z.object({ isAdmin: z.boolean() })` — pass it through `jsonRequestBody(z.object({ isAdmin: z.boolean() }))`. Use the same `tags: ['Admin']`, `security`, `responses` (200/401/404) as the ban route. The 200 response uses `resolver(successEnvelope(UserRowOutputSchema))` — same schema as the ban route since both return a `users` row.

- [x] 4.3 Run `make check-api` — must pass. Run `make test-specific filter=apps/api/src/routes/openapi.coverage.test.ts` — must pass (admin routes are NOT in the 17 in-scope paths, so adding metadata to them must not break the coverage test; if it does, the metadata is malformed — check the tag is declared and the schemas resolve).

## 5. D41 — Add model tests for `banUser`, `unbanUser`, `setUserAdminRole`

- [x] 5.1 Open `apps/api/src/modules/admin/model.test.ts`. The file already has four `describe` blocks (deleteEquipment, deleteVendor, deleteCoffeeVariety, approveEquipmentDeleteRequest guard). Add a new `describe('banUser', { sanitizeOps: false, sanitizeResources: false }, () => { ... })` block following the inline-fixture pattern. [completed with 3 it cases]

- [x] 5.2 Add a `describe('unbanUser', ...)` block with the same structure. [completed with 2 it cases]

- [x] 5.3 Add a `describe('setUserAdminRole', ...)` block with the same structure. [completed with 3 it cases incl. privilege-escalation-blocked]

- [x] 5.4 (Optional, recommended) Add `describe` blocks for the three siblings (`updateRecipeVisibility`, `updateEquipment`, `updateVendor`) following the same pattern. [completed — all 3 sibling blocks added]

- [x] 5.5 Run `make test-specific filter=apps/api/src/modules/admin/model.test.ts` — all new and pre-existing tests must pass. If a test fails because of a schema column mismatch, consult `packages/db/src/schema.ts` for the required NOT NULL columns without defaults and add them to the fixture.

## 6. D38-p1 — Add rate limit to `POST /api/v1/reports`

- [x] 6.1 Open `apps/api/src/modules/report/index.ts`. Add the import at the top of the file (with the other middleware imports around L11):
  ```typescript
  import { rateLimitMiddleware } from '../../middleware/rateLimit.ts';
  ```

- [x] 6.2 Modify the `POST '/'` route (L19-50) to add `rateLimitMiddleware` as the FIRST middleware in the chain (before `describeRoute`). Also add a `429` entry to the `describeRoute` responses:

  ```typescript
  report.post(
    '/',
    rateLimitMiddleware({ windowMs: 15 * 60_000, maxRequests: 3, keyPrefix: 'report' }),
    describeRoute({
      tags: ['Reports'],
      summary: 'Create a report',
      description: 'Submits a moderation report against a recipe or comment. Rate-limited to 3 requests per 15 minutes per IP.',
      security: [{ bearerAuth: [] }],
      requestBody: jsonRequestBody(ReportCreateSchema),
      responses: {
        201: { description: 'Report created', content: { 'application/json': { schema: resolver(successEnvelope(ReportOutputSchema)) } } },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } } },
        429: { description: 'Rate limit exceeded (3 requests per 15 minutes)', content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } } },
      },
    }),
    authMiddleware,
    zValidator('json', ReportCreateSchema, zodValidationHook),
    async (c) => {
      const userId = c.get('userId') as string;
      const body = c.req.req.valid('json');
      const entityType = body.recipeId ? 'recipe' : 'comment';
      const entityId = (body.recipeId ?? body.commentId)!;
      const result = await service.createReport(userId, entityType, entityId, body.reason);
      return success(c, result, 201);
    },
  );
  ```

  Do NOT add `report.use('*', ...)` — the admin GET/PATCH routes on this router must NOT be throttled by the report-specific limiter (see design Decision 4).

- [x] 6.3 Run `make check-api` — must pass.

## 7. D38-p1 — Add report rate-limit route test

- [x] 7.1 Create `apps/api/src/modules/report/index.test.ts`. [Created with the simplified unauthenticated-POST approach per task 7.2 — the rate-limit middleware runs FIRST in the POST chain, so the 429 fires regardless of body/auth validity.]

- [x] 7.2 (No fallback needed — Pattern B above is the established convention. If, during implementation, the route-level test proves flaky because `service.createReport` errors on the fake recipeId, swap the payload to a minimal one that passes `zValidator` but still triggers the 429 on the 4th call. The rate-limit middleware runs BEFORE `zValidator` and `authMiddleware` in the chain (it is the first middleware on the POST route per task 6.2), so the 429 fires regardless of whether the body or auth is valid — meaning the test could even send unauthenticated POSTs and still hit 429 on the 4th. If that simplifies the test, drop the `authedRequest` helper and send plain POSTs — the limiter keys by IP, not by auth state.) [Used this simplification — unauthenticated POSTs with empty-ish bodies, no JWT minting.]

- [x] 7.3 Run `make test-specific filter=apps/api/src/modules/report/index.test.ts` — must pass. Run `make check-api` and `make lint` on the new file.

## 8. D38-p2 — Create `apps/api/src/utils/sanitize.test.ts`

- [x] 8.1 Create `apps/api/src/utils/sanitize.test.ts` with the pure-utility convention (no `test-setup.ts`, no Hono, no spies):

- [x] 8.2 Add `describe('sanitizeText', () => { ... })` with `it` cases covering: [23 it cases — nullish, script tag stripping, image/anchor/event-handler tags, numeric comparison pass-through, zero-width chars, whitespace collapse, newline handling, trim, plain text/markdown pass-through, and the 3 documented limitations as pass-through cases.]

- [x] 8.3 Add `describe('sanitizeName', () => { ... })` with `it` cases: [5 it cases — newline collapse, whitespace collapse, HTML stripping inherited, nullish, trim.]

- [x] 8.4 Run `make test-specific filter=apps/api/src/utils/sanitize.test.ts` — all cases must pass. Run `make check-api` and `make lint`.

## 9. D38-p3 — Refactor `AuthContext.refreshUser` error handling

- [x] 9.1 Open `apps/web/src/contexts/AuthContext.tsx`. [Added sessionError state + clearSessionError useCallback.]

- [x] 9.2 Update the `AuthContextType` interface (L8-18) to add the two new fields with JSDoc: [Added sessionError + clearSessionError to interface.]

- [x] 9.3 Refactor the `refreshUser` catch block (L42-48) to branch per the spec. [5-branch catch: banned/401/5xx/network/other-4xx; try block sets sessionError null on success.]

- [x] 9.4 Remove the outer `.catch(() => {})` at L55. The mount `useEffect` becomes: `useEffect(() => { refreshUser(); }, [refreshUser]);`

- [x] 9.5 Add `sessionError` and `clearSessionError` to the provider value (L96-110).

- [x] 9.6 Run `make check` (type-checks all workspaces including web) — must pass. Adding `sessionError`/`clearSessionError` to `AuthContextType` is additive — no existing consumer destructures the context exhaustively (all consumers read specific fields like `{ user, isLoading }`), so no consumer updates are needed.

## 10. D38-p3 — Create `SessionRestoreBanner.tsx` and mount in Layout

- [x] 10.1 Create `apps/web/src/components/SessionRestoreBanner.tsx` modeled on `EmailVerificationBanner.tsx`: [Created with var(--error) background, retry + dismiss buttons, network/server copy branching, JSDoc.]

- [x] 10.2 Open `apps/web/src/components/layout/Layout.tsx` and add the import + mount: [Imported SessionRestoreBanner, mounted as sibling to EmailVerificationBanner above Navbar.]

- [x] 10.3 Run `make check` (type-check all workspaces) and `make lint` — must pass.

## 11. D38-p3 — Create `AuthContext.test.tsx`

- [x] 11.1 Create `apps/web/src/contexts/AuthContext.test.tsx` following the `LoginPage.test.tsx` mock skeleton. [TestConsumer component renders user-id/session-error/loading spans.]

- [x] 11.2 Set up the mocks with `vi.hoisted` for the logger and `vi.mock` for the api module (with the stubbed `ApiError` class — copy from `LoginPage.test.tsx:24-29`). Set `userApi.me: vi.fn()` so each test can flip it.

- [x] 11.3 Render via `MemoryRouter > I18nProvider > AuthProvider > <TestConsumer/>` with `waitFor` for `loading` to flip to `false` (or for `session-error` to update).

- [x] 11.4 Add the test cases: [5 cases — 401, 500, network TypeError, banned (403 USER_BANNED), success.]

- [x] 11.5 Run `make test-web` (runs `docker compose run --rm --no-deps app deno task --cwd apps/web test` → `deno run -A npm:vitest run`). All cases must pass with zero regressions in pre-existing web tests. To run a single file while iterating: `deno task --cwd apps/web test src/contexts/AuthContext.test.tsx` (appends the path as a Vitest filter). Note: `make test-specific filter=...` uses `deno test` (the Deno runner) and does NOT work for web tests — web tests use Vitest, so always use `make test-web` for the web suite. [819/819 tests pass, 60/60 files pass.]

## 12. Final verification

- [x] 12.1 Run `make check` — zero type errors across all workspaces (api, web, db, shared). [Clean — 0 errors across all four workspaces.]

- [x] 12.2 Run `make lint` — zero warnings on all changed files: [`Checked 489 files` — 0 errors/warnings.]
  - `apps/api/src/modules/admin/model.ts`
  - `apps/api/src/modules/admin/index.ts`
  - `apps/api/src/modules/admin/model.test.ts`
  - `apps/api/src/modules/report/index.ts`
  - `apps/api/src/modules/report/index.test.ts`
  - `apps/api/src/utils/sanitize.test.ts`
  - `apps/web/src/contexts/AuthContext.tsx`
  - `apps/web/src/contexts/AuthContext.test.tsx`
  - `apps/web/src/components/SessionRestoreBanner.tsx`
  - `apps/web/src/components/layout/Layout.tsx`

- [x] 12.3 Run `make test` — all tests pass, including: [API: 205 passed (1387 steps) / 0 failed; Web: 819 passed / 0 failed.]
  - The new admin model tests (D41).
  - The new report rate-limit test (D38-p1).
  - The new sanitize tests (D38-p2).
  - The new AuthContext tests (D38-p3).
  - The OpenAPI coverage test (`apps/api/src/routes/openapi.coverage.test.ts`) — must still pass (admin routes are not in-scope; the report 429 doc entry must not break any property).
  - Zero regressions in all pre-existing tests.

- [x] 12.4 Update the `Status` banner in `plans/D41-admin-user-mutation-guards.md` and `plans/D38-security-error-hardening.md` to `Resolved (2026-07-05)` and tick the Wave 1 checkboxes in `plans/ROADMAP.md`. Update the `TECHNICAL_DEBT.md` ledger rows for D41 and D38 to `resolved`. [All four files updated — D41/D38 status banners, ROADMAP Wave 1 checkboxes, TECHNICAL_DEBT §1.5/§1.6 + §3.4 follow-up + §4.3 survivor note + Summary table.]

- [x] 12.5 (Optional) Create `pr_description.md` at the project root summarising the three sub-changes, following the D19 PR-description format: `## Problem`, `## Solution` (table of what changed), `## What did NOT change`, `## Testing`, `## Risk`. [Created — overwrote the previous D27 content since D27 is archived.]