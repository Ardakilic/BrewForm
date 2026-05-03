# Spec: fix-critical-gaps-brewform-requirements-audit

## Status: completed

## Concerns: well-engineered, beautiful-product, open-source

## Discovery Answers

### status_quo

App crashes on Docker start due to Prisma/Deno npm compat issue. Recipe creation form has no equipment picker or setup auto-fill. Badge evaluation service exists but is never triggered automatically — gamification is dead code. Social sharing produces ugly links because OG meta tags are injected client-side and invisible to crawlers.

_-- Arda Kilicdagi_

### ambition

1-star: Each gap fixed minimally — Prisma imports refactored or upgraded, equipment picker added to recipe form, badge triggers wired inline on relevant actions, lightweight /share/:slug endpoint created for crawlers. 10-star: All of above + soft validation warnings surfaced in UI, unit preferences consumed by recipe display, full integration tests for critical paths, updated API docs and README.

_-- Arda Kilicdagi_

### reversibility

Fully reversible. Each fix is localized and independent. Prisma import changes can be reverted. Equipment form fields can be removed. Badge trigger calls can be deleted. Share endpoint can be removed.

_-- Arda Kilicdagi_

### user_impact

No breaking changes to existing data or user behavior. All changes are additive or fix broken functionality. Existing recipes, users, badges remain intact. New behavior: users can select equipment when creating recipes, earn badges automatically, share recipes with rich previews.

_-- Arda Kilicdagi_

### verification

For each fix: (1) Run make build to verify Docker build succeeds, (2) Run make test to verify existing tests still pass, (3) Run app via make up and verify container stays healthy, (4) Manually verify the specific feature: equipment selection in recipe form, badge evaluation after recipe creation, share URL returns proper meta tags.

_-- Arda Kilicdagi_

### scope_boundary

Do NOT redesign UI beyond adding necessary form fields. Do NOT add new features beyond the 4 critical gaps. Do NOT change authentication or authorization. Do NOT modify database schema. Major gaps from audit (M1-M8) are explicitly out of scope.

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

- Do NOT redesign UI beyond adding necessary form fields
- Do NOT add new features beyond the 4 critical gaps
- Do NOT change authentication or authorization
- Do NOT modify database schema
- Major gaps from audit (M1-M8) are explicitly out of scope.

## Tasks

- [x] task-1: Upgrade Prisma and fix runtime Deno compatibility**
Research latest Prisma version compatible with Deno 2.7.13. Update packages/db/package.json prisma and @prisma/client versions. Run prisma generate. Fix errorHandler.ts to avoid `import { Prisma } from @prisma/client` — use string-based error code checks (`err.name`, `err.code`) for PrismaClientKnownRequestError and PrismaClientValidationError. Verify app container starts successfully with `make build && make up`.
AC: `docker compose logs app` shows no SyntaxError. App container stays running. `make test` passes.
Files: `packages/db/package.json`, `apps/api/src/middleware/errorHandler.ts`

**
- [x] task-2: Add equipment picker and setup auto-fill to recipe form**
Add equipment selection UI to RecipeCreatePage.tsx using existing equipment API. Fetch user equipment list via equipmentApi.list(). Display as multi-select. Pass equipmentIds array in submit payload. Optionally add setup selector that auto-fills grinder, brewer details when selected.
AC: User can select multiple pieces of equipment when creating a recipe. Selected equipment is saved and displayed on recipe detail page.
Files: `apps/web/src/pages/recipes/RecipeCreatePage.tsx`, `apps/api/src/modules/recipe/service.ts`

**
- [x] task-3: Wire badge evaluation triggers inline**
Import evaluateBadges from badge service into recipe, comment, follow, and recipe-fork service paths. After successful recipe creation, comment creation, fork creation, or follow action, fire `evaluateBadges(userId)` in a fire-and-forget async block with try/catch so badge errors never block user actions.
AC: After creating a recipe, the user earns applicable badges (e.g., First Brew, Decade Brewer). Badge evaluation runs without blocking the API response.
Files: `apps/api/src/modules/recipe/service.ts`, `apps/api/src/modules/comment/service.ts`, `apps/api/src/modules/follow/service.ts`

**
- [x] task-4: Create /share/:slug endpoint for crawler-visible OG tags**
Create a new Hono route `/share/:slug` that fetches recipe metadata via existing getRecipeMeta service. Return HTML with proper `<meta property="og:...">` tags including title, description, image URL, and site name. Include a `<script>` that redirects human users to the SPA recipe page. Return 404 for non-public recipes. Register route in main.ts.
AC: `curl /share/public-recipe-slug` returns HTML with og:title, og:description, og:image, og:url meta tags. Non-public recipes return 404.
Files: `apps/api/src/routes/share.ts` (new), `apps/api/src/main.ts`

**
- [x] task-5: Update SEOHead to use share endpoint**
Update SEOHead component or recipe detail page to use `/share/:slug` as the canonical share URL. Update any share buttons to copy the `/share/:slug` URL instead of `/recipes/:slug`.
AC: Share button copies `/share/:slug` URL. Social platforms crawling this URL receive proper meta tags.
Files: `apps/web/src/components/seo/SEOHead.tsx`, `apps/web/src/pages/recipes/RecipeDetailPage.tsx`

**
- [x] task-6: Write tests for new behavior**
- Test errorHandler correctly identifies Prisma errors by code string (not instanceof).
- Test recipe creation accepts and saves equipmentIds.
- Test badge evaluation is called after recipe creation (mocked).
- Test /share/:slug returns proper meta tags for public recipes and 404 for private.
AC: All new tests pass. Existing 45 tests still pass.
Files: `apps/api/src/middleware/errorHandler.test.ts`, `apps/api/src/modules/recipe/service.test.ts`, `apps/api/src/routes/share.test.ts` (new)

**
- [x] task-7: Verify Docker build and runtime**
Run `make build` to verify multi-stage Dockerfile completes. Run `make up` to verify all containers start and stay healthy. Run `make test` to verify test suite passes. Run `make check` to verify type checking passes.
AC: Docker build succeeds with zero errors. App container stays running. All tests pass.
Files: `Dockerfile`, `Makefile`, `compose.yml

## Verification

- For each fix: (1) Run make build to verify Docker build succeeds, (2) Run make test to verify existing tests still pass, (3) Run app via make up and verify container stays healthy, (4) Manually verify the specific feature: equipment selection in recipe form, badge evaluation after recipe creation, share URL returns proper meta tags.

## Transition History

| From | To | User | Timestamp | Reason |
|------|----|------|-----------|--------|
| IDLE | DISCOVERY | Arda Kilicdagi | 2026-05-03T15:38:47.632Z | - |
