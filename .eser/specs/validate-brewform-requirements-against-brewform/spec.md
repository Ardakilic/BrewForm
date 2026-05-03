# Spec: validate-brewform-requirements-against-brewform

## Status: completed

## Concerns: well-engineered, beautiful-product, open-source

## Discovery Answers

### status_quo

No systematic process exists for verifying BrewForm codebase alignment with brewform-plan.md. Verification is ad-hoc or relies on PR review memory.

_-- Arda Kilicdagi_

### ambition

1-star: A manual markdown checklist I review myself. 10-star: An automated, repeatable audit run via Docker/Makefile that checks every plan section against code, runs tests, and produces a prioritized gap report with fix recommendations — as thorough as an external QA audit but executable on every PR.

_-- Arda Kilicdagi_

### reversibility

Fully reversible. This spec produces documentation and findings, not code changes. The audit report can be discarded or regenerated at any time.

_-- Arda Kilicdagi_

### user_impact

No user-facing behavior changes. This affects the developer workflow by introducing a structured compliance checklist. It may surface gaps that lead to future PRs, but the spec itself is read-only.

_-- Arda Kilicdagi_

### verification

Code inspection comparing every brewform-plan.md section against the actual codebase, plus test execution via Docker/Makefile (make check, make test, make test-coverage). Runtime verification by building and running the app stack.

_-- Arda Kilicdagi_

### scope_boundary

No exclusions — full plan alignment audit covering all sections. Performance, security, and design quality are included only where the plan explicitly mentions them. This is NOT a general security audit or load test.

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

## Accessibility (beautiful-product)

_To be addressed during execution._

## Out of Scope

- No exclusions — full plan alignment audit covering all sections
- Performance, security, and design quality are included only where the plan explicitly mentions them
- This is NOT a general security audit or load test.

## Tasks

- [x] task-1: Docker build & stack health verification**
Run `make build` and `make up` to verify the app stack builds and starts. Confirm app, postgres, mailpit, pgadmin containers are healthy. Document any build errors or missing services.
AC: `docker compose ps` shows all services Up. `make logs` shows no fatal errors.
Files: `Dockerfile`, `compose.yml`, `Makefile`

**
- [x] task-2: Test suite execution & coverage analysis**
Run `make check`, `make test`, `make test-coverage`. Record pass/fail counts per workspace. Identify failing tests and critical paths with zero coverage (e.g. validation enforcement, badge automation, photo versioning).
AC: All tests pass OR each failure is documented with plan section reference. Coverage gaps mapped to plan requirements.
Files: `Makefile`, `apps/api/src/**/*.test.ts`, `packages/shared/src/**/*.test.ts`

**
- [x] task-3: Database schema completeness audit**
Compare `packages/db/prisma/schema.prisma` against plan §4 Data Normalization. Verify: all entities (Recipe, RecipeVersion, Equipment, Bean, Setup, TasteNote, Photo, Badge, AuditLog, etc.), enums (Visibility, BrewMethod, DrinkType, EquipmentType), soft delete fields, indexes on filterable fields, and self-referential taste note hierarchy.
AC: Every entity in plan §2 and §3 has a corresponding Prisma model. Every filterable field has an index.
Files: `packages/db/prisma/schema.prisma`

**
- [x] task-4: Backend API modules audit**
Compare `apps/api/src/modules/` against plan §3 Core Features. Verify each module has controller + service + model. Check: auth (JWT, refresh, reset), recipe (CRUD, versioning, fork, visibility), equipment (CRUD, search), bean, vendor, taste (hierarchy, cache), photo (upload, soft-delete), comment (OP badge, reply restriction), follow (feed), badge (evaluation), setup (auto-fill), preference, search, qrcode, report, admin.
AC: Every §3 feature has a corresponding module. Endpoints return consistent response envelopes.
Files: `apps/api/src/modules/**/index.ts`

**
- [x] task-5: Middleware stack audit**
Verify CORS, requestId, rate limiting, error handler, auth middleware match plan §6.5. Check OpenAPI toggle (§6.9), graceful shutdown (§6.7), health/readiness probes (§10.1).
AC: All middleware files present and wired in main.ts. OpenAPI endpoints return 404 when disabled.
Files: `apps/api/src/middleware/*.ts`, `apps/api/src/main.ts`

**
- [x] task-6: Validation rules enforcement audit**
Compare `packages/shared/src/schemas/recipe.ts` and `packages/shared/src/utils/validation.ts` against plan §5. Verify: grindDate >= roastDate hard validation in Zod schema, brew method/drink type compatibility hard validation, soft warnings (ratio, time, temp ranges) are wired into API create/update handlers.
AC: Hard validation blocks save in API. Soft warnings are returned but do not block.
Files: `packages/shared/src/schemas/recipe.ts`, `packages/shared/src/utils/validation.ts`, `apps/api/src/recipe/service.ts`

**
- [x] task-7: Frontend pages & routing audit**
Compare `apps/web/src/router.tsx` and `apps/web/src/pages/` against plan §9. Verify: Home, recipe list/detail/create/edit/compare/print/focus, user profile, search, taste notes, settings, setups, beans, equipment, onboarding, privacy, terms, admin dashboard. Check theme switching (light/dark/coffee), i18n (en/tr).
AC: Every §9.3-9.7 page exists and is routable.
Files: `apps/web/src/router.tsx`, `apps/web/src/pages/**/*.tsx`

**
- [x] task-8: Shared package audit**
Compare `packages/shared/src/` against plan §6.4. Verify: types (Recipe, Equipment, Taste, User, etc.), Zod schemas (auth, recipe, equipment, etc.), constants (brew methods, drink types, emoji tags, units), utils (conversion, metrics, validation, date, slug), i18n (en.json, tr.json).
AC: Every shared export is imported by at least one app. No frontend imports from @brewform/db.
Files: `packages/shared/src/**/*.ts`

**
- [x] task-9: SCAA taste notes & caching audit**
Verify `files/scaa-2.json` exists and matches notbadcoffee.com source. Check `TasteNote` model has 3-level hierarchy with parent_id. Verify TasteAutocomplete debounce, case-insensitive search, parent-child expansion. Verify Deno KV caching with TTL and flush on admin changes.
AC: Taste notes importable. Autocomplete returns hierarchical results. Cache flushes on admin CRUD.
Files: `files/scaa-2.json`, `apps/api/src/taste/**/*.ts`, `apps/web/src/components/TasteAutocomplete.tsx`

**
- [x] task-10: Social features & gamification audit**
Verify: likes/favourites pivot table with timestamp, comments with OP badge and author-only replies, follow/unfollow with feed and email notifications, badge definitions seeded, evaluateBadges service exists. Check if badge evaluation is triggered automatically.
AC: All social DB tables present. Badge evaluation runs manually; automation gap documented.
Files: `apps/api/src/comment/**/*.ts`, `apps/api/src/follow/**/*.ts`, `apps/api/src/badge/**/*.ts`

**
- [x] task-11: Infrastructure & deployment audit**
Verify Dockerfile multi-stage build (deps, builder, runner), compose.yml services (app, postgres, mailpit, pgadmin), Makefile commands (all Docker-based), GitHub Actions CI. Check graceful shutdown, DB connection pooling config, env example completeness.
AC: Dockerfile follows plan §6.3. Makefile has all commands from plan §6.12. .env.example has all keys.
Files: `Dockerfile`, `compose.yml`, `Makefile`, `.github/workflows/*.yml`, `.env.example`

**
- [x] task-12: Compile & deliver prioritized gap report**
Synthesize all audit findings into a single markdown report: per-section scoring (Implemented/Partial/Missing/Not Applicable), prioritized gap list (Critical/Major/Minor), minimal fix recommendations with file references, and architectural decision flags.
AC: Report covers all plan sections §1-§11. Every gap references specific plan paragraph and source file.
Files: `docs/requirements-audit-report.md` (to be created)

## Verification

- Code inspection comparing every brewform-plan.md section against the actual codebase, plus test execution via Docker/Makefile (make check, make test, make test-coverage)
- Runtime verification by building and running the app stack.

## Transition History

| From | To | User | Timestamp | Reason |
|------|----|------|-----------|--------|
| IDLE | DISCOVERY | Arda Kilicdagi | 2026-05-03T14:55:03.760Z | - |
