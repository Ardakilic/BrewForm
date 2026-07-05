# D38 — Security & Error-Handling Hardening (Report Rate Limit, Sanitizer Tests, Auth Refresh)

**Severity:** High
**Status:** Resolved (2026-07-05) — via openspec change `wave-1-correctness-security`
**Relationship:** Extends the hardening line of [`D24-add-request-body-limit.md`](D24-add-request-body-limit.md) (resolved) and the error-surfacing line of [`D17-fix-error-swallowing.md`](D17-fix-error-swallowing.md) (resolved — survivor found and fixed here).

---

## Problem

Three independent hardening gaps, bundled because each is small:

### 1. `POST /api/v1/reports` has no dedicated rate limit (P2, abuse vector)

- `apps/api/src/modules/report/index.ts:19` — `report.post(...)` registers the report-submission route with `describeRoute` and auth, but **no `rateLimitMiddleware`**. Only the global 100 req/min limit (`main.ts`) applies.
- Contrast: the contact form applies a strict per-user limit at `apps/api/src/modules/contact/index.ts:28-33`:
  ```typescript
  contact.use(
    '*',
    rateLimitMiddleware({
      windowMs: 15 * 60_000,
      maxRequests: 3,
    }),
  );
  ```
- An authenticated user can file up to 100 reports/minute — enough to flood the admin moderation queue (reports drive `listReports`/`resolveReport` admin workflows).

### 2. `utils/sanitize.ts` has zero test coverage (P2, XSS-relevant)

- `apps/api/src/utils/sanitize.ts` exists with no `sanitize.test.ts`. This utility is a security control — a regression (e.g. a tag or attribute slipping through) would ship silently.

### 3. Auth refresh errors silently swallowed (P2, D17 survivor)

- `apps/web/src/contexts/AuthContext.tsx:50` — `refreshUser().catch(() => {});` in the mount `useEffect`. If the session-restore call fails for a *non-401* reason (network down, 500), the user is silently treated as logged out with no log and no way for the UI to distinguish "logged out" from "auth backend unreachable".

---

## Proposed Fix

### 1. Rate-limit report submissions

1. Import `rateLimitMiddleware` in `apps/api/src/modules/report/index.ts` and apply it to the POST route only (do **not** throttle any admin/list routes that share the router):
   ```typescript
   report.post(
     '/',
     rateLimitMiddleware({ windowMs: 15 * 60_000, maxRequests: 3 }),
     describeRoute({ ... }),
     ...
   );
   ```
   Mirror the contact pattern (3 per 15 min); since the route requires auth, the limiter keys per user. Tune `maxRequests` to 5 if 3 proves too strict for legitimate moderation-heavy users.
2. Update the route's OpenAPI description to document the 429 response.

### 2. Test the sanitizer

3. Create `apps/api/src/utils/sanitize.test.ts` covering every exported function: script-tag stripping/escaping, event-handler attributes (`onerror=`, `onclick=`), `javascript:` URLs, nested/malformed markup, unicode/entity-encoding bypass attempts, and the pass-through of benign text. Assert both "dangerous input neutralised" and "safe input unchanged".

### 3. Surface auth-refresh failures

4. In `apps/web/src/contexts/AuthContext.tsx`, replace the empty catch at `:50`:
   - Log via the web logger (pattern established by D17/D26): `log.warn({ err }, 'Session restore failed')`.
   - Distinguish expected vs unexpected failures: a 401 (no/expired session) is the normal logged-out path and needs no error state; network/5xx failures set a new `authError: boolean` (or `status: 'error'`) field on the context.
   - Expose `authError` from `useAuth()` so the shell (e.g. `Layout`/banner) can show a "couldn't restore your session — retry" notice. Keep UI wiring minimal: one banner or toast, no redesign.

5. Run `make ci`.

---

## Files to Change

| File | Change |
|------|--------|
| `apps/api/src/modules/report/index.ts` | Add per-user `rateLimitMiddleware` to POST; document 429 |
| `apps/api/src/modules/report/index.test.ts` | **New** (or extend) — rate-limit behaviour tests |
| `apps/api/src/utils/sanitize.test.ts` | **New** — XSS regression suite |
| `apps/web/src/contexts/AuthContext.tsx` | Log + `authError` state instead of empty catch |
| `apps/web/src/contexts/AuthContext.test.tsx` | Extend — refresh-failure cases |
| Banner/Layout component (small) | Render retry notice on `authError` |

---

## Test Plan

- **Report rate limit**: integration test — 3 POSTs succeed (or validate), the 4th returns 429 with the standard error envelope; a different user is unaffected; GET/admin report routes are not throttled. Mirror the contact module's rate-limit test if one exists.
- **Sanitizer**: table-driven cases as in step 3 above; include at least one payload from each OWASP XSS class the util claims to handle.
- **AuthContext**: mock `refreshUser` rejection — (a) 401 → user null, no `authError`, warn logged at most debug; (b) network error → `authError` true, `log.warn` called; (c) success path unchanged.
- `make ci` green.

---

## Acceptance Criteria

- [x] Report POST is limited to 3/15min per IP; 429 uses the standard error envelope and is documented in OpenAPI. (Per-IP keying via `keyPrefix: 'report'`, applied to POST only — admin GET/PATCH routes NOT throttled, per design Decision 4.)
- [x] `utils/sanitize.ts` has a dedicated test file with dangerous-input and benign-input coverage. (`sanitize.test.ts` — 28 cases including the 3 documented limitations as pass-through regression baselines.)
- [x] No empty `.catch(() => {})` remains in `AuthContext.tsx`; refresh failures are logged and unexpected ones surfaced via context state. (5-branch catch: banned/401/5xx/network/other-4xx; `sessionError: 'network' | 'server' | null` + `clearSessionError`; `SessionRestoreBanner` mounted in Layout.)
- [x] `make ci` passes. (`make check`, `make lint`, `make test` all green — 205 API tests / 1387 steps + 819 web tests pass; OpenAPI coverage test green.)

---

## Effort Estimate

**Low–Medium** — ~half a day total: rate limit ~1h, sanitizer tests ~2h, auth-error state ~2h.
