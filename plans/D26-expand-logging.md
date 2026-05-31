# D26 — Expand Structured Logging Coverage

**Severity:** Low  
**Status:** Open  
**File:** `TODO_logs.md`

---

## Issue Description

The initial logging PR covered infrastructure and key auth paths, but many modules still lack structured logging. The `TODO_logs.md` file tracks all remaining gaps across three priority tiers:

- **P1 (6 services, 7 pages, 2 providers, 1 component):** Data mutations, auth, external calls
- **P2 (3 services, 4 middleware, 14 admin pages, 12 user pages, 2 providers, 2 hooks):** Admin operations, secondary pages
- **P3 (7 pages, 2 components):** Static pages, read-only pass-through

---

## Impact

- **Reduced observability:** Production debugging is harder without entry/exit logs in key services.
- **No audit trail:** Data mutations (create/update/delete) in user, vendor, bean, setup, report, coffee-variety modules are unlogged.
- **Inconsistent debugging:** Some modules have logging, others don't — makes correlation across requests difficult.

---

## Root Cause

Logging was added incrementally. The initial PR covered auth and recipe modules (highest traffic). Remaining modules were deferred to a follow-up that never landed.

---

## Affected Files

### P1 — API Services (High Priority)

| Module | File |
|--------|------|
| user | `apps/api/src/modules/user/service.ts` |
| vendor | `apps/api/src/modules/vendor/service.ts` |
| bean | `apps/api/src/modules/bean/service.ts` |
| setup | `apps/api/src/modules/setup/service.ts` |
| report | `apps/api/src/modules/report/service.ts` |
| coffee-variety | `apps/api/src/modules/coffee-variety/service.ts` |

### P1 — Web Pages

| Page | File |
|------|------|
| Create Recipe | `apps/web/src/pages/recipes/RecipeCreatePage.tsx` |
| Edit Recipe | `apps/web/src/pages/recipes/RecipeEditPage.tsx` |
| Forgot Password | `apps/web/src/pages/auth/ForgotPasswordPage.tsx` |
| Reset Password | `apps/web/src/pages/auth/ResetPasswordPage.tsx` |
| Verify Email | `apps/web/src/pages/auth/VerifyEmailPage.tsx` |
| Settings | `apps/web/src/pages/settings/SettingsPage.tsx` |

### P1 — Context Providers

| Provider | File |
|----------|------|
| AuthContext | `apps/web/src/contexts/AuthContext.tsx` |

### P1 — Components

| Component | File |
|-----------|------|
| ErrorBoundary | `apps/web/src/components/ErrorBoundary.tsx` |

### P2 — API Services

| Module | File |
|--------|------|
| preference | `apps/api/src/modules/preference/service.ts` |
| taste | `apps/api/src/modules/taste/service.ts` |
| qrcode | `apps/api/src/modules/qrcode/service.ts` |

### P2 — API Middleware

| Middleware | File |
|------------|------|
| auth | `apps/api/src/middleware/auth.ts` |
| cors | `apps/api/src/middleware/cors.ts` |
| rateLimit | `apps/api/src/middleware/rateLimit.ts` |
| requestId | `apps/api/src/middleware/requestId.ts` |

### P2 — Web Pages (Admin + User-facing)

See `TODO_logs.md` for the full list (26 pages).

### P2 — Context Providers & Hooks

| Provider/Hook | File |
|---------------|------|
| ThemeContext | `apps/web/src/contexts/ThemeContext.tsx` |
| I18nContext | `apps/web/src/contexts/I18nContext.tsx` |
| useDebounce | `apps/web/src/hooks/useDebounce.ts` |
| useUnitSystem | `apps/web/src/hooks/useUnitSystem.ts` |

---

## Existing Pattern (Reference)

### API Service Pattern

```typescript
import { createLogger } from '../../utils/logger/index.ts';

const log = createLogger('module-name');

export async function function(userId: string, ...) {
  log.debug({ userId }, 'functionName started');
  // ... business logic ...
  log.debug({ userId }, 'functionName completed');
}
```

### Web Page Pattern

```typescript
import { createLogger } from '@/utils/logger.ts';

const log = createLogger('PageName');

useEffect(() => {
  log.debug({}, 'PageName mounted');
  return () => { log.debug({}, 'PageName unmounted'); };
}, []);
```

---

## Fix Approach

Follow the logging conventions defined in `AGENTS.md`:

### API Services (P1 & P2)

For each service function:
1. Create module-scoped logger at top of file: `const log = createLogger('module-name');`
2. Add entry log: `log.debug({ userId, ...ids }, 'functionName started');`
3. Add exit log: `log.debug({ userId, ...ids }, 'functionName completed');`
4. Add error log: `log.error({ err, ...ids }, 'functionName failed');`

### Web Pages (P1 & P2)

For each page component:
1. Create page-scoped logger: `const log = createLogger('PageName');`
2. Add mount/unmount logs via `useEffect`.

### Middleware (P2)

For each middleware:
1. Add request-level logging (trace/debug) for auth decisions, CORS blocks, rate limit hits.

---

## Implementation Steps

### Phase 1: P1 Services (Highest Impact)

1. **Read** `apps/api/src/modules/user/service.ts` — add entry/exit/debug logs to all public functions.
2. **Repeat** for `vendor/service.ts`, `bean/service.ts`, `setup/service.ts`, `report/service.ts`, `coffee-variety/service.ts`.
3. **Read** P1 web pages — add mount/unmount logs.

### Phase 2: P1 Context & Components

4. **Add** logging to `AuthContext.tsx` (login state changes, token refresh, errors).
5. **Add** logging to `ErrorBoundary.tsx` (catch render errors, log stack traces).

### Phase 3: P2 Services & Middleware

6. **Add** logging to `preference/service.ts`, `taste/service.ts`, `qrcode/service.ts`.
7. **Add** logging to middleware: `auth.ts`, `cors.ts`, `rateLimit.ts`, `requestId.ts`.

### Phase 4: P2 Pages

8. **Add** mount/unmount logs to all admin pages (14 pages).
9. **Add** mount/unmount logs to all user-facing pages (12 pages).

### Phase 5: P2 Context & Hooks

10. **Add** logging to `ThemeContext.tsx`, `I18nContext.tsx`.
11. **Add** logging to `useDebounce.ts`, `useUnitSystem.ts`.

### Phase 6: Cross-Cutting (Optional)

12. **Add** `performance.now()` timing to service entry/exit logs.
13. **Standardize** log object keys: always `userId`, `recipeId`, `equipmentId` (camelCase).

---

## Testing Strategy

| Test | Expected |
|------|----------|
| `make lint` | No lint errors from logging additions |
| `make check` | Type-check passes |
| `make test` | All tests pass |
| Manual: trigger each service function | Logs appear in structured JSON format |
| Manual: mount/unmount pages | Debug logs appear in console |

---

## Risk Assessment

**Risk: Low**

- Additive changes only — no behavior modification.
- Logging is behind log level filters (debug/trace).
- No performance impact in production (debug logs filtered out).
- Can be done incrementally per module.

---

## Dependencies

- Existing logger infrastructure (`createLogger` from API and web).
- `TODO_logs.md` is the source of truth for remaining gaps.
