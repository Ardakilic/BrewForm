# logging-test-coverage Specification

## Purpose
TBD - created by archiving change d26-expand-logging. Update Purpose after archive.
## Requirements
### Requirement: API service tests assert entry and exit logging at the expected level

Every API service test that exercises a logged function SHALL assert that the logger was called at the expected level (e.g., `log.debug`, `log.info`) with the expected entry message and relevant identifiers, and that the logger was called at the expected level with the expected completion message on success.

#### Scenario: Test verifies function entry log

- **WHEN** a test calls `getBean("bean-1")` which successfully returns a bean
- **THEN** the test SHALL assert that the logger spy received a call matching the expected log level (e.g., `log.debug({ id: "bean-1" }, 'getBean started')`)

#### Scenario: Test verifies function exit log

- **WHEN** a test calls `getBean("bean-1")` which successfully returns a bean
- **THEN** the test SHALL assert that the logger spy received a call matching the expected log level (e.g., `log.debug({ id: "bean-1" }, 'getBean completed')`)

### Requirement: API service tests assert error logging on failure paths

Every API service test that exercises a failure path SHALL assert that `log.error` or `log.warn` was called with the expected error context before the error was thrown.

#### Scenario: Test verifies not-found error is logged

- **WHEN** a test calls `getBean("nonexistent")` which throws `BEAN_NOT_FOUND`
- **THEN** the test SHALL assert that the logger spy received a call matching `log.error({ id: "nonexistent" }, 'getBean failed: bean not found')`

#### Scenario: Test verifies forbidden error is logged at warn level

- **WHEN** a test calls `updateBean(unauthorizedUserId, id, data)` which throws `FORBIDDEN`
- **THEN** the test SHALL assert that the logger spy received a call matching `log.warn({ id, userId }, ...)` before the throw

### Requirement: Middleware tests assert logging on auth failures

Auth middleware tests SHALL assert that the appropriate log level is used for each failure path: `log.debug` for missing token, `log.error` for token verification exceptions, `log.warn` for user-not-found and banned user.

#### Scenario: Test verifies banned user is logged

- **WHEN** a test calls `authMiddleware` with a valid token for a banned user
- **THEN** the test SHALL assert `log.warn` was called with `{ userId }` and a message containing "banned"
- **AND** the middleware returned a 403 response

#### Scenario: Test verifies token verification failure is logged

- **WHEN** a test calls `authMiddleware` with an invalid token that causes verification to throw
- **THEN** the test SHALL assert `log.error` was called with `{ err }` and a message containing "token verification failed"

### Requirement: Rate limit middleware tests assert warn logging on limit exceeded

Rate limit middleware tests SHALL assert that `log.warn` is called with the client IP and limit value when the rate limit is exceeded.

#### Scenario: Test verifies rate limit exceeded is logged

- **WHEN** a test triggers the rate limit by making requests up to the limit threshold
- **THEN** the test SHALL assert `log.warn` was called with `{ ip: "...", limit: 100 }` and a message containing "rate limit exceeded"
- **AND** the middleware returned a 429 response

### Requirement: Web page tests assert mount and unmount debug logging

Every web page test SHALL assert that the component's mount `useEffect` emitted `log.debug({}, '<PageName> mounted')` and that the unmount cleanup emitted `log.debug({}, '<PageName> unmounted')`.

#### Scenario: Test verifies page mount log

- **WHEN** a test renders `<RecipeEditPage />` within a router context
- **THEN** the test SHALL assert that the mocked `logger.debug` was called with `{}, 'RecipeEditPage mounted'`

#### Scenario: Test verifies page unmount log

- **WHEN** a test unmounts `<RecipeEditPage />`
- **THEN** the test SHALL assert that the mocked `logger.debug` was called with `{}, 'RecipeEditPage unmounted'`

### Requirement: Web test logger mocks follow the vi.hoisted pattern

Web tests that assert on logging SHALL use Vitest's `vi.hoisted` pattern to create a `mockLogger` object with spy methods (`debug`, `info`, `warn`, `error`) and mock the `@/utils/logger.ts` module to return it from `createLogger`.

#### Scenario: Mock logger is hoisted and accessible

- **WHEN** a web test file requires logger assertions
- **THEN** the file SHALL contain:
  ```typescript
  const { mockLogger } = vi.hoisted(() => ({
    mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }));
  vi.mock('@/utils/logger.ts', () => ({ createLogger: () => mockLogger }));
  ```

#### Scenario: Mock logger is cleared between tests

- **WHEN** each test in a test file starts
- **THEN** the test SHALL call `mockLogger.debug.mockClear()` (and similarly for other methods) in `beforeEach` or at the start of each test

### Requirement: API service test logger spying uses std/testing/mock

API service tests that assert on logging SHALL use `spy()` from `jsr:@std/testing/mock` to create call-tracking wrappers and `assertSpyCalls` / `assertSpyCallArgs` to verify log calls.

#### Scenario: Deno spy is used for logger verification

- **WHEN** an API test asserts on logging
- **THEN** the test SHALL import `{ spy, assertSpyCalls } from 'jsr:@std/testing/mock'`
- **AND** verify that `assertSpyCalls(logSpy.debug, 2)` confirms entry and exit were both called

### Requirement: New test files follow existing test patterns

New test files created for this change (report service test, auth middleware test, rate limit middleware test) SHALL follow the established test patterns in the codebase: using `describe`/`it` from `jsr:@std/testing/bdd` with `expect` from `jsr:@std/expect`, importing the real module under test, and using spies for logger assertions.

#### Scenario: Report service test file follows the vendor service test pattern

- **WHEN** `apps/api/src/modules/report/service.test.ts` is created
- **THEN** the file SHALL import `{ describe, it } from 'jsr:@std/testing/bdd'`
- **AND** SHALL import `{ expect } from 'jsr:@std/expect'`
- **AND** SHALL import the real `report/service.ts` module (not a mock)
- **AND** SHALL use `spy()` from `jsr:@std/testing/mock` for logger assertions
- **AND** SHALL follow the same file structure as `vendor/service.test.ts`

#### Scenario: Auth middleware test file follows the API test pattern

- **WHEN** `apps/api/src/middleware/auth.test.ts` is created
- **THEN** the file SHALL use `describe`/`it` blocks grouped by middleware function
- **AND** SHALL create a mock Hono context (`c`) for each test case
- **AND** SHALL set `c.env.JWT_SECRET` and `c.req.header()` for token testing
- **AND** SHALL assert both the response (status code, body) and the logger calls

#### Scenario: Rate limit middleware test file follows the API test pattern

- **WHEN** `apps/api/src/middleware/rateLimit.test.ts` is created
- **THEN** the file SHALL use `describe`/`it` blocks grouped by middleware function (`rateLimitMiddleware` and `authRateLimitMiddleware`)
- **AND** SHALL create a mock Hono context for each test case
- **AND** SHALL test both the under-limit (pass-through) and over-limit (429) scenarios
- **AND** SHALL assert `log.warn` was called with `{ ip, limit }` on rate limit exceeded

### Requirement: Web tests that update existing files must preserve all existing assertions

When adding logger mock setup and logger assertions to existing web test files, every existing test assertion (rendering, user interaction, API call mocking, error state display) SHALL be preserved unchanged. The logger mock and assertions SHALL be purely additive.

#### Scenario: Existing page rendering assertions are preserved

- **WHEN** `LoginPage.test.tsx` is updated to add `vi.hoisted` mockLogger and mount/unmount assertions
- **THEN** all existing assertions (e.g., "renders login form", "calls login API on submit", "displays error on failure") SHALL continue to pass
- **AND** the `vi.mock('@/utils/logger.ts', ...)` call SHALL NOT interfere with existing `vi.mock` calls for other modules

#### Scenario: Existing API mock setup is preserved

- **WHEN** `RecipeVersionsPage.test.tsx` is updated with logger assertions
- **THEN** existing `vi.mock` calls for API client modules SHALL remain in place and functional
- **AND** existing `mockResolvedValue` / `mockRejectedValue` setups SHALL still control API behavior in tests

#### Scenario: Mock logger cleared between tests does not affect other mocks

- **WHEN** `beforeEach` calls `mockLogger.debug.mockClear()` and other spy clear methods
- **THEN** other Vitest mocks (API clients, router, etc.) SHALL NOT be affected by the logger mock clear
- **AND** each test SHALL start with a clean logger spy state without affecting other mocked modules

### Requirement: API tests use describe/it from @std/testing/bdd with expect assertions

All API test files (both newly created and updated) SHALL use the Deno standard library testing framework: `describe` and `it` from `jsr:@std/testing/bdd` for test structure, and `expect` from `jsr:@std/expect` for assertions. API tests SHALL NOT use Vitest, Jest, or any other test framework.

#### Scenario: API test file imports follow the standard pattern

- **WHEN** an API test file is opened (e.g., `user/service.test.ts`, `report/service.test.ts`, `auth.test.ts`)
- **THEN** the file SHALL contain `import { describe, it } from 'jsr:@std/testing/bdd'`
- **AND** SHALL contain `import { expect } from 'jsr:@std/expect'`
- **AND** SHALL NOT contain any Vitest imports (`vi`, `describe` from `vitest`)

#### Scenario: API test assertions use expect matchers

- **WHEN** an API test asserts a value or behavior
- **THEN** the assertion SHALL use the `expect(...).toBe(...)`, `expect(...).toThrow(...)`, or `expect(...).toEqual(...)` pattern from `@std/expect`
- **AND** SHALL NOT use `assert()` or `assertEquals()` from `@std/assert` (the codebase standard is `@std/expect`)

### Requirement: Auth middleware test verifies optionalAuthMiddleware does NOT log errors when no token present

The auth middleware test file SHALL include a test case that verifies `optionalAuthMiddleware` emits only `log.debug` calls (never `log.error` or `log.warn`) when no Authorization header is present, because missing tokens are an expected and valid state for optional authentication.

#### Scenario: optionalAuthMiddleware absent token test asserts only debug logging

- **WHEN** a test calls `optionalAuthMiddleware` with a mock context that has no Authorization header
- **THEN** the test SHALL assert that `log.debug` was called with a message containing "no auth token"
- **AND** the test SHALL assert that `log.error` was NOT called (using `expect(spy.error).not.toHaveBeenCalled()` or equivalent)
- **AND** the test SHALL assert that `log.warn` was NOT called
- **AND** the middleware SHALL call `await next()` to proceed unauthenticated

#### Scenario: optionalAuthMiddleware with invalid token still proceeds without error logs

- **WHEN** a test calls `optionalAuthMiddleware` with an invalid/expired token
- **THEN** the test SHALL assert that `log.debug` was called (not `log.error`)
- **AND** the middleware SHALL call `await next()` to proceed unauthenticated
- **AND** the middleware SHALL NOT return a 401 response

### Requirement: Rate limit test verifies both IP-based and user-ID-based rate limit logging

The rate limit middleware test file SHALL include separate test cases for IP-based rate limiting (`rateLimitMiddleware`) and user-ID-based rate limiting (`authRateLimitMiddleware`), asserting that each emits the correct log context (IP only vs. IP + user ID) when the limit is exceeded.

#### Scenario: IP-based rate limit test verifies warn log with IP and limit

- **WHEN** a test triggers `rateLimitMiddleware` to exceed its limit by making 101 requests from the same IP
- **THEN** the test SHALL assert that `log.warn` was called exactly once
- **AND** the log call SHALL include `{ ip: "<client-ip>", limit: 100 }` in its first argument
- **AND** the log message SHALL contain "rate limit exceeded"
- **AND** the middleware returned a 429 response

#### Scenario: User-ID-based rate limit test verifies warn log with userId, IP, and limit

- **WHEN** a test triggers `authRateLimitMiddleware` to exceed its limit for an authenticated user
- **THEN** the test SHALL assert that `log.warn` was called exactly once
- **AND** the log call SHALL include `{ userId: "<user-id>", ip: "<client-ip>", limit: 100 }` in its first argument
- **AND** the log message SHALL contain "rate limit exceeded"
- **AND** the middleware returned a 429 response

#### Scenario: Rate limit test verifies no log is emitted under the limit

- **WHEN** a test makes requests that stay under the rate limit threshold
- **THEN** the test SHALL assert that `log.warn` was NOT called
- **AND** the middleware SHALL call `await next()` to proceed normally
- **AND** the response SHALL NOT be a 429

### Requirement: Test files run with --no-check flag matching the project test command

All test files (both new and updated) SHALL be compatible with the project's test execution model: `deno test --no-check --allow-all`. Tests SHALL NOT rely on type-checking at test runtime and SHALL use `--allow-all` compatible imports.

#### Scenario: Test files compile and run with make test

- **WHEN** `make test` is executed from the project root
- **THEN** all new and updated test files SHALL execute without compilation errors
- **AND** all test assertions (both pre-existing and newly added) SHALL pass

#### Scenario: Test files are compatible with test-specific filtering

- **WHEN** `make test-specific filter=report/service.test.ts` is executed
- **THEN** only the report service tests SHALL run
- **AND** all report service test assertions SHALL pass

