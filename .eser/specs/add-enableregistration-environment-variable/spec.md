# Spec: add-enableregistration-environment-variable

## Status: completed

## Concerns: well-engineered, beautiful-product, open-source

## Discovery Answers

### status_quo

Today anyone can register at any time with no mechanism to close registrations. The /register endpoint always accepts new users, RegisterPage is always accessible, Navbar always shows Sign Up for unauthenticated users. If an admin wants to stop registrations (spam wave, invite-only period), they have no option short of taking the server down. Current registration UX is clean but has no disabled-state handling.

_-- Arda Kilicdagi_

### ambition

10-star version: Dedicated GET /api/v1/auth/registration-status endpoint (public, no auth). Navbar conditionally hides/shows register link based on status endpoint. RegisterPage handles all states: loading (checking status), disabled (friendly message with login link), error (API unreachable — show register form as fallback). Structured logging on backend when registration attempted while disabled. OpenAPI docs updated. Comprehensive tests: backend (env config, auth route 403, status endpoint), frontend (RegisterPage disabled state, Navbar conditional rendering, API client). .env.example and docs/auth.md updated. User feels: app respects their time — tells them upfront if they can register, gives clear path to login if not.

_-- Arda Kilicdagi_

### reversibility

Fully reversible. The toggle is an env var (ENABLE_REGISTRATION, default true) — change back to true and redeploy. No database schema changes needed — purely runtime config check following existing OPENAPI_ENABLED pattern. No user data affected — existing users can still log in regardless of flag. The new GET /auth/registration-status endpoint is additive. Only one-way door concern: if clients hardcode dependency on status endpoint and we later remove it, but that is standard API deprecation.

_-- Arda Kilicdagi_

### user_impact

Existing users are completely unaffected — login, token refresh, password reset all work regardless of the flag. Only new registration attempts are blocked when disabled. No breaking API changes — /register POST still exists but returns 403 when disabled. The new /registration-status GET is additive. Navbar change is cosmetic for unauthenticated users (one less button). RegisterPage change only affects users who navigate directly to /register. No migration, no data changes, no backward compatibility concerns.

_-- Arda Kilicdagi_

### verification

Backend tests: env.test.ts — test ENABLE_REGISTRATION defaults to true, accepts false, rejects invalid values. auth/index.test.ts (new) — test POST /register returns 403 REGISTRATION_DISABLED when flag is false; test GET /registration-status returns {enabled: true/false}. auth/service.test.ts — test register() throws REGISTRATION_DISABLED when config says false. Frontend tests: RegisterPage — test disabled state shows closed message with login link; test enabled state shows form. Navbar — test register link hidden when registration disabled; shown when enabled. API client — test registration-status endpoint call. Documentation: .env.example updated with ENABLE_REGISTRATION, docs/auth.md updated with new config option.

_-- Arda Kilicdagi_

### scope_boundary

Out of scope: No admin panel UI toggle (env var only). No per-user registration control (invite codes, waitlists). No registration rate limiting changes. No changes to login, token refresh, or password reset flows. No email notification changes. No database schema changes. No changes to the admin setup/seed flow. The feature is strictly: one env var → blocks new registrations at the API level → frontend reflects the state via a status endpoint.

_-- Arda Kilicdagi_

## Test Strategy (well-engineered)

_To be addressed during execution._

## Performance Considerations (well-engineered)

_To be addressed during execution._

## Observability Plan (well-engineered)

_To be addressed during execution._

## Error Handling (well-engineered)

_To be addressed during execution._

## Security & Threat Model (well-engineered)

_To be addressed during execution._

## Developer Ergonomics (well-engineered)

_To be addressed during execution._

## Design States (empty, loading, error, success) (beautiful-product)

_To be addressed during execution._

## Mobile Layout (beautiful-product)

_To be addressed during execution._

## Interaction Design (beautiful-product)

_To be addressed during execution._

## Accessibility (beautiful-product)

_To be addressed during execution._

## Contributor Guide (open-source)

_To be addressed during execution._

## Public API Surface (open-source)

_To be addressed during execution._

## Out of Scope

- Out of scope: No admin panel UI toggle (env var only)
- No per-user registration control (invite codes, waitlists)
- No registration rate limiting changes
- No changes to login, token refresh, or password reset flows
- No email notification changes
- No database schema changes
- No changes to the admin setup/seed flow
- The feature is strictly: one env var → blocks new registrations at the API level → frontend reflects the state via a status endpoint.

## Tasks

- [x] task-1: Add ENABLE_REGISTRATION env var to config schema (apps/api/src/config/env.ts) following the OPENAPI_ENABLED pattern: z.enum(["true","false"]).default("true").transform(v => v === "true"). Files: apps/api/src/config/env.ts
- [x] task-2: Guard POST /auth/register in auth controller (apps/api/src/modules/auth/index.ts) — check config.enableRegistration before calling service.register(), return 403 REGISTRATION_DISABLED if false. Files: apps/api/src/modules/auth/index.ts
- [x] task-3: Add GET /auth/registration-status endpoint (apps/api/src/modules/auth/index.ts) — public, no auth, returns {enabled: boolean} from config. Add OpenAPI describeRoute. Files: apps/api/src/modules/auth/index.ts
- [x] task-4: Add structured logging when registration is attempted while disabled. Files: apps/api/src/modules/auth/index.ts
- [x] task-5: Update .env.example with ENABLE_REGISTRATION=true. Files: .env.example
- [x] task-6: Update docs/auth.md with ENABLE_REGISTRATION config option. Files: docs/auth.md
- [x] task-7: Backend tests — env.test.ts: test ENABLE_REGISTRATION defaults, accepts false, rejects invalid. auth/index.test.ts (new): test POST /register returns 403 when disabled, test GET /registration-status returns correct values. auth/service.test.ts: test register() throws REGISTRATION_DISABLED. Files: apps/api/src/config/env.test.ts, apps/api/src/modules/auth/index.test.ts (new), apps/api/src/modules/auth/service.test.ts
- [x] task-8: Frontend — Add registrationStatus() to authApi in api/index.ts. Files: apps/web/src/api/index.ts
- [x] task-9: Frontend — Update RegisterPage to check registration status on mount, show friendly closed message with login link when disabled, handle loading/error states. Files: apps/web/src/pages/auth/RegisterPage.tsx
- [x] task-10: Frontend — Update Navbar to conditionally hide register link based on registration status (desktop and mobile). Files: apps/web/src/components/layout/Navbar.tsx
- [x] task-11: Frontend tests — RegisterPage disabled/enabled/loading/error states. Navbar register link visibility. API client registration-status call. Files: apps/web/src/pages/auth/RegisterPage.test.tsx (new or extend), apps/web/src/components/layout/Navbar.test.tsx

## Verification

- Backend tests: env.test.ts — test ENABLE_REGISTRATION defaults to true, accepts false, rejects invalid values. auth/index.test.ts (new) — test POST /register returns 403 REGISTRATION_DISABLED when flag is false
- test GET /registration-status returns {enabled: true/false}. auth/service.test.ts — test register() throws REGISTRATION_DISABLED when config says false
- Frontend tests: RegisterPage — test disabled state shows closed message with login link
- test enabled state shows form
- Navbar — test register link hidden when registration disabled
- shown when enabled
- API client — test registration-status endpoint call
- Documentation: .env.example updated with ENABLE_REGISTRATION, docs/auth.md updated with new config option.

## Transition History

| From | To | User | Timestamp | Reason |
|------|----|------|-----------|--------|
| IDLE | DISCOVERY | Arda Kilicdagi | 2026-05-16T21:13:25.020Z | - |
