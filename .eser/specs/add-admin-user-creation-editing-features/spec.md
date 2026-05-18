# Spec: add-admin-user-creation-editing-features

## Status: completed

## Concerns: well-engineered, beautiful-product, open-source

## Discovery Answers

### status_quo

Currently, the admin panel has only list, ban, and unban for users. The ban/unban feature is BROKEN — frontend calls POST /unban (non-existent endpoint) with empty body, while backend expects POST /ban with { userId, banned: boolean }. No create user UI exists (POST /admin/users route stub exists in backend). No edit user capability. No ban reason tracking. The user list lacks pagination on frontend. Admins who need to fix a user email or reset a password must do it directly in the database.

_-- Arda Kilicdagi_

### ambition

10-STAR FULL EXPERIENCE. Create/edit forms with polished inline validation, loading skeletons, success/error toasts. User detail page showing stats (recipe count, followers, comments, badges). Ban dialog with required reason and confirmation step. User list with pagination and search. Dedup utility well-tested and documented. All error messages follow well-engineered standard (what went wrong, why, what to do). Every interaction state designed: loading, empty, error, success, edge cases (long names, duplicate emails, network failure). No AI slop — intentional design following existing admin panel aesthetic.

_-- Arda Kilicdagi_

### reversibility

No irreversible DB schema changes (ban reason stored in audit log, not new column). API contracts use existing patterns (Zod schemas, Hono validation, consistent JSON envelope). PATCH /admin/users/:id is a partial update (only update provided fields, blank password = skip). Audit log entries are additive. Frontend is fully reversible. Contract risk is acceptable — the payload shapes follow established conventions.

_-- Arda Kilicdagi_

### user_impact

No breaking changes to existing users. Admin users get new capabilities: create/edit buttons on user list, separate route pages for create/detail/edit. Ban flow gains a required reason field (intentional accountability). Self-protection: admins cannot edit or delete their own account via admin panel (redirected to profile settings). Admin-created users receive the same welcome email as self-registered users. Contributors gain a new generateUniqueUsername utility in @brewform/shared as a standard pattern.

_-- Arda Kilicdagi_

### verification

4 test layers: (1) Shared schema tests for AdminCreateUserSchema/AdminUpdateUserSchema validation rules; (2) Shared util tests for generateUniqueUsername with 0/1/multiple conflicts; (3) Backend unit tests for service functions (create, update, ban with reason, self-edit prevention, uniqueness checks); (4) Backend integration tests via Hono test client for full endpoints with auth. Frontend component tests for create/edit forms. Acceptance criteria: create user appears in list + welcome email sent; edit validates uniqueness; duplicate email/username shows error; self-edit returns 403 with clear message; ban requires reason stored in audit log; user list is paginated with working search.

_-- Arda Kilicdagi_

### scope_boundary

EXCLUDED: Social login/OAuth integration (dedup utility is built but not wired to any OAuth flow); batch user operations (multi-ban, multi-delete); user impersonation; email verification for admin-initiated email changes (no confirmation email); notification to user on admin profile edit (only welcome email on create); last-active/online status tracking; admin dashboard changes; any changes to non-admin user flows (registration, login, profile self-edit unchanged).

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

- EXCLUDED: Social login/OAuth integration (dedup utility is built but not wired to any OAuth flow)
- batch user operations (multi-ban, multi-delete)
- user impersonation
- email verification for admin-initiated email changes (no confirmation email)
- notification to user on admin profile edit (only welcome email on create)
- last-active/online status tracking
- admin dashboard changes
- any changes to non-admin user flows (registration, login, profile self-edit unchanged).

## Tasks

- [x] task-1: Add AdminCreateUserSchema and AdminUpdateUserSchema to packages/shared/src/schemas/admin.ts. Files: `packages/shared/src/schemas/admin.ts`
- [x] task-2: Add generateUniqueUsername utility function to packages/shared/src/utils/username.ts with JSDoc. Implements dedup with -1, -2 suffix pattern. Files: `packages/shared/src/utils/username.ts`
- [x] task-3: Write unit tests for AdminCreateUserSchema, AdminUpdateUserSchema in packages/shared/src/schemas/admin.test.ts. Test valid/invalid payloads, edge cases. Files: `packages/shared/src/schemas/admin.test.ts`
- [x] task-4: Write unit tests for generateUniqueUsername in packages/shared/src/utils/username.test.ts. Test no conflict, single conflict, multiple conflicts, edge cases. Files: `packages/shared/src/utils/username.test.ts`
- [x] task-5: Add adminUpdateUser, isUsernameTaken, isEmailTaken functions to apps/api/src/modules/admin/model.ts. adminUpdateUser does partial update, isUsernameTaken/isEmailTaken accept optional excludeId for edit uniqueness. Files: `apps/api/src/modules/admin/model.ts`
- [x] task-6: Update adminCreateUser in apps/api/src/modules/admin/service.ts to validate email/username uniqueness with clear errors. Update banUser to accept reason and store in auditLogs.details. Add adminUpdateUser with self-edit prevention (403), field uniqueness, audit logging (UPDATE_USER). Update unbanUser to clear ban context. Files: `apps/api/src/modules/admin/service.ts`
- [x] task-7: Add PATCH /admin/users/:id route to apps/api/src/modules/admin/index.ts with AdminUpdateUserSchema validation. Update POST /admin/users/:id/ban to accept reason in body. All routes behind authMiddleware + adminMiddleware. Files: `apps/api/src/modules/admin/index.ts`
- [x] task-8: Write backend unit tests in apps/api/src/modules/admin/service.test.ts for: adminCreateUser (success, duplicate email, duplicate username, invalid data), adminUpdateUser (success, self-edit forbidden, email uniqueness on edit, username uniqueness on edit), banUser with reason, unbanUser clearing context. Files: `apps/api/src/modules/admin/service.test.ts`
- [x] task-9: Write backend integration tests for new endpoints using Hono test client. Test POST /admin/users, PATCH /admin/users/:id, POST /admin/users/:id/ban with auth checks, admin-only checks, validation errors, success flows. Files: `apps/api/src/modules/admin/` (new test file or extend existing)
- [x] task-10: Add isUsernameTaken, isEmailTaken helpers to apps/api/src/modules/auth/model.ts. Integrate generateUniqueUsername from @brewform/shared into auth/service.ts register flow as standard approach comment. Files: `apps/api/src/modules/auth/model.ts`, `apps/api/src/modules/auth/service.ts`
- [x] task-11: Fix ban/unban in AdminUsersPage.tsx: use correct POST /admin/users/:id/ban endpoint with { userId, banned: boolean, reason } payload. Add ban reason required input in ban confirmation dialog. Files: `apps/web/src/pages/admin/AdminUsersPage.tsx`
- [x] task-12: Add pagination controls to AdminUsersPage.tsx (page numbers, prev/next, per-page selector). Wire to existing backend pagination. Add loading skeletons and empty state. Files: `apps/web/src/pages/admin/AdminUsersPage.tsx`
- [x] task-13: Create AdminUserCreatePage.tsx at /admin/users/new with form fields (email, username, password, displayName, bio, isAdmin, isBanned). Client-side validation, loading state, success redirect to list, error display. Files: `apps/web/src/pages/admin/AdminUserCreatePage.tsx` (new)
- [x] task-14: Create AdminUserEditPage.tsx at /admin/users/:id/edit with form pre-populated from GET /admin/users/:id. Password fields optional (blank = keep). Self-edit redirect with message. Loading skeleton, error state, success toast + redirect. Files: `apps/web/src/pages/admin/AdminUserEditPage.tsx` (new)
- [x] task-15: Create AdminUserDetailPage.tsx at /admin/users/:id showing user info (email, username, displayName, bio, join date, admin/banned badges, ban reason if banned) plus stats (recipe count, follower count, following count). Loading skeleton, error state, user not found state. Edit and Ban action buttons. Files: `apps/web/src/pages/admin/AdminUserDetailPage.tsx` (new)
- [x] task-16: Add routes to apps/web/src/router.tsx: /admin/users/new -> AdminUserCreatePage, /admin/users/:id -> AdminUserDetailPage, /admin/users/:id/edit -> AdminUserEditPage. All wrapped in RequireAuth requireAdmin. Files: `apps/web/src/router.tsx`
- [x] task-17: Add admin API functions to apps/web/src/api/index.ts: adminCreateUser, adminUpdateUser, adminGetUserDetail. Follow existing api client patterns. Files: `apps/web/src/api/index.ts`
- [x] task-18: Update docs/api.md with new endpoints: POST /admin/users (enhanced), PATCH /admin/users/:id (new), POST /admin/users/:id/ban (updated with reason). Include request/response examples. Files: `docs/api.md`
- [x] task-19: Update docs/auth.md with username uniqueness strategy section and generateUniqueUsername standard approach. Files: `docs/auth.md`
- [x] task-20: Create admin_users_plan.md at repository root with comprehensive implementation plan covering all above tasks, file changes, architecture decisions, error handling map, test strategy. Files: `admin_users_plan.md` (new)
- [x] task-21: Create pr_description.md at repository root with PR summary, changes breakdown, testing notes, screenshots placeholder, review checklist. Files: `pr_description.md` (new)

## Verification

- 4 test layers: (1) Shared schema tests for AdminCreateUserSchema/AdminUpdateUserSchema validation rules
- (2) Shared util tests for generateUniqueUsername with 0/1/multiple conflicts
- (3) Backend unit tests for service functions (create, update, ban with reason, self-edit prevention, uniqueness checks)
- (4) Backend integration tests via Hono test client for full endpoints with auth
- Frontend component tests for create/edit forms
- Acceptance criteria: create user appears in list + welcome email sent
- edit validates uniqueness
- duplicate email/username shows error
- self-edit returns 403 with clear message
- ban requires reason stored in audit log
- user list is paginated with working search.

## Transition History

| From | To | User | Timestamp | Reason |
|------|----|------|-----------|--------|
| IDLE | DISCOVERY | Arda Kilicdagi | 2026-05-18T20:27:00.730Z | - |
