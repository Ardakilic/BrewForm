# Logging

BrewForm uses structured logging in both the API (Node/Hono) and the web app (React/Vite), with a
shared Logger interface for consistency.

## Architecture

- **Shared interface**: `@brewform/shared/logger` defines the `Logger`, `ChildLogger` and
  `CreateLogger` types.
- **API implementation**: pino (`apps/api/src/utils/logger/index.ts`), structured JSON.
- **Web implementation**: console-based (`apps/web/src/utils/logger.ts`), filtered by level.

## API Logger (pino)

```typescript
import { createLogger } from './utils/logger/index.ts';
const log = createLogger('module-name'); // child logger tagged { module: 'module-name' }
log.debug({ userId, recipeId }, 'updateRecipe started');
log.error({ err, recipeId }, 'updateRecipe failed');
```

Configuration (API env vars):

| Variable | Default | Description |
| --- | --- | --- |
| `LOG_LEVEL` | `info` | Minimum level: `trace`, `debug`, `info`, `warn`, `error`, `fatal` or `silent` |
| `LOG_FORMAT` | `json` | `json` or `pretty` (`pino-pretty`, for local development) |

The dev compose file sets `LOG_LEVEL=debug`.

**Redaction is a safety net, not a licence.** The root logger redacts `*.password`,
`*.passwordHash`, `*.token`, `*.secret`, `*.apiKey` and `*.authorization`. These paths only match
keys one level inside the log object (`{ user: { password } }`), not top-level keys
(`{ password }`), so never put such values in a log call at all.

**Database errors**: log them as `log.error({ err: toLoggableError(err), … })`
(`apps/api/src/utils/errors.ts`). Drizzle error messages carry the query parameters, which can
include user data; `toLoggableError` keeps the error name, the message without the parameters, the
stack, the SQLSTATE, the constraint and table names and the placeholder-only SQL.

## Web Logger (console)

```typescript
import { createLogger } from '@/utils/logger.ts';
const log = createLogger('PageName');
```

`VITE_LOG_LEVEL` (build-time, default `info`) sets the minimum level. The web API client already
logs failed requests, so callers propagate errors instead of logging them again.

## Rules

These are the AGENTS.md logging rules; every new codepath includes structured logging.

- Create one module-scoped logger at the top of the file.
- **API services**: a `debug` log on entry and exit of every public function, with traceable ids
  (`log.debug({ userId, recipeId }, 'functionName started')` / `'functionName completed'`).
- **Web pages**: `debug` logs on mount and unmount (`'PageName mounted'` / `'PageName unmounted'`).
  Data loading lives in route loaders, actions and fetcher resource routes, so a page's
  data-loading failure is logged there with `log.error({ err }, '<PageName> <actionName> failed')`
  before the loader rethrows or the action returns `{ ok: false, error }`.
- **Error logs include the `err` object**: `log.error({ err, ...context }, 'what failed')`.
- **Ids, not payloads**: include the ids needed to trace the event; never request bodies, note text
  or other content.
- **Never log** passwords, tokens, secrets, API keys, or PII: no email addresses and no IP
  addresses.
- Email-send errors go through `toLoggableMailError` (`apps/api/src/utils/errors.ts`): nodemailer
  puts recipient addresses in the error's message, `response`, `rejected` and
  `rejectedErrors[].recipient`, so only the name, `code`, `command`, `responseCode` and stack frames
  are logged.
- Catches that can see a database error log `err: toLoggableError(err)`;
  `apps/api/src/utils/db-error-logging.enforcement.test.ts` pins the files.

| Level | When to use |
| --- | --- |
| `trace` | Very detailed debugging (development only) |
| `debug` | Function entry/exit, state transitions |
| `info` | Significant events (startup, connections, readiness transitions) |
| `warn` | Recoverable issues (rate limit hits, retries, degraded cache) |
| `error` | Operation failures (DB errors, failed side effects) |
| `fatal` | Unrecoverable errors |

### Rate limiting and client addresses

Rate-limit keys and request logs never contain raw IPs or emails:

- Email-keyed rate-limit policies (login failures per account, forgot-password per account) key on
  the first 32 hex characters of the SHA-256 of the normalised email (`emailKey` in
  `apps/api/src/middleware/rateLimit.ts`), never the address itself.
- IP-keyed policies use the normalised client address (an IPv6 address by its /64 prefix) as the
  store key. Store keys are never logged.
- The "rate limit exceeded" warn log (`rateLimitMiddleware rate limit exceeded`, logger
  `rate-limit-middleware`) carries only `policy`, `limit` and, when signed in, `userId`.
- The registration-disabled warn log carries no address.

## Request Tracing

- The API's `requestIdMiddleware` (`hono/request-id`, header `X-Request-ID`) reuses a valid incoming
  `X-Request-ID` (at most 255 characters of `[A-Za-z0-9_=-]`) or generates a UUID, stores it as
  `c.get('requestId')` and echoes it in the `X-Request-ID` response header.
- The web app generates one id per page load (`apps/web/src/utils/sessionId.ts`,
  `crypto.randomUUID()`), and the API client (`apps/web/src/api/client.ts`) sends it as
  `X-Request-ID` on every request, so one browser session's requests share an id.
- Response envelopes carry `requestId` (`meta.requestId` on success, `error.requestId` on errors),
  and the error handler includes `requestId` in its logs, so a user-reported error can be matched
  to the server log line.

## Tests

API tests import `apps/api/src/test-setup.ts` first, which sets `LOG_LEVEL=silent`, so test output
carries no log noise. Assert on logging with spies on the module logger
(`vi.spyOn(log, 'warn')`) rather than by reading output. With `APP_ENV=test`, emails are skipped
and log one `delivery: 'skipped'` line each.
