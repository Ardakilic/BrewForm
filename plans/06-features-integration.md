# Plan 06 — Feature Completeness & Integration Fixes (REVISED v2)

**Priority:** Medium-High
**Scope:** Styling consistency, PWA/favicon, data-layer gaps, missing features,
unimplemented specs, CORS alignment
**Estimated Effort:** ~9-13 days across 9 work items
**Dependencies:** None of these block each other; can be parallelized freely

> **Revision notes vs original plan:**
> - Tech stack table corrected (wrong Vite/Drizzle versions; React version verified)
> - `deno task test:web` replaced with correct commands throughout
> - API and shared tests use `@std/testing/bdd` + `@std/expect`; web tests use
>   **Vitest + jsdom + React Testing Library** (39 existing test files)
> - `NEW-2` (README rewrite) removed — README is already correct and comprehensive
> - `NEW-1` (web test infra) corrected — acknowledges existing Vitest infrastructure,
>   adds `make test-web` target and CI integration
> - M16 reframed as "unimplemented specs" not "README lies"
> - M16c `eq` naming collision bug fixed (`eqItem` rename)
> - `EQUIPMENT_INCOMPATIBLE` changed to use existing `VALIDATION_ERROR` code (422)
> - M6 conflicting approaches resolved (compute on fly, no stored derivation)
> - `docs/` update requirements added to every feature work item
> - M9 rate-limiter and API client pre-implementation checklist added
> - H5 manifest `scope` field added; `<html class="light">` theme conflict noted
> - L4 SVG viewBox clip bug corrected
> - `formatNumber` defined inline where referenced
> - M16b coordinated with M16a (no hardcoded `g`/`ml`/`°C` units)
> - **v3:** M6 stat-cards test corrected to extend existing Vitest file (not replace)
> - **v3:** M9/M16b frontend page tests added using Vitest + RTL pattern
> - **v3:** H10 verification updated to include Vitest regression check
> - **v3:** `make test-web` target and CI integration step added

---

## Tech Stack Reference

| Layer | Technology | Notes |
|-------|-----------|-------|
| Runtime | Deno 2.7 | Pure Deno — no npm/npx/bun/husky/lint-staged |
| Monorepo | Deno workspaces | Root `deno.json` with `workspace.members` |
| Backend | Hono (v4.x) | `@hono/zod-validator` for request validation |
| Frontend | React 19 + Vite + Tailwind CSS v4 + Base UI | Verify exact Vite version in `apps/web/deno.json` |
| ORM | Drizzle ORM | `drizzle-kit@0.31` confirmed in Makefile |
| Database | PostgreSQL | `postgres-js` driver, `max: 10` pool |
| Cache | Deno KV | `InMemoryCacheProvider` used in tests |
| Storage | Local or S3-compatible (Garage) | `STORAGE_DRIVER` env var |
| Email | MJML (pre-compiled at build time) | `make email-build` |
| Validation | Zod (shared between frontend and backend) | `@brewform/shared/schemas` |
| Testing | Deno test runner + `@std/testing/bdd` + `@std/expect` | `make test`, `make test-api`, `make test-shared` |
| Web Testing | Vitest 4 + jsdom + React Testing Library + fast-check | `deno task --cwd apps/web test` (39 existing files) |
| Linting | Deno lint + Biome.js | `make lint`, `make fmt` |

**IMPORTANT: This is a pure Deno project. Never use npm/npx/bun/husky/lint-staged
or other Node.js-specific tools. All commands go through `make` → `docker compose`
→ `deno`.**

**Test syntax for `apps/api/` and `packages/shared/` tests (Deno native):**
```ts
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
```

**Test syntax for `apps/web/` tests (Vitest + React Testing Library):**
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
```

> ⚠️ The web app has **39 existing Vitest test files** using jsdom + RTL.
> `apps/web/vitest.config.ts` configures the environment. `apps/web/deno.json`
> defines `"test": "deno run -A npm:vitest run"`. **Never write `apps/web/` tests
> using `jsr:@std/testing/bdd`** — use Vitest imports to stay consistent with
> the existing test infrastructure. Deno BDD is only used in 3 web files that
> test extracted pure logic without DOM rendering (exploration/preservation tests).

---

## Table of Contents

| ID | Title | Severity | Effort |
|----|-------|----------|--------|
| [NEW-1](#new-1--shared-package-unit-test-infrastructure) | Shared Package Unit Test Infrastructure | High | 0.5 day |
| [H10](#h10--576-inline-styles-vs-tailwind-consistency) | 576 Inline Styles vs Tailwind | High | 3-4 days |
| [H5](#h5--missing-pwa-manifest) | Missing PWA Manifest | High | 0.5 day |
| [L4](#l4--missing-favicon-files) | Missing Favicon Files | Low | 0.5 day |
| [M2](#m2--recipeversionphoto-never-populated-on-create) | RecipeVersionPhoto Never Populated | Medium | 0.5 day |
| [M6](#m6--tds-field-missing--extractionyield-not-computed) | TDS Field Missing / extractionYield Not Computed | Medium | 0.5 day |
| [M9](#m9--no-contact-form) | No Contact Form | Medium | 1-2 days |
| [M16](#m16--unimplemented-specified-features) | Unimplemented Specified Features | Medium | 2-3 days |
| [N7](#n7--cors-credentials-true-without-frontend-credentials-include) | CORS credentials Mismatch | Nota Bene | 0.25 day |

---

## NEW-1 — Shared Package Unit Test Infrastructure

**Severity:** High
**Effort:** 0.5 day

### Evidence

- `make test-shared` runs `deno test` against `packages/shared/src/` — this target
  exists and works
- Several new pure utility functions are being added in this plan (`computeExtractionYield`
  in M6, `convertWeight`/`convertVolume`/`convertTemperature` in M16a, `buildStatCards`
  changes)
- **CORRECTION:** `apps/web/src/utils/stat-cards.test.ts` already exists with 236
  lines of comprehensive Vitest tests (unit + property-based using fast-check).
  There are **39 existing Vitest test files** across `apps/web/src/` covering
  components, pages, and utilities. These use Vitest + jsdom + React Testing Library.
- `packages/shared/src/` tests use Deno BDD (`@std/testing/bdd` + `@std/expect`)

### Impact

Without tests for the new shared utilities, regressions in the core computation
logic (unit conversions, stat card construction) go undetected in CI.

> ⚠️ **Critical:** Web Vitest tests are NOT in `make ci` or `make test`. They
> must be run via `deno task --cwd apps/web test`. A `make test-web` target
> should be added, and `ci` should be updated to include it.

### Action Plan

**Step 1: Confirm what exists**

```bash
# Deno-native tests (API + shared):
make test-shared
# Review which files under packages/shared/src/ currently have .test.ts counterparts

# Vitest tests (web) — 39 existing files:
deno task --cwd apps/web test
# Runs: deno run -A npm:vitest run
# Config: apps/web/vitest.config.ts (jsdom, @testing-library/jest-dom setup)
```

**Step 2: Create `packages/shared/src/unit-conversion.test.ts`**

(Created as part of M16a — see that section.)

**Step 3: Create `packages/shared/src/utils.test.ts`** (if not exists)

(Created as part of M6 — see that section.)

**Step 3b: Extend existing `apps/web/src/utils/stat-cards.test.ts`**

This file already exists with 236 lines of Vitest tests (unit + property-based).
New tests for M6 (TDS/EY stat card) should be **appended** to this file using
Vitest conventions — NOT replaced with a Deno BDD version.

**Step 4: Confirm `make test-shared` picks up new test files**

Deno's test runner discovers all `*.test.ts` files in the target directory
automatically. No registration needed.

### Verification

```bash
# Deno-native tests:
make test-shared
# Must exit 0 with the new test files discovered and passing

# Vitest web tests:
deno task --cwd apps/web test
# Must exit 0 — all 39+ existing tests pass alongside any new additions
```

### Step 5: Add `make test-web` Target and Update CI

**Makefile addition:**
```makefile
test-web: ## Run web (Vitest) tests
	docker compose run --rm --no-deps app deno run -A --cwd apps/web npm:vitest run
```

**Update `ci` target to include web tests:**
```makefile
ci: fmt-check lint check build-web check-tests test-coverage test-web ## Run full CI pipeline
```

**Update `deno.json` `ci` task:**
```json
"ci": "deno task fmt-check && deno task lint && deno task check && deno task build && deno task test-coverage && deno task --cwd apps/web test"
```

---

## H10 — 576 Inline Styles vs Tailwind (Consistency)

**Severity:** High
**Effort:** 3-4 days (incremental — can be spread across sprints)

### Evidence

Exact count: **576** `style={{}}` occurrences across `apps/web/src/`.

**Top offenders by file (pages):**

| File | Count |
|------|-------|
| `pages/admin/AdminUserDetailPage.tsx` | 42 |
| `pages/admin/AdminUsersPage.tsx` | 27 |
| `pages/admin/AdminUserEditPage.tsx` | 23 |
| `pages/settings/SettingsPage.tsx` | 22 |
| `pages/TasteNotesPage.tsx` | 19 |
| `pages/users/UserProfilePage.tsx` | 17 |
| `pages/admin/AdminEquipmentPage.tsx` | 17 |
| `pages/auth/RegisterPage.tsx` | 16 |
| `pages/recipes/StarredRecipesPage.tsx` | 15 |
| `pages/admin/AdminVendorsPage.tsx` | 15 |
| `pages/admin/AdminUserCreatePage.tsx` | 15 |
| `pages/recipes/RecipeListPage.tsx` | 14 |
| `pages/admin/AdminRecipesPage.tsx` | 14 |
| `pages/recipes/RecipeComparePage.tsx` | 13 |
| `pages/recipes/RecipeDetailPage.tsx` | 12 |

**Top offenders by file (components):**

| File | Count |
|------|-------|
| `components/taste/TasteAutocomplete.tsx` | 14 |
| `components/recipe/CommentSection.tsx` | 13 |
| `components/recipe/MetadataBadges.tsx` | 11 |
| `components/recipe/BeanSection.tsx` | 11 |
| `components/onboarding/OnboardingWizard.tsx` | 11 |
| `components/recipe/EquipmentSection.tsx` | 10 |
| `components/recipe/BrewTimeline.tsx` | 10 |
| `components/recipe/TastingNotesSection.tsx` | 8 |
| `components/recipe/StarRating.tsx` | 6 |
| `components/recipe/BreadcrumbNav.tsx` | 6 |

`Navbar.tsx` and `Footer.tsx` already use the correct Tailwind v4 `[color:var(...)]`
syntax, proving the pattern works in this project.

### Impact

- Two competing styling patterns in the same codebase
- Inline styles defeat Tailwind's responsive/hover/dark utilities
- Larger bundle: inline styles are not deduplicated by the CSS engine
- Global theme changes require touching every `style={{}}` instead of one CSS variable

### Conversion Pattern Reference

```tsx
// BEFORE                                              // AFTER
style={{ color: 'var(--text-secondary)' }}             className='text-[color:var(--text-secondary)]'
style={{ backgroundColor: 'var(--bg-secondary)' }}     className='bg-[color:var(--bg-secondary)]'
style={{ borderColor: 'var(--border-primary)' }}       className='border-[color:var(--border-primary)]'
style={{ border: '1px solid var(--border-primary)' }}  className='border border-[color:var(--border-primary)]'
style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem' }}  className='text-xs px-3 py-1'
```

Combined example:
```tsx
// BEFORE
<div
  className='flex flex-col rounded-lg p-4'
  style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}
>

// AFTER
<div className='flex flex-col rounded-lg p-4 bg-[color:var(--bg-secondary)] border border-[color:var(--border-primary)]'>
```

### Action Plan

**Phase 1 — Recipe detail components (35 styles, 1 day)**

1. `components/recipe/StatCards.tsx` (3 styles)
2. `components/recipe/BreadcrumbNav.tsx` (6 styles)
3. `components/recipe/StarRating.tsx` (6 styles)
4. `components/recipe/TastingNotesSection.tsx` (8 styles)
5. `components/recipe/BrewTimeline.tsx` (10 styles)
6. `components/recipe/EquipmentSection.tsx` (10 styles)

**Phase 2 — Recipe detail page + comments (36 styles, 0.5 day)**

1. `components/recipe/CommentSection.tsx` (13 styles)
2. `components/recipe/MetadataBadges.tsx` (11 styles)
3. `pages/recipes/RecipeDetailPage.tsx` (12 styles)

**Phase 3 — Admin pages (153 styles, 1 day)**

1. `pages/admin/AdminUserDetailPage.tsx` (42 styles)
2. `pages/admin/AdminUsersPage.tsx` (27 styles)
3. `pages/admin/AdminUserEditPage.tsx` (23 styles)
4. `pages/admin/AdminEquipmentPage.tsx` (17 styles)
5. `pages/admin/AdminVendorsPage.tsx` (15 styles)
6. `pages/admin/AdminUserCreatePage.tsx` (15 styles)
7. `pages/admin/AdminRecipesPage.tsx` (14 styles)

**Phase 4 — Remaining pages + components (352 styles, 1-2 days)**

Convert all remaining files largest-first. The mechanical pattern is identical.

### docs/ Changes

No documentation changes needed — this is a purely internal code quality refactor.

### Tests & Verification

After each file:

1. **Type-check:** `make check-web` — must exit 0
2. **Vitest regression:** `deno task --cwd apps/web test` — must exit 0
   > ⚠️ Many H10 target files have existing Vitest tests (e.g. `CommentSection.test.tsx`,
   > `MetadataBadges.test.tsx`, `BreadcrumbNav.test.tsx`, `EquipmentSection.test.tsx`,
   > `BrewTimeline.test.tsx`, `TastingNotesSection.test.tsx`, `StarRating.test.tsx`,
   > `BeanSection.test.tsx`, `Navbar.test.tsx`, `Footer.test.tsx`, etc.).
   > Inline-to-Tailwind conversion must not break these behavioural tests.
3. **Zero inline styles audit:**
   ```bash
   grep -c "style={{" apps/web/src/path/to/file.tsx
   # Must return 0
   ```
4. **Visual:** Toggle Light/Dark/Coffee themes in browser; confirm all colours render correctly

After Phase 4 complete:

5. **Global audit:**
   ```bash
   grep -r "style={{" apps/web/src/ | wc -l
   # Must return 0
   ```
6. **Full Vitest suite:** `deno task --cwd apps/web test` — all 39+ tests pass

---

## H5 — Missing PWA Manifest

**Severity:** High
**Effort:** 0.5 day

### Evidence

- `apps/web/public/` contains only `_redirects` and `404.html` — no `manifest.json`
- `apps/web/index.html` has no `<link rel="manifest">`, no `<meta name="theme-color">`,
  no `<link rel="apple-touch-icon">`
- Mobile browsers cannot offer "Add to Home Screen" without a manifest

### Impact

- No "Add to Home Screen" on mobile
- No themed address bar on Android Chrome
- Lighthouse PWA score: 0

### Action Plan

**Step 1: Create `apps/web/public/manifest.json`**

```json
{
  "name": "BrewForm",
  "short_name": "BrewForm",
  "description": "Coffee brewing recipes and tasting notes",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#1a1207",
  "theme_color": "#c8a27a",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/favicon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any maskable" }
  ],
  "categories": ["food", "lifestyle"],
  "lang": "en",
  "dir": "ltr"
}
```

- `scope: "/"` — required; prevents out-of-scope navigations opening a new browser window
- `background_color: #1a1207` — dark coffee brown (Coffee theme `--bg-primary`)
- `theme_color: #c8a27a` — warm accent (`--accent-primary` in Coffee theme)

**Step 2: Update `apps/web/index.html`**

> ⚠️ Do **not** add `class="light"` to `<html>`. The ThemeContext sets this class
> dynamically to prevent a flash of wrong theme on load. Preserve whatever the
> existing `<html>` tag currently has.

Add inside `<head>`, after the existing `<meta>` tags:

```html
<meta name="theme-color" content="#c8a27a" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="icon" type="image/x-icon" href="/favicon.ico" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
<link rel="manifest" href="/manifest.json" />
```

**Step 3: Coordinate with L4**

The manifest references `icon-192.png`, `icon-512.png`, and `favicon.svg` — all
created in L4. Implement L4 first or simultaneously.

### docs/ Changes

No dedicated docs page needed. If `docs/deployment.md` has a production checklist,
add a note that the manifest must be served from `/manifest.json` (Caddy/static
hosting must not block this path).

### Tests & Verification

1. Chrome DevTools → Application → Manifest: parsed manifest shows with no warnings
2. All icon URLs in manifest return HTTP 200 (Network tab)
3. Lighthouse PWA audit: manifest-related checks pass
4. Android Chrome: URL bar shows "Add to Home Screen" prompt
5. Manual: `GET /manifest.json` returns `Content-Type: application/manifest+json`

---

## L4 — Missing Favicon Files

**Severity:** Low
**Effort:** 0.5 day

### Evidence

- `apps/web/index.html` references `/favicon.svg` which does not exist
- Browser shows default/broken favicon in every tab

### Action Plan

**Step 1: Create `apps/web/public/favicon.svg`**

> ⚠️ **SVG viewBox fix:** The original plan's paths extended to `y < 0`, which
> clips at the viewBox origin. The corrected version uses `viewBox="0 0 64 72"`
> to give 8px of headroom for the steam wisps.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 72" fill="none">
  <!-- Steam wisps (8px headroom above cup) -->
  <path d="M22 16c0-4 4-4 4-8" stroke="#c8a27a" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
  <path d="M32 14c0-4 4-4 4-8" stroke="#c8a27a" stroke-width="2" stroke-linecap="round" opacity="0.4"/>
  <path d="M42 16c0-4 4-4 4-8" stroke="#c8a27a" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
  <!-- Cup body -->
  <rect x="12" y="24" width="36" height="28" rx="4" fill="#c8a27a"/>
  <!-- Coffee surface -->
  <ellipse cx="30" cy="32" rx="14" ry="3" fill="#8b6914"/>
  <!-- Handle -->
  <path d="M48 30c6 0 8 4 8 8s-2 8-8 8" stroke="#c8a27a" stroke-width="4" stroke-linecap="round" fill="none"/>
  <!-- Saucer -->
  <ellipse cx="30" cy="56" rx="22" ry="5" fill="#a0845c"/>
  <!-- Cup base connection -->
  <rect x="18" y="52" width="24" height="4" rx="2" fill="#c8a27a"/>
</svg>
```

**Step 2: Required icon files**

| File | Size | Purpose |
|------|------|---------|
| `favicon.svg` | any | Modern browsers, PWA manifest |
| `favicon.ico` | 32×32 | Legacy browsers |
| `apple-touch-icon.png` | 180×180 | iOS home screen |
| `icon-192.png` | 192×192 | Android/PWA manifest |
| `icon-512.png` | 512×512 | PWA splash screen |

**Step 3: Generate raster icons (Deno-compatible)**

Add `scripts/generate-icons.ts`:

```ts
// Run with:
// docker compose run --rm --no-deps app \
//   deno run --allow-read --allow-write --allow-ffi scripts/generate-icons.ts

import { Resvg } from 'npm:@resvg/resvg-js';
import { join } from 'jsr:@std/path';

const svgData = await Deno.readTextFile(
  join(Deno.cwd(), 'apps/web/public/favicon.svg'),
);
const outDir = join(Deno.cwd(), 'apps/web/public');

const sizes: [number, string][] = [
  [32, 'favicon-32.png'],
  [180, 'apple-touch-icon.png'],
  [192, 'icon-192.png'],
  [512, 'icon-512.png'],
];

for (const [size, name] of sizes) {
  const resvg = new Resvg(svgData, { fitTo: { mode: 'width', value: size } });
  await Deno.writeFile(join(outDir, name), resvg.render().asPng());
  console.log(`Generated ${name} (${size}×${size})`);
}
// Convert favicon-32.png → favicon.ico using ImageMagick or any online tool.
```

Add Makefile target:

```makefile
generate-icons: ## Generate PNG icons from favicon.svg
	docker compose run --rm --no-deps app \
	  deno run --allow-read --allow-write --allow-ffi scripts/generate-icons.ts
```

**Step 4: `index.html` `<link>` tags**

Already handled in H5 Step 2.

### docs/ Changes

None. Icon generation is a one-time developer task with no runtime docs needed.

### Tests & Verification

1. Browser tab shows the coffee cup favicon (not a broken icon placeholder)
2. Network tab: `GET /favicon.svg` → 200, `GET /favicon.ico` → 200
3. `GET /apple-touch-icon.png`, `GET /icon-192.png`, `GET /icon-512.png` → 200
4. Chrome DevTools → Application → Manifest → Icons: all sizes resolve without errors
5. iOS Safari: "Add to Home Screen" shows the custom icon

---

## M2 — RecipeVersionPhoto Never Populated on Create

**Severity:** Medium
**Effort:** 0.5 day

### Evidence

- `packages/db/src/schema.ts:336-354` — `recipeVersionPhotos` junction table exists
- `apps/api/src/modules/recipe/model.ts:188-198` — `forkRecipe()` correctly copies
  version photos from source
- `apps/api/src/modules/recipe/service.ts:73-102` — `createRecipe()` transaction
  never inserts into `recipeVersionPhotos`
- `apps/api/src/modules/recipe/service.ts:181-212` — `updateRecipe()` with
  `bumpVersion: true` also never populates `recipeVersionPhotos`

### Impact

- Photos are associated with the recipe (`photos.recipeId`) but not with any version
- Fork copies an empty photo set from the source — the original never had photos
  populated at the version level

### Action Plan

**Step 1: Add `recipeVersionPhotos` to imports in `service.ts`**

In the existing import block at the top of `apps/api/src/modules/recipe/service.ts`,
add `recipeVersionPhotos`:

```ts
import {
  recipeAdditionalPreparations,
  recipeEquipment,
  recipes,
  recipeTasteNotes,
  recipeVersionPhotos,  // ADD
  recipeVersions,
  setups,
  users,
} from '@brewform/db/schema';
```

**Step 2: Update `createRecipe()` — inside the transaction**

After the `additionalPreparations` insertion block, add:

```ts
if (data.photoIds?.length) {
  await tx.insert(recipeVersionPhotos).values(
    data.photoIds.map((photoId: string, i: number) => ({
      recipeVersionId: version.id,
      photoId,
      sortOrder: i,
    })),
  );
}
```

**Step 3: Update `updateRecipe()` — inside the `bumpVersion` branch**

After `model.createVersion()` returns `newVersion`, before `model.update()`:

```ts
if (data.photoIds?.length) {
  await db.insert(recipeVersionPhotos).values(
    data.photoIds.map((photoId: string, i: number) => ({
      recipeVersionId: newVersion.id,
      photoId,
      sortOrder: i,
    })),
  );
} else if (latestVersion?.id) {
  // No new photos supplied — carry forward from previous version
  const previousPhotos = await db
    .select()
    .from(recipeVersionPhotos)
    .where(eq(recipeVersionPhotos.recipeVersionId, latestVersion.id));
  if (previousPhotos.length) {
    await db.insert(recipeVersionPhotos).values(
      previousPhotos.map((vp) => ({
        recipeVersionId: newVersion.id,
        photoId: vp.photoId,
        sortOrder: vp.sortOrder,
      })),
    );
  }
}
```

> Ensure `latestVersion` is fetched before the `bumpVersion` branch. Review the
> surrounding code context to confirm the variable is available at this point.

**Step 4: Verify frontend sends `photoIds`**

Confirm `RecipeCreatePage.tsx` and `RecipeEditPage.tsx` include `photoIds` in the
request payload. Add if missing.

### docs/ Changes

None — this is an internal data-layer fix. The existing `docs/recipes.md` and
`docs/api.md` behaviour descriptions remain accurate (photos are already documented
as part of recipe creation).

### Tests

File: `apps/api/src/modules/recipe/service.test.ts` (create if absent)

```ts
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';

describe('createRecipe', () => {
  it('populates recipeVersionPhotos when photoIds provided', async () => {
    const recipe = await createRecipe({ ...validData, photoIds: ['photo-1', 'photo-2'] });
    const versionPhotos = await db
      .select()
      .from(recipeVersionPhotos)
      .where(eq(recipeVersionPhotos.recipeVersionId, recipe.latestVersion.id));
    expect(versionPhotos.length).toBe(2);
    expect(versionPhotos[0].photoId).toBe('photo-1');
    expect(versionPhotos[1].sortOrder).toBe(1);
  });

  it('inserts no recipeVersionPhotos when photoIds is empty', async () => {
    const recipe = await createRecipe({ ...validData, photoIds: [] });
    const versionPhotos = await db
      .select()
      .from(recipeVersionPhotos)
      .where(eq(recipeVersionPhotos.recipeVersionId, recipe.latestVersion.id));
    expect(versionPhotos.length).toBe(0);
  });
});

describe('updateRecipe with bumpVersion', () => {
  it('carries forward photos from previous version when no new photoIds given', async () => {
    // setup: recipe with 2 photos, then bump without providing new photoIds
    const newVersion = await updateRecipe(recipeId, { bumpVersion: true });
    const photos = await db
      .select()
      .from(recipeVersionPhotos)
      .where(eq(recipeVersionPhotos.recipeVersionId, newVersion.id));
    expect(photos.length).toBe(2);
  });

  it('replaces photos with new photoIds when provided on bump', async () => {
    const newVersion = await updateRecipe(recipeId, {
      bumpVersion: true,
      photoIds: ['new-photo'],
    });
    const photos = await db
      .select()
      .from(recipeVersionPhotos)
      .where(eq(recipeVersionPhotos.recipeVersionId, newVersion.id));
    expect(photos.length).toBe(1);
    expect(photos[0].photoId).toBe('new-photo');
  });
});

describe('forkRecipe', () => {
  it('copies version photos from source to forked recipe', async () => {
    // Now that createRecipe populates version photos, the fork should copy them
    const forked = await forkRecipe(sourceRecipeId, userId);
    const photos = await db
      .select()
      .from(recipeVersionPhotos)
      .where(eq(recipeVersionPhotos.recipeVersionId, forked.latestVersion.id));
    expect(photos.length).toBe(sourceVersionPhotoCount);
  });
});
```

Run: `make test-api`

---

## M6 — TDS Field Missing / extractionYield Not Computed

**Severity:** Medium
**Effort:** 0.5 day

### Evidence

- No `extractionYield`, `extraction_yield`, or `TDS` anywhere in the codebase
- Standard formula: `EY% = (tds% / 100 × extractionVolumeMl) / groundWeightGrams × 100`
- `extractionVolumeMl` and `groundWeightGrams` already exist in `recipeVersions`
- TDS is not stored — needs a new optional schema column
- `apps/web/src/utils/stat-cards.ts` builds 5 stat cards; a conditional 6th is needed

### Design Decision

**Compute extraction yield on the fly in the frontend.** Only `tds` needs a schema
column. Storing a derived `extractionYield` column creates a consistency risk if
its inputs change; computing it client-side is free.

### Action Plan

**Step 1: Add `tds` column to `recipeVersions`**

In `packages/db/src/schema.ts`, inside the `recipeVersions` table definition,
after `temperatureCelsius`:

```ts
tds: decimal('tds', { precision: 4, scale: 2 }),
```

Then:

```bash
make db-generate
make db-migrate
```

**Step 2: Update Zod schema in `packages/shared`**

In the recipe version schema (wherever `temperatureCelsius` is defined):

```ts
tds: z.number().min(0).max(25).optional().nullable(),
```

**Step 3: Create `computeExtractionYield` in `packages/shared/src/utils.ts`**

```ts
/**
 * Computes extraction yield percentage.
 * Formula: (TDS% × beverage_weight_g) / dry_coffee_weight_g × 100
 *
 * @param tds - Total Dissolved Solids as a percentage (e.g. 1.35 for 1.35% TDS)
 * @param extractionVolumeMl - Brewed volume in ml (water density ≈ 1, so ml ≈ g)
 * @param groundWeightGrams - Dry coffee dose in grams
 * @returns Extraction yield percentage (e.g. 22.5), or null if any input is invalid
 */
export function computeExtractionYield(
  tds: number,
  extractionVolumeMl: number,
  groundWeightGrams: number,
): number | null {
  if (!tds || !extractionVolumeMl || !groundWeightGrams || groundWeightGrams === 0) {
    return null;
  }
  return (tds / 100) * extractionVolumeMl / groundWeightGrams * 100;
}
```

**Step 4: Update `buildStatCards` in `apps/web/src/utils/stat-cards.ts`**

> ⚠️ Coordinate with M16a: both M6 and M16a modify `buildStatCards`. Implement
> them in the same PR to avoid conflicts.

Add `tds` to the input type and append the conditional 6th card:

```ts
import { computeExtractionYield } from '@brewform/shared/utils';

// Helper — define once at the top of stat-cards.ts if not already present
const formatNumber = (n: number): string =>
  Number.isInteger(n) ? String(n) : n.toFixed(2);

export function buildStatCards(
  version: {
    groundWeightGrams?: number | null;
    extractionVolumeMl?: number | null;
    extractionTimeSeconds?: number | null;
    brewRatio?: number | null;
    temperatureCelsius?: number | null;
    tds?: number | null;       // ADD
  },
  unitSystem: UnitSystem = 'metric',   // ADD — for M16a coordination
): StatCardItem[] {
  // ... existing 5 cards (dose, yield, time, ratio, temp) — unit conversion
  // applied in M16a on the same PR ...

  const cards: StatCardItem[] = [dose, yieldCard, time, ratio, temp];

  if (
    version.tds != null &&
    version.extractionVolumeMl != null &&
    version.groundWeightGrams != null
  ) {
    const ey = computeExtractionYield(
      version.tds,
      version.extractionVolumeMl,
      version.groundWeightGrams,
    );
    if (ey !== null) {
      cards.push({
        label: 'recipe.stat.extractionYield',
        value: `${ey.toFixed(1)}%`,
      });
    }
  }

  return cards;
}
```

**Step 5: Update StatCards grid for optional 6th card**

In `apps/web/src/components/recipe/StatCards.tsx`:

```tsx
// BEFORE
<div className='flex flex-row overflow-x-auto gap-3 md:grid md:grid-cols-5 md:overflow-visible'>

// AFTER — auto-adapts to 5 or 6 cards
<div className='flex flex-row overflow-x-auto gap-3 md:grid md:grid-cols-5 lg:grid-cols-6 md:overflow-visible'>
```

**Step 6: Add TDS input to recipe create/edit forms**

Add an optional TDS numeric input to `RecipeCreatePage.tsx` and
`RecipeEditPage.tsx`, grouped with the existing extraction parameters
(`extractionVolumeMl`, `extractionTimeSeconds`).

**Step 7: Add i18n keys**

In `packages/shared/src/i18n/en.ts`:
```ts
'recipe.stat.extractionYield': 'EY',
'recipe.form.tds': 'TDS (%)',
'recipe.form.tds.placeholder': 'e.g. 1.35',
```

In `packages/shared/src/i18n/tr.ts`:
```ts
'recipe.stat.extractionYield': 'EY',
'recipe.form.tds': 'TDS (%)',
'recipe.form.tds.placeholder': 'ör. 1.35',
```

### docs/ Changes

**`docs/recipes.md` — update the Canonical Units table:**

```markdown
## Canonical Units

All numeric values are stored in canonical (metric) units:

| Measurement             | Storage Unit            |
|-------------------------|-------------------------|
| Coffee weight           | grams                   |
| Water weight            | grams                   |
| Brew temperature        | Celsius                 |
| Extraction time         | seconds                 |
| Grind size              | micrometers (optional)  |
| TDS (Total Dissolved Solids) | percentage (e.g. 1.35 for 1.35%) |

Extraction Yield is **not stored** — it is derived on the client from TDS, extraction
volume, and dose when all three are present:

  EY% = (TDS% / 100 × extractionVolumeMl) / groundWeightGrams × 100
```

### Tests

**`packages/shared/src/utils.test.ts`:**

```ts
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { computeExtractionYield } from './utils.ts';

describe('computeExtractionYield', () => {
  it('computes correctly for a typical pour-over (1.35% TDS, 250ml, 15g)', () => {
    // (1.35 / 100) × 250 / 15 × 100 = 22.5
    const result = computeExtractionYield(1.35, 250, 15);
    expect(result).not.toBeNull();
    expect(Math.abs(result! - 22.5)).toBeLessThan(0.01);
  });

  it('returns null when tds is 0', () => {
    expect(computeExtractionYield(0, 250, 15)).toBeNull();
  });

  it('returns null when groundWeight is 0 (division by zero guard)', () => {
    expect(computeExtractionYield(1.35, 250, 0)).toBeNull();
  });

  it('returns null when extractionVolume is 0', () => {
    expect(computeExtractionYield(1.35, 0, 15)).toBeNull();
  });
});
```

**`apps/web/src/utils/stat-cards.test.ts` — EXTEND existing file (do NOT replace):**

> ⚠️ **CORRECTION:** This file already exists with 236 lines of comprehensive
> Vitest tests (unit + property-based with fast-check). It uses `import { describe,
> expect, it } from 'vitest'`. **Append** the following tests to the existing file:

```ts
// ─── TDS / Extraction Yield (M6) ────────────────────────────────────────────

describe('buildStatCards — TDS / extraction yield (M6)', () => {
  it('returns 5 cards when tds is null', () => {
    const cards = buildStatCards({
      groundWeightGrams: 18,
      extractionVolumeMl: 36,
      tds: null,
    });
    expect(cards).toHaveLength(5);
  });

  it('returns 6 cards when tds is provided with valid volume and dose', () => {
    const cards = buildStatCards({
      groundWeightGrams: 15,
      extractionVolumeMl: 250,
      tds: 1.35,
    });
    expect(cards).toHaveLength(6);
    expect(cards[5]).toEqual({
      label: 'recipe.stat.extractionYield',
      value: '22.5%',
    });
  });

  it('returns 5 cards when tds is provided but extractionVolumeMl is null', () => {
    const cards = buildStatCards({
      groundWeightGrams: 15,
      extractionVolumeMl: null,
      tds: 1.35,
    });
    expect(cards).toHaveLength(5);
  });

  it('returns 5 cards when tds is provided but groundWeightGrams is null', () => {
    const cards = buildStatCards({
      groundWeightGrams: null,
      extractionVolumeMl: 250,
      tds: 1.35,
    });
    expect(cards).toHaveLength(5);
  });
});
```

> **Run with:** `deno task --cwd apps/web test` (NOT `make test-shared`).
> The existing stat-cards tests use Vitest and are picked up by `vitest.config.ts`.

Run: `make test-shared` (for `packages/shared/src/utils.test.ts`),
`deno task --cwd apps/web test` (for stat-cards tests), `make check-web` (type-check)

---

## M9 — No Contact Form

**Severity:** Medium
**Effort:** 1-2 days

### Evidence

- No `/contact` route in `apps/web/src/router.tsx`
- No contact endpoint in `apps/api/src/routes/index.ts`
- No contact module under `apps/api/src/modules/`
- `docs/api.md` has no contact endpoint
- Footer has no Contact link

### Pre-implementation Checklist

Before writing any code, verify these two things in the actual source:

1. **Rate limiter signature** — Read `apps/api/src/middleware/rateLimit.ts` and
   confirm the exact parameter names (may differ from `{ windowMs, maxRequests, keyPrefix }`).
2. **API client shape** — Read `apps/web/src/api/client.ts` and confirm whether
   the pattern is `api.post('/contact', body)` or `request('/contact', { method: 'POST', ... })`.

### Action Plan

**Step 1: Create `apps/api/src/modules/contact/index.ts`**

```ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { AppEnv } from '../../types/hono.ts';
import { rateLimitMiddleware } from '../../middleware/rateLimit.ts';
import { createLogger } from '../../utils/logger/index.ts';

const logger = createLogger('contact');

const contactSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(255),
  subject: z.string().min(1).max(200),
  message: z.string().min(10).max(5000),
});

const contact = new Hono<AppEnv>();

// ⚠️ Verify the actual rateLimitMiddleware call signature in middleware/rateLimit.ts
// before finalising this — parameter names below are assumed.
contact.use('*', rateLimitMiddleware({
  windowMs: 15 * 60_000,
  maxRequests: 3,
  keyPrefix: 'contact',
}));

contact.post('/', zValidator('json', contactSchema), async (c) => {
  const data = c.req.valid('json');
  const config = c.get('config'); // adjust to match your AppEnv shape

  logger.info(
    { name: data.name, email: data.email, subject: data.subject },
    'Contact form submission',
  );

  // Wire to the existing SMTP email utility (same one used by notifications)
  // Import path: apps/api/src/utils/email/ or similar — confirm before use
  await sendEmail({
    to: config.ADMIN_EMAIL,
    subject: `[BrewForm Contact] ${data.subject}`,
    text: `From: ${data.name} <${data.email}>\n\n${data.message}`,
  });

  return c.json({
    success: true,
    data: { message: 'Thank you for your message. We will get back to you soon.' },
  });
});

export default contact;
```

**Step 2: Register route in `apps/api/src/routes/index.ts`**

```ts
import contact from '../modules/contact/index.ts';

// After existing route registrations:
routes.route('/api/v1/contact', contact);
```

**Step 3: Create `apps/web/src/pages/ContactPage.tsx`**

```tsx
import { useState } from 'react';
import { useTranslation } from '../contexts/I18nContext';
import { SEOHead } from '../components/seo/SEOHead';
// ⚠️ Adjust import/call to match the actual client.ts API shape
import { api } from '../api/client';

export function ContactPage() {
  const { t } = useTranslation();
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('sending');
    setErrorMessage('');
    try {
      await api.post('/contact', form);
      setStatus('sent');
      setForm({ name: '', email: '', subject: '', message: '' });
    } catch (err: unknown) {
      setStatus('error');
      setErrorMessage(
        err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      );
    }
  };

  const inputClasses = [
    'w-full rounded-lg px-4 py-2 text-sm',
    'bg-[color:var(--bg-primary)]',
    'border border-[color:var(--border-primary)]',
    'text-[color:var(--text-primary)]',
    'placeholder:text-[color:var(--text-tertiary)]',
    'focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-primary)]',
  ].join(' ');

  return (
    <>
      <SEOHead title={`${t('contact.title')} | BrewForm`} />
      <div className='mx-auto max-w-2xl px-4 py-12'>
        <h1 className='text-3xl font-bold mb-2 text-[color:var(--text-primary)]'>
          {t('contact.title')}
        </h1>
        <p className='mb-8 text-[color:var(--text-secondary)]'>{t('contact.description')}</p>

        {status === 'sent' ? (
          <div className='rounded-lg p-6 bg-[color:var(--bg-secondary)] border border-[color:var(--border-primary)] text-center'>
            <p className='text-lg font-semibold text-[color:var(--accent-primary)]'>
              {t('contact.success.title')}
            </p>
            <p className='mt-2 text-[color:var(--text-secondary)]'>
              {t('contact.success.message')}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className='space-y-4'>
            {(['name', 'email', 'subject'] as const).map((field) => (
              <div key={field}>
                <label
                  htmlFor={field}
                  className='block text-sm font-medium mb-1 text-[color:var(--text-secondary)]'
                >
                  {t(`contact.form.${field}`)}
                </label>
                <input
                  id={field}
                  type={field === 'email' ? 'email' : 'text'}
                  required
                  maxLength={field === 'name' ? 100 : field === 'email' ? 255 : 200}
                  value={form[field]}
                  onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                  className={inputClasses}
                />
              </div>
            ))}
            <div>
              <label
                htmlFor='message'
                className='block text-sm font-medium mb-1 text-[color:var(--text-secondary)]'
              >
                {t('contact.form.message')}
              </label>
              <textarea
                id='message'
                required
                minLength={10}
                maxLength={5000}
                rows={6}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                className={inputClasses}
              />
            </div>

            {status === 'error' && (
              <p className='text-sm text-red-500'>{errorMessage}</p>
            )}

            <button
              type='submit'
              disabled={status === 'sending'}
              className='w-full rounded-lg px-4 py-2 text-sm font-semibold text-white bg-[color:var(--accent-primary)] hover:opacity-90 disabled:opacity-50 transition-opacity'
            >
              {status === 'sending' ? t('contact.form.sending') : t('contact.form.submit')}
            </button>
          </form>
        )}
      </div>
    </>
  );
}
```

**Step 4: Add route in `apps/web/src/router.tsx`**

```tsx
import { ContactPage } from './pages/ContactPage';

// In the Layout children array, before the catch-all:
{ path: 'contact', element: <ContactPage /> },
```

**Step 5: Add Footer link**

In `apps/web/src/components/layout/Footer.tsx`:

```tsx
<Link to='/contact' className='text-sm text-[color:var(--text-secondary)]'>
  {t('footer.contact')}
</Link>
```

**Step 6: Add i18n keys**

In `packages/shared/src/i18n/en.ts`:

```ts
'contact.title': 'Contact Us',
'contact.description': "Have a question, suggestion, or found a bug? We'd love to hear from you.",
'contact.form.name': 'Name',
'contact.form.email': 'Email',
'contact.form.subject': 'Subject',
'contact.form.message': 'Message',
'contact.form.submit': 'Send Message',
'contact.form.sending': 'Sending…',
'contact.success.title': 'Message Sent!',
'contact.success.message': "Thank you for reaching out. We'll get back to you as soon as possible.",
'footer.contact': 'Contact',
```

In `packages/shared/src/i18n/tr.ts` (proper Turkish Unicode):

```ts
'contact.title': 'Bize Ulaşın',
'contact.description': 'Bir sorunuz, öneriniz veya bir hata mı buldunuz? Sizden duymak isteriz.',
'contact.form.name': 'Ad',
'contact.form.email': 'E-posta',
'contact.form.subject': 'Konu',
'contact.form.message': 'Mesaj',
'contact.form.submit': 'Mesaj Gönder',
'contact.form.sending': 'Gönderiliyor…',
'contact.success.title': 'Mesaj Gönderildi!',
'contact.success.message': 'Bize ulaştığınız için teşekkürler. En kısa sürede size geri döneceğiz.',
'footer.contact': 'İletişim',
```

### docs/ Changes

**`docs/api.md` — add after the existing Reports section:**

```markdown
## Contact

| Method | Endpoint   | Auth | Description                |
|--------|-----------|------|----------------------------|
| POST   | `/contact` | none | Submit a contact form message |

### POST /contact

Rate limited: **3 requests per 15 minutes per IP**.

Request body:

```json
{
  "name": "Jane Brewer",
  "email": "jane@example.com",
  "subject": "Feature request",
  "message": "It would be great if..."
}
```

| Field     | Type   | Required | Constraints            |
|-----------|--------|----------|------------------------|
| `name`    | string | yes      | max 100 chars          |
| `email`   | string | yes      | valid email, max 255   |
| `subject` | string | yes      | max 200 chars          |
| `message` | string | yes      | min 10 chars, max 5000 |

Response `200`:

```json
{ "success": true, "data": { "message": "Thank you for your message. We will get back to you soon." } }
```

Response `422` — validation failed (standard `VALIDATION_ERROR` envelope).
Response `429` — rate limit exceeded.
```

### Tests

**`apps/api/src/modules/contact/contact.test.ts`:**

```ts
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';

const VALID = {
  name: 'Test User',
  email: 'test@example.com',
  subject: 'Bug report',
  message: 'This is a test message longer than ten chars.',
};

describe('POST /api/v1/contact', () => {
  it('returns 200 with valid payload', async () => {
    const res = await app.request('/api/v1/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 422 when message is shorter than 10 chars', async () => {
    const res = await app.request('/api/v1/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID, message: 'short' }),
    });
    expect(res.status).toBe(422);
  });

  it('returns 422 when email is malformed', async () => {
    const res = await app.request('/api/v1/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID, email: 'not-an-email' }),
    });
    expect(res.status).toBe(422);
  });

  it('returns 429 on the 4th request within the rate-limit window', async () => {
    for (let i = 0; i < 3; i++) {
      await app.request('/api/v1/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(VALID),
      });
    }
    const res = await app.request('/api/v1/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID),
    });
    expect(res.status).toBe(429);
  });
});
```

Run: `make test-api`

Frontend verification (type-check + Vitest + manual):

1. `make check-web` — must exit 0
2. `deno task --cwd apps/web test` — must exit 0
3. Navigate to `/contact` — form renders correctly in all three themes
4. Submit valid data — success message appears
5. Footer shows Contact link

**`apps/web/src/pages/ContactPage.test.tsx` (Vitest + RTL):**

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContactPage } from './ContactPage';

vi.mock('../api/client.ts', () => ({
  api: { post: vi.fn() },
}));

vi.mock('../contexts/I18nContext.tsx', () => ({
  useTranslation: vi.fn(),
}));

import { api } from '../api/client.ts';
import { useTranslation } from '../contexts/I18nContext.tsx';

const mockApi = vi.mocked(api);
const mockUseTranslation = vi.mocked(useTranslation);

const enT = (key: string) => {
  const map: Record<string, string> = {
    'contact.title': 'Contact Us',
    'contact.description': "Have a question?",
    'contact.form.name': 'Name',
    'contact.form.email': 'Email',
    'contact.form.subject': 'Subject',
    'contact.form.message': 'Message',
    'contact.form.submit': 'Send Message',
    'contact.form.sending': 'Sending…',
    'contact.success.title': 'Message Sent!',
    'contact.success.message': "We'll get back to you.",
  };
  return map[key] ?? key;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTranslation.mockReturnValue({
    locale: 'en' as const,
    setLocale: vi.fn(),
    t: enT,
    availableLocales: ['en', 'tr'],
  });
});

describe('ContactPage', () => {
  it('renders all form fields', () => {
    render(<ContactPage />);
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Subject')).toBeInTheDocument();
    expect(screen.getByLabelText('Message')).toBeInTheDocument();
  });

  it('submits form and shows success message', async () => {
    mockApi.post.mockResolvedValue({ success: true });
    render(<ContactPage />);

    await userEvent.type(screen.getByLabelText('Name'), 'Test User');
    await userEvent.type(screen.getByLabelText('Email'), 'test@example.com');
    await userEvent.type(screen.getByLabelText('Subject'), 'Bug report');
    await userEvent.type(screen.getByLabelText('Message'), 'This is a detailed bug report.');
    await userEvent.click(screen.getByRole('button', { name: 'Send Message' }));

    await waitFor(() => {
      expect(screen.getByText('Message Sent!')).toBeInTheDocument();
    });
    expect(mockApi.post).toHaveBeenCalledWith('/contact', {
      name: 'Test User',
      email: 'test@example.com',
      subject: 'Bug report',
      message: 'This is a detailed bug report.',
    });
  });

  it('shows error message on API failure', async () => {
    mockApi.post.mockRejectedValue(new Error('Network error'));
    render(<ContactPage />);

    await userEvent.type(screen.getByLabelText('Name'), 'Test');
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('Subject'), 'Test');
    await userEvent.type(screen.getByLabelText('Message'), 'This is long enough.');
    await userEvent.click(screen.getByRole('button', { name: 'Send Message' }));

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });
});
```

> Uses the same Vitest + RTL pattern as all other page tests (e.g. `HomePage.test.tsx`).

---

## M16 — Unimplemented Specified Features

**Severity:** Medium
**Effort:** 2-3 days total

### Evidence

Three features specified in both `README.md` and `docs/recipes.md` are not
fully implemented:

**1. "Canonical Units — UI converts to user preferences" (`docs/recipes.md`, Canonical Units)**
- `unitSystem` setting exists in `SettingsPage.tsx` and `UserPreferences` schema
- `PATCH /api/v1/preferences` correctly stores `unitSystem`
- Nothing reads it when rendering stat cards — `stat-cards.ts` hardcodes `g`, `ml`, `°C`

**2. "Version Control — full history browsable" (`docs/recipes.md`, Versioning)**
- Version creation works; `GET /api/v1/recipes/:slugOrId` returns `currentVersionId`
- No `GET /api/v1/recipes/:slug/versions` endpoint exists
- No UI route `/recipes/:slug/versions` exists in `router.tsx`

**3. "Brew Method Compatibility — data-driven validation" (`docs/recipes.md`, Hard Validation)**
- `brewMethodEquipmentRules` table and seed data exist
- `AdminCompatibilityPage.tsx` provides admin CRUD for rules
- `apps/api/src/modules/recipe/service.ts` **never queries this table** during
  recipe create or update

### M16a — Unit Conversion (1 day)

> ⚠️ Implement in the same PR as M6, since both touch `buildStatCards`.

**Step 1: Create `packages/shared/src/unit-conversion.ts`**

```ts
export type UnitSystem = 'metric' | 'imperial';

export interface ConversionResult {
  value: number;
  unit: string;
}

/** Grams → ounces (2 decimal places) */
export function convertWeight(grams: number, system: UnitSystem): ConversionResult {
  if (system === 'imperial') {
    return { value: Math.round(grams * 0.03527396 * 100) / 100, unit: 'oz' };
  }
  return { value: grams, unit: 'g' };
}

/** Millilitres → fluid ounces (2 decimal places) */
export function convertVolume(ml: number, system: UnitSystem): ConversionResult {
  if (system === 'imperial') {
    return { value: Math.round(ml * 0.033814 * 100) / 100, unit: 'fl oz' };
  }
  return { value: ml, unit: 'ml' };
}

/** Celsius → Fahrenheit (1 decimal place) */
export function convertTemperature(celsius: number, system: UnitSystem): ConversionResult {
  if (system === 'imperial') {
    return { value: Math.round((celsius * 9 / 5 + 32) * 10) / 10, unit: '°F' };
  }
  return { value: celsius, unit: '°C' };
}
```

**Step 2: Update `buildStatCards` to use conversions**

In `apps/web/src/utils/stat-cards.ts`, update the existing 5 cards to use the
conversion functions (the `unitSystem` parameter added in M6 Step 4):

```ts
import {
  convertWeight,
  convertVolume,
  convertTemperature,
  type UnitSystem,
} from '@brewform/shared/unit-conversion';

// formatNumber defined once at top of file:
const formatNumber = (n: number): string =>
  Number.isInteger(n) ? String(n) : n.toFixed(2);

// Inside buildStatCards(version, unitSystem = 'metric'):

const doseConverted = version.groundWeightGrams != null
  ? convertWeight(version.groundWeightGrams, unitSystem)
  : null;
const dose: StatCardItem = {
  label: 'recipe.stat.dose',
  value: doseConverted
    ? `${formatNumber(doseConverted.value)}${doseConverted.unit}`
    : `—g`,
};

const yieldConverted = version.extractionVolumeMl != null
  ? convertVolume(version.extractionVolumeMl, unitSystem)
  : null;
const yieldCard: StatCardItem = {
  label: 'recipe.stat.yield',
  value: yieldConverted
    ? `${formatNumber(yieldConverted.value)}${yieldConverted.unit}`
    : `—ml`,
};

// time and ratio are dimensionless — no conversion

const tempConverted = version.temperatureCelsius != null
  ? convertTemperature(version.temperatureCelsius, unitSystem)
  : null;
const temp: StatCardItem = {
  label: 'recipe.stat.temp',
  value: tempConverted
    ? `${formatNumber(tempConverted.value)}${tempConverted.unit}`
    : `—°C`,
};
```

**Step 3: Read `unitSystem` from preferences and pass to `buildStatCards`**

Create a `useUnitSystem()` hook (or read from the existing preferences context):

```ts
// apps/web/src/hooks/useUnitSystem.ts
import { usePreferences } from '../contexts/PreferencesContext'; // adjust to actual path
import type { UnitSystem } from '@brewform/shared/unit-conversion';

export function useUnitSystem(): UnitSystem {
  const prefs = usePreferences();
  return (prefs?.unitSystem ?? 'metric') as UnitSystem;
}
```

In `RecipeDetailPage.tsx` (and anywhere else `buildStatCards` is called):

```ts
const unitSystem = useUnitSystem();
const statCards = buildStatCards(version, unitSystem);
```

### M16b — Version History Browsing (1-2 days)

**Step 1: Add `GET /api/v1/recipes/:slug/versions` endpoint**

First check whether `GET /api/v1/recipes/:slugOrId` already includes `versions[]`
in its response. If not, add a dedicated endpoint in
`apps/api/src/modules/recipe/index.ts`:

```ts
// GET /recipes/:slug/versions
router.get('/:slug/versions', optionalAuthMiddleware, async (c) => {
  const { slug } = c.req.param();
  const userId = c.get('userId');
  const recipe = await RecipeService.getBySlug(slug, userId);
  if (!recipe) return notFound(c, 'Recipe not found');
  const versions = await RecipeModel.getVersionsByRecipeId(recipe.id);
  return ok(c, versions);
});
```

Add `getVersionsByRecipeId` to `apps/api/src/modules/recipe/model.ts` if it does
not already exist.

**Step 2: Create `apps/web/src/pages/recipes/RecipeVersionsPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router';
import { api } from '../../api/client';
import { useTranslation } from '../../contexts/I18nContext';
import { SEOHead } from '../../components/seo/SEOHead';
import { useUnitSystem } from '../../hooks/useUnitSystem';
import { convertWeight, convertVolume, convertTemperature } from '@brewform/shared/unit-conversion';

interface VersionSummary {
  id: string;
  versionNumber: number;
  brewDate: string;
  brewMethod: string;
  groundWeightGrams: number | null;
  extractionVolumeMl: number | null;
  extractionTimeSeconds: number | null;
  temperatureCelsius: number | null;
}

interface RecipeVersionsResponse {
  id: string;
  title: string;
  slug: string;
  versions: VersionSummary[];
}

export function RecipeVersionsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const unitSystem = useUnitSystem();
  const [data, setData] = useState<RecipeVersionsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    api.get<RecipeVersionsResponse>(`/recipes/${slug}/versions`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return <div className='mx-auto max-w-4xl px-4 py-12 text-[color:var(--text-secondary)]'>Loading…</div>;
  }
  if (!data) {
    return <div className='mx-auto max-w-4xl px-4 py-12 text-[color:var(--text-secondary)]'>Recipe not found</div>;
  }

  return (
    <>
      <SEOHead title={`${data.title} – Version History | BrewForm`} />
      <div className='mx-auto max-w-4xl px-4 py-12'>
        <div className='mb-6'>
          <Link to={`/recipes/${data.slug}`} className='text-sm text-[color:var(--accent-primary)]'>
            ← {t('common.back')}
          </Link>
          <h1 className='text-2xl font-bold mt-2 text-[color:var(--text-primary)]'>
            {data.title} – {t('recipe.versionHistory')}
          </h1>
        </div>

        <div className='space-y-3'>
          {data.versions.map((v) => {
            const weight = v.groundWeightGrams != null
              ? convertWeight(v.groundWeightGrams, unitSystem)
              : null;
            const volume = v.extractionVolumeMl != null
              ? convertVolume(v.extractionVolumeMl, unitSystem)
              : null;
            const temp = v.temperatureCelsius != null
              ? convertTemperature(v.temperatureCelsius, unitSystem)
              : null;

            return (
              <div
                key={v.id}
                className='rounded-lg p-4 bg-[color:var(--bg-secondary)] border border-[color:var(--border-primary)]'
              >
                <div className='flex items-center justify-between'>
                  <span className='font-semibold text-[color:var(--text-primary)]'>
                    v{v.versionNumber}
                  </span>
                  <span className='text-sm text-[color:var(--text-tertiary)]'>
                    {new Date(v.brewDate).toLocaleDateString()}
                  </span>
                </div>
                <div className='mt-2 flex gap-4 text-sm text-[color:var(--text-secondary)]'>
                  {v.brewMethod && <span>{v.brewMethod}</span>}
                  {weight && <span>{weight.value}{weight.unit}</span>}
                  {volume && <span>{volume.value}{volume.unit}</span>}
                  {v.extractionTimeSeconds != null && <span>{v.extractionTimeSeconds}s</span>}
                  {temp && <span>{temp.value}{temp.unit}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
```

**Step 3: Add route in `apps/web/src/router.tsx`**

```tsx
import { RecipeVersionsPage } from './pages/recipes/RecipeVersionsPage';

// After the existing recipe detail route:
{ path: 'recipes/:slug/versions', element: <RecipeVersionsPage /> },
```

**Step 4: Add link from RecipeDetailPage**

In `MetadataBadges.tsx` or `RecipeDetailPage.tsx`, near the version badge,
add a link when `versionCount > 1`:

```tsx
{recipe.versionCount > 1 && (
  <Link
    to={`/recipes/${recipe.slug}/versions`}
    className='text-sm text-[color:var(--accent-primary)] hover:underline'
  >
    {t('recipe.viewVersionHistory')} ({recipe.versionCount})
  </Link>
)}
```

Add i18n keys:

```ts
// en.ts
'recipe.versionHistory': 'Version History',
'recipe.viewVersionHistory': 'View version history',

// tr.ts
'recipe.versionHistory': 'Sürüm Geçmişi',
'recipe.viewVersionHistory': 'Sürüm geçmişini görüntüle',
```

### M16c — Brew Method Compatibility Validation (0.5 day)

> ⚠️ **Critical bug fix:** The original plan named the loop variable `eq`, which
> shadows the imported Drizzle `eq()` operator. This causes a runtime
> `TypeError: eq is not a function`. The variable is renamed to `eqItem` below.

**Step 1: Add validation function in `apps/api/src/modules/recipe/service.ts`**

```ts
import { brewMethodEquipmentRules } from '@brewform/db/schema';

async function validateEquipmentCompatibility(
  brewMethod: string,
  equipmentIds: string[],
): Promise<void> {
  if (!brewMethod || !equipmentIds?.length) return;

  const equipmentList = await db
    .select({ id: equipment.id, type: equipment.type })
    .from(equipment)
    .where(inArray(equipment.id, equipmentIds));

  const incompatible: string[] = [];

  for (const eqItem of equipmentList) {        // ← renamed from "eq" to avoid
    const [rule] = await db                    //   shadowing the Drizzle eq() import
      .select()
      .from(brewMethodEquipmentRules)
      .where(
        and(
          eq(brewMethodEquipmentRules.brewMethod, brewMethod),
          eq(brewMethodEquipmentRules.equipmentType, eqItem.type),
        ),
      )
      .limit(1);

    if (rule && !rule.compatible) {
      incompatible.push(`${eqItem.type} is not compatible with ${brewMethod}`);
    }
  }

  if (incompatible.length) {
    throw Object.assign(
      new Error('VALIDATION_ERROR'),
      { code: 'EQUIPMENT_INCOMPATIBLE', details: incompatible },
    );
  }
}
```

**Step 2: Wire into `createRecipe()` and `updateRecipe()`**

```ts
// In createRecipe(), before the transaction:
await validateEquipmentCompatibility(data.brewMethod, data.equipmentIds ?? []);

// In updateRecipe(), before the bumpVersion logic:
if (data.brewMethod && data.equipmentIds) {
  await validateEquipmentCompatibility(data.brewMethod, data.equipmentIds);
}
```

**Step 3: Return 422 via the error handler middleware**

In `apps/api/src/middleware/errorHandler.ts`, add a case for `EQUIPMENT_INCOMPATIBLE`:

```ts
if (err.code === 'EQUIPMENT_INCOMPATIBLE') {
  return c.json(
    {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Equipment is not compatible with the selected brew method',
        details: err.details.map((d: string) => ({ field: 'equipmentIds', message: d })),
        requestId: c.get('requestId'),
      },
    },
    422,
  );
}
```

> Uses `VALIDATION_ERROR` (the existing 422 error code per `docs/api.md`) so
> clients do not need special handling for an unknown code.

### Dependencies

- M16a must be implemented in the same PR as M6 (both modify `buildStatCards`)
- M16b requires M16a's `useUnitSystem` hook
- M16c is independent

### docs/ Changes

**`docs/recipes.md` — update Canonical Units section:**

Add a note after the existing conversion table:
```markdown
The UI reads `UserPreferences.unitSystem` and `UserPreferences.temperatureUnit` from
the preferences API at page load and converts all displayed measurements via
`packages/shared/src/unit-conversion.ts`.
```

**`docs/recipes.md` — update Versioning section:**

```markdown
Full version history is accessible via the API and the version history UI:

- API: `GET /api/v1/recipes/:slug/versions` — returns all versions for a recipe
- UI: `/recipes/:slug/versions` — browsable version history page (linked from the
  recipe detail page when `versionCount > 1`)
```

**`docs/api.md` — add Recipes section entry:**

In the Recipes endpoint table, add:

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/recipes/:slug/versions` | optional | List all versions for a recipe |

**`docs/recipes.md` — update Hard Validation section:**

```markdown
- Brew method and equipment compatibility is enforced at save time via the
  `BrewMethodEquipmentRule` table. Incompatible combinations return a `422
  VALIDATION_ERROR` with a `details` array naming each incompatible equipment type.
```

### Tests

**M16a — `packages/shared/src/unit-conversion.test.ts`:**

```ts
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { convertWeight, convertVolume, convertTemperature } from './unit-conversion.ts';

describe('convertWeight', () => {
  it('returns grams unchanged in metric', () => {
    expect(convertWeight(18, 'metric')).toEqual({ value: 18, unit: 'g' });
  });
  it('converts 18g to oz in imperial', () => {
    const r = convertWeight(18, 'imperial');
    expect(r.unit).toBe('oz');
    expect(Math.abs(r.value - 0.63)).toBeLessThan(0.01);
  });
});

describe('convertVolume', () => {
  it('returns ml unchanged in metric', () => {
    expect(convertVolume(250, 'metric')).toEqual({ value: 250, unit: 'ml' });
  });
  it('converts 250ml to fl oz in imperial', () => {
    const r = convertVolume(250, 'imperial');
    expect(r.unit).toBe('fl oz');
    expect(Math.abs(r.value - 8.45)).toBeLessThan(0.01);
  });
});

describe('convertTemperature', () => {
  it('returns celsius unchanged in metric', () => {
    expect(convertTemperature(93, 'metric')).toEqual({ value: 93, unit: '°C' });
  });
  it('converts 93°C to °F in imperial', () => {
    const r = convertTemperature(93, 'imperial');
    expect(r.unit).toBe('°F');
    expect(Math.abs(r.value - 199.4)).toBeLessThan(0.1);
  });
  it('converts 0°C to 32°F', () => {
    const r = convertTemperature(0, 'imperial');
    expect(r.value).toBe(32);
  });
});
```

**M16b — `apps/api/src/modules/recipe/recipe.versions.test.ts`:**

```ts
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';

describe('GET /api/v1/recipes/:slug/versions', () => {
  it('returns 200 with versions array for a public recipe', async () => {
    const res = await app.request(`/api/v1/recipes/${publicRecipeSlug}/versions`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(typeof body.data[0].versionNumber).toBe('number');
  });

  it('returns 404 for a non-existent recipe slug', async () => {
    const res = await app.request('/api/v1/recipes/does-not-exist/versions');
    expect(res.status).toBe(404);
  });
});
```

**M16c — `apps/api/src/modules/recipe/recipe.compatibility.test.ts`:**

```ts
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';

describe('brew method compatibility validation', () => {
  it('returns 422 VALIDATION_ERROR with details when equipment is incompatible', async () => {
    const res = await app.request('/api/v1/recipes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        ...validRecipePayload,
        brewMethod: 'espresso_machine',
        equipmentIds: [incompatibleEquipmentId],
      }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(body.error.details)).toBe(true);
    expect(body.error.details.length).toBeGreaterThan(0);
  });

  it('allows recipe creation when all equipment is compatible', async () => {
    const res = await app.request('/api/v1/recipes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        ...validRecipePayload,
        brewMethod: 'espresso_machine',
        equipmentIds: [compatibleEquipmentId],
      }),
    });
    expect(res.status).toBe(201);
  });

  it('skips compatibility check when no equipmentIds are provided', async () => {
    const res = await app.request('/api/v1/recipes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ ...validRecipePayload, equipmentIds: [] }),
    });
    expect(res.status).toBe(201);
  });
});
```

Run: `make test-api` and `make test-shared`

**M16b — `apps/web/src/pages/recipes/RecipeVersionsPage.test.tsx` (Vitest + RTL):**

> ⚠️ This is a **frontend page test** — use Vitest + RTL, not Deno BDD.

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { RecipeVersionsPage } from './RecipeVersionsPage';

vi.mock('react-router', () => ({
  useParams: vi.fn(),
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode; [key: string]: unknown }) =>
    <a href={to} {...props}>{children}</a>,
}));

vi.mock('../../api/client.ts', () => ({
  api: { get: vi.fn() },
}));

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: vi.fn(),
}));

vi.mock('../../hooks/useUnitSystem.ts', () => ({
  useUnitSystem: vi.fn().mockReturnValue('metric'),
}));

import { useParams } from 'react-router';
import { api } from '../../api/client.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';

const mockUseParams = vi.mocked(useParams);
const mockApi = vi.mocked(api);
const mockUseTranslation = vi.mocked(useTranslation);

const enT = (key: string) => {
  const map: Record<string, string> = {
    'common.back': 'Back',
    'recipe.versionHistory': 'Version History',
  };
  return map[key] ?? key;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseParams.mockReturnValue({ slug: 'test-recipe' });
  mockUseTranslation.mockReturnValue({
    locale: 'en' as const,
    setLocale: vi.fn(),
    t: enT,
    availableLocales: ['en', 'tr'],
  });
});

describe('RecipeVersionsPage', () => {
  it('renders version list on successful load', async () => {
    mockApi.get.mockResolvedValue({
      title: 'My Recipe',
      slug: 'test-recipe',
      versions: [
        { id: 'v1', versionNumber: 1, brewDate: '2026-01-01', brewMethod: 'v60',
          groundWeightGrams: 18, extractionVolumeMl: 250, extractionTimeSeconds: 180,
          temperatureCelsius: 93 },
        { id: 'v2', versionNumber: 2, brewDate: '2026-02-01', brewMethod: 'v60',
          groundWeightGrams: 17, extractionVolumeMl: 240, extractionTimeSeconds: 170,
          temperatureCelsius: 92 },
      ],
    });

    render(<RecipeVersionsPage />);

    await waitFor(() => {
      expect(screen.getByText('v1')).toBeInTheDocument();
      expect(screen.getByText('v2')).toBeInTheDocument();
    });
  });

  it('renders "not found" when API returns null', async () => {
    mockApi.get.mockRejectedValue(new Error('Not found'));

    render(<RecipeVersionsPage />);

    await waitFor(() => {
      expect(screen.getByText(/not found/i)).toBeInTheDocument();
    });
  });
});
```

Run: `deno task --cwd apps/web test` (for all Vitest web tests)

---

## N7 — CORS credentials: true Without Frontend credentials: 'include'

**Severity:** Nota Bene (informational — currently non-breaking)
**Effort:** 0.25 day

### Evidence

- `apps/api/src/middleware/cors.ts` — `credentials: true` set in CORS config
- `apps/web/src/api/client.ts` — `request()` uses plain `fetch()` without
  `credentials: 'include'`
- Auth uses Bearer token in `Authorization` header (not cookies), so `credentials: true`
  has no current effect
- Vite dev proxy forwards `/api/*` to the API on the same origin, so CORS is not
  triggered in development

### Impact

No current bug. Risk: if the app migrates to HTTP-only cookie auth (recommended in
the security plan), `credentials: 'include'` will be required or auth will silently fail.

### Action Plan

**Step 1: Add `credentials: 'include'` to all `fetch` calls in `apps/web/src/api/client.ts`**

Three places to update:

```ts
// 1. Main request() function
let response = await fetch(`${API_BASE}${endpoint}`, {
  ...options,
  headers,
  credentials: 'include',  // ADD
});

// 2. 401 retry inside request()
response = await fetch(`${API_BASE}${endpoint}`, {
  ...options,
  headers,
  credentials: 'include',  // ADD
});

// 3. refreshAccessToken()
const response = await fetch(`${API_BASE}/auth/refresh`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ refreshToken, rememberMe }),
  credentials: 'include',  // ADD
});
```

**Step 2: Add documentation comment to `apps/api/src/middleware/cors.ts`**

```ts
/**
 * CORS Configuration
 *
 * credentials: true — Required because the frontend sends requests with
 * credentials: 'include'. Currently the app uses Bearer token auth (not cookies),
 * but this ensures future compatibility when migrating to HTTP-only cookie auth.
 *
 * IMPORTANT: When credentials: true is set, the browser enforces that
 * Access-Control-Allow-Origin must be an explicit origin list — never '*'.
 * Our config provides the list via config.CORS_ALLOWED_ORIGINS.
 * Do not switch to wildcard origin while credentials: true is active.
 */
```

### docs/ Changes

No docs change needed — this is infrastructure plumbing, not a user-visible feature.
If `docs/auth.md` describes the auth flow, add a note there that `credentials: include`
is set on all fetch calls for future cookie-auth compatibility.

### Tests & Verification

1. `make dev` — existing login and recipe fetch flows work without console errors
2. Browser Network tab: requests show `credentials: include` in request headers
3. No `Access-Control-Allow-Origin: *` appears alongside `Access-Control-Allow-Credentials: true`
   (that combination causes browser block)
4. `make test-api` — especially any existing `cors.test.ts`

---

## Implementation Order

```
Week 1:
  L4    (Favicon)                    — 0.5 day, unblocks H5
  H5    (PWA Manifest)               — 0.5 day, depends on L4 for icons
  N7    (CORS credentials)           — 0.25 day, safe additive change
  M2    (RecipeVersionPhoto)         — 0.5 day, data-layer fix

Week 2:
  NEW-1 (Test infrastructure check)  — 0.5 day, confirm existing + scaffold new files
  M6 + M16a (TDS + Unit Conversion)  — 1.5 days, MUST be same PR (both touch stat-cards.ts)
  M9    (Contact Form)               — 1-2 days, new endpoint + page

Week 3:
  H10   (Inline Styles) Phase 1-2    — 1.5 days
  M16b  (Version History)            — 1-2 days, verify API response shape first

Week 4:
  H10   (Inline Styles) Phase 3-4    — 2 days
  M16c  (Brew Validation)            — 0.5 day, fix eq naming bug before shipping
```

---

## Cross-References

- **Plan 01 (Security):** N7 relates to the cookie-based auth migration recommended there
- **Plan 02 (SEO):** H5 and L4 improve the Lighthouse PWA score alongside SEO meta tag fixes
- **Plan 03 (Performance):** H10 inline-to-Tailwind conversion reduces bundle size
- **Plan 05 (Technical Debt):** H10 is also a code quality concern
- **M6 and M16a must be in the same PR** — both modify `buildStatCards()` in `stat-cards.ts`
- **M16b requires M16a** — the version history page uses `useUnitSystem()` from M16a
- **docs/ index:** The `docs/` table in `README.md` does not need updating for M6 or M16 — the
  changes go into existing files (`docs/recipes.md`, `docs/api.md`) already listed there.
  If `docs/contact.md` is desired as a standalone reference, add it to the README docs table.
