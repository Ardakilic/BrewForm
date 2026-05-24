# Plan 08 -- Documentation & Polish (Revised)

**Priority band:** Mixed (1 High, 1 Medium, 5 Low)
**Total effort:** ~28-38 hours (reduced from 30-40h after removing already-done M7 Phase 1)
**Dependencies:** None -- all items are independent and can be tackled in any order

> **Revision notes (vs. original):**
> - **M7 Phase 1 removed entirely** — onboarding wizard already uses `useTranslation()` throughout; EN + TR both have all 17 keys. This work is done.
> - **M7 is now Phase 2 only** (interactive steps) — effort reduced to 6-10h
> - **H1 table corrected** — `middleware/auth.ts` has 0 JSDoc (not 1); `recipe/service.ts` has 15 exports (not 12) + 2 interfaces; `auth/service.ts` has 8 exports (not 6); `comment/model.ts` is 143 lines (not 122); `taste/service.ts` is 117 lines (not 85); `recipe/model.ts` is 532 lines (not 514)
> - **L5 analysis tightened** — `@theme` palette vars are not referenced anywhere (not as Tailwind utilities, not as `var(--color-coffee-*)` even inside the `.coffee` theme block). Safe to remove.
> - **L11 version claim corrected** — the project already uses React Router v7.5; `handle` was introduced in v6.4, not "v7.5"
> - **AGENTS.md confirmed to exist** — L6 reference to it is valid

---

## Table of Contents

| ID | Title | Priority | Effort | Section |
|----|-------|----------|--------|---------|
| H1 | Zero JSDoc/TSDoc (~9% coverage) | High | 20-30h | [Link](#h1--zero-jsdoctsdoc-9-coverage) |
| M7 | Onboarding wizard is static links | Medium | 6-10h | [Link](#m7--onboarding-wizard-is-static-links) |
| L5 | Coffee palette defined but unused | Low | 15min | [Link](#l5--coffee-palette-defined-but-unused) |
| L6 | No pre-commit formatting hooks | Low | 30min | [Link](#l6--no-pre-commit-formatting-hooks) |
| L8 | ComparePage route params naming | Low | 15min | [Link](#l8--comparepage-route-params-naming) |
| L9 | Deprecated functions in relative-date.ts | Low | 20min | [Link](#l9--deprecated-functions-in-relative-datets) |
| L11 | No declarative page titles | Low | N/A | [Link](#l11--no-declarative-page-titles) |

---

## H1 -- Zero JSDoc/TSDoc (~9% coverage)

**Priority:** High
**Effort:** 20-30 hours (spread across sprints)

### Evidence

The codebase has ~285 exported functions across all API modules. Only 3 files have any JSDoc at all (~9% of module files, far less of functions):

**Files WITH JSDoc:**
- `apps/api/src/modules/auth/jwt.ts` -- 8 JSDoc blocks (module doc + interfaces + functions)
- `apps/api/src/utils/response/index.ts` -- 5 JSDoc blocks
- `apps/api/src/utils/cache/index.ts` -- 5 JSDoc blocks

**Files WITHOUT any JSDoc (all 0 `/**` blocks):**

| File | Lines | Exports | JSDoc |
|------|-------|---------|-------|
| `recipe/model.ts` | 532 | 24 | 0 |
| `recipe/service.ts` | 548 | 13 functions + 2 interfaces | 0 |
| `admin/model.ts` | 484 | 35 | 0 |
| `admin/service.ts` | 349 | 37 | 0 |
| `auth/service.ts` | 197 | 8 | 0 |
| `auth/model.ts` | 148 | 15 | 0 |
| `middleware/auth.ts` | 93 | 0 named (2 unexported fns) | 0 |
| `badge/model.ts` | 125 | 3 | 0 |
| `badge/service.ts` | 46 | 4 | 0 |
| `comment/model.ts` | 143 | 7 | 0 |
| `comment/service.ts` | 89 | 3 | 0 |
| `follow/model.ts` | 92 | 7 | 0 |
| `follow/service.ts` | 51 | 5 | 0 |
| `user/model.ts` | 105 | 7 | 0 |
| `taste/model.ts` | 62 | 8 | 0 |
| `taste/service.ts` | 117 | 7 | 0 |
| All 16 shared type files | varies | varies | 0 |
| `packages/shared/src/utils/validation.ts` | -- | -- | 0 |

### Impact

- New contributors cannot understand parameter contracts without reading full implementations
- TypeScript intellisense shows empty tooltips for all functions
- Complex functions like `forkRecipe` in `recipe/model.ts` (125 lines, DB transaction with 6 sub-queries copying taste notes, equipment, preparations, and photos atomically) are impenetrable without reading every line
- `recipe/service.ts` exports `CompatibilityCheckItem` and `CompatibilityRule` interfaces alongside `checkEquipmentCompatibility` — these are non-obvious cross-cutting concerns with no explanation
- No `@throws` documentation means callers don't know which error strings to catch

### Action Plan

#### Phase 1 -- Core Modules (highest leverage)

**Step 1: Document `apps/api/src/modules/recipe/model.ts`**

All 24 exported functions. This is the largest and most complex data-access module.

Functions to document:
```
create, findById, findBySlug, findMany, update, softDelete,
createVersion, forkRecipe, incrementLikes, decrementLikes,
incrementComments, decrementComments, upsertUserRating,
getRecipeRatingStats, getUserRating, getFavouriteCount,
getUserLikeStatus, toggleLike, toggleFavourite, toggleFeature,
updateVersionNotes, getVersionsByRecipeId, getFeed, findStarred
```

**Example -- module-level doc at file top:**
```ts
/**
 * Recipe data-access layer.
 *
 * Pure Drizzle ORM operations — no business logic, no authorization, no side effects.
 * Called exclusively by `recipe/service.ts`.
 *
 * Soft-delete convention: all queries filter `isNull(recipes.deletedAt)`.
 */
```

**Example -- `forkRecipe` (most complex function, 125 lines):**
```ts
/**
 * Deep-copy a recipe for a new author inside a single database transaction.
 *
 * Creates a new recipe linked to the source via `forkedFromId`, then copies
 * the latest version including taste notes, equipment, additional preparations,
 * and version photos. Also increments the source recipe's `forkCount`.
 *
 * @param sourceId - UUID of the recipe to fork
 * @param authorId - UUID of the user creating the fork
 * @param title    - Title for the forked recipe
 * @param slug     - Pre-generated unique slug for the fork
 * @returns The new recipe row with its first version and all copied relations
 * @throws {Error} `RECIPE_NOT_FOUND` if sourceId does not exist or is soft-deleted
 * @throws {Error} `RECIPE_NO_VERSIONS` if the source recipe has no published versions
 */
export async function forkRecipe(
  sourceId: string,
  authorId: string,
  title: string,
  slug: string,
) {
```

**Example -- `create` (simple CRUD):**
```ts
/**
 * Insert a new recipe row and return it with all database-generated fields.
 *
 * @param data - Insert payload inferred from the Drizzle schema.
 *               Must include at minimum: `slug`, `title`, `authorId`.
 */
export async function create(data: typeof recipes.$inferInsert) {
```

**Example -- `toggleLike` (side-effectful toggle):**
```ts
/**
 * Toggle the authenticated user's like on a recipe.
 *
 * If the user has already liked the recipe, removes the like and decrements
 * the recipe's `likeCount`. Otherwise inserts a like and increments it.
 *
 * @param userId   - UUID of the user toggling the like
 * @param recipeId - UUID of the recipe
 * @returns `{ liked: boolean }` — the new state after toggling
 */
export async function toggleLike(userId: string, recipeId: string) {
```

**Step 2: Document `apps/api/src/modules/recipe/service.ts`**

13 exported functions plus 2 exported interfaces. This file exports `CompatibilityCheckItem`, `CompatibilityRule`, and `checkEquipmentCompatibility` which are cross-cutting concerns that especially need explanation.

**Example -- `checkEquipmentCompatibility` (non-obvious function):**
```ts
/**
 * Validate that a set of equipment items are all compatible with a given brew method.
 *
 * Compatibility rules are defined in `@brewform/shared/constants/brew-method-rules`.
 * Each rule specifies which equipment categories are allowed or required for a
 * brew method (e.g. espresso requires a pressurized brewer, prohibits French press).
 *
 * @param equipmentIds  - UUIDs of the equipment items being added to the recipe version
 * @param brewMethod    - The brew method key (e.g. `'espresso'`, `'pour_over'`)
 * @param allEquipment  - Full equipment records (fetched from DB), used to resolve categories
 * @returns Array of compatibility check results — one per equipment item.
 *          Items with `compatible: false` include a `reason` string.
 */
export function checkEquipmentCompatibility(
  equipmentIds: string[],
  brewMethod: string,
  allEquipment: CompatibilityCheckItem[],
): CompatibilityRule[] {
```

**Example -- `createRecipe` (most complex service function):**
```ts
/**
 * Create a new recipe with its first version and all related entities.
 *
 * Orchestration steps:
 * 1. Generate a unique slug from the title
 * 2. If `setupId` is provided, inherit `grinder` and `brewerDetails` from the setup
 *    (unless explicitly supplied in `data`)
 * 3. Compute derived metrics: `brewRatio` and `flowRate` from raw measurements
 * 4. Insert recipe, version, taste notes, equipment, additional preparations,
 *    and version photos (all delegated to `recipe/model.ts`)
 * 5. Asynchronously evaluate badge eligibility for the author
 * 6. Asynchronously notify the author's followers
 *
 * @param authorId - UUID of the authenticated user creating the recipe
 * @param data     - Creation payload (validated Zod schema from `@brewform/shared`)
 * @returns The complete recipe object with version, relations, and author summary
 */
export async function createRecipe(authorId: string, data: any) {
```

**Step 3: Document `packages/shared/src/types/` -- all 16 type files**

These are the API/frontend contract. Priority order by size:

1. `recipe.ts` (125 lines) — the most complex type file
2. `equipment.ts` (64 lines)
3. `user.ts` (54 lines)
4. `api.ts` (33 lines)
5. `index.ts` (32 lines)
6. `badge.ts` (29 lines)
7. `bean.ts` (24 lines)
8. `taste.ts` (22 lines)
9. Remaining 8 files (all ≤16 lines each)

**Example -- interface documentation in `types/recipe.ts`:**
```ts
/**
 * Full recipe response returned by `GET /api/v1/recipes/:slugOrId`.
 *
 * The `versions` array is always non-empty; the first element is the current
 * (highest-numbered) version. Versions are ordered newest-first.
 */
export interface Recipe {
  /** UUID primary key */
  id: string;
  /** URL-safe slug derived from the title, e.g. `"my-morning-espresso"` */
  slug: string;
  /** User-facing title */
  title: string;
  /** Visibility state. Drafts are only visible to the author. */
  visibility: 'draft' | 'private' | 'public';
  // ...
}
```

**Step 4: Document `packages/shared/src/utils/validation.ts`**

Add JSDoc to all exported validation functions and Zod schemas describing what each validates and what errors are thrown.

#### Phase 2 -- All Other Modules

**Step 5: Document remaining module services and models**

Priority order (by line count and complexity):
1. `admin/model.ts` (484 lines, 35 exports)
2. `admin/service.ts` (349 lines, 37 exports)
3. `auth/service.ts` (197 lines, 8 exports)
4. `auth/model.ts` (148 lines, 15 exports)
5. `comment/model.ts` (143 lines, 7 exports)
6. `taste/service.ts` (117 lines, 7 exports)
7. `user/model.ts` (105 lines, 7 exports)
8. `comment/service.ts` (89 lines, 3 exports)
9. `follow/model.ts` (92 lines, 7 exports)
10. `badge/model.ts` (125 lines, 3 exports)
11. `taste/model.ts` (62 lines, 8 exports)
12. `follow/service.ts` (51 lines, 5 exports)
13. `badge/service.ts` (46 lines, 4 exports)
14. Remaining small modules (photo, preference, qrcode, report, vendor, setup, bean — all under 50 lines)

**Step 6: Document `apps/api/src/middleware/auth.ts`**

The file has no named exports but exposes the `authMiddleware` and `optionalAuthMiddleware` functions. Document each with their side effects (sets `c.set('userId', ...)`, `c.set('user', ...)`), accepted token formats (cookie vs Bearer), and what they return on failure.

### Style Guide

Follow the existing JSDoc style established in `auth/jwt.ts`:

1. **Module-level doc** at file top explaining the module's role and its place in the 3-layer stack
2. **Single-line for simple getters:** `/** Fetch a recipe by its UUID primary key, excluding soft-deleted rows. */`
3. **Multi-line for complex functions** with `@param`, `@returns`, `@throws`
4. **Interface members** get single-line `/** ... */` inline comments
5. **No redundant type restatements** — don't write `@param id - string` when the signature already says `id: string`
6. Use Drizzle's `$inferInsert` / `$inferSelect` in JSDoc `@param` types where appropriate (confirmed correct API per Drizzle docs ≥0.28.3)

---

## M7 -- Onboarding Wizard is Static Links

**Priority:** Medium
**Effort:** 6-10 hours

### Current State (Important Correction)

> ⚠️ **The original plan's Phase 1 (i18n) is already done and must not be applied.**
>
> The wizard already imports and uses `useTranslation()`. Every string in every step component calls `t()`. Both EN and TR translation files have all 17 onboarding keys fully covered. There is nothing to fix here.

What remains is Phase 2 only: making the wizard steps interactive instead of just linking away to other pages.

### Evidence

`apps/web/src/components/onboarding/OnboardingWizard.tsx`:
- 5 steps: `welcome`, `equipment`, `beans`, `first-brew`, `explore`
- Each step uses `t()` correctly for all strings ✅
- But each step renders only static text + an `<a href="...">` link to a separate page
- Only API calls: `skip()` and `complete()` — both PATCH `/preferences` with `{ onboardingCompleted: true }`
- Collects zero user data during onboarding
- The `skip` and `complete` handlers are identical in behaviour

### Impact

- Onboarding provides no value beyond what a nav link could — clicking "Set Up Equipment" navigates the user away from the wizard permanently (no return path back to complete it)
- Zero data collection means the app can't contextualise the experience (e.g. pre-fill setup in first recipe, suggest beans)

### Action Plan

**Step 1: Equipment step — inline setup selector**

Replace the `<a href='/setups'>` link with a dropdown of existing setups. If the user has none, keep the link as a fallback.

```tsx
function EquipmentStep({ t, onSelect }: StepProps & { onSelect: (id: string | null) => void }) {
  const [setups, setSetups] = useState<{ id: string; name: string }[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    api.get('/setups').then((res: any) => setSetups(res.data ?? [])).catch(() => {});
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value || null;
    setSelectedId(id);
    onSelect(id);
  }

  return (
    <>
      <div className='text-6xl mb-4'>🔧</div>
      <h2 className='text-xl font-bold' style={{ color: 'var(--text-primary)' }}>
        {t('onboarding.equipment')}
      </h2>
      <p className='mt-2' style={{ color: 'var(--text-secondary)' }}>
        {t('onboarding.equipmentDescription')}
      </p>

      {setups.length > 0
        ? (
          <select
            value={selectedId ?? ''}
            onChange={handleChange}
            className='mt-4 w-full input-primary'
          >
            <option value=''>{t('onboarding.equipment.selectPlaceholder')}</option>
            {setups.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )
        : (
          <div className='mt-4'>
            <a href='/setups' className='btn-primary inline-block'>
              {t('onboarding.equipmentAction')}
            </a>
          </div>
        )}
    </>
  );
}
```

**Step 2: Bean step — inline quick-add form**

```tsx
function BeansStep({ t, onBeanSaved }: StepProps & { onBeanSaved: (id: string) => void }) {
  const [origin, setOrigin] = useState('');
  const [roaster, setRoaster] = useState('');
  const [saved, setSaved] = useState(false);

  async function handleQuickAdd() {
    if (!origin && !roaster) return;
    try {
      const res = await api.post('/beans', { origin, roaster }) as any;
      setSaved(true);
      onBeanSaved(res.data?.id);
    } catch { /* user can add beans later */ }
  }

  return (
    <>
      <div className='text-6xl mb-4'>🫘</div>
      <h2 className='text-xl font-bold' style={{ color: 'var(--text-primary)' }}>
        {t('onboarding.beans')}
      </h2>
      {saved
        ? <p className='mt-4' style={{ color: 'var(--success)' }}>{t('onboarding.beans.saved')}</p>
        : (
          <div className='mt-4 space-y-3 text-left'>
            <input
              type='text'
              placeholder={t('onboarding.beans.originPlaceholder')}
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              className='w-full input-primary'
            />
            <input
              type='text'
              placeholder={t('onboarding.beans.roasterPlaceholder')}
              value={roaster}
              onChange={(e) => setRoaster(e.target.value)}
              className='w-full input-primary'
            />
            <button type='button' onClick={handleQuickAdd} className='btn-primary w-full'>
              {t('onboarding.beansAction')}
            </button>
          </div>
        )}
      <a href='/beans' className='text-sm mt-3 inline-block' style={{ color: 'var(--text-tertiary)' }}>
        {t('onboarding.beans.advancedLink')}
      </a>
    </>
  );
}
```

**Step 3: First brew step — pass setup/bean context via query params**

Replace the bare `<a href='/recipes/new'>` with a `<button>` that navigates using `useNavigate`, injecting the setup and bean IDs collected in previous steps:

```tsx
function FirstBrewStep(
  { t, setupId, beanId }: StepProps & { setupId: string | null; beanId: string | null },
) {
  const navigate = useNavigate();

  function startRecipe() {
    const params = new URLSearchParams();
    if (setupId) params.set('setupId', setupId);
    if (beanId) params.set('beanId', beanId);
    const qs = params.toString();
    navigate(`/recipes/new${qs ? `?${qs}` : ''}`);
  }

  return (
    <>
      <div className='text-6xl mb-4'>📝</div>
      <h2 className='text-xl font-bold' style={{ color: 'var(--text-primary)' }}>
        {t('onboarding.firstBrew')}
      </h2>
      <p className='mt-2' style={{ color: 'var(--text-secondary)' }}>
        {t('onboarding.firstBrewDescription')}
      </p>
      <div className='mt-4'>
        <button type='button' onClick={startRecipe} className='btn-primary'>
          {t('onboarding.firstBrewAction')}
        </button>
      </div>
    </>
  );
}
```

**Step 4: Lift state to parent `OnboardingWizard`**

The parent needs to track `selectedSetupId` and `savedBeanId` to thread them into `FirstBrewStep`:

```tsx
export function OnboardingWizard() {
  const { t } = useTranslation();
  const { refreshUser } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [selectedSetupId, setSelectedSetupId] = useState<string | null>(null);
  const [savedBeanId, setSavedBeanId] = useState<string | null>(null);

  // skip() and complete() unchanged ...

  return (
    <div className='mx-auto max-w-lg px-6 py-12 text-center'>
      {currentStep === 'welcome' && <WelcomeStep t={t} />}
      {currentStep === 'equipment' && (
        <EquipmentStep t={t} onSelect={setSelectedSetupId} />
      )}
      {currentStep === 'beans' && (
        <BeansStep t={t} onBeanSaved={setSavedBeanId} />
      )}
      {currentStep === 'first-brew' && (
        <FirstBrewStep t={t} setupId={selectedSetupId} beanId={savedBeanId} />
      )}
      {currentStep === 'explore' && <ExploreStep t={t} />}
      {/* navigation buttons unchanged */}
    </div>
  );
}
```

**Step 5: Add missing i18n keys for new inline content**

A small number of new keys are needed for the inline form fields that don't exist yet (since the original component only needed link labels):

Add to both `en.json` and `tr.json`:
```json
{
  "onboarding.equipment.selectPlaceholder": "Select a setup...",
  "onboarding.beans.saved": "Bean saved! You can add more later.",
  "onboarding.beans.originPlaceholder": "Origin (e.g. Ethiopia)",
  "onboarding.beans.roasterPlaceholder": "Roaster (e.g. Blue Bottle)",
  "onboarding.beans.advancedLink": "Add more details later"
}
```

### Notes

- Keep `<a href='/setups'>` and `<a href='/beans'>` as fallbacks in every step — users who haven't added any setups/beans yet still need a path forward
- `RecipeCreatePage` would need to read the `setupId`/`beanId` query params to pre-fill the form — verify the page already handles query params, or add that support as part of this task

---

## L5 -- Coffee Palette Defined But Unused

**Priority:** Low
**Effort:** 15 minutes

### Evidence

`apps/web/src/styles/globals.css:3-13` defines 10 coffee palette CSS custom properties in the Tailwind `@theme` block:

```css
@theme {
  --color-coffee-50: #faf6f1;
  --color-coffee-100: #f0e6d6;
  /* ... through --color-coffee-900: #2c1a12 */
}
```

The `@theme` block tells Tailwind to generate utility classes like `bg-coffee-500`, `text-coffee-300`, etc. A search across all `.tsx`, `.ts`, and `.css` files in `apps/web/src/` finds **zero references** to any `coffee-[number]` class or `var(--color-coffee-*)` variable.

Note: the `.coffee` theme class (lines 78+) sets semantic variables using hardcoded hex values — it does **not** reference `var(--color-coffee-*)`, so removing the `@theme` entries does not affect the coffee theme.

### Action Plan

**Step 1: Remove the palette from `apps/web/src/styles/globals.css`**

Delete lines 4-13 (the `--color-coffee-*` declarations only, keep the rest of `@theme`):

```css
@theme {
  /* Remove: --color-coffee-50 through --color-coffee-900 */

  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
  /* ... animations etc. unchanged ... */
}
```

**Step 2: Verify no regressions**

```bash
make check-web && make build-web
```

Confirm the three themes (light, dark, coffee) still render correctly in the browser.

---

## L6 -- No Pre-Commit Formatting Hooks

**Priority:** Low
**Effort:** 30 minutes

### Evidence

- No `.githooks/` directory exists in the repository
- No `core.hooksPath` configured
- The Makefile has `fmt-check`, `lint`, and `ci` targets, but they are not enforced pre-commit
- Developers can commit unformatted code that CI (`make ci`) will later reject

### Action Plan

**Step 1: Create `.githooks/pre-commit`**

```bash
#!/bin/sh
# BrewForm pre-commit hook
# Runs Deno format check and lint before each commit.
#
# Install once after cloning:
#   make setup-hooks
# Or manually:
#   git config core.hooksPath .githooks

set -e

echo "Pre-commit: checking formatting..."
deno fmt --check

echo "Pre-commit: linting..."
deno lint apps/ packages/
```

**Step 2: Make the hook executable**

```bash
chmod +x .githooks/pre-commit
```

**Step 3: Add `setup-hooks` target to `Makefile`**

Add alongside the existing code quality targets:

```makefile
# --- Developer Setup ---

setup-hooks: ## Configure git to use .githooks/ for pre-commit checks
	git config core.hooksPath .githooks
	@echo "Git hooks configured. Pre-commit runs 'deno fmt --check' and 'deno lint'."
```

Append `setup-hooks` to the `.PHONY` declaration.

**Step 4: Document in `AGENTS.md`**

> Note: `AGENTS.md` exists in the repo root and is the right place for developer workflow conventions. Add:

```markdown
## Git Hooks

Run `make setup-hooks` once after cloning to enable pre-commit format and lint checks.
This sets `git config core.hooksPath .githooks` locally — it does not affect other contributors
until they also run the command.
```

---

## L8 -- ComparePage Route Params Naming

**Priority:** Low
**Effort:** 15 minutes

### Evidence

`apps/web/src/router.tsx:68`:
```tsx
{ path: 'recipes/compare/:id1/:id2', element: <RecipeComparePage /> },
```

`apps/web/src/pages/recipes/RecipeComparePage.tsx:13`:
```tsx
const { id1, id2 } = useParams();
```

The values passed are slugs (e.g. `"my-morning-espresso"`), not UUIDs. The API client's `recipeApi.get()` accepts both slugs and UUIDs in the same endpoint, but the parameter names suggest UUID format to any reader.

### Action Plan

**Step 1: Rename route params in `apps/web/src/router.tsx`**

```tsx
// Before:
{ path: 'recipes/compare/:id1/:id2', element: <RecipeComparePage /> },

// After:
{ path: 'recipes/compare/:slug1/:slug2', element: <RecipeComparePage /> },
```

**Step 2: Update `RecipeComparePage.tsx`**

```tsx
// Before (line 13):
const { id1, id2 } = useParams();

// After:
const { slug1, slug2 } = useParams();
```

Update all downstream references on lines 21, 24, 25, 30 from `id1`/`id2` to `slug1`/`slug2`.

**Step 3: Search for any navigate/Link calls building compare URLs**

```bash
grep -rn 'recipes/compare' apps/web/src/ --include="*.tsx" --include="*.ts"
```

Update any string-concatenated URLs to use the new param names.

---

## L9 -- Deprecated Functions in relative-date.ts

**Priority:** Low
**Effort:** 20 minutes

### Evidence

`apps/web/src/utils/relative-date.ts:75-94` contains 3 deprecated functions:

```ts
/** @deprecated Use roastDateResult() + t() for localized output */
export function roastDateLabel(roastDate: Date, brewDate: Date): string { ... }

/** @deprecated Use packageOpenDateResult() + t() for localized output */
export function packageOpenDateLabel(packageOpenDate: Date, brewDate: Date): string { ... }

/** @deprecated Use grindDateResult() + t() for localized output */
export function grindDateLabel(grindDate: Date, brewDate: Date): string { ... }
```

**Usage analysis:**
- **`apps/web/src/components/recipe/BeanSection.tsx`:** Uses `roastDateResult`, `packageOpenDateResult`, `grindDateResult` ✅ — already migrated to the new API
- **`apps/web/src/components/recipe/BeanSection.test.tsx` (lines 39-41):** Mocks the deprecated `*Label` functions — out of sync with the component it tests
- **`apps/web/src/utils/relative-date.test.ts`:** Imports and runs full test suites against all three deprecated functions

The deprecated functions exist only for backward compatibility but no production code uses them.

### Action Plan

**Step 1: Remove deprecated functions from `relative-date.ts`**

Delete lines 75-94 (the 3 `@deprecated` functions and their preceding comment).

**Step 2: Remove deprecated imports from `relative-date.test.ts`**

Remove `grindDateLabel`, `packageOpenDateLabel`, `roastDateLabel` from the import on line 11.

**Step 3: Replace deprecated test suites in `relative-date.test.ts`**

The test file has dedicated `describe` blocks for the deprecated functions (lines 56-237). Replace them with equivalent tests for the `*Result()` functions they wrap:

```ts
// Before:
describe('roastDateLabel', () => {
  it('same day returns "today"', () => {
    expect(roastDateLabel(date, date)).toBe('today');
  });
  it('9 days later', () => {
    expect(roastDateLabel(roast, brew)).toBe('9 days post-roast');
  });
});

// After:
describe('roastDateResult', () => {
  it('same calendar day returns { type: "today" }', () => {
    expect(roastDateResult(date, date)).toEqual({ type: 'today' });
  });
  it('9 days later returns { type: "daysAgo", days: 9 }', () => {
    expect(roastDateResult(roast, brew)).toEqual({ type: 'daysAgo', days: 9 });
  });
});
```

Apply the same pattern for `packageOpenDateResult` (`type: 'daysSinceOpened'`) and `grindDateResult` (`type: 'daysAgo'`).

Also update the property-based tests at lines 164-237 to use `*Result()` functions.

**Step 4: Update `BeanSection.test.tsx` mock**

Lines 39-41 mock the deprecated functions. `BeanSection.tsx` already uses `*Result()` so the mock must match:

```ts
// Before:
roastDateLabel: (_roastDate: Date, _brewDate: Date) => '7 days post-roast',
packageOpenDateLabel: (_openDate: Date, _brewDate: Date) => '3 days since opened',
grindDateLabel: (_grindDate: Date, _brewDate: Date) => '1 days ago',

// After:
roastDateResult: (_roastDate: Date, _brewDate: Date) => ({ type: 'daysAgo', days: 7 }),
packageOpenDateResult: (_openDate: Date, _brewDate: Date) => ({ type: 'daysSinceOpened', days: 3 }),
grindDateResult: (_grindDate: Date, _brewDate: Date) => ({ type: 'daysAgo', days: 1 }),
```

Update the assertion on line 119 that checks for the `'7 days post-roast'` string — it should now check for the translated output that `BeanSection` produces by passing `{ type: 'daysAgo', days: 7 }` through `t()`.

---

## L11 -- No Declarative Page Titles

**Priority:** Low (informational — no action required now)
**Effort:** N/A (defer unless SSR is added)

### Evidence

`apps/web/src/components/seo/SEOHead.tsx:21-22`:
```tsx
useEffect(() => {
  document.title = title ? `${title} | BrewForm` : 'BrewForm — Coffee Brewing Recipes';
```

Page titles are set imperatively via `useEffect` + `document.title`. The `SEOHead` component returns `null` and performs all work as side effects.

The project uses React Router v7.5, which supports route `handle` properties (this feature has been available since React Router v6.4).

### Impact

- Works correctly for a client-side SPA — this is not a bug
- If/when SSR is added, `useEffect` won't run server-side and titles will be missing

### Action Plan

**Current recommendation: No action.**

The `SEOHead` component is well-structured, handles `og:*`, `twitter:card`, `robots`, and `canonical` correctly, and works for the current SPA architecture.

**If SSR is added in the future:**

Migrate to React Router's `handle` property (available since v6.4, already supported in the v7.5 version used here):
```tsx
{
  path: 'recipes/:slug',
  element: <RecipeDetailPage />,
  handle: { title: (params: { slug: string }) => `Recipe: ${params.slug}` },
}
```

Use `useMatches()` in a root layout to collect `handle.title` values and render into `<title>`.

**Minor task — audit SEOHead coverage:**

Several pages are missing `<SEOHead>`. Run:

```bash
grep -rL "SEOHead" apps/web/src/pages/ --include="*.tsx"
```

Pages currently missing it include (among others):
- `setups/SetupListPage.tsx`
- `admin/AdminDashboard.tsx`
- `beans/BeanListPage.tsx`
- `users/UserProfilePage.tsx`
- `recipes/RecipeListPage.tsx`
- `recipes/RecipeVersionsPage.tsx`
- `recipes/RecipeEditPage.tsx`
- `recipes/RecipeCreatePage.tsx`
- `recipes/RecipeDetailPage.tsx`
- `recipes/StarredRecipesPage.tsx`
- `recipes/RecipeFocusModePage.tsx`
- `recipes/RecipeComparePage.tsx`
- `settings/SettingsPage.tsx`
- `equipment/EquipmentListPage.tsx`
- `TermsPage.tsx`, `PrivacyPage.tsx`, `TasteNotesPage.tsx`

Each missing page should add `<SEOHead title="..." />`. This is 15-minute work per page.

---

## Summary & Recommended Execution Order

1. **L5 — Coffee palette** (15 min) — quick cleanup, zero risk
2. **L8 — ComparePage params** (15 min) — quick rename, zero risk
3. **L9 — Deprecated functions** (20 min) — remove dead code, update tests
4. **L6 — Pre-commit hooks** (30 min) — improve DX for all developers
5. **H1 Phase 1 — Core JSDoc** (10-15 hours) — recipe module + shared types (highest leverage)
6. **H1 Phase 2 — Remaining JSDoc** (10-15 hours) — all other modules
7. **M7 — Interactive onboarding** (6-10 hours) — make wizard collect data
8. **L11 — SEOHead audit** (2-3 hours) — add `<SEOHead>` to ~15 missing pages; defer declarative titles until SSR