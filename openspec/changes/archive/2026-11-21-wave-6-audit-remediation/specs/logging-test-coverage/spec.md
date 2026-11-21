## RENAMED Requirements

- FROM: `### Requirement: API service test logger spying uses std/testing/mock`
- TO: `### Requirement: API service test logger spying uses Vitest spies`

- FROM: `### Requirement: API tests use describe/it from @std/testing/bdd with expect assertions`
- TO: `### Requirement: API tests use describe/it/expect from vitest`

- FROM: `### Requirement: Test files run with --no-check flag matching the project test command`
- TO: `### Requirement: Test files run without type-checking under the Vitest runner`

## MODIFIED Requirements

### Requirement: API service test logger spying uses Vitest spies
API service tests that assert on logging SHALL spy on the module logger with `vi.spyOn(log, '<level>')` (or inject a `vi.fn()` logger double) and verify calls with `expect(spy).toHaveBeenCalledTimes(n)` / `toHaveBeenCalledWith(...)`, restoring spies in `afterEach` (`vi.restoreAllMocks()`).

#### Scenario: Vitest spy is used for logger verification
- **WHEN** an API test asserts on logging
- **THEN** it imports `{ vi }` from `vitest` and spies on the logger's level methods (as `apps/api/src/modules/report/service.test.ts` does)
- **AND** `expect(debugSpy).toHaveBeenCalledTimes(2)` confirms that entry and exit were both logged

### Requirement: New test files follow existing test patterns

New test files created for this change (report service test, auth middleware test, rate limit middleware test) SHALL follow the established test patterns in the codebase: using `describe`/`it`/`expect` from `vitest`, importing the real module under test, and using `vi.spyOn` spies for logger assertions.

#### Scenario: Report service test file follows the vendor service test pattern

- **WHEN** `apps/api/src/modules/report/service.test.ts` is created
- **THEN** the file SHALL import `{ describe, expect, it, vi } from 'vitest'`
- **AND** SHALL import the real `report/service.ts` module (not a mock)
- **AND** SHALL use `vi.spyOn` on the module logger for logger assertions
- **AND** SHALL follow the same file structure as `vendor/service.test.ts`

#### Scenario: Auth middleware test file follows the API test pattern

- **WHEN** `apps/api/src/middleware/auth.test.ts` is created
- **THEN** the file SHALL use `describe`/`it` blocks grouped by middleware function
- **AND** SHALL create a mock Hono context (`c`) for each test case
- **AND** SHALL set `c.env.JWT_SECRET` and `c.req.header()` for token testing
- **AND** SHALL assert both the response (status code, body) and the logger calls

#### Scenario: Rate limit middleware test file follows the API test pattern

- **WHEN** `apps/api/src/middleware/rateLimit.test.ts` is created
- **THEN** the file SHALL use `describe`/`it` blocks grouped by middleware factory (`rateLimit` and `rateLimitFailures`, as defined by the `api-rate-limiting` capability)
- **AND** SHALL exercise each case through a Hono app request whose client address comes from connection info (`peerEnv()`), resetting the limiter backend between cases
- **AND** SHALL test both the under-limit (pass-through) and over-limit (429) scenarios
- **AND** SHALL assert `log.warn` was called with `{ policy, limit }` (or `{ policy, limit, userId }` for user-keyed policies) on rate limit exceeded

### Requirement: API tests use describe/it/expect from vitest
All API test files (both newly created and updated) SHALL use Vitest: `describe`, `it`, `expect` and, where needed, `vi`, `beforeEach`, `afterEach`, `beforeAll` and `afterAll` imported from `vitest`, and no other test framework or assertion library.

#### Scenario: API test file imports follow the standard pattern
- **WHEN** an API test file is opened (e.g., `user/service.test.ts`, `report/service.test.ts`, `middleware/auth.test.ts`)
- **THEN** it imports its test API from `vitest`
- **AND** it imports nothing from Jest, `node:test`, or a previous runtime's standard-library test modules

#### Scenario: API test assertions use expect matchers
- **WHEN** an API test asserts a value or behaviour
- **THEN** the assertion uses Vitest `expect(...)` matchers such as `toBe`, `toEqual` or `toThrow`
- **AND** it does not use `node:assert`

### Requirement: Test files run without type-checking under the Vitest runner
All test files (both new and updated) SHALL be compatible with the project's test execution model: each workspace's `test` script runs `vitest run`, which transpiles without type-checking, and type-checking is a separate gate (`pnpm run check`, `make check`, `make check-tests`). Tests SHALL NOT depend on type-checking at test time.

#### Scenario: Test files compile and run with make test
- **WHEN** `make test` is executed from the project root
- **THEN** all new and updated test files execute without transpilation errors
- **AND** all test assertions (both pre-existing and newly added) pass

#### Scenario: Test files are compatible with test-specific filtering
- **WHEN** `make test-specific filter=report/service.test.ts` is executed
- **THEN** only the report service tests run
- **AND** all report service test assertions pass

### Requirement: Rate limit test verifies both IP-based and user-ID-based rate limit logging

The rate limit middleware test file SHALL include separate test cases for an IP-keyed policy (for example `rateLimit(POLICIES.global)`) and a user-keyed policy (for example `rateLimit(POLICIES.commentUser)` mounted after `authMiddleware`), asserting that each emits the correct log context (`{ policy, limit }` vs. `{ policy, limit, userId }`) when the limit is exceeded. The former `rateLimitMiddleware` and `authRateLimitMiddleware` factories no longer exist (see the `api-rate-limiting` capability); only the log message string `rateLimitMiddleware rate limit exceeded` is kept.

#### Scenario: IP-based rate limit test verifies warn log with policy and limit

- **WHEN** a test sends 101 requests from one simulated peer (`peerEnv(ip)`) to a route guarded by `rateLimit(POLICIES.global)` with the default limit of 100
- **THEN** the test SHALL assert that `log.warn` was called exactly once
- **AND** the log call SHALL include `{ policy: 'global', limit: 100 }` in its first argument and no IP, email or key field
- **AND** the log message SHALL contain "rate limit exceeded"
- **AND** the middleware returned a 429 response

#### Scenario: User-ID-based rate limit test verifies warn log with userId, policy and limit

- **WHEN** a test exceeds `rateLimit(POLICIES.commentUser)` for an authenticated user
- **THEN** the test SHALL assert that `log.warn` was called exactly once
- **AND** the log call SHALL include `{ policy: 'comment-user', limit: 5, userId: "<user-id>" }` in its first argument
- **AND** the log message SHALL contain "rate limit exceeded"
- **AND** the middleware returned a 429 response

#### Scenario: Rate limit test verifies no log is emitted under the limit

- **WHEN** a test makes requests that stay under the rate limit threshold
- **THEN** the test SHALL assert that `log.warn` was NOT called
- **AND** the middleware SHALL call `await next()` to proceed normally
- **AND** the response SHALL NOT be a 429
