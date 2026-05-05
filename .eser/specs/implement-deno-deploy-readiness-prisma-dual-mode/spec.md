# Spec: implement-deno-deploy-readiness-prisma-dual-mode

## Status: completed

## Concerns: well-engineered, beautiful-product, open-source

## Discovery Answers

### status_quo

[STATED] The app currently cannot deploy to Deno Deploy. Key blockers (verified by reading code): (1) Prisma binary engine incompatible with Deno Deploy isolates — packages/db/src/index.ts imports @prisma/client directly. (2) Runtime MJML compilation uses node:fs and node:path — apps/api/src/modules/auth/email.ts and utils/notify/index.ts. (3) setInterval-based jobs in utils/jobs/index.ts dont run on Deploy. (4) Local filesystem uploads via Deno.writeFile ephemeral on Deploy. (5) CI uses npm install/npx instead of deno-native commands. (6) Frontend deploys to GitHub Pages instead of Deno Deploy static site. (7) Explicit port binding in main.ts fails on Deploy. (8) Unconditional SIGTERM/SIGINT handlers may cause issues on Deploy.

_-- Arda Kilicdagi_

### ambition

[STATED] 1-star: App deploys to Deno Deploy but local dev requires cloud services or is broken. 10-star (plan target): Seamless local development fully offline-capable, one-command deploy to Deno Deploy. All 16 features in the verification checklist work identically in both environments. Contributors can run `deno task dev` and have postgres, mailpit, s3 (garage), cache, and cron jobs all working locally.

_-- Arda Kilicdagi_

### reversibility

[INFERRED] This is a low-risk, largely reversible refactor. No database migrations or schema changes. The Prisma dual-generator is additive — existing binary client remains. Generated email templates are derived from source .mjml files. S3 storage driver is behind an env var switch. All changes are gated by env vars (DENO_DEPLOY, STORAGE_DRIVER, etc.). Rollback = revert commits + reset env vars.

_-- Arda Kilicdagi_

### user_impact

[STATED] Zero breaking changes to API consumers or end users. This is pure infrastructure refactoring. Contributors benefit from: deno-native tasks (no npm/npx), local S3 testing with Garage, comprehensive env config, and clearer separation between local and deploy concerns. Time-to-hello-world: `deno task dev` starts API + docker compose up -d starts postgres + mailpit + garage.

_-- Arda Kilicdagi_

### verification

[STATED] Verify via the 16-item checklist in coding_plan.md Section 16: API server, frontend dev, database, migrations, seed, admin setup, email (SMTP), file upload (local + S3/Garage), cache, cron jobs, QR codes, auth, photo upload. Technical verification: `deno check`, `deno lint`, `deno test`, `deno task db:generate`, `deno run -A apps/api/scripts/build-email-templates.ts`. CI workflow updated to deno-native commands.

_-- Arda Kilicdagi_

### scope_boundary

[STATED] Out of scope: Deno Deploy project provisioning, DNS configuration (brewform.cc / api.brewform.cc), Prisma Accelerate account setup, actual deployment execution. These are covered in deployment_plan.md, not coding_plan.md. In scope: all code changes required for Deploy compatibility. Also out of scope: new features, UI redesign, database schema changes, auth mechanism changes.

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

- Deno Deploy dashboard project creation, DNS configuration, domain verification, production database provisioning, production data seeding, monitoring setup

## Tasks

- [x] task-1: Prisma dual-mode, pre-compile MJML email templates, S3-compatible storage abstraction with local fallback, Deno.cron jobs, conditional signal handling, static site config, API entry point refactor, logger cleanup, env vars, remove node imports, CI/CD update, dependency cleanup
- [x] task-2: Run deno check, deno test, local e2e smoke test. Specific verification plan: deno check, deno test, local e2e, S3 driver test, build frontend, generate Prisma edge client
- [x] task-3: Write or update tests for all new and changed behavior
- [x] task-4: Update documentation for all public-facing changes

## Verification

- deno check --unstable-sloppy-imports apps/api/src/main.ts must pass
- deno test apps/api/src/ packages/shared/src/ must pass
- local e2e: register user, create recipe, upload photo, check Mailpit, verify cron job registration logs
- test S3 driver with Garage credentials
- build frontend: cd apps/web && deno task build
- generate Prisma edge client: deno task db:generate

## Transition History

| From | To | User | Timestamp | Reason |
|------|----|------|-----------|--------|
| IDLE | DISCOVERY | Arda Kilicdagi | 2026-05-04T20:01:21.262Z | - |
| SPEC_PROPOSAL | SPEC_APPROVED | Arda Kilicdagi | 2026-05-04T20:25:51.262Z | - |
