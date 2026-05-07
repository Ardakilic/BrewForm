# Spec: verify-fix-inline-findings-code-review

## Status: completed

## Concerns: well-engineered, beautiful-product, open-source

## Discovery Answers

### status_quo

The codebase has several minor but real quality gaps: escapeHtml over-escapes slashes breaking OG URL meta tags; appBaseUrl hardcodes the production domain; env config lacks early URL validation for S3 endpoints; a route module exports a utility function causing cyclic import risk; Makefile suppresses stderr hiding CI failures; Dockerfile includes an unused Node.js runtime in the runner stage; deployment docs have markdown lint issues and lack cross-platform Windows guidance. None block production, but they reduce maintainability and correctness.

_-- Arda Kilicdagi_

### ambition

1-star: patch each issue in isolation with minimal diffs. 10-star: every finding is verified against current code, fixed only when still valid, skipped with a brief documented reason, and the entire changeset passes type-check, lint, and tests so the repo is clean and consistent.

_-- Arda Kilicdagi_

### reversibility

All changes are fully reversible. No database migrations, no API breaking changes, no data model changes. The only structural refactor is extracting escapeHtml into a shared utility, which is a pure move with identical behavior.

_-- Arda Kilicdagi_

### user_impact

End-user impact is minimal and positive: OG meta URLs will no longer have escaped slashes (fixing scraper previews), and email notification links will respect the PUBLIC_APP_URL config in preview/non-prod deployments. No breaking changes for existing users.

_-- Arda Kilicdagi_

### verification

Validation plan: 1) Run `deno check --unstable-sloppy-imports apps/api/src/main.ts` to verify type safety after imports move. 2) Run `deno lint apps/ packages/` to catch style issues. 3) Run `deno test apps/api/src/ packages/shared/src/` to confirm tests pass (including the updated share.test.ts import). 4) Run `deno install` after package.json change and verify deno.lock updates cleanly. 5) Manual review of deployment_plan.md markdown with a linter (MD040, MD028).

_-- Arda Kilicdagi_

### scope_boundary

This spec will NOT add new features, change business logic, refactor unrelated modules, or upgrade dependency versions beyond moving mjml to devDependencies. It will NOT build and push a Docker image to empirically test the Node removal; instead it relies on static code audit. It will NOT create a second compose.yml app service (that finding does not exist in the current file).

_-- Arda Kilicdagi_

## Test Strategy (well-engineered)

Unit tests cover `escapeHtml` and `escapeHtmlAttr` behavior. Integration tests are not required because changes are pure refactors or config validation. Run `deno test apps/api/src/ packages/shared/src/` after edits.

## Performance Considerations (well-engineered)

No performance impact. `escapeHtmlAttr` is a single-pass string replacement identical to the previous `escapeHtml` minus one `.replace` call.

## Observability Plan (well-engineered)

No new runtime codepaths or services. Existing logs and metrics remain unchanged.

## Error Handling (well-engineered)

Zod schema changes in `env.ts` will produce clearer early-startup errors for invalid `S3_ENDPOINT` or `S3_PUBLIC_URL`. The `Makefile` `check` target will now surface `deno install` and `prisma generate` stderr for faster CI debugging.

## Security & Threat Model (well-engineered)

No new attack surface. Removing `OPENAPI_ENABLED` in production reduces exposure. `escapeHtmlAttr` preserves HTML attribute escaping (quotes, ampersands, angle brackets) without over-escaping slashes.

## Developer Ergonomics (well-engineered)

Developers on Windows can now copy-paste the correct shell syntax from `deployment_plan.md`. Preview deployments can override the public app URL via `PUBLIC_APP_URL`.

## Design States (empty, loading, error, success) (beautiful-product)

N/A — no UI changes.

## Mobile Layout (beautiful-product)

N/A — no UI changes.

## Interaction Design (beautiful-product)

N/A — no UI changes.

## Accessibility (beautiful-product)

N/A — no UI changes.

## Contributor Guide (open-source)

N/A — no new contributor workflows.

## Public API Surface (open-source)

N/A — no public API changes.

## Decisions

| # | Decision | Choice | Promoted |
|---|----------|--------|----------|
| 1 | Split spec into separate areas? | Chose to keep as single spec despite multiple areas detected | no |

## Out of Scope

- This spec will NOT add new features, change business logic, refactor unrelated modules, or upgrade dependency versions beyond moving mjml to devDependencies
- It will NOT build and push a Docker image to empirically test the Node removal
- instead it relies on static code audit
- It will NOT create a second compose.yml app service (that finding does not exist in the current file).

## Tasks

- [ ] **task-1 — Shared HTML utilities**
  - Create `packages/shared/src/utils/html.ts` exporting `escapeHtml` (with `/` escaping) and `escapeHtmlAttr` (without `/` escaping).
  - Update `packages/shared/src/utils/index.ts` to re-export both.
  - Files: `packages/shared/src/utils/html.ts`, `packages/shared/src/utils/index.ts`

- [ ] **task-2 — Fix share.ts**
  - Import `escapeHtml` and `escapeHtmlAttr` from `@brewform/shared/utils`.
  - Use `escapeHtmlAttr` for `meta.url`, `og:url`, `og:image`, `twitter:image`, and `href` attributes in `OG_TEMPLATE`.
  - Extract the repeated 404 HTML literal into a module-scope constant `RECIPE_NOT_FOUND_HTML` and replace both usages.
  - Remove the local `escapeHtml` export.
  - Files: `apps/api/src/routes/share.ts`

- [ ] **task-3 — Fix notify/index.ts**
  - Import `escapeHtml` from `@brewform/shared/utils` instead of `../../routes/share.ts`.
  - Update `appBaseUrl()` to read `config.PUBLIC_APP_URL` and fall back to the previous env-based logic.
  - Files: `apps/api/src/utils/notify/index.ts`

- [ ] **task-4 — Env config & .env.example**
  - Add `PUBLIC_APP_URL: z.string().optional()` to `apps/api/src/config/env.ts`.
  - Change `S3_ENDPOINT` and `S3_PUBLIC_URL` validators from `z.string().optional()` to `z.string().url().optional()`.
  - Add `PUBLIC_APP_URL=` to `.env.example`.
  - Files: `apps/api/src/config/env.ts`, `.env.example`

- [ ] **task-5 — Move mjml to devDependencies**
  - Move `"mjml"` from `dependencies` to `devDependencies` in `apps/api/package.json`.
  - Run `deno install` to refresh `deno.lock`.
  - Verify `apps/api/scripts/build-email-templates.ts` still resolves `npm:mjml@^4.15.0`.
  - Files: `apps/api/package.json`, `deno.lock`

- [ ] **task-6 — Dockerfile runtime cleanup**
  - Remove the `RUN apt-get ... nodejs` block from the `runner` stage (runtime does not invoke `node`).
  - Keep Node in `deps` and `builder` stages for Prisma CLI/generate.
  - Files: `Dockerfile`

- [ ] **task-7 — compose.yml garage dependency**
  - Add `garage` with `condition: service_started` to the `app` service `depends_on`.
  - Note: no second `app` service exists around lines 73-84; skip that sub-finding.
  - Files: `compose.yml`

- [ ] **task-8 — Makefile stderr visibility**
  - Remove `2>/dev/null` from `deno install` and `prisma generate` inside the `check` target bash string.
  - Preserve `&&` chaining and remaining commands.
  - Files: `Makefile`

- [ ] **task-9 — deployment_plan.md fixes**
  - Strengthen `OPENAPI_ENABLED` descriptor from "Optional: disable in production" to "Strongly recommended: disable in production / set to `false`"; add a one-line note after the table.
  - Add `text` language identifier to the fenced code block containing "Prisma Migrate: applying migrations..." (MD040).
  - Remove the blank `>` line inside the blockquote around "Apex domain note" (MD028) by splitting into two blockquotes.
  - Add Windows PowerShell (`$env:VITE_API_URL="..."`) and cmd.exe (`set VITE_API_URL=...`) equivalents next to the existing `export VITE_API_URL=...` line.
  - Add a new "Database Connection Errors" troubleshooting entry covering Prisma Accelerate timeouts, migration locks, connection pool exhaustion, and network issues with concise fixes.
  - Files: `deployment_plan.md`

- [ ] **task-10 — Validation**
  - Run `deno check --unstable-sloppy-imports apps/api/src/main.ts`.
  - Run `deno lint apps/ packages/`.
  - Run `deno test apps/api/src/ packages/shared/src/`.
  - Run `deno install` and verify `deno.lock` is consistent.
  - Files: N/A (validation commands)

## Verification

- Validation plan: 1) Run `deno check --unstable-sloppy-imports apps/api/src/main.ts` to verify type safety after imports move. 2) Run `deno lint apps/ packages/` to catch style issues. 3) Run `deno test apps/api/src/ packages/shared/src/` to confirm tests pass (including the updated share.test.ts import). 4) Run `deno install` after package.json change and verify deno.lock updates cleanly. 5) Manual review of deployment_plan.md markdown with a linter (MD040, MD028).

## Transition History

| From | To | User | Timestamp | Reason |
|------|----|------|-----------|--------|
| IDLE | DISCOVERY | Arda Kilicdagi | 2026-05-06T09:57:48.318Z | - |
