## Why

Most BrewForm modules lack structured logging: 33 of 44 targeted source files have zero log calls, the auth middleware silently swallows token failures (the biggest security gap found), rate limit hits produce no audit trail, and no existing tests verify logging behavior anywhere. Production debugging and security auditing require consistent observability across the entire stack.

## What Changes

- Add module-scoped loggers and entry/exit debug logs to **9 API service files** (26 unlogged functions)
- Add error/warn logging on **all 36 error throw sites** before the throw (USER_NOT_FOUND, BEAN_NOT_FOUND, FORBIDDEN, etc.)
- Add mount/unmount debug logs to **27 web page components** via useEffect
- Add structured logging to **4 API middleware**: auth failures (warn/error on invalid tokens, banned users, catch blocks), rate limit hits (warn), CORS blocks (debug), request ID flow (trace)
- Add state-change logging to **5 web context/hook files**: AuthContext (login/logout/refresh/errors), ThemeContext, I18nContext, useDebounce, useUnitSystem, useStaticCacheSync
- Add missing JSDoc docblocks to **5 files** discovered during audit (equipment service, coffee-variety service, rateLimit middleware, requestId middleware, cors middleware)
- Add logging assertions to **21 existing test files** and create **3 new test files** (report service, auth middleware, rate limit middleware)
- All changes are additive — no behavioral modification, no API changes, no database changes

## Capabilities

### New Capabilities

- `api-service-logging`: Structured debug/error/warn logging for all API service functions (entry, exit, guard clause failures, cache interactions)
- `api-middleware-logging`: Structured logging for API middleware (auth decisions, rate limit hits, CORS blocks, request ID generation)
- `web-page-logging`: Mount/unmount lifecycle debug logs and async error catch logging for web page components
- `web-context-hook-logging`: State-change and lifecycle debug/trace logs for React context providers and hooks
- `logging-test-coverage`: Test assertions verifying that logger methods are called at expected points (entry, exit, error paths)

## Impact

- **44 source files modified** (9 API services, 4 middleware, 27 web pages, 5 web contexts/hooks)
- **5 JSDoc-only files modified** (no behavioral change)
- **3 new test files created**, **21 existing test files updated** with logger assertions
- Zero production performance impact (debug/trace logs filtered out at LOG_LEVEL=info via pino)
- Pino's built-in redaction protects passwordHash, token, secret, apiKey, authorization fields
