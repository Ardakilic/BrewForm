## MODIFIED Requirements

### Requirement: Report submission route is rate-limited
The `POST /api/v1/reports` route in `apps/api/src/modules/report/index.ts` SHALL be protected by two named rate-limit policies from `apps/api/src/utils/rate-limit/policies.ts`: `report-ip` (3 requests per 15 minutes per client IP) and `report-user` (3 requests per 15 minutes per authenticated user id).

The `report-ip` limiter SHALL be applied as the first middleware in the POST route's chain (before `describeRoute`, `authMiddleware` and `zValidator`), so that an unauthenticated flood is also throttled. The `report-user` limiter SHALL be applied immediately after `authMiddleware`, so that one account cannot bypass the limit by switching networks. Each policy counts in its own namespace (`report-ip:<ip>`, `report-user:<userId>`), independent of the `global` policy (`apps/api/src/main.ts`), the `contact-ip` policy and every other policy, so the limits do not interfere.

The client IP SHALL be resolved by the shared `getClientIp(c)` helper according to the `TRUST_PROXY` configuration (`none` → TCP peer address; `hops` → right-most `X-Forwarded-For` entry after `TRUST_PROXY_HOPS` trusted hops; `cloudflare` → `CF-Connecting-IP` only when the hop is a Cloudflare edge). It SHALL NOT be the raw `x-forwarded-for` / `x-real-ip` header string. Counters SHALL live in the dedicated rate-limit backend (`RATE_LIMIT_STORE`), not in `CacheProvider`, so `CACHE_ENABLED=false` does not disable them.

The admin `GET /` and `PATCH /:id/resolve` routes on the same report router SHALL NOT be throttled by either report policy. The limiters are applied to the POST route only (NOT via `report.use('*', ...)`), because the admin moderation routes must remain unrestricted for legitimate admin workflows. The `global` policy still applies to them.

```typescript
// Required shape (report/index.ts):
import { rateLimit } from '../../middleware/rateLimit.ts';
import { POLICIES } from '../../utils/rate-limit/policies.ts';

report.post(
  '/',
  rateLimit(POLICIES.reportIp),
  describeRoute({
    tags: ['Reports'],
    summary: 'Create a report',
    description: 'Submits a moderation report against a recipe or comment. Rate-limited to 3 requests per 15 minutes per client IP and per user.',
    security: [{ bearerAuth: [] }],
    requestBody: jsonRequestBody(ReportCreateSchema),
    responses: {
      201: { description: 'Report created', content: { 'application/json': { schema: resolver(successEnvelope(ReportOutputSchema)) } } },
      401: { description: 'Unauthorized', content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } } },
      429: { description: 'Rate limit exceeded (3 requests per 15 minutes)', content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } } },
    },
  }),
  authMiddleware,
  rateLimit(POLICIES.reportUser),
  zValidator('json', ReportCreateSchema, zodValidationHook),
  async (c) => { ... },
);
```

**Note on the 429 envelope:** The runtime 429 body emitted by the rate-limit middleware is `{ success: false, error: { code: 'RATE_LIMITED', message: '...', requestId } }`. `error.requestId` is populated from the request context (the requestId middleware runs before rate limiting in the middleware stack), so the body validates against `ErrorEnvelopeSchema` (`packages/shared/src/schemas/response.ts`). Every 429 also carries `Retry-After` (whole seconds until the window resets), the IETF `RateLimit` / `RateLimit-Policy` items for the evaluated policies, and the legacy `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset` headers for the last evaluated policy. The OpenAPI `429` entry uses `resolver(ErrorEnvelopeSchema)` per the AGENTS.md convention.

#### Scenario: 4th report POST within 15 minutes returns 429

- **WHEN** a client sends 4 `POST /api/v1/reports` requests within a 15-minute window from the same client IP
- **THEN** the first 3 requests are processed by the route handler (returning 201, 400 or 401 per their payloads and auth)
- **AND** the 4th request returns HTTP `429` with `error.code === 'RATE_LIMITED'`, a `Retry-After` header between 1 and 900, and the headers `X-RateLimit-Limit: 3`, `X-RateLimit-Remaining: 0` and `X-RateLimit-Reset` set

#### Scenario: A different IP is unaffected

- **WHEN** one client IP has exhausted its 3-request `report-ip` budget and a second client IP (a different TCP peer, or a different trusted-hop address under `TRUST_PROXY=hops`) sends a `POST /api/v1/reports` within the same 15-minute window
- **THEN** the second IP's request is processed normally (not 429)

#### Scenario: Spoofed forwarding headers do not create new buckets

- **WHEN** `TRUST_PROXY=none` and one TCP peer sends 4 `POST /api/v1/reports` requests, each with a different random `X-Forwarded-For` value
- **THEN** the 4th request returns 429

#### Scenario: One user is limited across IPs

- **WHEN** one authenticated user sends 4 valid `POST /api/v1/reports` requests from 4 different client IPs within 15 minutes
- **THEN** the 4th request returns 429 from the `report-user` policy

#### Scenario: Admin report routes are NOT throttled by the report limiter

- **WHEN** a client sends 4 `GET /api/v1/reports` requests (admin list) within a 15-minute window from the same IP
- **THEN** none of the GET requests return 429 due to `report-ip` or `report-user` (the `global` policy may still apply)
- **AND** the same holds for `PATCH /api/v1/reports/:id/resolve`

#### Scenario: Report limiter is independent of the contact limiter

- **WHEN** a client has exhausted its 3-request budget on `POST /api/v1/contact` (policy `contact-ip`) and then sends a `POST /api/v1/reports` within the same 15-minute window
- **THEN** the report POST is processed normally (the two policy namespaces are independent counters)

#### Scenario: Report limiter keeps working with the cache disabled

- **WHEN** `CACHE_ENABLED=false` and a client sends 4 `POST /api/v1/reports` requests within 15 minutes
- **THEN** the 4th request returns 429

#### Scenario: 429 response is documented in OpenAPI

- **WHEN** the generated `/api/v1/openapi.json` is inspected for `POST /api/v1/reports`
- **THEN** the operation's `responses` map includes a `429` entry with `content.application/json.schema` resolved from `ErrorEnvelopeSchema`

### Requirement: Report route rate-limit test coverage
The API package SHALL contain a route-level test file `apps/api/src/modules/report/index.test.ts` that exercises the rate-limit behaviour on `POST /api/v1/reports`. The test SHALL:

1. Build a test Hono app that mounts the report router behind a requestId middleware (mirroring `apps/api/src/modules/contact/contact.test.ts`).
2. Send unauthenticated POSTs with a `ReportCreateSchema`-shaped body for the `report-ip` cases. No JWT minting or user-row seeding is required, because `report-ip` runs FIRST in the POST route's middleware chain (before `authMiddleware` and `zValidator`), so the 429 fires regardless of body or auth validity.
3. Simulate client IPs through connection info, using the client-IP test helper that passes `{ incoming: { socket: { remoteAddress } } }` as the `app.request()` env. It SHALL NOT use `x-forwarded-for` to obtain fresh buckets.
4. Send 3 POSTs that are processed, then assert that the 4th returns 429 with `Retry-After`.
5. Assert that a second simulated IP is not throttled, and that random `X-Forwarded-For` values from one peer under `TRUST_PROXY=none` do not create new buckets.
6. Cover `report-user` with an authenticated user (signed access token plus a seeded user, DB-backed) sending from different simulated IPs.
7. Assert that `GET /api/v1/reports` (admin list) and/or `PATCH /api/v1/reports/:id/resolve` are NOT throttled by the report policies.
8. Reset limiter state per test with `resetRateLimitBackend()` in `beforeEach` (memory backend). The test SHALL NOT reset the limiter through `setCacheProvider`, because the limiter no longer uses the cache.

#### Scenario: Report rate-limit test passes

- **WHEN** `make test-specific filter=apps/api/src/modules/report/index.test.ts` is executed
- **THEN** the rate-limit test cases pass, including the 4th-POST-returns-429 case, the spoofed-header case, the per-user case and the admin-routes-not-throttled case

#### Scenario: Type-check and lint pass on the new test file

- **WHEN** `make check-api` and `make lint` are invoked
- **THEN** zero errors and zero warnings are reported on `apps/api/src/modules/report/index.test.ts` and `apps/api/src/modules/report/index.ts`
