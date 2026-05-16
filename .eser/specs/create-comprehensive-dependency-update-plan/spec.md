# Spec: create-comprehensive-dependency-update-plan

## Status: executing

## Concerns: well-engineered, beautiful-product, open-source

## Discovery Answers

### status_quo

Today, each dependency is at its current version pinned in deno.lock. Renovate opens PRs one by one, the owner manually reviews each, asks CodeRabbit for analysis, and must figure out interdependencies ad-hoc. No consolidated plan exists.

_-- Arda Kilicdagi_

### ambition

10-star: A detailed, actionable document with version tables per package, exact code changes needed (file paths + line numbers), ordering of operations, a checklist of post-update verification steps, known risk mitigations from each CodeRabbit analysis, and a rollback strategy.

_-- Arda Kilicdagi_

### reversibility

Most changes are reversible via git revert (single branch/PR). Irreversible decisions documented: zod v4 schema API changes, bcryptjs v3 hash format change ($2a$→$2b$), TypeScript 6 default changes. Plan includes reversible vs irreversible classification and rollback section.

_-- Arda Kilicdagi_

### user_impact

End users: minimal (only mjml v5 email template rendering change). Contributors: TypeScript 6 defaults, zod v4 API, vitest v4 APIs change dev workflow. Deprecated packages (@base-ui-components/react→@base-ui/react, @types/bcryptjs removal) need replacement.

_-- Arda Kilicdagi_

### scope_boundary

Plan only, no execution. Only dependency bumps and minimum compatibility code changes. No new features, architecture changes, or tech stack changes. Exception: handle deprecated packages (replace @base-ui-components/react with @base-ui/react, remove @types/bcryptjs as bcryptjs v3 has built-in types). No Docker/CI config changes.

_-- Arda Kilicdagi_

### verification

Checklist: (1) deno fmt --check (formatting must pass) (2) deno lint (linting must pass for all workspace apps/packages) (3) deno task check (type-check all packages) (4) deno test (all tests across all workspace packages must pass) (5) deno task build (web build must succeed) (6) deno task email-build (regenerate email templates with mjml v5) (7) Visual verification of all 6 email templates for mjml v5 background-color change (8) All revised/updated tests must pass. Success = all checks green, zero test failures, zero new type errors.

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

- Plan only, no execution
- Only dependency bumps and minimum compatibility code changes
- No new features, architecture changes, or tech stack changes
- Exception: handle deprecated packages (replace @base-ui-components/react with @base-ui/react, remove @types/bcryptjs as bcryptjs v3 has built-in types)
- No Docker/CI config changes.

## Tasks

- [ ] task-1: Detailed, actionable document with version tables per package, exact code changes needed (file paths + line numbers), ordering of operati...
- [ ] task-2: Checklist: (1) deno fmt --check (formatting must pass) (2) deno lint (linting must pass for all workspace apps/packages) (3) deno task check (type-check all packages) (4) deno test (all tests across all workspace packages must pass) (5) deno task build (web build must succeed) (6) deno task email-build (regenerate email templates with mjml v5) (7) Visual verification of all 6 email templates for mjml v5 background-color change (8) All revised/updated tests must pass. Success = all checks green, zero test failures, zero new type errors.
- [ ] task-3: Write or update tests for all new and changed behavior
- [ ] task-4: Update documentation for all public-facing changes (README, API docs, CHANGELOG)

## Verification

- Checklist: (1) deno fmt --check (formatting must pass) (2) deno lint (linting must pass for all workspace apps/packages) (3) deno task check (type-check all packages) (4) deno test (all tests across all workspace packages must pass) (5) deno task build (web build must succeed) (6) deno task email-build (regenerate email templates with mjml v5) (7) Visual verification of all 6 email templates for mjml v5 background-color change (8) All revised/updated tests must pass
- Success = all checks green, zero test failures, zero new type errors.

## Transition History

| From | To | User | Timestamp | Reason |
|------|----|------|-----------|--------|
| IDLE | DISCOVERY | Arda Kilicdagi | 2026-05-16T14:30:21.465Z | - |
