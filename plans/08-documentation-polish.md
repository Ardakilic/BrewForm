# Plan 08: Documentation & Polish

**Priority:** 8 (Ongoing)
**Source:** [Deep Dive Analysis](deep-dive-analysis.md) — Phase 8
**Issues:** H1 (JSDoc), M7 (Interactive Onboarding), L1 (Sourcemaps), L5 (Coffee Palette), L6 (Pre-commit Hooks), L8 (ComparePage Naming), L9 (Deprecated Functions), L11 (Declarative Titles)
**Effort:** ~30–45 hours
**Impact:** 📚 Maintainability, 🚀 New user flow, 🔧 Workflow, 🎨 Design system

---

## H1 — Zero JSDoc/TSDoc Across Entire Codebase ✅ CONFIRMED

**Evidence:**
- [`apps/api/src/modules/recipe/model.ts`](apps/api/src/modules/recipe/model.ts) — 514 lines, 28 exported functions, **zero** `/**` JSDoc blocks.
- [`apps/api/src/modules/recipe/service.ts`](apps/api/src/modules/recipe/service.ts) — 435 lines, 15 exported functions, **zero** `/**`.
- [`apps/api/src/modules/badge/service.ts`](apps/api/src/modules/badge/service.ts) — 46 lines, zero `/**`.
- [`apps/api/src/modules/comment/service.ts`](apps/api/src/modules/comment/service.ts) — 101 lines, zero `/**`.
- **Overall:** ~285 exported functions across all modules, only ~10 have JSDoc (~3.5% coverage). The only documented files are `auth/jwt.ts`, `utils/response/`, `utils/cache/`, and `middleware/auth.ts`.

**Impact:** New contributors cannot understand parameter contracts without reading full implementation. TypeScript intellisense shows empty tooltips. Complex functions like `forkRecipe` (185 lines, 6 sub-queries, undocumented) are impenetrable.

**Action Plan — Phase 1 (Core):**
1. Document `apps/api/src/modules/recipe/model.ts` — all 28 exported functions with `@param`, `@returns`, `@throws`
2. Document `apps/api/src/modules/recipe/service.ts` — all 15 exported functions
3. Document `packages/shared/src/types/` — all 16 type files with TSDoc on interfaces
4. Document `packages/shared/src/utils/validation.ts`

**Action Plan — Phase 2 (Secondary):**
5. Document remaining 14 module services and models
6. Document frontend components in `apps/web/src/components/seo/`, `apps/web/src/components/recipe/`

**Estimated effort:** Large (20-30 hours total, spread across sprints)

---

## M7 — Onboarding Wizard is Static Links, Not Interactive ✅ CONFIRMED

**Evidence:**
- [`apps/web/src/components/onboarding/OnboardingWizard.tsx`](apps/web/src/components/onboarding/OnboardingWizard.tsx) — 5 steps (`['welcome', 'equipment', 'beans', 'first-brew', 'explore']`).
- Each step is a static informational card with an external link:
  - EquipmentStep (line 97): `<a href='/setups'>` — link away
  - BeansStep (line 112): `<a href='/beans'>` — link away
  - FirstBrewStep (line 130): `<a href='/recipes/new'>` — link away
  - ExploreStep (line 147): `<a href='/recipes'>` — link away
- Only API calls: `skip()` / `complete()` — just sets `onboardingCompleted: true`.
- Wizard collects zero user data.

**Impact:** New users are sent away from the onboarding flow instead of guided through it. High drop-off rate. Missed opportunity for first-experience delight.

**Action Plan:**
1. Make EquipmentStep interactive: inline form to add first equipment
2. Make BeansStep interactive: inline form to add first bean
3. Make FirstBrewStep interactive: inline mini recipe creation form
4. When user completes all steps inline, mark onboarding as complete
5. Keep the skip/complete links as fallback for users who want to skip

**Estimated effort:** Large (8-12 hours — essentially building mini CRUD forms into the wizard)

---

## L1 — Vite Build Sourcemaps Disabled ✅ CONFIRMED

**Evidence:**
- [`apps/web/vite.config.ts:46`](apps/web/vite.config.ts) — `sourcemap: false`.

**Impact:** Production stack traces point to minified code. Debugging production issues requires reproducing locally with sourcemaps enabled.

**Action Plan:**
1. If Sentry integrated (Plan 07): set `sourcemap: 'hidden'` and upload to Sentry
2. Otherwise: keep disabled for production bundle size

**Estimated effort:** Small (5 minutes config change)

---

## L5 — Tailwind Coffee Palette Defined But Unused ✅ CONFIRMED

**Evidence:**
- [`apps/web/src/styles/globals.css:4-13`](apps/web/src/styles/globals.css) — `--color-coffee-50` through `--color-coffee-900` defined in `@theme`.
- Search for `coffee-500`, `coffee-400` as Tailwind classes in `apps/web/src/` — **zero usages**.
- Components use `var(--accent-primary)` etc. which happen to map to coffee tones, but not the coffee palette directly.

**Impact:** Dead CSS code in the theme configuration. Inconsistency between defined palette and actual usage.

**Action Plan:**
1. Align `--accent-primary`, `--bg-primary`, etc. with coffee palette values in `:root`, `.dark`, `.coffee` blocks
2. Use `bg-coffee-50`, `text-coffee-500` directly in components where the palette values suffice
3. Or remove unused palette if CSS variables are the preferred theming approach

**Estimated effort:** Small (30 minutes)

---

## L6 — No Pre-Commit Formatting Hooks ✅ CONFIRMED

**Evidence:**
- `.git/hooks/pre-commit` — missing. No `husky`, `lint-staged`, or `.pre-commit-config.yaml`.

**Impact:** Inconsistent code formatting in commits. CI must catch formatting issues that could be caught earlier.

**Action Plan:**
1. Add a simple pre-commit hook in `.git/hooks/pre-commit`:
   ```bash
   #!/bin/sh
   deno fmt --check
   deno lint
   ```
2. Or add a `Makefile` target `make precommit` and document it

**Estimated effort:** Small (15 minutes)

---

## L8 — ComparePage Route Params Named :id1/:id2 But Accepts Slugs ✅ CONFIRMED

**Evidence:**
- [`apps/web/src/router.tsx:70`](apps/web/src/router.tsx) — `path: 'recipes/compare/:id1/:id2'`
- [`apps/web/src/pages/recipes/RecipeComparePage.tsx:23-25`](apps/web/src/pages/recipes/RecipeComparePage.tsx) — Calls `recipeApi.get(id1)` and `recipeApi.get(id2)` — the API accepts both IDs and slugs

**Impact:** Parameter name is misleading. Future developers might assume numeric IDs and add parsing logic that breaks with slugs.

**Action Plan:**
1. Rename params to `:slug1/:slug2` for clarity
2. Or keep and add a comment explaining both work

**Estimated effort:** Small (5 minutes)

---

## L9 — Three Deprecated Functions in relative-date.ts ⚠️ PARTIAL

**Evidence:**
- [`apps/web/src/utils/relative-date.ts:75-93`](apps/web/src/utils/relative-date.ts) — `roastDateLabel`, `packageOpenDateLabel`, `grindDateLabel` marked `@deprecated`.
- Search for these in production `.tsx` files — **zero calls**. Only referenced in test files (`relative-date.test.ts`, `BeanSection.test.tsx`).
- Production code (`BeanSection.tsx:3-6`) correctly uses non-deprecated replacements: `roastDateResult`, `packageOpenDateResult`, `grindDateResult`.

**Impact:** Dead code that increases maintenance surface. Low priority — they linger but aren't actively misused.

**Action Plan:**
1. Remove deprecated functions
2. Update test files to use non-deprecated equivalents

**Estimated effort:** Small (15 minutes)

---

## L11 — No Declarative Page Titles (All Via useEffect) ✅ CONFIRMED

**Evidence:**
- [`apps/web/src/components/seo/SEOHead.tsx:22`](apps/web/src/components/seo/SEOHead.tsx) — `document.title = title ? \`${title} | BrewForm\` : 'BrewForm — Coffee Brewing Recipes'` — done imperatively in `useEffect`.
- Search for `handle.*title`, `meta.*title` in router — **zero results**.
- No route uses React Router's `handle` property for declarative metadata.

**Impact:** Page titles are scattered across components via `useEffect` calls. Hard to audit which pages set which titles, or if any are missed.

**Action Plan:**
1. **Option A (declarative):** Add `handle: { title: 'Home' }` to each route, create a top-level effect that reads active route's handle and sets `document.title`
2. **Option B:** Keep current approach but ensure SEOHead is present on every page
3. Current approach works for an SPA; low priority unless SSR is added

**Estimated effort:** Small (30 minutes)

---

## Dependencies

- H1 is the largest effort — spread across multiple sprints
- M7 is a large feature — mini CRUD forms in the wizard
- L1 is conditional on Plan 07 (Observability) Sentry integration
- L5, L6, L8, L9, L11 are standalone polish items
