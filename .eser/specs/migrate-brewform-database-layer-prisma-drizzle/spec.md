# Spec: migrate-brewform-database-layer-prisma-drizzle

## Status: completed

## Concerns: well-engineered, beautiful-product, open-source

## Discovery Answers

### status_quo

Today BrewForm uses Prisma ORM with dual-mode clients (standard + Deno edge with Accelerate). Prisma requires binary generation, schema-to-client compilation, and Accelerate connection strings on Deno Deploy. This adds build-time complexity, dependency on Prisma-specific infrastructure (Prisma Postgres + Accelerate), and larger bundle sizes. The current API layer has 20+ model files using prisma.xxx.find/findMany/create/update patterns with extensive any casts.

### ambition

1-star: Replace Prisma with Drizzle but break tests, lose seed data, and require manual DB fixes. 10-star: Seamless migration where all 24 models, 12 enums, 40+ indexes, relations, and seed data are preserved. API contract unchanged. Type-check passes. All tests pass. CI/CD updated. Deployment docs updated for standard PostgreSQL (no Prisma-specific services). Local dev works with docker compose postgres. Deno Deploy works with postgres-js and standard DATABASE_URL.

### reversibility

Partially reversible. If the Drizzle migration SQL is additive-only (same columns, same types), we can revert to Prisma by restoring the old client and schema. However, after data is written via Drizzle, rolling back to Prisma requires re-running Prisma migrations. We will validate on a fresh DB first and ensure the generated 0000_init.sql is additive-only.

### user_impact

Zero user-facing impact. The API contract remains unchanged. All endpoints return identical data shapes. This is a pure infrastructure refactor. Existing users data is preserved because schema is replicated 1:1.

### verification

1) Static: deno check passes on apps/api/src/main.ts and apps/web/src/main.tsx. deno lint and deno fmt --check pass. Zero @prisma/client imports remain. 2) DB: drizzle-kit generate produces valid SQL. Migration applies cleanly to fresh PostgreSQL. Seed script runs without errors. All 24 tables have correct row counts. 3) Functional: GET /health and /ready return correctly. Register, login, create recipe, fork, like, comment, follow, badge evaluation, admin stats all work. 4) Tests: All existing test suites pass. 5) Deployment docs updated.

### scope_boundary

This migration does NOT: change the database schema (no new columns, no renames), replace the web frontend framework, change the storage driver (S3/local), modify email delivery, add new features, or optimize query performance beyond mechanical translation. It DOES migrate model files to use Drizzle-inferred types instead of any casts. It does NOT migrate away from Hono or change the API contract.

## Tasks

- [x] task-1: Create Drizzle schema (packages/db/src/schema.ts) with all 24 pgTable models, 12 pgEnums, 40+ indexes, relations() helpers. Use Drizzle type inference. Files: packages/db/src/schema.ts
- [x] task-2: Update DB package driver (packages/db/src/index.ts) to export postgres-js client + drizzle db instance. Remove Prisma conditional import. Files: packages/db/src/index.ts
- [x] task-3: Create drizzle-kit config (packages/db/drizzle.config.ts) for PostgreSQL dialect. Files: packages/db/drizzle.config.ts
- [x] task-4: Rewrite seed script (packages/db/src/seed.ts) using Drizzle insert/returning. Preserve exact seed data: SCAA taste notes, brew method rules, 10 badges, 3 users, 7 equipment, 1 vendor, 1 bean, 2 recipes with versions/equipment, social data, 2 setups, 1 userBadge. Files: packages/db/src/seed.ts
- [x] task-5: Migrate API model files from Prisma to Drizzle queries with proper Drizzle type inference, removing no-explicit-any lint ignores where feasible. Files: apps/api/src/modules/auth/model.ts, apps/api/src/modules/user/model.ts, apps/api/src/modules/recipe/model.ts, apps/api/src/modules/equipment/model.ts, apps/api/src/modules/comment/model.ts, apps/api/src/modules/follow/model.ts, apps/api/src/modules/badge/model.ts, apps/api/src/modules/admin/model.ts, apps/api/src/modules/setup/model.ts, apps/api/src/modules/preference/model.ts, apps/api/src/modules/vendor/model.ts, apps/api/src/modules/bean/model.ts, apps/api/src/modules/taste/model.ts, apps/api/src/modules/photo/model.ts, apps/api/src/modules/qrcode/model.ts, apps/api/src/modules/report/model.ts
- [x] task-6: Migrate service/util files with Prisma references. Files: apps/api/src/modules/recipe/service.ts, apps/api/src/utils/notify/index.ts, apps/api/src/setup.ts
- [x] task-7: Migrate middleware and entry points. Files: apps/api/src/middleware/auth.ts, apps/api/src/routes/health.ts, apps/api/src/main.ts
- [x] task-8: Update dependencies and scripts in package.json files. Remove @prisma/client, prisma, @prisma/extension-accelerate. Add drizzle-orm, drizzle-kit, postgres. Update db:generate, db:migrate, db:seed scripts. Files: package.json, packages/db/package.json
- [x] task-9: Update Makefile commands from Prisma to Drizzle equivalents. Files: Makefile
- [x] task-10: Update CI/CD workflows. Replace Prisma generate/migrate with drizzle-kit. Files: .github/workflows/ci.yml, .github/workflows/pr.yml
- [x] task-11: Update Dockerfile. Remove Prisma generate step. Files: Dockerfile
- [x] task-12: Update deno.json test include paths. Remove packages/db/prisma/, add packages/db/src/. Files: deno.json
- [x] task-13: Update deployment docs. Remove Prisma Postgres/Accelerate references. Use standard postgresql:// DATABASE_URL. Files: deployment_plan.md, docs/deployment.md, docs/architecture.md, README.md
- [x] task-14: Run full verification: deno check, deno lint, deno fmt --check, generate migration, test seed on fresh DB, run all test suites. Files: all
- [x] task-15: Update tests that import from @brewform/db or reference Prisma types. Files: apps/api/src/**/*.test.ts

## Verification

- 1) Static: deno check passes on apps/api/src/main.ts and apps/web/src/main.tsx. deno lint and deno fmt --check pass
- Zero @prisma/client imports remain. 2) DB: drizzle-kit generate produces valid SQL
- Migration applies cleanly to fresh PostgreSQL
- Seed script runs without errors
- All 24 tables have correct row counts. 3) Functional: GET /health and /ready return correctly
- Register, login, create recipe, fork, like, comment, follow, badge evaluation, admin stats all work. 4) Tests: All existing test suites pass. 5) Deployment docs updated.

## Transition History

| From | To | User | Timestamp | Reason |
|------|----|------|-----------|--------|
| IDLE | DISCOVERY | Arda Kilicdagi | 2026-05-06T14:19:04.552Z | - |
