## Context

Wave 1 of the debt roadmap bundles two P1 correctness/security items (`D41` + `D38`) into one shippable change. They share no code paths, no spec dependencies, and no test fixtures — the bundle exists only because both are small and the PR overhead of splitting them is larger than the review cost of keeping them together. This design treats them as three independent sub-changes (D41, D38-p1, D38-p2, D38-p3) that happen to land in one commit.

### Architecture — the three sub-changes at a glance

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  WAVE 1 — three independent sub-changes, one PR                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  D41 — admin user mutation guards                                            │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  model.ts    banUser/unbanUser/setUserAdminRole  ──┐                   │  │
│  │             updateRecipeVisibility/updateEquipment/updateVendor         │  │
│  │             add isNull(deletedAt) guard to WHERE    │                   │  │
│  │                                                     ▼                   │  │
│  │  service.ts  (no change — null→throw already exists before audit log)  │  │
│  │                                                     │                   │  │
│  │                                                     ▼                   │  │
│  │  index.ts    PATCH /users/:id/admin  ── add try/catch → 404            │  │
│  │              (ban/unban route already correct)                         │  │
│  │              + describeRoute on both routes                            │  │
│  │                                                     │                   │  │
│  │                                                     ▼                   │  │
│  │  model.test.ts  new describe blocks (3 primary + 3 optional siblings)  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  D38-p1 — report rate limit                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  report/index.ts   import rateLimitMiddleware                          │  │
│  │                    report.post('/',                                    │  │
│  │                      rateLimitMiddleware({                             │  │
│  │                        windowMs: 15*60_000, maxRequests: 3,            │  │
│  │                        keyPrefix: 'report'                             │  │
│  │                      }),  ← FIRST middleware on POST only              │  │
│  │                      describeRoute({ ... + 429 entry }),               │  │
│  │                      authMiddleware, zValidator(...), handler          │  │
│  │                    )                                                   │  │
│  │                    (GET/PATCH admin routes NOT throttled)              │  │
│  │                                                                        │  │
│  │  report/index.test.ts (NEW)  4th POST → 429                           │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  D38-p2 — sanitizer tests                                                    │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  utils/sanitize.test.ts (NEW)  describe('sanitizeText') /              │  │
│  │                                describe('sanitizeName')                │  │
│  │                                table-ish it() cases                    │  │
│  │  (no production code change)                                           │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  D38-p3 — auth refresh error surfacing                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  AuthContext.tsx   refreshUser catch block → branch on                 │  │
│  │                    err instanceof ApiError && err.status === 401        │  │
│  │                    vs. 5xx / network                                   │  │
│  │                    + sessionError state + clearSessionError            │  │
│  │                    - remove .catch(()=>{}) at L55                      │  │
│  │                                                                        │  │
│  │  SessionRestoreBanner.tsx (NEW)  minimal inline banner                 │  │
│  │                                                                        │  │
│  │  Layout.tsx   mount <SessionRestoreBanner/> next to                    │  │
│  │               <EmailVerificationBanner/>                               │  │
│  │                                                                        │  │
│  │  AuthContext.test.tsx (NEW)  401/500/network/success cases             │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Codebase facts (verified 2026-07-05 on `main`)

**D41:**
- `apps/api/src/modules/admin/model.ts:30` imports `and, eq, isNull` from `drizzle-orm` — no import changes needed.
- The three primary targets: `banUser` (L98-102), `unbanUser` (L105-109), `setUserAdminRole` (L112-115). All use `eq(users.id, userId)` alone.
- The three sibling targets found by the sweep: `updateRecipeVisibility` (L227-235, on `recipes`), `updateEquipment` (L271-291, on `equipment`), `updateVendor` (L322-334, on `vendors`). All use `eq(<t>.id, id)` alone.
- The correct pattern in the same file: `softDeleteUser` (L197-204), `softDeleteRecipe` (L238-243), `updateCoffeeVariety` (L596-605), `deleteEquipment`/`deleteVendor`/`deleteCoffeeVariety` (D19 fix), and `approveEquipmentDeleteRequest` inner update (D19 fix). All use `and(eq(<t>.id, id), isNull(<t>.deletedAt))`.
- Service-layer call sites: `service.ts:52-61` (`banUser`), `:63-71` (`unbanUser`), `:73-87` (`setUserAdminRole`). All three already have `if (!user) throw new Error('USER_NOT_FOUND')` **before** the `createAuditLog` call — so when the model returns `null`, no audit entry is written. **The service layer needs no change for the three primary targets.**
- Controller-layer: `index.ts:159-178` (ban/unban, `POST /users/:id/ban`) already wraps the service call in `try/catch` mapping `USER_NOT_FOUND` → `error(c, 'NOT_FOUND', 'User not found.', 404)`. `index.ts:215-225` (setRole, `PATCH /users/:id/admin`) does **NOT** wrap in try/catch — the service throw propagates uncaught to the global error handler and becomes a 500. **This is a real bug that D41 must fix** by mirroring the ban route's try/catch.
- **OpenAPI coverage test scope:** `apps/api/src/routes/openapi.coverage.test.ts:59-77` lists 17 in-scope base paths. `/api/v1/admin` is NOT among them (only `/api/v1/users`, `/api/v1/reports`, etc.). So the admin routes are exempt from the coverage test's "every in-scope op documents 401" property (P4). However, AGENTS.md states "a route without `describeRoute()` is incomplete" as a project rule. The two touched routes (ban/unban + setRole) get full metadata; the ~20 other admin routes remain a separate D25-line follow-up.
- Test fixture pattern: `apps/api/src/modules/admin/model.test.ts` uses inline `crypto.randomUUID()` IDs + `db.insert(users).values({...})` in `beforeEach` + hard-delete in `afterEach`. No shared helper. Each `describe` block is self-contained. The D19 `deleteEquipment` block (L17-68) is the three-`it` template (active → already-deleted-returns-null → no-overwrite). The `deleteCoffeeVariety` block adds a 4th "returns null when updating a deleted row" regression `it` (L171-177).
- No `softDeleteUser` tests exist anywhere — D41 does not need to add them (out of scope), but the new `banUser`/`unbanUser`/`setUserAdminRole` tests will set up a soft-deleted user via `db.update(users).set({ deletedAt: preDeleteTime }).where(eq(users.id, userId))` (the same direct-UPDATE pattern the `approveEquipmentDeleteRequest guard` block uses at L243-256 for equipment).

**D38-p1:**
- `apps/api/src/modules/report/index.ts:11` imports only `adminMiddleware, authMiddleware` from `auth.ts` — `rateLimitMiddleware` is NOT imported.
- The POST route is at L19-50. The middleware chain is `describeRoute → authMiddleware → zValidator → handler`. No `report.use('*', ...)` exists.
- The template: `apps/api/src/modules/contact/index.ts:29-36` — `contact.use('*', rateLimitMiddleware({ windowMs: 15 * 60_000, maxRequests: 3, keyPrefix: 'contact' }))`. The 429 doc entry is at `contact/index.ts:56-59`.
- `rateLimitMiddleware` is defined at `apps/api/src/middleware/rateLimit.ts:29-82`. Signature: `({ windowMs?, maxRequests?, keyPrefix? })`. **Keys by IP only**: `const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'; const key = '${keyPrefix}:${ip}'`. It does NOT read `userId`. The plan's claim that "the limiter keys per user" is **wrong** — the spec must document per-IP keying as the actual behaviour.
- The global 100/min limiter (`main.ts:69`) uses the same factory with no `keyPrefix` (defaults to `'rate-limit'`). A new `keyPrefix: 'report'` creates an independent counter namespace, so the report limit and the global limit do not interfere.
- The runtime 429 body (`rateLimit.ts:61-67`) is `{ success: false, error: { code: 'RATE_LIMITED', message: '...' } }` — it **omits `error.requestId`**. `ErrorEnvelopeSchema` (`packages/shared/src/schemas/response.ts:15-25`) requires `requestId: z.string()`. This is a pre-existing inconsistency shared by every 429 in the codebase; the spec documents it as out-of-scope.
- The contact rate-limit test (`apps/api/src/modules/contact/contact.test.ts:53-68`) is the template: build a `new Hono()`, mount the router via `app.route('/api/v1/contact', contact)`, fire 3 POSTs, assert the 4th returns 429. The contact test does NOT send auth headers (contact is unauthenticated). The report POST requires `authMiddleware` — the new test must additionally satisfy auth.

**D38-p2:**
- `apps/api/src/utils/sanitize.ts` (53 lines, no imports, pure regex). Exports: `sanitizeText` (L27-40), `sanitizeName` (L42-53). Non-exported helpers: `stripHtmlTags` (L10-13, regex `/<\/?[a-z][^>]*>/gi` — the `[a-z]` anchor is what avoids matching `1 < 2`), `stripZeroWidthChars` (L15-18), `normalizeWhitespace` (L20-25).
- No `sanitize.test.ts` exists. No test file imports from `sanitize.ts` directly. The functions are exercised only transitively via `comment/service.ts`, `recipe/service.ts`, `user/service.ts`.
- Known limitations (document, do NOT fix): no `javascript:` URL filtering, no HTML entity decoding, no handling of `<` not followed by a letter (e.g. `< script>` with a space).
- Test convention template: `apps/api/src/utils/response/response.test.ts` — no `test-setup.ts`, no Hono app, no spies, nested `describe` per function, `'should ...'` `it` naming.

**D38-p3:**
- `apps/web/src/contexts/AuthContext.tsx` (118 lines). Interface `AuthContextType` (L8-18): `user`, `isLoading`, `isAuthenticated`, `login`, `register`, `logout`, `refreshUser`. **No `sessionError` field yet.**
- `refreshUser` (L36-52): try `userApi.me()` → `setUser(userData)`; catch → `isBannedError` branch (L43-44, `log.warn` + `setUser(null)`) or else-branch (L45-47, `log.warn` "session may be expired" + `setUser(null)`); finally → `setIsLoading(false)`. **Never re-throws.** The outer `.catch(() => {})` at L55 is redundant (the inner catch already swallows) but exists as a React unhandled-rejection guard.
- `apps/web/src/api/client.ts:83-99` — `ApiError` class with `code`, `details?`, `status` (default 500). The throw site (L54-59) sets `status = response.status`. So `err instanceof ApiError && err.status === 401` is the discriminator.
- **Critical 401 nuance:** `client.ts:34-49` intercepts 401 on non-`/auth/` endpoints and silently retries via `/auth/refresh`. `userApi.me()` calls `api.get('/users/me')` — `/users/me` does not start with `/auth/`, so the client attempts a silent refresh before throwing. A 401 reaching `refreshUser` therefore means **both the original call AND the refresh retry failed** = the session is genuinely dead. Silent `setUser(null)` is correct for this case.
- Network errors: `client.ts:64-67` catches `fetch()` throws (e.g. `TypeError: Failed to fetch`), logs, and re-throws the original `TypeError` — NOT wrapped in `ApiError`. So `err instanceof ApiError` is `false` for network failures. This is the discriminator: `instanceof ApiError` → HTTP error with `.status`; not `instanceof ApiError` → network error.
- Banner precedent: `apps/web/src/components/EmailVerificationBanner.tsx` (44 lines). Self-contained, calls `useAuth()` directly, early `return null` when not applicable, inline Tailwind + `var(--accent-primary)`. Mounted in `Layout.tsx:31` above `<Navbar />`.
- No toast system exists anywhere in `apps/web/src` (searched `useToast|ToastProvider|toast`). The spec uses a minimal inline banner, not a toast lib.
- Web test convention template: `apps/web/src/pages/auth/LoginPage.test.tsx`. Vitest + testing-library + jsdom, globals on, setup at `src/test-setup.ts`. Mock skeleton: `vi.hoisted` for logger, `vi.mock('../../api/index', ...)` with a stubbed `ApiError` class. Render via `MemoryRouter > I18nProvider > AuthProvider > <Component/>` + `waitFor`. `userApi.me` is mocked to reject by default (so the provider mounts in a logged-out state).

### Stakeholders

- **API (`apps/api/`)** — admin module, report module, sanitize util. All D41 + D38-p1 + D38-p2 code lives here.
- **Web (`apps/web/`)** — AuthContext, Layout, new banner. All D38-p3 code lives here.
- **DB package, shared package** — unaffected (no schema, no shared schema changes; `ApiError` already exposes `.status`).
- **Admin users** — the only callers of the ban/unban/setRole endpoints; they will now see 404s instead of silent successes when targeting deleted users, and 404s instead of 500s on the setRole route.
- **Regular users** — unaffected except: (a) report submission is now rate-limited to 3/15min per IP (the same budget as contact); (b) a session-restore failure on a server/network error now shows a banner instead of silently logging them out.

## Goals / Non-Goals

**Goals:**
- D41: make all six unguarded admin updates idempotent against soft-deleted rows; map `USER_NOT_FOUND` to 404 on the setRole route; add tests covering the active and soft-deleted paths for the three primary functions.
- D38-p1: throttle report submissions to 3/15min per IP, mirroring contact; document the 429 in OpenAPI.
- D38-p2: add a dedicated regression suite for `sanitizeText`/`sanitizeName` covering dangerous-input neutralisation and benign-input pass-through.
- D38-p3: distinguish 401 (silent logout, correct) from 5xx/network (log.error + `sessionError` banner) in `AuthContext.refreshUser`; expose `sessionError` and `clearSessionError` from `useAuth()`; render a minimal retry banner in the shell.
- All: add JSDoc to every new or modified exported function. Pass `make check`, `make lint`, `make test`.

**Non-Goals:**
- Fixing `softDeleteUser`/`softDeleteRecipe` service-layer unconditional audit logs (separate follow-up).
- Changing `rateLimitMiddleware` to key by `userId` (cross-cutting; out of scope).
- Fixing the 429 envelope `requestId` omission (cross-cutting; out of scope).
- Adding `javascript:` URL or HTML-entity filtering to `sanitize.ts` (documented limitation; out of scope).
- Full OpenAPI retrofit of all admin routes (D25-line follow-up).
- i18n for the `SessionRestoreBanner` (D40 wave).
- Touching the `logout` empty catch (intentional best-effort).

## Decisions

### Decision 1 (D41) — Guard all six unguarded updates, not just the three primary

The D41 plan frames the sibling sweep as part of the change's review checklist. The sweep found three more unguarded updates on soft-deletable tables (`updateRecipeVisibility`, `updateEquipment`, `updateVendor`). All six get the same one-line `and(eq(<t>.id, id), isNull(<t>.deletedAt))` guard. Rationale: the bug class is identical, the fix is identical, the test pattern is identical, and leaving three known siblings unfixed would mean a third change to revisit the same file next week. The risk of fixing all six is the same as fixing three (each is a one-line WHERE-clause addition that makes the function return `null` instead of mutating a deleted row).

Tests are required for the three primary targets (user-state mutations — the privilege-escalation case). Tests for the three siblings are **optional but recommended** — the spec lists them as a separate task group that can be deferred if the implementer is time-constrained, since the sibling functions are lower-risk (no privilege escalation; they just silently mutate deleted rows). The `updateCoffeeVariety` regression `it` in the existing `deleteCoffeeVariety` block (model.test.ts L171-177) is the template for the sibling tests.

### Decision 2 (D41) — Fix the `PATCH /users/:id/admin` route's missing try/catch

After the model gets its `isNull(deletedAt)` guard, `setUserAdminRole` will return `null` for soft-deleted users, the service will throw `USER_NOT_FOUND`, and the route (L215-225) will return 500 instead of 404 because it has no try/catch. The ban/unban route (L159-178) already does the right thing and is the template. D41 fixes this in the same change because it is a direct consequence of the model fix — leaving it would mean the change introduces a 500 regression on a route that previously returned 200 (even though the 200 was wrong, a 500 is also wrong, and 404 is correct). The fix is a 5-line try/catch mirroring the ban route.

### Decision 3 (D41) — Add `describeRoute` to the two touched admin routes only

AGENTS.md mandates `describeRoute` on every route. The OpenAPI coverage test (`openapi.coverage.test.ts:59-77`) does NOT include `/api/v1/admin` in its 17 in-scope paths, so the test does not enforce this for admin routes today. Since D41 touches the ban/unban and setRole routes anyway (for the try/catch fix), it adds full `describeRoute` metadata to those two routes (tags: `Admin`, `security: [{ bearerAuth: [] }]`, `401` + `404` via `resolver(ErrorEnvelopeSchema)`, request body via `jsonRequestBody`). The ~20 other admin routes that predate the OpenAPI mandate remain a D25-line follow-up — adding metadata to all of them would balloon this change and is not required by any test.

### Decision 4 (D38-p1) — Apply the rate limiter as route-level middleware on POST only, NOT via `report.use('*', ...)`

The contact module applies `contact.use('*', rateLimitMiddleware({...}))` at the router level, which throttles ALL routes on the router (not just POST). The report router has three routes: POST `/` (submission, the target), GET `/` (admin list), PATCH `/:id/resolve` (admin resolve). Applying `report.use('*', ...)` would throttle the two admin routes too — at 3/15min per IP, which is far too strict for admin moderation workflows.

Two options:
1. **Router-level `report.use('*', ...)`** (contact pattern) — simple, but throttles admin routes. Admins hitting the moderation queue would be limited to 3 list/resolve actions per 15 min per IP. This breaks moderation.
2. **Route-level middleware on POST only** — apply `rateLimitMiddleware({...})` as the first middleware in the POST route's chain (before `describeRoute`), leaving GET/PATCH untouched.

**Decision: Option 2.** The D38 plan proposed Option 1 but did not account for the admin routes sharing the router. Option 2 is the correct scope: the abuse vector is report **submission** (any authenticated user can file reports), not admin moderation. The implementation:

```typescript
report.post(
  '/',
  rateLimitMiddleware({ windowMs: 15 * 60_000, maxRequests: 3, keyPrefix: 'report' }),
  describeRoute({ ... }),  // add 429 entry
  authMiddleware,
  zValidator('json', ReportCreateSchema, zodValidationHook),
  async (c) => { ... },
);
```

The limiter is placed **before** `authMiddleware` so an unauthenticated flood is also throttled (the global 100/min applies upstream, but this gives a tighter 3/15min for the report endpoint specifically). The `keyPrefix: 'report'` namespaces the counter from the global limiter.

**Trade-off:** per-IP keying means a NAT'd office of legitimate users shares a 3/15min budget. This matches the contact module's behaviour and is acceptable for a low-volume endpoint. If it proves too strict, `maxRequests` can be tuned to 5 in a follow-up (the plan notes this).

### Decision 5 (D38-p1) — Report route test must stub auth; use a middleware-stub approach, not JWT minting

The contact rate-limit test (`contact.test.ts:53-68`) fires unauthenticated POSTs because contact is unauthenticated. The report POST requires `authMiddleware` (Bearer JWT). Two options for the test:
1. **Mint a real JWT** — requires `JWT_SECRET` and the auth middleware's verification logic. Heavyweight for a rate-limit test.
2. **Stub `authMiddleware`** — replace the auth middleware with a no-op that sets `c.set('userId', 'test-user')` so the handler runs. The rate-limit behaviour is what's under test, not auth.

**Decision: Option 2**, but only if the test file can cleanly stub the middleware. Since `report/index.ts` imports `authMiddleware` directly, the test would need to mock the middleware module. The cleaner approach: the test mounts the report router on a test Hono app and applies a stub auth middleware before the router. The exact stub mechanism is an implementation detail for the tasks doc, but the spec requires: (a) 3 POSTs succeed (or validate — the test need not assert 201, only that the 4th is 429), (b) the 4th returns 429, (c) GET `/` and PATCH `/:id/resolve` are NOT throttled (assert a 4th GET in the window does not return 429). The contact test's "fire 4 POSTs, assert 4th is 429" is the core assertion to mirror.

**Resolution (verified during spec finalisation):** The API tests use Deno's `jsr:@std/testing` (not Vitest), so `vi.mock` is unavailable. The established pattern for authenticated route tests is **Pattern B: mint a real JWT via `signAccessToken`** (defined at `apps/api/src/modules/auth/jwt.ts:42-56`), used by `follow/index_test.ts:64-71` (`authedRequest` helper) and `recipe/recipe-filter-deprecation.test.ts:104-114` (`createAuthedTestApp`). Because `authMiddleware` does a DB lookup, the test must also insert a real user row in `beforeEach`. The cache is reset per test via `setCacheProvider(new InMemoryCacheProvider())` (pattern from `rateLimit.test.ts:11-13`). The tasks doc (7.1) contains the full import list, helper skeleton, and test cases. A simplification noted in task 7.2: since the rate-limit middleware runs FIRST in the POST chain (before `authMiddleware` and `zValidator`), the 429 fires regardless of body/auth validity — so the test could even send unauthenticated POSTs and still hit 429 on the 4th, which removes the need for JWT minting entirely if the implementer prefers the simpler path.

### Decision 6 (D38-p2) — Document `sanitize.ts` limitations as pass-through cases, do not fix them

The sanitizer has two known gaps: no `javascript:` URL filtering (bare `javascript:alert(1)` text passes through) and no HTML entity decoding (`&#60;script&#62;` passes through). These are documented in the file's header comment ("intentionally NOT a full HTML sanitizer"). The spec does NOT add new sanitisation logic — that would be a feature change requiring a real HTML sanitizer dependency. Instead, the tests assert the **current** behaviour as explicit pass-through cases: `expect(sanitizeText('javascript:alert(1)')).toBe('javascript:alert(1)')`. This locks the current behaviour as a regression baseline — if someone later adds URL filtering, the test will fail and force a conscious update. A future change could introduce DOMPurify if user content ever needs to allow any HTML; today, all user content is plain text or limited markdown (bold/italic only), so the gaps are not exploitable.

### Decision 7 (D38-p3) — `sessionError: 'network' | 'server' | null`, not a boolean

The plan suggested `authError: boolean`. A boolean is insufficient for the banner to render a useful message: "network" (you appear to be offline) vs. "server" (the server had an error) are different user experiences. The spec uses a three-state union:
- `null` — no error (default, and after a successful retry).
- `'server'` — `err instanceof ApiError && err.status >= 500`. The session may still be valid; the user should retry.
- `'network'` — `!(err instanceof ApiError)` (fetch threw before a response). The user is likely offline or DNS-failed.

The 401 case sets `sessionError = null` (silent logout is correct — the session is genuinely dead). The banned case sets `sessionError = null` (existing behaviour — banned users see the banned message elsewhere). The banner renders for `'server'` and `'network'`, with slightly different copy. `clearSessionError()` sets it back to `null`; the banner calls it on retry.

### Decision 8 (D38-p3) — Minimal inline banner, not a toast system

No toast/notification system exists in the web app. Building one is out of scope for Wave 1. The `SessionRestoreBanner` is a single self-contained component modeled on `EmailVerificationBanner.tsx` — early `return null` when `sessionError === null`, inline Tailwind + CSS custom properties, retry button calls `refreshUser()` then `clearSessionError()` on success. It is mounted in `Layout.tsx` as a sibling to `<EmailVerificationBanner />`. The banner text is inline English in this change; i18n keys are a D40-wave follow-up.

### Decision 9 (D38-p3) — Remove the outer `.catch(() => {})` at AuthContext L55

The mount `useEffect` is `refreshUser().catch(() => {})` (L54-56). The inner `refreshUser` already has a try/catch that never re-throws, so the outer `.catch` is redundant — it swallows nothing of substance. After the refactor, the inner catch still never re-throws, so the outer `.catch` can be removed without introducing unhandled rejections. Removing it eliminates the D17-survivor empty catch and makes the code honest. If a future change makes `refreshUser` re-throw, the `useEffect` would need to handle it — but that is not this change.

### Decision 10 (D38-p3) — 401 keeps `log.warn`; 5xx/network uses `log.error`

Per the logging rules in AGENTS.md: `warn` is for "recoverable issues (rate limit hits, retries)"; `error` is for "operation failures (DB errors, validation failures)". A 401 on session restore is the normal logged-out path — `warn` is correct (it is recoverable: the user can log in again). A 5xx or network failure is an operation failure — `error` is correct. The existing `log.warn({ err }, 'AuthContext token refresh failed — session may be expired')` at L46 is kept for the 401 branch but with an accurate message ("session expired or not authenticated"). The new 5xx/network branch uses `log.error({ err }, 'Session restore failed — network or server error')`. The banned branch keeps its existing `log.warn` at L44.

## Risks / Trade-offs

- **D41 behavioural change:** Previously, `PATCH /api/v1/admin/users/:id/admin` on a soft-deleted user returned 200 with the mutated row. After the fix, it returns 404. This is correct (the resource is deleted) but is a contract change. No client currently depends on mutating deleted users (the admin UI lists only active users via `listUsers`, which already filters `deletedAt`), so the impact is nil in practice.
- **D41 behavioural change on setRole route:** Previously, `PATCH /users/:id/admin` on a soft-deleted user returned 500 (uncaught throw). After the fix, it returns 404. This is a strict improvement.
- **D38-p1 per-IP keying:** A NAT'd office shares a 3/15min budget. Acceptable for a low-volume endpoint; matches contact. `maxRequests` can be tuned in a follow-up.
- **D38-p1 throttles only POST, not admin routes:** This diverges from the contact pattern (which throttles the whole router). The divergence is intentional and documented (Decision 4) — the admin list/resolve routes must not be throttled at 3/15min.
- **D38-p2 locks current sanitiser limitations:** The tests assert `javascript:` URLs and HTML entities pass through unchanged. If a future change adds filtering, the tests will fail and force a conscious update. This is the intended behaviour (regression baseline), not a risk.
- **D38-p3 `sessionError` is new context state:** Adding a field to `AuthContextType` is a type-level change that could affect consumers if they destructure the context exhaustively. No consumer does this (all consumers use `useAuth()` and read specific fields), so the risk is nil. The `isAuthenticated` field was added the same way previously.
- **D38-p3 banner is not i18n'd:** Inline English text. D40 wave will add `t()` keys. Acceptable for Wave 1 because the banner is a transient error notice, not core UI.

## Migration Plan

No data migration, feature flag, or deploy sequencing needed. All changes are code-only and backward-compatible at the API contract level (the only contract changes are 200→404 on deleted-user mutations, which is a correctness fix, and a new 429 on report spam, which is the intended hardening).

**Order of implementation (tasks doc follows this):**
1. D41 model.ts WHERE clauses + JSDoc (6 functions).
2. D41 index.ts try/catch on setRole + describeRoute on 2 routes.
3. D41 model.test.ts new describe blocks.
4. D38-p1 report/index.ts rate limit + 429 doc.
5. D38-p1 report/index.test.ts route test.
6. D38-p2 sanitize.test.ts.
7. D38-p3 AuthContext.tsx refreshUser refactor + sessionError + clearSessionError.
8. D38-p3 SessionRestoreBanner.tsx + Layout.tsx mount.
9. D38-p3 AuthContext.test.tsx.
10. `make check`, `make lint`, `make test` after each sub-change is complete (not just at the end).

Rollback: `git revert` the merge commit. No DB state to undo.

## Open Questions

None blocking. All decisions are resolved above. The optional sibling tests (Decision 1) are a time-budget call for the implementer, not an open question.