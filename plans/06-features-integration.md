# Plan 06 -- Feature Completeness & Integration Fixes

**Priority:** Medium-High
**Scope:** Styling consistency, PWA/favicon, data-layer gaps, missing features, README accuracy, CORS alignment
**Estimated Effort:** ~8-12 days across 8 work items
**Dependencies:** None of these block each other; can be parallelized freely

---

## Tech Stack Reference

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Deno | 2.x |
| API Framework | Hono | v4.7 |
| Frontend | React | 19.1 |
| Styling | Tailwind CSS | v4.1 |
| Build | Vite | 8 |
| Database | PostgreSQL + Drizzle ORM | 0.45 |
| Validation | Zod | v4 (shared schemas) |

**IMPORTANT: This is a pure Deno project. Never use npm/npx/bun/husky/lint-staged or other Node.js-specific tools.**

---

## Table of Contents

| ID | Title | Severity | Effort |
|----|-------|----------|--------|
| [H10](#h10--576-inline-styles-vs-tailwind-consistency) | 576 Inline Styles vs Tailwind | High | 3-4 days |
| [H5](#h5--missing-pwa-manifest) | Missing PWA Manifest | High | 0.5 day |
| [L4](#l4--missing-favicon-files) | Missing Favicon Files | Low | 0.5 day |
| [M2](#m2--recipeversionphoto-never-populated-on-create) | RecipeVersionPhoto Never Populated | Medium | 0.5 day |
| [M6](#m6--extractionyield-not-computed) | extractionYield Not Computed | Medium | 0.5 day |
| [M9](#m9--no-contact-form) | No Contact Form | Medium | 1-2 days |
| [M16](#m16--readme-claims-dont-match-implementation) | README Claims vs Implementation | Medium | 2-3 days |
| [N7](#n7--cors-credentials-true-without-frontend-credentials-include) | CORS credentials Mismatch | Nota Bene | 0.25 day |

---

## H10 -- 576 Inline Styles vs Tailwind (Consistency)

**Severity:** High
**Effort:** 3-4 days (incremental -- can be spread across sprints)

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

Meanwhile, `Navbar.tsx` and `Footer.tsx` already use the correct Tailwind v4 `[color:var(...)]` syntax, proving the pattern works in this project.

### Impact

- Inconsistent styling approach across the codebase (two competing patterns in the same project)
- Inline styles defeat Tailwind's responsive/hover/dark utilities -- cannot write `hover:text-[var(--accent-primary)]` when the color is an inline style
- Larger bundle: inline styles are not deduplicated by the CSS engine
- Harder to maintain: global theme changes require touching every `style={{}}` instead of one CSS variable

### Conversion Pattern Reference

These are the exact transformations to apply mechanically:

```tsx
// BEFORE (inline style)
<div style={{ color: 'var(--text-secondary)' }}>

// AFTER (Tailwind v4 arbitrary value)
<div className='text-[color:var(--text-secondary)]'>
```

```tsx
// BEFORE
<div style={{ backgroundColor: 'var(--bg-secondary)' }}>

// AFTER
<div className='bg-[color:var(--bg-secondary)]'>
```

```tsx
// BEFORE
<div style={{ borderColor: 'var(--border-primary)' }}>

// AFTER
<div className='border-[color:var(--border-primary)]'>
```

```tsx
// BEFORE
<div style={{ border: '1px solid var(--border-primary)' }}>

// AFTER
<div className='border border-[color:var(--border-primary)]'>
```

```tsx
// BEFORE
<div style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem' }}>

// AFTER
<div className='text-xs px-3 py-1'>
```

```tsx
// BEFORE (combined)
<div
  className='flex flex-col rounded-lg p-4'
  style={{
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border-primary)',
  }}
>

// AFTER (merged into className)
<div className='flex flex-col rounded-lg p-4 bg-[color:var(--bg-secondary)] border border-[color:var(--border-primary)]'>
```

### Action Plan

**Phase 1 -- Recipe detail components (35 styles, 1 day)**

Convert in this order:
1. `components/recipe/StatCards.tsx` (3 styles) -- smallest, good warmup
2. `components/recipe/BreadcrumbNav.tsx` (6 styles)
3. `components/recipe/StarRating.tsx` (6 styles)
4. `components/recipe/TastingNotesSection.tsx` (8 styles)
5. `components/recipe/BrewTimeline.tsx` (10 styles)
6. `components/recipe/EquipmentSection.tsx` (10 styles)

Run `deno task test:web` after each file.

**Phase 2 -- Recipe detail page + comments (36 styles, 0.5 day)**

1. `components/recipe/CommentSection.tsx` (13 styles)
2. `components/recipe/MetadataBadges.tsx` (11 styles)
3. `pages/recipes/RecipeDetailPage.tsx` (12 styles)

**Phase 3 -- Admin pages (153 styles, 1 day)**

1. `pages/admin/AdminUserDetailPage.tsx` (42 styles)
2. `pages/admin/AdminUsersPage.tsx` (27 styles)
3. `pages/admin/AdminUserEditPage.tsx` (23 styles)
4. `pages/admin/AdminEquipmentPage.tsx` (17 styles)
5. `pages/admin/AdminVendorsPage.tsx` (15 styles)
6. `pages/admin/AdminUserCreatePage.tsx` (15 styles)
7. `pages/admin/AdminRecipesPage.tsx` (14 styles)

**Phase 4 -- Remaining pages + components (352 styles, 1-2 days)**

Convert all remaining files, largest first. The mechanical pattern is identical.

### Concrete Example: StatCards.tsx

Current code at `apps/web/src/components/recipe/StatCards.tsx:22-41`:

```tsx
// BEFORE
<div
  key={card.label}
  className='flex flex-col rounded-lg p-4 min-w-[80px] flex-shrink-0 md:flex-shrink md:min-w-0'
  style={{
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border-primary)',
  }}
>
  <span
    className='text-xs uppercase tracking-widest'
    style={{ color: 'var(--text-tertiary)' }}
  >
    {t(card.label)}
  </span>
  <span
    className='text-2xl font-bold mt-1'
    style={{ color: 'var(--text-primary)' }}
  >
    {card.value}
  </span>
</div>
```

```tsx
// AFTER
<div
  key={card.label}
  className='flex flex-col rounded-lg p-4 min-w-[80px] flex-shrink-0 md:flex-shrink md:min-w-0 bg-[color:var(--bg-secondary)] border border-[color:var(--border-primary)]'
>
  <span className='text-xs uppercase tracking-widest text-[color:var(--text-tertiary)]'>
    {t(card.label)}
  </span>
  <span className='text-2xl font-bold mt-1 text-[color:var(--text-primary)]'>
    {card.value}
  </span>
</div>
```

### Verification

After each file:
1. Run `deno task test:web` to confirm no test regressions
2. Visual check in browser: toggle Light/Dark/Coffee themes
3. Verify the file has zero remaining `style={{` occurrences: `grep -c "style={{" <file>`

---

## H5 -- Missing PWA Manifest

**Severity:** High
**Effort:** 0.5 day

### Evidence

- `apps/web/public/` contains only `_redirects` and `404.html` -- no `manifest.json`
- `apps/web/index.html` has no `<link rel="manifest">`, no `<meta name="theme-color">`, no `<link rel="apple-touch-icon">`
- Mobile browsers cannot offer "Add to Home Screen" without a manifest

### Impact

- No "Add to Home Screen" capability on mobile
- No themed address bar color on Android Chrome
- Missing from any PWA audits (Lighthouse PWA score: 0)

### Action Plan

**Step 1: Create `apps/web/public/manifest.json`**

```json
{
  "name": "BrewForm",
  "short_name": "BrewForm",
  "description": "Coffee brewing recipes and tasting notes",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1a1207",
  "theme_color": "#c8a27a",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    },
    {
      "src": "/favicon.svg",
      "sizes": "any",
      "type": "image/svg+xml"
    }
  ],
  "categories": ["food", "lifestyle"],
  "lang": "en",
  "dir": "ltr"
}
```

Color rationale:
- `background_color: #1a1207` -- dark coffee brown (matches Coffee theme `--bg-primary`)
- `theme_color: #c8a27a` -- warm accent (matches `--accent-primary` in Coffee theme)

**Step 2: Update `apps/web/index.html`**

```html
<!DOCTYPE html>
<html lang="en" class="light">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BrewForm</title>
    <meta name="description" content="Coffee brewing recipes and tasting notes" />
    <meta name="theme-color" content="#c8a27a" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" type="image/x-icon" href="/favicon.ico" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/manifest.json" />
  </head>
  <body>
    <script>
      if (sessionStorage.redirect) {
        var redirect = sessionStorage.redirect;
        delete sessionStorage.redirect;
        history.replaceState(null, '', redirect);
      }
    </script>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 3: Coordinate with L4 for icon files**

The manifest references `icon-192.png`, `icon-512.png`, and `favicon.svg` -- all created in L4 below.

### Dependencies

- **L4** (Missing Favicon Files) -- the manifest references icon files that L4 creates. Implement L4 first or simultaneously.

### Verification

1. Open Chrome DevTools > Application > Manifest -- should show parsed manifest with icons
2. Lighthouse PWA audit should recognize the manifest
3. Test on Android Chrome: long-press URL bar should show "Add to Home Screen"

---

## L4 -- Missing Favicon Files

**Severity:** Low
**Effort:** 0.5 day

### Evidence

- `apps/web/index.html:7` references `/favicon.svg` which does not exist
- `apps/web/public/` contains only `_redirects` and `404.html`
- Browser shows default/broken favicon

### Impact

- Broken favicon in every browser tab
- No branding in bookmarks, tab bar, or home screen

### Action Plan

**Step 1: Create `apps/web/public/favicon.svg`**

A simple coffee cup icon that works at small sizes:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <!-- Steam wisps -->
  <path d="M22 8c0-4 4-4 4-8" stroke="#c8a27a" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
  <path d="M32 6c0-4 4-4 4-8" stroke="#c8a27a" stroke-width="2" stroke-linecap="round" opacity="0.4"/>
  <path d="M42 8c0-4 4-4 4-8" stroke="#c8a27a" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
  <!-- Cup body -->
  <rect x="12" y="16" width="36" height="28" rx="4" fill="#c8a27a"/>
  <!-- Coffee surface -->
  <ellipse cx="30" cy="24" rx="14" ry="3" fill="#8b6914"/>
  <!-- Handle -->
  <path d="M48 22c6 0 8 4 8 8s-2 8-8 8" stroke="#c8a27a" stroke-width="4" stroke-linecap="round" fill="none"/>
  <!-- Saucer -->
  <ellipse cx="30" cy="48" rx="22" ry="5" fill="#a0845c"/>
  <!-- Cup base connection -->
  <rect x="18" y="44" width="24" height="4" rx="2" fill="#c8a27a"/>
</svg>
```

**Step 2: List all required icon files**

| File | Size | Purpose |
|------|------|---------|
| `favicon.svg` | any | Modern browsers, manifest |
| `favicon.ico` | 32x32 | Legacy browsers |
| `apple-touch-icon.png` | 180x180 | iOS home screen |
| `icon-192.png` | 192x192 | Android/PWA manifest |
| `icon-512.png` | 512x512 | PWA splash screen |

**Step 3: Generate raster icons from SVG**

Since this is a Deno project, use a one-off script or manual conversion:

```bash
# Option A: Use resvg-js (Deno-compatible) for SVG-to-PNG
# Option B: Use any online SVG-to-PNG tool (Realfavicongenerator.net)
# Option C: Create a Deno script using Canvas API

# The generated files go into apps/web/public/:
# apps/web/public/favicon.svg       (created in Step 1)
# apps/web/public/favicon.ico        (32x32, convert from SVG)
# apps/web/public/apple-touch-icon.png (180x180, convert from SVG)
# apps/web/public/icon-192.png       (192x192, convert from SVG)
# apps/web/public/icon-512.png       (512x512, convert from SVG)
```

**Step 4: Update `<link>` tags in `index.html`**

Already covered in H5 Step 2 above. The relevant additions:

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="icon" type="image/x-icon" href="/favicon.ico" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
```

### Dependencies

- None. H5 (PWA Manifest) depends on this for icon references.

### Verification

1. Open the app in browser -- favicon should appear in tab
2. Check Network tab: `/favicon.svg` returns 200, not 404
3. iOS Safari: add to home screen shows custom icon
4. Chrome DevTools > Application > Manifest > Icons -- all icons resolve

---

## M2 -- RecipeVersionPhoto Never Populated on Create

**Severity:** Medium
**Effort:** 0.5 day

### Evidence

- `packages/db/src/schema.ts:336-354` -- `recipeVersionPhotos` junction table exists with `recipeVersionId`, `photoId`, `sortOrder`
- `apps/api/src/modules/recipe/model.ts:7` -- `recipeVersionPhotos` is imported
- `apps/api/src/modules/recipe/model.ts:188-198` -- `recipeVersionPhotos` is populated during `forkRecipe()` (copies source version photos to fork)
- `apps/api/src/modules/recipe/model.ts:100-103` -- `createVersion()` only inserts into `recipeVersions`, never into `recipeVersionPhotos`
- `apps/api/src/modules/recipe/service.ts:73-102` -- `createRecipe()` transaction inserts version, taste notes, equipment, additional preparations -- but **never** inserts into `recipeVersionPhotos`
- `apps/api/src/modules/recipe/service.ts:181-212` -- `updateRecipe()` with `bumpVersion` creates new version via `model.createVersion()` -- also **never** populates `recipeVersionPhotos`
- `apps/api/src/modules/photo/` -- no references to `recipeVersionPhotos` anywhere in the photo module

### Impact

- Photos uploaded for a recipe are associated with the recipe (via `photos.recipeId`) but not with any specific version
- When a recipe is forked, version photos are correctly copied -- but the original recipe never had them populated, so an empty array is copied
- Version-specific photo tracking is effectively dead code for normal recipe creation/editing

### Action Plan

**Step 1: Update `createRecipe()` in `apps/api/src/modules/recipe/service.ts`**

After the existing recipe creation transaction (which already inserts taste notes, equipment, and preparations), add photo-version association:

```ts
// In createRecipe(), inside the transaction, after additionalPreparations insertion
// (after the block at line ~120-131)

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

This requires importing `recipeVersionPhotos` in `service.ts`:

```ts
// At top of service.ts, add to the existing import:
import {
  recipeAdditionalPreparations,
  recipeEquipment,
  recipes,
  recipeTasteNotes,
  recipeVersionPhotos,  // ADD THIS
  recipeVersions,
  setups,
  users,
} from '@brewform/db/schema';
```

**Step 2: Update `updateRecipe()` version bump path**

In the `bumpVersion` branch of `updateRecipe()` (line ~164-212), after `model.createVersion()` returns, associate photos with the new version:

```ts
// After model.createVersion() at line ~181-212, before the model.update() call

// Copy existing version photos to new version (or use new photoIds if provided)
if (data.photoIds?.length) {
  // Explicit photo list provided -- use it
  await db.insert(recipeVersionPhotos).values(
    data.photoIds.map((photoId: string, i: number) => ({
      recipeVersionId: version.id,
      photoId,
      sortOrder: i,
    })),
  );
} else if (latestVersion?.id) {
  // No new photos provided -- carry forward from previous version
  const previousPhotos = await db.select().from(recipeVersionPhotos)
    .where(eq(recipeVersionPhotos.recipeVersionId, latestVersion.id));
  if (previousPhotos.length) {
    await db.insert(recipeVersionPhotos).values(
      previousPhotos.map((vp) => ({
        recipeVersionId: version.id,
        photoId: vp.photoId,
        sortOrder: vp.sortOrder,
      })),
    );
  }
}
```

**Step 3: Update the photo upload flow**

The photo upload endpoint (`apps/api/src/modules/photo/`) inserts into the `photos` table with `recipeId`. After upload, the frontend should include `photoIds` in recipe create/update requests so the service can populate `recipeVersionPhotos`. Verify the frontend already sends `photoIds` or add it to the recipe form submission payload.

### Dependencies

- None.

### Verification

1. Create a new recipe with photos -- check `recipe_version_photo` table has rows
2. Edit a recipe with `bumpVersion: true` -- new version should have photo associations
3. Fork a recipe that now has version photos -- fork should copy them correctly
4. Run existing tests: `deno task test:api`

---

## M6 -- extractionYield Not Computed

**Severity:** Medium
**Effort:** 0.5 day

### Evidence

- Zero matches for `extractionYield`, `extraction_yield`, or `TDS` anywhere in the codebase
- The formula is standard in specialty coffee: `extractionYield = (tds * extractionVolumeMl) / groundWeightGrams * 100`
- The required inputs (`extractionVolumeMl`, `groundWeightGrams`) already exist in `recipeVersions` schema
- TDS (Total Dissolved Solids) is not stored in the schema -- this would need to be an optional field
- `apps/web/src/utils/stat-cards.ts` already builds 5 stat cards: DOSE, YIELD, TIME, RATIO, TEMP

### Impact

- Specialty coffee users expect extraction yield as a key metric
- Without TDS in the schema, extraction yield cannot be computed -- this is a two-part feature

### Action Plan

**Step 1: Add TDS column to recipe versions**

Add optional `tds` column to `recipeVersions` in `packages/db/src/schema.ts`:

```ts
// In the recipeVersions table definition, add after temperatureCelsius:
tds: decimal('tds', { precision: 4, scale: 2 }),
```

Generate and run migration:

```bash
make db-generate
make db-migrate
```

**Step 2: Add extraction yield computation to shared utils**

Create or extend `packages/shared/src/utils.ts`:

```ts
/**
 * Computes extraction yield percentage.
 * Formula: (TDS% x beverage_weight_grams) / dry_coffee_weight_grams x 100
 *
 * @param tds - Total Dissolved Solids as a percentage (e.g. 1.35 for 1.35%)
 * @param extractionVolumeMl - Volume of extracted coffee in ml (approximated as grams)
 * @param groundWeightGrams - Weight of dry coffee grounds in grams
 * @returns Extraction yield as a percentage, or null if inputs are invalid
 */
export function computeExtractionYield(
  tds: number,
  extractionVolumeMl: number,
  groundWeightGrams: number,
): number | null {
  if (!tds || !extractionVolumeMl || !groundWeightGrams || groundWeightGrams === 0) {
    return null;
  }
  // tds is already a percentage (e.g. 1.35 means 1.35%)
  // extractionVolumeMl approximates beverage weight in grams (water density ~1)
  return (tds / 100) * extractionVolumeMl / groundWeightGrams * 100;
}
```

**Step 3: Compute and store in recipe service**

In `apps/api/src/modules/recipe/service.ts`, within `createRecipe()` and `updateRecipe()`:

```ts
import { computeBrewRatio, computeFlowRate, computeExtractionYield } from '@brewform/shared/utils';

// In createRecipe(), alongside brewRatio and flowRate computation:
const extractionYield = data.tds && data.extractionVolumeMl && data.groundWeightGrams
  ? computeExtractionYield(data.tds, data.extractionVolumeMl, data.groundWeightGrams)
  : null;

// Pass to version insert:
// tds: data.tds ?? null,
// extractionYield,
```

Alternatively, compute on the fly in the frontend (no DB column needed for yield since it is derived):

```ts
// In stat-cards.ts, extractionYield is computed from existing version data
// This avoids adding an extractionYield column -- just add tds to the schema
```

**Step 4: Add extraction yield stat card**

Update `apps/web/src/utils/stat-cards.ts`:

```ts
export function buildStatCards(version: {
  groundWeightGrams?: number | null;
  extractionVolumeMl?: number | null;
  extractionTimeSeconds?: number | null;
  brewRatio?: number | null;
  temperatureCelsius?: number | null;
  tds?: number | null;  // ADD THIS
}): StatCardItem[] {
  const dash = '—';

  // ... existing 5 cards ...

  // Conditional 6th card: Extraction Yield (only when TDS is available)
  const cards = [dose, yieldCard, time, ratio, temp];

  if (version.tds != null && version.extractionVolumeMl != null && version.groundWeightGrams != null) {
    const ey = (version.tds / 100) * version.extractionVolumeMl / version.groundWeightGrams * 100;
    cards.push({
      label: 'recipe.stat.extractionYield',
      value: `${ey.toFixed(1)}%`,
    });
  }

  return cards;
}
```

**Step 5: Update StatCards component grid**

In `apps/web/src/components/recipe/StatCards.tsx`, change the grid to accommodate 5 or 6 cards:

```tsx
// BEFORE
<div className='flex flex-row overflow-x-auto gap-3 md:grid md:grid-cols-5 md:overflow-visible'>

// AFTER (auto-fit adapts to 5 or 6 cards)
<div className='flex flex-row overflow-x-auto gap-3 md:grid md:grid-cols-5 lg:grid-cols-6 md:overflow-visible'>
```

**Step 6: Add i18n keys**

In `packages/shared/src/i18n/en.ts` and `tr.ts`:

```ts
// en.ts
'recipe.stat.extractionYield': 'EY',

// tr.ts
'recipe.stat.extractionYield': 'EY',
```

**Step 7: Add TDS field to recipe create/edit forms**

Add an optional TDS input field to `RecipeCreatePage.tsx` and `RecipeEditPage.tsx` alongside the existing extraction parameters.

### Dependencies

- Requires a database migration (new `tds` column)
- Requires shared schema update in `packages/shared` if Zod schemas include version fields

### Verification

1. Create a recipe with TDS value -- extraction yield card should appear
2. Create a recipe without TDS -- only 5 cards shown (no extraction yield)
3. Update `stat-cards.test.ts` to cover the new conditional card
4. Run `deno task test:web` and `deno task test:api`

---

## M9 -- No Contact Form

**Severity:** Medium
**Effort:** 1-2 days

### Evidence

- No `/contact`, `/feedback`, or `/support` route in `apps/web/src/router.tsx`
- No contact-related endpoint in `apps/api/src/routes/index.ts`
- No contact module under `apps/api/src/modules/`
- Footer has links to Recipes, Taste Notes, Privacy, Terms -- but no Contact link

### Impact

- Users have no way to report issues, provide feedback, or contact the team
- Standard web application feature gap

### Action Plan

**Step 1: Create API endpoint `apps/api/src/modules/contact/index.ts`**

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

// Strict rate limit: 3 submissions per 15 minutes per IP
contact.use('*', rateLimitMiddleware({
  windowMs: 15 * 60_000,
  maxRequests: 3,
  keyPrefix: 'contact',
}));

contact.post(
  '/',
  zValidator('json', contactSchema),
  async (c) => {
    const data = c.req.valid('json');

    logger.info({ name: data.name, email: data.email, subject: data.subject }, 'Contact form submission');

    // Option A: Send email notification to admin
    // Option B: Store in database for admin dashboard review
    // For now, log and acknowledge -- wire to email transport in production

    return c.json({
      success: true,
      data: { message: 'Thank you for your message. We will get back to you soon.' },
    });
  },
);

export default contact;
```

**Step 2: Register route in `apps/api/src/routes/index.ts`**

```ts
import contact from '../modules/contact/index.ts';

// Add after the existing route registrations:
routes.route('/api/v1/contact', contact);
```

**Step 3: Create `apps/web/src/pages/ContactPage.tsx`**

```tsx
import { useState } from 'react';
import { useTranslation } from '../contexts/I18nContext';
import { SEOHead } from '../components/seo/SEOHead';
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
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err.message || 'Something went wrong. Please try again.');
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
        <p className='mb-8 text-[color:var(--text-secondary)]'>
          {t('contact.description')}
        </p>

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
            <div>
              <label htmlFor='name' className='block text-sm font-medium mb-1 text-[color:var(--text-secondary)]'>
                {t('contact.form.name')}
              </label>
              <input
                id='name'
                type='text'
                required
                maxLength={100}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputClasses}
              />
            </div>

            <div>
              <label htmlFor='email' className='block text-sm font-medium mb-1 text-[color:var(--text-secondary)]'>
                {t('contact.form.email')}
              </label>
              <input
                id='email'
                type='email'
                required
                maxLength={255}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={inputClasses}
              />
            </div>

            <div>
              <label htmlFor='subject' className='block text-sm font-medium mb-1 text-[color:var(--text-secondary)]'>
                {t('contact.form.subject')}
              </label>
              <input
                id='subject'
                type='text'
                required
                maxLength={200}
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                className={inputClasses}
              />
            </div>

            <div>
              <label htmlFor='message' className='block text-sm font-medium mb-1 text-[color:var(--text-secondary)]'>
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

In `apps/web/src/components/layout/Footer.tsx`, in the Legal column, add after the Terms link:

```tsx
<Link to='/contact' className='text-sm text-[color:var(--text-secondary)]'>
  {t('footer.contact')}
</Link>
```

**Step 6: Add i18n keys**

In `packages/shared/src/i18n/en.ts`:

```ts
'contact.title': 'Contact Us',
'contact.description': 'Have a question, suggestion, or found a bug? We\'d love to hear from you.',
'contact.form.name': 'Name',
'contact.form.email': 'Email',
'contact.form.subject': 'Subject',
'contact.form.message': 'Message',
'contact.form.submit': 'Send Message',
'contact.form.sending': 'Sending...',
'contact.success.title': 'Message Sent!',
'contact.success.message': 'Thank you for reaching out. We\'ll get back to you as soon as possible.',
'footer.contact': 'Contact',
```

In `packages/shared/src/i18n/tr.ts`:

```ts
'contact.title': 'Bize Ulasin',
'contact.description': 'Bir sorunuz, oneriniz veya bir hata mi buldunuz? Sizden duymak isteriz.',
'contact.form.name': 'Ad',
'contact.form.email': 'E-posta',
'contact.form.subject': 'Konu',
'contact.form.message': 'Mesaj',
'contact.form.submit': 'Mesaj Gonder',
'contact.form.sending': 'Gonderiliyor...',
'contact.success.title': 'Mesaj Gonderildi!',
'contact.success.message': 'Bize ulastiginiz icin tesekkurler. En kisa surede size geri donecegiz.',
'footer.contact': 'Iletisim',
```

### Dependencies

- None.

### Verification

1. Navigate to `/contact` -- form renders correctly
2. Submit with valid data -- success message appears
3. Submit 4 times rapidly -- 4th should get 429 rate limited
4. Check API logs for contact submission entry
5. Footer shows Contact link
6. Toggle all 3 themes -- form styles correctly
7. Run `deno task test:web` and `deno task test:api`

---

## M16 -- README Claims Don't Match Implementation

**Severity:** Medium
**Effort:** 2-3 days total

### Evidence

Three features claimed in `README.md` are not fully implemented:

**1. "Canonical Units -- All data stored in metric; UI converts to user preferences" (README line 18)**

- `apps/web/src/pages/settings/SettingsPage.tsx:9` -- `unitSystem: 'metric' | 'imperial'` preference exists
- `apps/web/src/pages/settings/SettingsPage.tsx:182-191` -- UI dropdown for metric/imperial exists and saves to preferences
- **Nothing in the codebase reads the `unitSystem` preference and converts displayed values**
- `stat-cards.ts` hardcodes `g`, `ml`, `s`, `°C` regardless of user setting

**2. "Version Control -- Each recipe edit creates an immutable snapshot; full history browsable" (README line 19)**

- Version creation works: `apps/api/src/modules/recipe/service.ts:164-212` creates new versions on `bumpVersion: true`
- `components/recipe/MetadataBadges.tsx:108` shows `v{versionNumber}` inline
- **No `/recipes/:slug/versions` route exists in `router.tsx`**
- **No version list/diff UI anywhere in the frontend**
- Users cannot browse past versions

**3. "Brew Method Compatibility -- Data-driven validation ensures brew methods and equipment are compatible" (README line 11)**

- `packages/db/src/schema.ts:580-597` -- `brewMethodEquipmentRules` table exists with `brewMethod`, `equipmentType`, `compatible` columns
- `packages/db/src/seed.ts:96` -- seed data populates rules
- `apps/web/src/pages/admin/AdminCompatibilityPage.tsx` -- admin CRUD UI exists for managing rules
- **`apps/api/src/modules/recipe/service.ts` never queries `brewMethodEquipmentRules`** during recipe creation or editing
- Validation claim is aspirational, not implemented

### Impact

- README misleads new contributors and users about actual feature completeness
- Users configure unit preferences that have no effect
- Version history data exists but is inaccessible to users

### Action Plan

### M16a -- Unit Conversion (1 day)

**Step 1: Create conversion utility in `packages/shared/src/unit-conversion.ts`**

```ts
export type UnitSystem = 'metric' | 'imperial';

interface ConversionResult {
  value: number;
  unit: string;
}

/** Grams to ounces */
export function convertWeight(grams: number, system: UnitSystem): ConversionResult {
  if (system === 'imperial') {
    return { value: Math.round(grams * 0.03527396 * 100) / 100, unit: 'oz' };
  }
  return { value: grams, unit: 'g' };
}

/** Milliliters to fluid ounces */
export function convertVolume(ml: number, system: UnitSystem): ConversionResult {
  if (system === 'imperial') {
    return { value: Math.round(ml * 0.033814 * 100) / 100, unit: 'fl oz' };
  }
  return { value: ml, unit: 'ml' };
}

/** Celsius to Fahrenheit */
export function convertTemperature(celsius: number, system: UnitSystem): ConversionResult {
  if (system === 'imperial') {
    return { value: Math.round((celsius * 9 / 5 + 32) * 10) / 10, unit: '°F' };
  }
  return { value: celsius, unit: '°C' };
}
```

**Step 2: Consume in `stat-cards.ts`**

Update `buildStatCards` to accept a `unitSystem` parameter:

```ts
import { convertWeight, convertVolume, convertTemperature, type UnitSystem } from '@brewform/shared/unit-conversion';

export function buildStatCards(
  version: { /* existing fields */ },
  unitSystem: UnitSystem = 'metric',
): StatCardItem[] {
  const dash = '—';

  const doseConverted = version.groundWeightGrams != null
    ? convertWeight(version.groundWeightGrams, unitSystem)
    : null;
  const dose: StatCardItem = {
    label: 'recipe.stat.dose',
    value: doseConverted ? `${formatNumber(doseConverted.value)}${doseConverted.unit}` : `${dash}g`,
  };

  const yieldConverted = version.extractionVolumeMl != null
    ? convertVolume(version.extractionVolumeMl, unitSystem)
    : null;
  const yieldCard: StatCardItem = {
    label: 'recipe.stat.yield',
    value: yieldConverted ? `${formatNumber(yieldConverted.value)}${yieldConverted.unit}` : `${dash}ml`,
  };

  // Time is always in seconds (no conversion needed)

  // Ratio is dimensionless (no conversion needed)

  const tempConverted = version.temperatureCelsius != null
    ? convertTemperature(version.temperatureCelsius, unitSystem)
    : null;
  const temp: StatCardItem = {
    label: 'recipe.stat.temp',
    value: tempConverted ? `${formatNumber(tempConverted.value)}${tempConverted.unit}` : `${dash}°C`,
  };

  return [dose, yieldCard, time, ratio, temp];
}
```

**Step 3: Pass `unitSystem` from preferences context to StatCards**

The `SettingsPage` already saves `unitSystem` to preferences. Create a `usePreferences()` hook or read from the preferences API to pass to components that display units.

### M16b -- Version History Browsing (1-2 days, can be deferred)

**Step 1: Create `apps/web/src/pages/recipes/RecipeVersionsPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router';
import { api } from '../../api/client';
import { useTranslation } from '../../contexts/I18nContext';
import { SEOHead } from '../../components/seo/SEOHead';

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

interface RecipeWithVersions {
  id: string;
  title: string;
  slug: string;
  versions: VersionSummary[];
}

export function RecipeVersionsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const [recipe, setRecipe] = useState<RecipeWithVersions | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    api.get<RecipeWithVersions>(`/recipes/${slug}`)
      .then(setRecipe)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return <div className='mx-auto max-w-4xl px-4 py-12 text-[color:var(--text-secondary)]'>Loading...</div>;
  }

  if (!recipe) {
    return <div className='mx-auto max-w-4xl px-4 py-12 text-[color:var(--text-secondary)]'>Recipe not found</div>;
  }

  return (
    <>
      <SEOHead title={`${recipe.title} - Version History | BrewForm`} />
      <div className='mx-auto max-w-4xl px-4 py-12'>
        <div className='mb-6'>
          <Link to={`/recipes/${recipe.slug}`} className='text-sm text-[color:var(--accent-primary)]'>
            &larr; {t('common.back')}
          </Link>
          <h1 className='text-2xl font-bold mt-2 text-[color:var(--text-primary)]'>
            {recipe.title} -- {t('recipe.versionHistory')}
          </h1>
        </div>

        <div className='space-y-3'>
          {recipe.versions.map((v) => (
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
                {v.groundWeightGrams != null && <span>{v.groundWeightGrams}g</span>}
                {v.extractionVolumeMl != null && <span>{v.extractionVolumeMl}ml</span>}
                {v.extractionTimeSeconds != null && <span>{v.extractionTimeSeconds}s</span>}
                {v.temperatureCelsius != null && <span>{v.temperatureCelsius}&deg;C</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
```

**Step 2: Add route**

```tsx
// In router.tsx, after the existing recipe routes:
{ path: 'recipes/:slug/versions', element: <RecipeVersionsPage /> },
```

**Step 3: Add link from RecipeDetailPage**

In the MetadataBadges area or near the version badge, add a link to the versions page when `versionCount > 1`.

### M16c -- Brew Method Compatibility Validation (0.5 day)

**Step 1: Add validation function in `apps/api/src/modules/recipe/service.ts`**

```ts
import { brewMethodEquipmentRules } from '@brewform/db/schema';

async function validateEquipmentCompatibility(
  brewMethod: string,
  equipmentIds: string[],
): Promise<void> {
  if (!brewMethod || !equipmentIds?.length) return;

  // Fetch the equipment types for the given IDs
  const equipmentList = await db.select({
    id: equipment.id,
    type: equipment.type,
  }).from(equipment).where(inArray(equipment.id, equipmentIds));

  // Check each equipment type against brew method rules
  const incompatible: string[] = [];
  for (const eq of equipmentList) {
    const [rule] = await db.select().from(brewMethodEquipmentRules)
      .where(and(
        eq(brewMethodEquipmentRules.brewMethod, brewMethod),
        eq(brewMethodEquipmentRules.equipmentType, eq.type),
      ))
      .limit(1);

    if (rule && !rule.compatible) {
      incompatible.push(`${eq.type} is not compatible with ${brewMethod}`);
    }
  }

  if (incompatible.length) {
    const error: any = new Error('EQUIPMENT_INCOMPATIBLE');
    error.details = incompatible;
    throw error;
  }
}
```

**Step 2: Wire into `createRecipe()` and `updateRecipe()`**

```ts
// In createRecipe(), before the transaction:
await validateEquipmentCompatibility(data.brewMethod, data.equipmentIds);

// In updateRecipe(), before the bumpVersion logic:
if (data.brewMethod && data.equipmentIds) {
  await validateEquipmentCompatibility(data.brewMethod, data.equipmentIds);
}
```

**Step 3: Return a user-friendly error**

In the error handler middleware, map `EQUIPMENT_INCOMPATIBLE` to a 422 response with the details array so the frontend can display which equipment is incompatible.

### Dependencies

- M16a (unit conversion) is independent
- M16b (version history) is independent
- M16c (brew method validation) is independent
- After implementing, update README only if any feature is intentionally deferred

### Verification

For each sub-item:
1. **M16a:** Change unit system to imperial in Settings, verify StatCards show oz/fl oz/F
2. **M16b:** Navigate to `/recipes/:slug/versions`, verify all versions listed
3. **M16c:** Create a recipe with incompatible equipment, verify 422 error returned
4. Run all tests after each change

---

## N7 -- CORS credentials: true Without Frontend credentials: 'include'

**Severity:** Nota Bene (informational -- currently non-breaking)
**Effort:** 0.25 day

### Evidence

- `apps/api/src/middleware/cors.ts:8` -- `credentials: true` set in CORS config
- `apps/web/src/api/client.ts:52-66` -- `request()` function uses plain `fetch()` without `credentials: 'include'`
- Authentication uses Bearer token in `Authorization` header (not cookies), so `credentials: true` has no current effect
- Vite dev proxy forwards `/api/*` requests to the API server on the same origin, so cross-origin is not triggered during development

### Impact

- **No current bug** -- the app works because:
  - Dev: Vite proxies `/api/*` to same origin (no CORS involved)
  - Prod (Deno Deploy + GitHub Pages): If on different origins, Bearer tokens work without cookies
- **Future risk:** If the app ever switches to HTTP-only cookie auth (recommended in the security plan), `credentials: 'include'` will be required or authentication will silently fail

### Action Plan

**Step 1: Add `credentials: 'include'` to fetch calls for future-proofing**

In `apps/web/src/api/client.ts`, update the `request()` function:

```ts
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',  // ADD THIS -- ensures cookies sent for cross-origin
  });

  // ... rest of the function unchanged
```

Also add to the retry fetch inside the 401 handler:

```ts
  if (response.status === 401 && token) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
        credentials: 'include',  // ADD THIS
      });
    }
    // ...
  }
```

And in `refreshAccessToken()`:

```ts
async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('brewform_refresh_token');
  if (!refreshToken) return null;
  const rememberMe = localStorage.getItem('brewform_remember_me') === 'true';

  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken, rememberMe }),
      credentials: 'include',  // ADD THIS
    });
    // ...
```

**Step 2: Document the CORS/auth relationship**

Add a comment block in `cors.ts`:

```ts
/**
 * CORS Configuration
 *
 * credentials: true -- Required because the frontend sends requests with
 * credentials: 'include'. Currently the app uses Bearer token auth (not cookies),
 * but this ensures future compatibility if/when migrating to HTTP-only cookie auth.
 *
 * When credentials: true, the browser enforces that Access-Control-Allow-Origin
 * cannot be '*' -- it must be an explicit origin list, which we provide via
 * config.CORS_ALLOWED_ORIGINS.
 */
```

### Dependencies

- None. This is a safe, additive change.

### Verification

1. Verify dev mode still works (Vite proxy)
2. Check browser Network tab: requests should include `credentials: include`
3. Verify no CORS errors in console
4. Run `deno task test:api` (especially `cors.test.ts`)

---

## Implementation Order

Recommended sequence for minimal conflicts and maximum incremental value:

```
Week 1:
  L4  (Favicon)           -- 0.5 day, unblocks H5
  H5  (PWA Manifest)      -- 0.5 day, depends on L4
  N7  (CORS credentials)  -- 0.25 day, quick fix
  M2  (VersionPhoto)      -- 0.5 day, data-layer fix

Week 2:
  M6  (extractionYield)   -- 0.5 day, schema change
  M9  (Contact Form)      -- 1-2 days, new feature
  M16a (Unit Conversion)  -- 1 day, new shared utility

Week 3:
  H10 (Inline Styles)     -- 3-4 days, start Phase 1-2

Week 4:
  H10 (Inline Styles)     -- continue Phase 3-4
  M16b (Version History)  -- 1-2 days, new page
  M16c (Brew Validation)  -- 0.5 day, wire existing table
```

---

## Cross-References

- **Plan 01 (Security):** N7 relates to the cookie-based auth migration recommended there
- **Plan 02 (SEO):** H5 and L4 improve Lighthouse PWA score alongside SEO meta tag fixes
- **Plan 03 (Performance):** H10 inline-to-Tailwind conversion reduces bundle size
- **Plan 05 (Technical Debt):** H10 is also a code quality concern; M16 is documentation debt
