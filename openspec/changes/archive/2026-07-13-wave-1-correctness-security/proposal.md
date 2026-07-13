## Why

Two Wave 1 P1 debt items bundle into one change because they are small, independent of each other, and shippable in a single PR with no cross-debt coupling:

- **D41 — Admin user mutations missing soft-delete guard.** Three admin user-state mutations (`banUser`, `unbanUser`, `setUserAdminRole`) in `apps/api/src/modules/admin/model.ts:98-115` update by `eq(users.id, userId)` alone, with no `isNull(users.deletedAt)` guard. A sweep of the same file found three more unguarded updates on soft-deletable tables (`updateRecipeVisibility`, `updateEquipment`, `updateVendor`). The correct pattern is already established in the same file by `softDeleteUser` (L197-204), `softDeleteRecipe` (L238-243), and the D19 fix. The risk is real but narrow: a soft-deleted user can be mutated (banned, granted admin) and the API returns the mutated row as if the operation were meaningful. The privilege-escalation edge — `setUserAdminRole(deletedUserId, true)` creating a deleted-but-admin row — is the worst case; any future account-restore path would resurrect it with admin rights granted while it was invisible to normal listings.

- **D38 — Security & error-handling hardening (three small pieces).**
  1. `POST /api/v1/reports` (`apps/api/src/modules/report/index.ts:19-50`) has no dedicated rate limit. Only the global 100 req/min limiter (`apps/api/src/main.ts:69`) applies, keyed by IP. An authenticated user can file up to 100 reports/minute — enough to flood the admin moderation queue. The contact module (`apps/api/src/modules/contact/index.ts:29-36`) already applies a strict 3-per-15-min limit; the report route is the same class of abuse vector and should follow the same pattern.
  2. `apps/api/src/utils/sanitize.ts` (a security control: regex-based HTML/zero-width/whitespace stripping used by `comment`, `recipe`, and `user` services) has **zero test coverage**. A regression (a tag or attribute slipping through) would ship silently.
  3. `apps/web/src/contexts/AuthContext.tsx:42-48` — `refreshUser` catches every error from `userApi.me()` and converts it to `setUser(null)` + a single `log.warn` with the misleading message "session may be expired", applied to 401, 403, 500, and network failures alike. The web client (`apps/web/src/api/client.ts:34-49`) already silently retries 401 via `/auth/refresh` before throwing, so a 401 reaching `refreshUser` means the refresh cookie is also dead = genuinely logged out (silent is correct). But 5xx and network failures mean the session may still be valid — silently logging the user out and telling them "session may be expired" is wrong. The user cannot distinguish "logged out" from "auth backend unreachable".

| Concern | Current state | Wave 1 fix |
|---|---|---|
| `banUser`/`unbanUser`/`setUserAdminRole` WHERE clause | `eq(users.id, userId)` — mutates soft-deleted rows | `and(eq(users.id, userId), isNull(users.deletedAt))` — returns `null` for deleted |
| `updateRecipeVisibility`/`updateEquipment`/`updateVendor` WHERE clause | unguarded — same bug class | same guard added (sibling sweep) |
| `PATCH /api/v1/admin/users/:id/admin` route (setUserAdminRole) | no try/catch — service throws `USER_NOT_FOUND` → 500 | mirror ban route's `try/catch` → 404 |
| `POST /api/v1/reports` rate limit | global 100/min only | `rateLimitMiddleware({ windowMs: 15*60_000, maxRequests: 3, keyPrefix: 'report' })` as the FIRST middleware on the POST route only (NOT `report.use('*', ...)` — see design Decision 4: admin GET/PATCH routes on the same router must not be throttled) |
| `apps/api/src/utils/sanitize.ts` tests | none | new `sanitize.test.ts` covering `sanitizeText` + `sanitizeName` |
| `AuthContext.refreshUser` error handling | one branch for all errors → silent logout + misleading warn | split 401 (silent, correct) from 5xx/network (log.error + expose `sessionError` to a banner) |

## What Changes

**D41 — admin user mutation guards:**
- `apps/api/src/modules/admin/model.ts` — add `and(eq(<t>.id, id), isNull(<t>.deletedAt))` to six functions: `banUser` (L98), `unbanUser` (L105), `setUserAdminRole` (L112), `updateRecipeVisibility` (L227), `updateEquipment` (L271), `updateVendor` (L322). Update the three primary functions' JSDoc to state the active-row precondition. `and`/`isNull` already imported (L30).
- `apps/api/src/modules/admin/index.ts` — wrap the `PATCH /users/:id/admin` handler (L215-225) in a `try/catch` mapping `USER_NOT_FOUND` → 404, mirroring the ban/unban route at L159-178. Add full `describeRoute` metadata to both admin user routes (ban/unban + setRole) including `401`, `404`, `429` (none — no per-route limit on admin), and `resolver(ErrorEnvelopeSchema)` per AGENTS.md. The ban/unban route already does the 404 mapping correctly and is the template.
- `apps/api/src/modules/admin/model.test.ts` — new `describe` blocks for `banUser`, `unbanUser`, `setUserAdminRole` (and optionally the three siblings) following the D19 `deleteEquipment` three-`it` pattern (active → already-deleted-returns-null → no-mutation-on-deleted-row), using the inline `crypto.randomUUID()` fixture + hard-delete `afterEach` pattern already established in this file.

**D38 piece 1 — report rate limit:**
- `apps/api/src/modules/report/index.ts` — import `rateLimitMiddleware` from `../../middleware/rateLimit.ts`; add `rateLimitMiddleware({ windowMs: 15 * 60_000, maxRequests: 3, keyPrefix: 'report' })` as the FIRST middleware in the POST route's chain (before `describeRoute`, `authMiddleware`, `zValidator`); add a `429` entry to the POST route's `describeRoute` responses mirroring `contact/index.ts:56-59`. Do NOT use `report.use('*', ...)` — the admin GET/PATCH routes on the same router must not be throttled (see design Decision 4).
- `apps/api/src/modules/report/index.test.ts` — **new** route-level test file. Mirror `apps/api/src/modules/contact/contact.test.ts:53-68` (the 4th-request-returns-429 test). The report POST requires `authMiddleware`, so the test must additionally stub auth (mint a valid JWT or stub the middleware) — see the design doc for the chosen approach.

**D38 piece 2 — sanitizer tests:**
- `apps/api/src/utils/sanitize.test.ts` — **new**. Mirror `apps/api/src/utils/response/response.test.ts` conventions (no `test-setup.ts`, no Hono app, no spies, nested `describe` per function, `'should ...'` `it` naming). Cover `sanitizeText` and `sanitizeName` against: nullish input, HTML tag stripping (script, img with onerror, closing tags), the `1 < 2 > 1` numeric-comparison pass-through (the regex's intentional `[a-z]` anchor), zero-width Unicode stripping, whitespace normalization, newline handling, and document the known limitations (no `javascript:` URL filtering, no HTML entity decoding) as explicit "passes through unchanged" cases so a future regression is caught.

**D38 piece 3 — auth refresh error surfacing:**
- `apps/web/src/contexts/AuthContext.tsx` — refactor the `refreshUser` catch block (L42-48) to branch on `err instanceof ApiError && err.status === 401` (silent `setUser(null)`, keep existing `log.warn` but with accurate message) vs. other `ApiError` (5xx) and non-`ApiError` (network) → `log.error({ err }, 'Session restore failed — network or server error')` + set a new `sessionError: 'network' | 'server' | null` state field. Remove the outer `.catch(() => {})` at L55 (the inner catch already prevents throws). Expose `sessionError` on `AuthContextType` and from `useAuth()`. Add a `clearSessionError()` function so the banner can dismiss itself on a successful manual retry.
- `apps/web/src/components/SessionRestoreBanner.tsx` — **new** minimal inline banner modeled on `EmailVerificationBanner.tsx` (self-contained, calls `useAuth()`, early `return null` when no error, inline Tailwind + CSS custom properties). Renders a "couldn't restore your session — retry" notice; retry button calls `refreshUser()` and clears the banner on success.
- `apps/web/src/components/layout/Layout.tsx` — mount `<SessionRestoreBanner />` as a sibling to `<EmailVerificationBanner />` at L31.
- `apps/web/src/contexts/AuthContext.test.tsx` — **new**. Follow `apps/web/src/pages/auth/LoginPage.test.tsx` mock skeleton (`vi.hoisted` logger mock, full `../../api/index` mock with the stubbed `ApiError` class, `MemoryRouter > I18nProvider > AuthProvider > <TestConsumer/>`, `waitFor` for `isLoading`). Test cases: (a) 401 → `user` null, `sessionError` null, `log.warn` called, no banner; (b) 500 → `user` null, `sessionError === 'server'`, `log.error` called; (c) network `TypeError` → `sessionError === 'network'`, `log.error` called; (d) success → unchanged.

No schema changes. No migrations. No shared-package changes. No frontend package changes.

## Capabilities

### Modified Capabilities

- **admin-soft-delete**: Extends D19's idempotent soft-delete requirement to cover the three admin user-state mutations (`banUser`/`unbanUser`/`setUserAdminRole`) and three sibling unguarded updates (`updateRecipeVisibility`/`updateEquipment`/`updateVendor`). Adds the route-level 404 mapping for `PATCH /users/:id/admin` (the ban/unban route is already correct).
- **error-handling**: Extends the D17 error-surfacing line to the `AuthContext.refreshUser` mount path — 401 (silent, correct) is distinguished from 5xx/network (logged at `error` and surfaced via a `sessionError` context field + a `SessionRestoreBanner`).
- **request-body-limit**: No change to the body-limit spec itself, but the report rate-limit piece reuses the same `rateLimitMiddleware` factory and the same 429 documentation pattern. The rate limit is documented under a new dedicated capability below to keep the spec boundary clean.

### New Capabilities

- **report-rate-limit**: The `POST /api/v1/reports` submission route SHALL be protected by a dedicated per-IP rate limit of 3 requests per 15 minutes, namespaced from the global limiter via `keyPrefix: 'report'`. The 429 response SHALL be documented in the route's OpenAPI metadata. Admin list/resolve routes on the same router SHALL NOT be throttled by this limit — the limiter is applied as route-level middleware on POST only, NOT via `report.use('*', ...)` (see design Decision 4 for the trade-off).
- **text-sanitization**: The `sanitizeText` and `sanitizeName` exports from `apps/api/src/utils/sanitize.ts` SHALL have dedicated unit-test coverage asserting both dangerous-input neutralisation and benign-input pass-through, so a regression in the regex-based stripping is caught before ship.

## Impact

**Files changed (10):**

| File | Change type |
|---|---|
| `apps/api/src/modules/admin/model.ts` | edit — 6 WHERE clauses + 3 JSDoc updates |
| `apps/api/src/modules/admin/index.ts` | edit — try/catch on PATCH setRole + describeRoute on 2 routes |
| `apps/api/src/modules/admin/model.test.ts` | edit — new describe blocks for 3 (or 6) functions |
| `apps/api/src/modules/report/index.ts` | edit — import rateLimitMiddleware, add it as first middleware on POST route, add 429 doc |
| `apps/api/src/modules/report/index.test.ts` | new — rate-limit route test |
| `apps/api/src/utils/sanitize.test.ts` | new — sanitizer unit tests |
| `apps/web/src/contexts/AuthContext.tsx` | edit — refreshUser branches, sessionError state, clearSessionError |
| `apps/web/src/contexts/AuthContext.test.tsx` | new — refresh-failure cases |
| `apps/web/src/components/SessionRestoreBanner.tsx` | new — minimal banner |
| `apps/web/src/components/layout/Layout.tsx` | edit — mount the banner |

**No schema/migration changes.** `and`/`isNull` already imported in `admin/model.ts:30`. `rateLimitMiddleware` already exists at `apps/api/src/middleware/rateLimit.ts:29`. `ApiError` already exposes `.status` (`apps/web/src/api/client.ts:83-99`). The web logger is already imported and used in `AuthContext.tsx:4-6`.

**Stakeholders:** API (admin + report modules), web (AuthContext + Layout). DB, shared, deployment unaffected.

**Risk:** Low. D41 is six one-line WHERE-clause changes plus one try/catch plus tests — the pattern is proven by D19 and every non-admin soft-delete. D38 piece 1 is a one-middleware-addition plus a 429 doc entry — the pattern is proven by contact (with a scoped-to-POST twist documented in design Decision 4). D38 piece 2 is a pure new test file. D38 piece 3 is the most involved (a state-field addition + a new banner component + a new test file) but is still ~2h of work and touches only one context's catch block and one Layout line.

**Verification:** `make check` (type-check all workspaces), `make lint`, `make test` (runs the new admin model tests, the new report route test, the new sanitize tests, and the new AuthContext tests via Docker with `--allow-all`). The OpenAPI coverage test (`apps/api/src/routes/openapi.coverage.test.ts`) is unaffected — admin routes are not in its 17-path in-scope list (L59-77), and the report route is already in scope; adding a `429` response to its `describeRoute` does not violate any coverage property.

## Out of Scope

- **`softDeleteUser` / `softDeleteRecipe` service-layer audit-log noise** (`admin/service.ts:165-173` and `:215-220` write audit unconditionally on null returns). Same bug class as D19's `deleteEquipment`/`deleteVendor` audit fix, but the D41 plan scopes this out. Tracked as a follow-up.
- **Per-user (instead of per-IP) rate-limit keying.** The current `rateLimitMiddleware` keys by `x-forwarded-for`/`x-real-ip` only — it does not read `userId` even when authenticated. Changing the keying strategy is a cross-cutting change to the middleware itself and is out of scope; the report limit reuses the existing per-IP keying, matching the contact module's behaviour.
- **429 envelope `requestId` conformance.** The runtime 429 body from `rateLimitMiddleware` (`rateLimit.ts:61-67`) omits `error.requestId`, but `ErrorEnvelopeSchema` (`packages/shared/src/schemas/response.ts:15-25`) requires it. This is a pre-existing inconsistency shared by every 429 in the codebase (contact, auth, global). Fixing it is a separate cross-cutting change.
- **`sanitize.ts` `javascript:` URL and HTML-entity-encoding gaps.** The sanitizer does not filter `javascript:` URLs (bare text passes through) and does not decode/escape HTML entities (`&#60;script&#62;` passes through). These are documented limitations, not bugs to fix in this change — the spec asserts the current behaviour as pass-through cases so a regression is caught, but does not add new sanitisation logic. A future change could introduce a real HTML sanitizer (DOMPurify or similar) if user content ever needs to allow any HTML.
- **`logout` empty catch** (`AuthContext.tsx:86-94`). Intentional best-effort — leave alone.
- **Full OpenAPI retrofit of admin routes.** Only the two routes touched by D41 (ban/unban + setRole) get `describeRoute` metadata. The ~20 other admin routes that predate the OpenAPI mandate remain a separate follow-up (D25 line).
- **i18n for the `SessionRestoreBanner`.** The banner text is inline English in this change; adding `t()` keys for it is part of the D40 i18n wave, not Wave 1.