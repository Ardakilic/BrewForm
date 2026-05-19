# Plan 01: Critical Stability & Security

**Priority:** 1 (Highest)
**Source:** [Deep Dive Analysis](deep-dive-analysis.md) — Phase 1
**Issues:** C2 (ErrorBoundary), H13 (Security Headers), H12 (Email Verification), H11 (HTTP-only Cookie Auth)
**Effort:** ~10–14 hours
**Impact:** 🛡️ Crash recovery, anti-XSS, anti-bot, 6 missing security headers

---

## C2 — No React Error Boundary (White Screen on Crash) ✅ CONFIRMED

**Evidence:**
- Search for `ErrorBoundary` across all `apps/web/src/` — **zero results**
- [`apps/web/src/App.tsx:7-17`](apps/web/src/App.tsx) — `RouterProvider` is wrapped in `ThemeProvider > I18nProvider > AuthProvider`. No `ErrorBoundary` wrapper.
- [`apps/web/src/router.tsx:42-151`](apps/web/src/router.tsx) — 30+ route definitions, none have `errorElement` or `ErrorBoundary` set.

**Impact:** Any uncaught React render error unmounts the entire tree → user sees blank white screen → must manually refresh. No recovery path.

**Context7 Note (React Router v7):** Set `ErrorBoundary` on root route. Use `useRouteError()` + `isRouteErrorResponse()`. All thrown errors (components, loaders, actions) propagate to a single boundary.

**Action Plan:**
- [ ] 1. Create `apps/web/src/components/ErrorBoundary.tsx`:
   ```tsx
   import { useRouteError, isRouteErrorResponse } from 'react-router';

   export function RootErrorBoundary() {
     const error = useRouteError();

     if (isRouteErrorResponse(error)) {
       return (
         <div className='flex flex-col items-center justify-center min-h-[60vh] p-8'>
           <h1 className='text-2xl font-bold mb-4'>{error.status} {error.statusText}</h1>
           <p className='text-[var(--text-secondary)] mb-6'>{error.data}</p>
           <button onClick={() => window.location.reload()} className='btn-primary'>
             Try Again
           </button>
         </div>
       );
     }

     if (error instanceof Error) {
       return (
         <div className='flex flex-col items-center justify-center min-h-[60vh] p-8'>
           <h1 className='text-2xl font-bold mb-4'>Something went wrong</h1>
           <p className='text-[var(--text-secondary)] mb-6'>{error.message}</p>
           <button onClick={() => window.location.reload()} className='btn-primary'>
             Try Again
           </button>
         </div>
       );
     }

     return <h1>Unknown Error</h1>;
   }
   ```
- [ ] 2. Add to root route in `apps/web/src/router.tsx`:
   ```tsx
   {
     path: '/',
     ErrorBoundary: RootErrorBoundary,
     element: <Layout />,
     children: [/* existing routes */],
   }
   ```
- [ ] 3. Optionally add per-route error boundaries for admin section and RecipeDetailPage.

**Estimated effort:** Small (1-2 hours)

---

## H13 — Missing HTTP Security Headers ✅ CONFIRMED

**Evidence:**
- [`apps/api/src/main.ts:45-51`](apps/api/src/main.ts) — Middleware stack: `cors → requestId → rateLimit(100/min) → cache injection`. No security headers.
- Search for `secureHeaders`, `Content-Security-Policy` in `apps/api/src/` — **zero results**.
- Missing: CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy.

**Impact:** No clickjacking protection, no MIME sniffing protection, no HTTPS enforcement, no script/style source restrictions. Vulnerable to common web attacks.

**Context7 Note (Hono `secureHeaders`):** `hono/secure-headers` provides one middleware that sets all 6 standard security headers. Use `app.use('*', secureHeaders({...}))`. Not needed: `compress()` middleware on Deno Deploy — responses auto-compressed.

**Action Plan:**
- [ ] 1. Import and add in `apps/api/src/main.ts` (after CORS, before rate limit):
   ```tsx
   import { secureHeaders } from 'hono/secure-headers';

   app.use('*', secureHeaders({
     strictTransportSecurity: 'max-age=63072000; includeSubDomains; preload',
     xFrameOptions: 'DENY',
     xContentTypeOptions: 'nosniff',
     referrerPolicy: 'strict-origin-when-cross-origin',
     contentSecurityPolicy: {
       defaultSrc: ["'self'"],
       scriptSrc: ["'self'"],
       styleSrc: ["'self'", "'unsafe-inline'"],
       imgSrc: ["'self'", 'data:', 'https:'],
       connectSrc: ["'self'"],
       fontSrc: ["'self'"],
     },
   }));
   ```
- [ ] 2. This **one middleware call** instantly fixes all 6 headers.
- [ ] 3. Adjust CSP for production (add analytics domains, S3 image URLs as needed).

**Estimated effort:** Small (30 minutes)

---

## H12 — No Email Verification Flow ✅ CONFIRMED

**Evidence:**
- [`packages/db/src/schema.ts:132-155`](packages/db/src/schema.ts) — `users` table: `id, email, username, passwordHash, displayName, avatarUrl, bio, onboardingCompleted, isAdmin, isBanned, createdAt, updatedAt, deletedAt`. **No `emailVerified` column.**
- [`apps/api/src/modules/auth/index.ts`](apps/api/src/modules/auth/index.ts) — Routes: POST `/register`, `/login`, `/refresh`, `/forgot-password`, `/reset-password`, GET `/registration-status`. **No `/verify-email` endpoint.**
- Registration immediately returns access + refresh tokens.

**Impact:** Anyone can register with any email address. No bot protection, no typo correction. Welcome email is sent but purely informational.

**Action Plan:**
- [ ] 1. **DB:** Add `emailVerifiedAt TIMESTAMP` column to `users` table (nullable)
- [ ] 2. **DB:** Create `emailVerificationTokens` table: `id, userId (FK), token, expiresAt, createdAt`
- [ ] 3. **Schema:** Update `packages/db/src/schema.ts`, run `make db-generate && make db-migrate`
- [ ] 4. **API:** Create `POST /api/v1/auth/send-verification` — generates token, emails verification link
- [ ] 5. **API:** Create `POST /api/v1/auth/verify-email` — validates token, sets `emailVerifiedAt`
- [ ] 6. **API:** Modify registration to gate token issuance behind email verification
- [ ] 7. **FE:** Add "Please verify your email" banner for unverified users
- [ ] 8. **FE:** Add `/verify-email?token=xxx` route

**Estimated effort:** Medium (4-6 hours)

---

## H11 — JWT Tokens Stored in localStorage (XSS-Vulnerable) ✅ CONFIRMED

**Evidence:**
- [`apps/web/src/api/client.ts:8`](apps/web/src/api/client.ts) — `localStorage.setItem('brewform_access_token', token)`
- [`apps/web/src/api/client.ts:16`](apps/web/src/api/client.ts) — `localStorage.getItem('brewform_access_token')`
- [`apps/web/src/api/client.ts:24`](apps/web/src/api/client.ts) — `localStorage.removeItem('brewform_access_token')`
- [`apps/web/src/api/client.ts:29`](apps/web/src/api/client.ts) — `localStorage.getItem('brewform_refresh_token')`
- [`apps/api/src/modules/auth/index.ts:86`](apps/api/src/modules/auth/index.ts) — Login returns tokens in JSON response body
- [`apps/api/src/modules/auth/index.ts:38`](apps/api/src/modules/auth/index.ts) — Register same pattern
- No `Set-Cookie` header anywhere in auth module.

**Impact:** Any XSS attack (injected script, compromised npm dependency) can read JWT tokens from `localStorage`. Tokens accessible to all JavaScript on the page.

**Context7 Note (Hono `hono/cookie`):** Provides `setCookie()`, `getCookie()`, `setSignedCookie()` with `httpOnly`, `secure`, `sameSite`, `maxAge`, `path`, `prefix` options. Supports `__Secure-` and `__Host-` prefixes. Enforces best practices (max 400-day expiry, requires `secure` for `__Secure-` prefix).

**Action Plan:**
- [ ] 1. **API** — Change login/register to set HTTP-only cookies:
   ```tsx
   import { setCookie } from 'hono/cookie';

   setCookie(c, 'access_token', accessToken, {
     httpOnly: true,
     secure: true,
     sameSite: 'Strict',
     path: '/',
     maxAge: 15 * 60, // 15 minutes
   });
   setCookie(c, 'refresh_token', refreshToken, {
     httpOnly: true,
     secure: true,
     sameSite: 'Strict',
     path: '/api/v1/auth/refresh',
     maxAge: 7 * 24 * 60 * 60, // 7 days
   });
   ```
- [ ] 2. **API** — Change auth middleware to read from cookies instead of `Authorization` header:
   ```tsx
   import { getCookie } from 'hono/cookie';
   const token = getCookie(c, 'access_token');
   ```
- [ ] 3. **FE** — Remove all `localStorage` token storage from `client.ts`. Cookies sent automatically.
- [ ] 4. **FE** — Remove manual `Authorization` header. Add `credentials: 'include'` if cross-origin.
- [ ] 5. **CSRF** — Same-origin (Vite proxies `/api/*`) so CSRF risk is low. Add `X-Requested-With: XMLHttpRequest` header check for extra safety.

**Estimated effort:** Medium (4-6 hours, requires coordinated FE/BE changes)

---

## Dependencies

- H12 (Email Verification) depends on DB migration tooling and email template system
- H11 (Cookie Auth) requires coordinated backend + frontend changes — deploy API first
- C2 and H13 are independent and can run in parallel
