## Context

BrewForm uses structured logging with a shared interface (`@brewform/shared/logger`) implemented by Pino on the API side and a ConsoleLogger on the web side. The initial logging PR covered infrastructure and auth/recipe paths. However, 33 of 44 targeted source files still have zero log calls. The `TODO_logs.md` file tracks remaining gaps across three priority tiers.

The codebase follows a 3-layer API module pattern (`model.ts` → `service.ts` → `index.ts`) with Hono middleware stack (cors → requestId → rateLimit → cache → error handler → routes). Logging conventions are defined in `AGENTS.md`.

## Goals / Non-Goals

**Goals:**
- Add entry/exit `log.debug` calls to every public service function across all unlogged modules
- Add `log.error`/`log.warn` before every `throw new Error(...)` guard clause
- Add mount/unmount `log.debug` to every web page component via `useEffect`
- Add security-relevant logging to auth middleware (token failures, banned users)
- Add rate limit hit logging (warn level)
- Add missing JSDoc docblocks discovered during audit
- Verify all logging additions with test assertions

**Non-Goals:**
- `performance.now()` timing in service logs (future Phase 10)
- Slow query detection logger (db module)
- HTTP request/response logging module
- Web navigation timing logs
- P3 static pages (Terms, Privacy, Contact, etc.)
- Fixing pre-existing bugs (missing existence check in `deleteAccount`, `data: any` parameters)
- Structural refactoring of service files

## Decisions

### Decision 1: Logger naming convention by file type

| File Type | Logger Name | Variable | Import Path |
|-----------|------------|----------|-------------|
| API service | `'<domain>-service'` (kebab-case) | `log` | `../../utils/logger/index.ts` |
| API middleware | `'<name>-middleware'` (kebab-case) | `log` | `../utils/logger/index.ts` |
| Web page | `'PageName'` (PascalCase component) | `log` | `@/utils/logger.ts` or relative |
| Web context/hook | `'ContextOrHookName'` (PascalCase) | `log` | `@/utils/logger.ts` |

**Rationale:** Matches existing conventions in already-logged files (equipment service uses `'equipment'`, recipe service uses `'recipe-service'`, LoginPage uses `'LoginPage'`). Kebab-case for backend modules, PascalCase for frontend components — consistent with module naming in the codebase.

### Decision 2: Error logging before throw (not wrapping in try/catch)

All error logging is placed **immediately before** the `throw new Error(...)` statement rather than wrapping functions in try/catch blocks. This is because:
- None of the 9 service files currently use try/catch (verified in audit)
- The guard clause pattern (`if (!resource) throw...`) is used universally
- Adding try/catch would change control flow and error propagation behavior
- The existing logged services (equipment, recipe, coffee-variety) use the pre-throw pattern

### Decision 3: Log level selection

| Scenario | Level | Rationale |
|----------|-------|-----------|
| Function entry/exit | `debug` | Routine trace — filtered in production |
| Resource not found | `error` | Unrecoverable for this request |
| Authorization denied | `warn` | Expected in normal operation (users hit boundaries) |
| Content moderation action | `info` | Significant event worth always-on logging |
| Auth token failure | `error`/`warn` | Security-relevant — want visibility even at info level |
| Rate limit exceeded | `warn` | Recoverable but noteworthy |
| Debounce timer cycle | `trace` | Extremely high-frequency, would be noise at debug |
| Unit system read | `trace` | One-line context read, minimal value |

### Decision 4: Log object keys — IDs only, never payloads

Log objects contain only traceable identifiers (userId, id, page, perPage, slug, entityType, entityId) and counts (total, resultCount). Full data payloads are never logged. Pino's built-in redaction (`passwordHash`, `password`, `token`, `secret`, `apiKey`, `authorization`) provides defense-in-depth.

### Decision 5: Test logger assertions via spies/mocks, not log output capture

API tests use `jsr:@std/testing/mock` spies on the logger module. Web tests use Vitest's `vi.hoisted` + `mockLogger` pattern (already established in `RecipeCreatePage.test.tsx` and `RecipeFocusModePage.test.tsx`). This avoids fragile stdout capture and works consistently across Deno and browser test environments.

### Decision 6: JSDoc additions are scope-justified

The audit discovered 5 files with missing or incomplete JSDoc. Since these files are already being touched for logging (or are adjacent), adding docblocks in the same pass avoids duplicate review overhead. The most critical gap — `equipment/service.ts` with zero JSDoc on 9 functions — was discovered during the logging audit.

## Risks / Trade-offs

- **Risk:** Auth middleware logging changes could accidentally alter token flow → **Mitigation:** Log calls are placed around existing logic, never inside it. All `c.json()` returns are unchanged.
- **Risk:** Incorrect web import paths (`@/utils/logger.ts` vs relative paths) → **Mitigation:** Spec provides exact import path per file based on nesting depth. The `@/` alias works universally; relative paths are provided as alternatives.
- **Risk:** Debug log volume in development with `LOG_LEVEL=debug` → **Mitigation:** Debug logs are expected in development. `trace` level used for high-frequency hooks (useDebounce) to keep debug usable.
- **Trade-off:** Adding logger assertions to every existing test increases test maintenance burden → Accepted as necessary for logging coverage; assertions are lightweight (1-2 lines per function) and follow established patterns.

## Open Questions

None. All design decisions are resolved. The implementation spec at `plans/D26-expand-logging-spec.md` provides exact per-file code.
