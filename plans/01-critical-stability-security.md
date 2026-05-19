# Plan 01: Critical Stability & Security

**Priority:** 1 (Highest)
**Source:** [Deep Dive Analysis](deep-dive-analysis.md) — Phase 1
**Issues:** C2 (ErrorBoundary), H13 (Security Headers), H12 (Email Verification), H11 (HTTP-only Cookie Auth)
**Effort:** ~10–14 hours
**Impact:** 🛡️ Crash recovery, anti-XSS, anti-bot, 6 missing security headers

---

## C2 — React Error Boundary (White Screen on Crash)

**Background:** Zero `ErrorBoundary` components exist. Any uncaught React render error unmounts the entire tree → blank white screen.

### Tasks
1. Create `apps/web/src/components/ErrorBoundary.tsx` with `useRouteError()` + `isRouteErrorResponse()`
2. Add `ErrorBoundary: RootErrorBoundary` to root route in `apps/web/src/router.tsx`
3. Optionally add per-route boundaries for admin section and RecipeDetailPage

---

## H13 — Missing HTTP Security Headers

**Background:** No CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, or Permissions-Policy set.

### Tasks
1. Import `secureHeaders` from `hono/secure-headers`
2. Add `app.use('*', secureHeaders({...}))` in `apps/api/src/main.ts` after CORS, before rate limit
3. Configure CSP: `default-src 'self'`, `script-src 'self'`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data: https:`, `connect-src 'self'`, `font-src 'self'`
4. Set HSTS: `max-age=63072000; includeSubDomains; preload`

---

## H12 — No Email Verification Flow

**Background:** Anyone can register with any email. No `emailVerified` column, no verify endpoint.

### Tasks
1. **DB:** Add `emailVerifiedAt TIMESTAMP` to `users` table
2. **DB:** Create `emailVerificationTokens` table: `id, userId (FK), token, expiresAt, createdAt`
3. **Schema:** Update `packages/db/src/schema.ts`, run `make db-generate && make db-migrate`
4. **API:** Create `POST /api/v1/auth/send-verification` — generates token, emails verification link
5. **API:** Create `POST /api/v1/auth/verify-email` — validates token, sets `emailVerifiedAt`
6. **API:** Modify registration to gate token issuance behind email verification
7. **FE:** Add "Please verify your email" banner for unverified users
8. **FE:** Add `/verify-email?token=xxx` route

---

## H11 — JWT Tokens in localStorage (XSS-Vulnerable)

**Background:** Tokens stored in `localStorage` — accessible to any JS on the page. Should be HTTP-only cookies.

### Tasks
1. **API:** Change login/register to use `setCookie()` from `hono/cookie` with `httpOnly, secure, sameSite: 'Strict'`
2. **API:** Update auth middleware to read token from cookies via `getCookie(c, 'access_token')`
3. **FE:** Remove all `localStorage` token storage from `apps/web/src/api/client.ts`
4. **FE:** Add `credentials: 'include'` to fetch calls if cross-origin
5. **CSRF:** Add `X-Requested-With: XMLHttpRequest` header check for extra safety

---

## Dependencies

- H12 (Email Verification) depends on DB migration tooling and email template system
- H11 (Cookie Auth) requires coordinated backend + frontend changes — deploy API first
- C2 and H13 are independent and can run in parallel
