# Plan 08: Documentation & Polish

**Priority:** 8 (Ongoing)
**Source:** [Deep Dive Analysis](deep-dive-analysis.md) — Phase 8
**Issues:** H1 (JSDoc), M7 (Interactive Onboarding), L1 (Sourcemaps), L5 (Coffee Palette), L6 (Pre-commit Hooks), L8 (ComparePage Naming), L9 (Deprecated Functions), L11 (Declarative Titles)
**Effort:** ~30–45 hours
**Impact:** 📚 Maintainability, 🚀 New user flow, 🔧 Workflow, 🎨 Design system

---

## H1 — Zero JSDoc/TSDoc Across Entire Codebase

**Background:** ~3.5% documentation coverage on ~285 exported functions. New contributors can't understand parameter contracts.

### Tasks — Phase 1 (Core)
1. Document `apps/api/src/modules/recipe/model.ts` — 28 exported functions
2. Document `apps/api/src/modules/recipe/service.ts` — 15 exported functions
3. Document `packages/shared/src/types/` — 16 type files
4. Document `packages/shared/src/utils/validation.ts`

### Tasks — Phase 2 (Secondary)
5. Document remaining 14 module services and models
6. Document frontend components (seo/, recipe/)

---

## M7 — Onboarding Wizard is Static Links, Not Interactive

**Background:** 5-step wizard has zero interactive forms — just informational cards with external links. Collects no user data.

### Tasks
1. Make EquipmentStep interactive: inline form to add first equipment
2. Make BeansStep interactive: inline form to add first bean
3. Make FirstBrewStep interactive: inline mini recipe creation form
4. Mark onboarding complete when user finishes inline steps
5. Keep skip/complete links as fallback

---

## L1 — Vite Build Sourcemaps Disabled

**Background:** `sourcemap: false` in vite.config.ts — no production debugging.

### Tasks
1. If Sentry integrated (Plan 07): set `sourcemap: 'hidden'` + upload to Sentry
2. Otherwise: keep disabled for production bundle size

---

## L5 — Tailwind Coffee Palette Defined But Unused

**Background:** `--color-coffee-50` through `--color-coffee-900` defined in `@theme` but zero usages.

### Tasks
1. Align `--accent-primary`, `--bg-primary` etc. with coffee palette values
2. Use `bg-coffee-50`, `text-coffee-500` directly in components where applicable
3. Or remove unused palette if CSS variables are preferred approach

---

## L6 — No Pre-Commit Formatting Hooks

**Background:** No git pre-commit hook for `deno fmt --check` or `deno lint`.

### Tasks
1. Add `.git/hooks/pre-commit`:
   ```bash
   deno fmt --check
   deno lint
   ```
2. Or add `Makefile` target `make precommit` and document it

---

## L8 — ComparePage Route Params Named :id1/:id2 But Accepts Slugs

**Background:** Route params named `:id` but API accepts both IDs and slugs.

### Tasks
1. Rename params to `:slug1/:slug2` for clarity
2. Or add comment explaining both work

---

## L9 — Three Deprecated Functions in relative-date.ts

**Background:** `roastDateLabel`, `packageOpenDateLabel`, `grindDateLabel` marked `@deprecated` — not called in production, only in tests.

### Tasks
1. Remove deprecated functions
2. Update test files to use non-deprecated equivalents

---

## L11 — No Declarative Page Titles (All Via useEffect)

**Background:** `document.title` set imperatively in `useEffect` — no route-level handle metadata.

### Tasks
1. Option A: Add `handle: { title }` to routes, create effect to read and set title
2. Option B: Keep current approach (works for SPA)

---

## Dependencies

- H1 is the largest effort — spread across multiple sprints
- M7 is a large feature — mini CRUD forms in the wizard
- L1 is conditional on Plan 07 (Observability) Sentry integration
- L5, L6, L8, L9, L11 are standalone polish items
