## ADDED Requirements

### Requirement: Report submission route is rate-limited

The `POST /api/v1/reports` route in `apps/api/src/modules/report/index.ts` SHALL be protected by a dedicated `rateLimitMiddleware` instance with `windowMs: 15 * 60_000` (15 minutes), `maxRequests: 3`, and `keyPrefix: 'report'`. The middleware SHALL be applied as the first middleware in the POST route's chain (before `describeRoute`, `authMiddleware`, and `zValidator`) so that an unauthenticated flood is also throttled. The `keyPrefix: 'report'` namespaces the counter from the global 100/min limiter (`apps/api/src/main.ts:69`, which uses the default `keyPrefix: 'rate-limit'`) and from the contact module's limiter (`keyPrefix: 'contact'`), so the three limits do not interfere.

The limiter keys by IP (`x-forwarded-for` → `x-real-ip` → `'unknown'`), matching the existing `rateLimitMiddleware` behaviour defined at `apps/api/src/middleware/rateLimit.ts:38-41`. It does NOT key by `userId` even when authenticated — this is the current behaviour of all `rateLimitMiddleware` instances in the codebase and is not changed by this requirement.

The admin `GET /` and `PATCH /:id/resolve` routes on the same report router SHALL NOT be throttled by this limit. The limiter is applied to the POST route only (NOT via `report.use('*', ...)`), because the admin moderation routes must remain unrestricted for legitimate admin workflows.

```typescript
// Required pattern (report/index.ts):
import { rateLimitMiddleware } from '../../middleware/rateLimit.ts';

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
  async (c) => { ... },
);
```

**Note on the 429 envelope:** The runtime 429 body emitted by `rateLimitMiddleware` (`rateLimit.ts:61-67`) is `{ success: false, error: { code: 'RATE_LIMITED', message: '...' } }` and omits `error.requestId`, while `ErrorEnvelopeSchema` (`packages/shared/src/schemas/response.ts:15-25`) requires `requestId: z.string()`. This is a pre-existing inconsistency shared by every 429 in the codebase (contact, auth, global) and is out of scope for this change. The OpenAPI `429` entry uses `resolver(ErrorEnvelopeSchema)` per the AGENTS.md convention, matching the contact module's existing 429 documentation at `contact/index.ts:56-59`.

#### Scenario: 4th report POST within 15 minutes returns 429

- **WHEN** a client sends 4 `POST /api/v1/reports` requests within a 15-minute window from the same IP
- **THEN** the first 3 requests are processed by the route handler (returning 201, 400, or 401 per their payloads/auth)
- **AND** the 4th request returns HTTP `429` with `error.code === 'RATE_LIMITED'` and the `X-RateLimit-Limit: 3`, `X-RateLimit-Remaining: 0`, and `X-RateLimit-Reset` headers set

#### Scenario: A different IP is unaffected

- **WHEN** one IP has exhausted its 3-request budget and a second IP sends a `POST /api/v1/reports` within the same 15-minute window
- **THEN** the second IP's request is processed normally (not 429)

#### Scenario: Admin report routes are NOT throttled by the report limiter

- **WHEN** a client sends 4 `GET /api/v1/reports` requests (admin list) within a 15-minute window from the same IP
- **THEN** none of the GET requests return 429 due to the report-specific limiter (the global 100/min limiter may still apply, but the `keyPrefix: 'report'` limiter does not)
- **AND** the same holds for `PATCH /api/v1/reports/:id/resolve`

#### Scenario: Report limiter is independent of the contact limiter

- **WHEN** a client has exhausted its 3-request budget on `POST /api/v1/contact` (keyPrefix `'contact'`) and then sends a `POST /api/v1/reports` within the same 15-minute window
- **THEN** the report POST is processed normally (the two `keyPrefix` namespaces are independent counters)

#### Scenario: 429 response is documented in OpenAPI

- **WHEN** the generated `/api/v1/openapi.json` is inspected for `POST /api/v1/reports`
- **THEN** the operation's `responses` map includes a `429` entry with `content.application/json.schema` resolved from `ErrorEnvelopeSchema`

### Requirement: Report route rate-limit test coverage

The API package SHALL contain a route-level test file `apps/api/src/modules/report/index.test.ts` that exercises the rate-limit behaviour on `POST /api/v1/reports`. The test SHALL:

1. Build a test Hono app mounting the report router (mirroring `apps/api/src/modules/contact/contact.test.ts:7-11`).
2. Satisfy the `authMiddleware` requirement on the POST route — either by stubbing the auth middleware with a no-op that sets `c.set('userId', 'test-user')`, or by minting a valid JWT. The stub approach is preferred (the rate-limit behaviour is under test, not auth).
3. Send 3 POSTs that are processed, then assert the 4th returns 429.
4. Assert that `GET /api/v1/reports` (admin list) and/or `PATCH /api/v1/reports/:id/resolve` are NOT throttled by the report-specific limiter (a 4th request in the window does not return 429 from the `keyPrefix: 'report'` counter).
5. Use the `InMemoryCacheProvider` (default under `CACHE_DRIVER=memory` / `APP_ENV=test`) so the rate-limit counter is fresh per test. Each `it` SHOULD build its own app to avoid counter leakage between tests, matching the contact test pattern.

The test SHALL mint a real JWT via `signAccessToken` (defined at `apps/api/src/modules/auth/jwt.ts:42-56`, signature `signAccessToken({ id, email, username, isAdmin }): Promise<string>`) — this is the established pattern for authenticated route tests in this codebase, used by `apps/api/src/modules/follow/index_test.ts:64-71` and `apps/api/src/modules/recipe/recipe-filter-deprecation.test.ts:104-114`. Because `authMiddleware` does a DB lookup (returns 401 if the user is not found), the test MUST insert a real user row into the `users` table in `beforeEach`. The cache SHALL be reset per test via `setCacheProvider(new InMemoryCacheProvider())` (pattern from `apps/api/src/middleware/rateLimit.test.ts:11-13`).

A simplification the implementer MAY use: since the rate-limit middleware runs FIRST in the POST route's middleware chain (before `authMiddleware` and `zValidator`), the 429 fires regardless of body/auth validity — so the test could send unauthenticated POSTs with an empty body and still hit 429 on the 4th, removing the need for JWT minting. This is acceptable because the rate-limit behaviour is what is under test, not auth or validation.

#### Scenario: Report rate-limit test passes

- **WHEN** `make test-specific filter=apps/api/src/modules/report/index.test.ts` is executed
- **THEN** the rate-limit test cases pass, including the 4th-POST-returns-429 case and the admin-routes-not-throttled case

#### Scenario: Type-check and lint pass on the new test file

- **WHEN** `make check-api` and `make lint` are invoked
- **THEN** zero errors and zero warnings are reported on `apps/api/src/modules/report/index.test.ts` and `apps/api/src/modules/report/index.ts`