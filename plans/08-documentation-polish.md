# Plan 08 -- Documentation & Polish

**Priority band:** Mixed (1 High, 1 Medium, 5 Low)
**Total effort:** ~30-40 hours
**Dependencies:** None -- all items are independent and can be tackled in any order

---

## Table of Contents

| ID | Title | Priority | Effort | Section |
|----|-------|----------|--------|---------|
| H1 | Zero JSDoc/TSDoc (~9% coverage) | High | 20-30h | [Link](#h1--zero-jsdoctsdoc-9-coverage) |
| M7 | Onboarding wizard is static links | Medium | 8-12h | [Link](#m7--onboarding-wizard-is-static-links) |
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

The codebase has ~285 exported functions across all API modules. Only 4 files have any JSDoc at all (~9% of module files, far less of functions):

**Files WITH JSDoc:**
- `apps/api/src/modules/auth/jwt.ts` -- 8 JSDoc blocks (module doc + interfaces + functions)
- `apps/api/src/utils/response/index.ts` -- 5 JSDoc blocks
- `apps/api/src/utils/cache/index.ts` -- 5 JSDoc blocks
- `apps/api/src/middleware/auth.ts` -- 1 JSDoc block

**Files WITHOUT any JSDoc (all 0 `/**` blocks):**

| File | Lines | Exports | JSDoc |
|------|-------|---------|-------|
| `recipe/model.ts` | 514 | 23 | 0 |
| `recipe/service.ts` | 435 | 12 | 0 |
| `admin/model.ts` | 484 | 35 | 0 |
| `admin/service.ts` | 349 | 37 | 0 |
| `auth/service.ts` | 173 | 6 | 0 |
| `auth/model.ts` | 101 | 12 | 0 |
| `badge/model.ts` | 125 | 3 | 0 |
| `badge/service.ts` | 46 | 4 | 0 |
| `comment/model.ts` | 122 | 5 | 0 |
| `comment/service.ts` | 101 | 3 | 0 |
| `follow/model.ts` | 92 | 7 | 0 |
| `follow/service.ts` | 51 | 5 | 0 |
| `user/model.ts` | 105 | 7 | 0 |
| `taste/model.ts` | 62 | 8 | 0 |
| `taste/service.ts` | 85 | 6 | 0 |
| All 16 shared type files | varies | varies | 0 |
| `packages/shared/src/utils/validation.ts` | -- | -- | 0 |

### Impact

- New contributors cannot understand parameter contracts without reading full implementations
- TypeScript intellisense shows empty tooltips for all functions
- Complex functions like `forkRecipe` (95 lines, DB transaction with 6 sub-queries) are impenetrable without reading every line
- No `@throws` documentation means callers don't know which error strings to catch

### Action Plan

#### Phase 1 -- Core Modules (highest leverage)

**Step 1: Document `apps/api/src/modules/recipe/model.ts`**

All 23 exported functions. This is the largest and most complex data-access module.

Functions to document:
```
create, findById, findBySlug, findMany, update, softDelete,
createVersion, forkRecipe, incrementLikes, decrementLikes,
incrementComments, decrementComments, upsertUserRating,
getRecipeRatingStats, getUserRating, getFavouriteCount,
getUserLikeStatus, toggleLike, toggleFavourite, toggleFeature,
updateVersionNotes, getFeed, findStarred
```

**Example -- `forkRecipe` in model.ts (the most complex function):**

```ts
/**
 * Fork (deep-copy) a recipe for a new author.
 *
 * Creates a new recipe linked to the source via `forkedFromId`, then
 * deep-copies the latest version including all related entities:
 * taste notes, equipment, additional preparations, and version photos.
 *
 * The entire operation runs inside a single database transaction so
 * the fork is atomic -- if any sub-insert fails, nothing is committed.
 *
 * @param sourceId - UUID of the recipe to fork
 * @param authorId - UUID of the user creating the fork
 * @param title    - Title for the forked recipe
 * @param slug     - Pre-generated unique slug for the fork
 * @returns The complete forked recipe with its first version and all
 *          copied relations (tasteNotes, equipment, preparations, photos)
 * @throws {Error} `RECIPE_NOT_FOUND` if sourceId does not exist or is soft-deleted
 * @throws {Error} `RECIPE_NO_VERSIONS` if the source recipe has no versions
 */
export async function forkRecipe(
  sourceId: string,
  authorId: string,
  title: string,
  slug: string,
) {
```

**Example -- `create` in model.ts (simple CRUD):**

```ts
/**
 * Insert a new recipe row.
 *
 * @param data - Recipe insert payload (inferred from the Drizzle schema).
 *               Must include at minimum: slug, title, authorId.
 * @returns The newly created recipe row with all database-generated fields
 *          (id, createdAt, updatedAt).
 */
export async function create(data: typeof recipes.$inferInsert) {
```

**Example -- `toggleLike` in model.ts (side-effectful toggle):**

```ts
/**
 * Toggle a user's like on a recipe.
 *
 * If the user has already liked the recipe, removes the like and
 * decrements the recipe's like counter. Otherwise, inserts a like
 * and increments the counter.
 *
 * @param userId   - UUID of the user toggling the like
 * @param recipeId - UUID of the recipe being liked/unliked
 * @returns `{ liked: boolean }` indicating the new state after toggling
 */
export async function toggleLike(userId: string, recipeId: string) {
```

**Step 2: Document `apps/api/src/modules/recipe/service.ts`**

All 12 exported functions. This is the business-logic layer that orchestrates model calls.

Functions to document:
```
getRecipe, createRecipe, updateRecipe, deleteRecipe, forkRecipe,
listRecipes, toggleLike, toggleFavourite, toggleFeature,
saveNotes, listStarredRecipes, getRecipeMeta
```

**Example -- `createRecipe` in service.ts (the most complex service function):**

```ts
/**
 * Create a new recipe with its first version and all related entities.
 *
 * Orchestrates the full recipe creation flow:
 * 1. Generates a unique slug from the title
 * 2. If a setupId is provided, inherits grinder and brewerDetails from the
 *    user's setup (unless explicitly supplied in data)
 * 3. Computes derived metrics (brewRatio, flowRate) from raw measurements
 * 4. Inserts the recipe, version, taste notes, equipment, additional
 *    preparations, and version photos in a single transaction
 * 5. Asynchronously evaluates badge eligibility for the author
 * 6. Asynchronously notifies the author's followers
 *
 * @param authorId - UUID of the authenticated user creating the recipe
 * @param data     - Recipe creation payload. Key fields:
 *   - title: string (required) -- used to generate the URL slug
 *   - setupId?: string -- optional setup to inherit equipment from
 *   - brewMethod: string -- e.g. 'espresso', 'pour_over', 'french_press'
 *   - groundWeightGrams?: number -- dose weight
 *   - extractionVolumeMl?: number -- yield volume
 *   - extractionTimeSeconds?: number -- shot/brew time
 *   - tasteNoteIds?: string[] -- UUIDs of taste notes to attach
 *   - equipmentIds?: string[] -- UUIDs of equipment to attach
 *   - visibility?: 'draft' | 'private' | 'public' (default: 'draft')
 * @returns The complete recipe object with version, relations, and author
 * @throws {Error} Database constraint violations if required fields are missing
 */
export async function createRecipe(authorId: string, data: any) {
```

**Example -- `forkRecipe` in service.ts (business-logic wrapper):**

```ts
/**
 * Fork an existing recipe for a new author.
 *
 * Validates visibility rules (drafts/private recipes can only be forked by
 * their own author), generates a unique slug, delegates to the model-layer
 * fork, then asynchronously evaluates badge eligibility.
 *
 * @param sourceId - UUID of the recipe to fork
 * @param authorId - UUID of the user creating the fork
 * @param title    - Optional custom title; defaults to "Fork of {source.title}"
 * @returns The newly created forked recipe
 * @throws {Error} `RECIPE_NOT_FOUND` if sourceId does not exist
 * @throws {Error} `FORBIDDEN` if the recipe is draft/private and the user
 *                 is not the author
 */
export async function forkRecipe(
  sourceId: string,
  authorId: string,
  title?: string,
) {
```

**Step 3: Document `packages/shared/src/types/` -- all 16 type files**

Every interface in the shared types package needs TSDoc explaining its purpose. These types are the contract between API and frontend.

Files to document:
```
additional-preparation.ts, api.ts, audit.ts, badge.ts, bean.ts,
brew-method-rule.ts, comment.ts, equipment.ts, follow.ts, index.ts,
password-reset.ts, photo.ts, recipe.ts, setup.ts, taste.ts, user.ts
```

**Example -- interface documentation in `types/recipe.ts`:**

```ts
/**
 * Recipe response returned by GET /api/v1/recipes/:slugOrId.
 *
 * Contains the recipe metadata, all versions (newest first), author
 * summary, and fork-origin reference. The `versions` array always
 * has at least one entry; the first element is the current/latest version.
 */
export interface Recipe {
  /** UUID primary key */
  id: string;
  /** URL-safe slug derived from the title (e.g. "my-morning-espresso") */
  slug: string;
  /** User-facing title */
  title: string;
  // ...
}
```

**Step 4: Document `packages/shared/src/utils/validation.ts`**

Add JSDoc to all exported validation functions and schemas.

#### Phase 2 -- All Other Modules

**Step 5: Document remaining module services and models**

Priority order (by line count and complexity):
1. `admin/model.ts` (484 lines, 35 exports)
2. `admin/service.ts` (349 lines, 37 exports)
3. `auth/service.ts` (173 lines, 6 exports)
4. `badge/model.ts` (125 lines, 3 exports)
5. `comment/model.ts` (122 lines, 5 exports)
6. `user/model.ts` (105 lines, 7 exports)
7. `comment/service.ts` (101 lines, 3 exports)
8. `auth/model.ts` (101 lines, 12 exports)
9. `follow/model.ts` (92 lines, 7 exports)
10. `taste/service.ts` (85 lines, 6 exports)
11. `taste/model.ts` (62 lines, 8 exports)
12. `follow/service.ts` (51 lines, 5 exports)
13. `equipment/model.ts` (51 lines, 6 exports)
14. Remaining small files (photo, preference, qrcode, report, vendor, setup, bean, badge -- all under 50 lines)

**Step 6: Document frontend components**

Focus on components that other devs are most likely to reuse or extend:
- `apps/web/src/components/seo/SEOHead.tsx` -- already partially documented (Props interface has 2 JSDoc fields), complete the rest
- `apps/web/src/components/recipe/` -- recipe card, bean section, recipe form components

### Style Guide

Follow the existing JSDoc style established in `auth/jwt.ts`:

1. **Module-level doc** at file top explaining the module's role:
   ```ts
   /**
    * Recipe data-access layer (model).
    *
    * Pure database operations via Drizzle ORM. No business logic,
    * authorization, or side effects. Called exclusively by recipe/service.ts.
    */
   ```

2. **Single-line for simple getters:** `/** Fetch a recipe by its UUID primary key. */`

3. **Multi-line for complex functions** with `@param`, `@returns`, `@throws`

4. **Interface members** get single-line `/** ... */` comments

5. **No redundant type re-statements** -- don't write `@param id - string` when the type is already `id: string`

---

## M7 -- Onboarding Wizard is Static Links

**Priority:** Medium
**Effort:** 8-12 hours

### Evidence

`apps/web/src/components/onboarding/OnboardingWizard.tsx` (152 lines):
- 5 steps: `welcome`, `equipment`, `beans`, `first-brew`, `explore`
- Each step renders static text + emoji + a link to a separate page (e.g., `<a href='/setups'>Set Up Equipment</a>`)
- Only API calls: `skip()` and `complete()` -- both just PATCH `/preferences` with `{ onboardingCompleted: true }`
- Collects **zero user data** during onboarding
- All strings are hardcoded English -- does not use the `useTranslation()` hook from `I18nContext.tsx`
- The i18n system supports 379 keys in EN/TR and is used throughout the rest of the app

### Impact

- Onboarding provides no value beyond what a landing page could -- user navigates away from the wizard to accomplish each step
- Turkish-speaking users see English-only onboarding content, breaking the otherwise comprehensive i18n experience
- Zero data collection means the app can't personalize the experience (e.g., pre-selecting brew methods, suggesting recipes)

### Action Plan

#### Phase 1: Fix i18n (required, ~2 hours)

Replace all hardcoded strings with `t()` calls from the existing translation system.

**Step 1: Add translation keys**

Add to both `packages/shared/src/i18n/locales/en.json` and `tr.json`:

```json
{
  "onboarding.welcome.title": "Welcome to BrewForm!",
  "onboarding.welcome.description": "Let's set up your brewing profile so you can start logging and sharing your coffee recipes.",
  "onboarding.equipment.title": "Add Your Equipment",
  "onboarding.equipment.description": "Set up your espresso machine, grinder, and accessories. You can create setups for different brewing configurations.",
  "onboarding.equipment.cta": "Set Up Equipment",
  "onboarding.beans.title": "Add Your Beans",
  "onboarding.beans.description": "Add the coffee beans you currently have so you can track them in your recipes.",
  "onboarding.beans.cta": "Add Beans",
  "onboarding.firstBrew.title": "Log Your First Brew",
  "onboarding.firstBrew.description": "Time to record your first recipe! Fill in the brew parameters, taste notes, and personal observations.",
  "onboarding.firstBrew.cta": "Create Recipe",
  "onboarding.explore.title": "Explore & Discover",
  "onboarding.explore.description": "Browse popular recipes, follow other brewers, and discover new techniques. You're all set!",
  "onboarding.explore.cta": "Browse Recipes",
  "onboarding.skip": "Skip",
  "onboarding.next": "Next",
  "onboarding.getStarted": "Get Started!"
}
```

**Step 2: Update OnboardingWizard.tsx to use `useTranslation()`**

```tsx
import { useTranslation } from '../../contexts/I18nContext';

function EquipmentStep() {
  const { t } = useTranslation();
  return (
    <>
      <div className='text-6xl mb-4'>🔧</div>
      <h2 className='text-xl font-bold' style={{ color: 'var(--text-primary)' }}>
        {t('onboarding.equipment.title')}
      </h2>
      <p className='mt-2' style={{ color: 'var(--text-secondary)' }}>
        {t('onboarding.equipment.description')}
      </p>
      <div className='mt-4'>
        <a href='/setups' className='btn-primary inline-block'>
          {t('onboarding.equipment.cta')}
        </a>
      </div>
    </>
  );
}
```

Apply the same pattern to all 5 step components and the navigation buttons.

#### Phase 2: Make Steps Interactive (~6-10 hours)

Replace the "link away to a separate page" pattern with inline forms that actually collect data without leaving the wizard.

**Step 2a: Equipment step -- inline setup selector**

Instead of linking to `/setups`, show a dropdown of existing equipment setups or a "quick add" form:

```tsx
function EquipmentStep() {
  const { t } = useTranslation();
  const [setups, setSetups] = useState<Setup[]>([]);
  const [selectedSetupId, setSelectedSetupId] = useState<string | null>(null);

  useEffect(() => {
    // Fetch user's existing setups (may be empty for new users)
    api.get('/setups').then(setSetups).catch(() => {});
  }, []);

  return (
    <>
      <div className='text-6xl mb-4'>🔧</div>
      <h2 className='text-xl font-bold' style={{ color: 'var(--text-primary)' }}>
        {t('onboarding.equipment.title')}
      </h2>
      <p className='mt-2' style={{ color: 'var(--text-secondary)' }}>
        {t('onboarding.equipment.description')}
      </p>

      {setups.length > 0 ? (
        <select
          value={selectedSetupId ?? ''}
          onChange={(e) => setSelectedSetupId(e.target.value || null)}
          className='mt-4 w-full input-primary'
        >
          <option value="">{t('onboarding.equipment.selectPlaceholder')}</option>
          {setups.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      ) : (
        <div className='mt-4'>
          <a href='/setups' className='btn-secondary inline-block'>
            {t('onboarding.equipment.cta')}
          </a>
        </div>
      )}
    </>
  );
}
```

**Step 2b: Bean step -- inline quick-add form**

Show a simple form with origin + roaster fields:

```tsx
function BeansStep() {
  const { t } = useTranslation();
  const [origin, setOrigin] = useState('');
  const [roaster, setRoaster] = useState('');
  const [saved, setSaved] = useState(false);

  async function handleQuickAdd() {
    if (!origin && !roaster) return;
    try {
      await api.post('/beans', { origin, roaster });
      setSaved(true);
    } catch { /* fallback: user can add beans later */ }
  }

  return (
    <>
      <div className='text-6xl mb-4'>🫘</div>
      <h2 className='text-xl font-bold' style={{ color: 'var(--text-primary)' }}>
        {t('onboarding.beans.title')}
      </h2>
      {saved ? (
        <p className='mt-2 text-green-600'>{t('onboarding.beans.saved')}</p>
      ) : (
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
            {t('onboarding.beans.quickAdd')}
          </button>
        </div>
      )}
      <div className='mt-2'>
        <a href='/beans' className='text-sm underline' style={{ color: 'var(--text-secondary)' }}>
          {t('onboarding.beans.advancedLink')}
        </a>
      </div>
    </>
  );
}
```

**Step 2c: First brew step -- quick recipe form**

Link to `/recipes/new` with pre-populated setup/bean from previous steps via query params or context:

```tsx
function FirstBrewStep({ selectedSetupId, savedBeanId }: {
  selectedSetupId?: string | null;
  savedBeanId?: string | null;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  function startRecipe() {
    const params = new URLSearchParams();
    if (selectedSetupId) params.set('setupId', selectedSetupId);
    if (savedBeanId) params.set('beanId', savedBeanId);
    const query = params.toString();
    navigate(`/recipes/new${query ? `?${query}` : ''}`);
  }

  return (
    <>
      <div className='text-6xl mb-4'>📝</div>
      <h2 className='text-xl font-bold' style={{ color: 'var(--text-primary)' }}>
        {t('onboarding.firstBrew.title')}
      </h2>
      <p className='mt-2' style={{ color: 'var(--text-secondary)' }}>
        {t('onboarding.firstBrew.description')}
      </p>
      <div className='mt-4'>
        <button type='button' onClick={startRecipe} className='btn-primary'>
          {t('onboarding.firstBrew.cta')}
        </button>
      </div>
    </>
  );
}
```

**Step 2d: Lift state to parent**

The `OnboardingWizard` parent component needs to track data collected across steps so it can pass it forward:

```tsx
export function OnboardingWizard() {
  const { t } = useTranslation();
  const { refreshUser } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [selectedSetupId, setSelectedSetupId] = useState<string | null>(null);
  const [savedBeanId, setSavedBeanId] = useState<string | null>(null);

  // ... skip/complete handlers unchanged ...

  return (
    <div className='mx-auto max-w-lg px-6 py-12 text-center'>
      {currentStep === 'equipment' && (
        <EquipmentStep onSelect={setSelectedSetupId} />
      )}
      {currentStep === 'beans' && (
        <BeansStep onBeanSaved={setSavedBeanId} />
      )}
      {currentStep === 'first-brew' && (
        <FirstBrewStep
          selectedSetupId={selectedSetupId}
          savedBeanId={savedBeanId}
        />
      )}
      {/* ... */}
    </div>
  );
}
```

**Keep skip/link fallbacks** -- every interactive step should still have a "skip" or "add later" link to the full page as a fallback.

### Dependencies

- Phase 1 (i18n): Requires adding keys to `packages/shared/src/i18n/locales/en.json` and `tr.json`
- Phase 2 (interactive): Requires existing `/setups` and `/beans` API endpoints (already exist)

---

## L5 -- Coffee Palette Defined But Unused

**Priority:** Low
**Effort:** 15 minutes

### Evidence

`apps/web/src/styles/globals.css:3-13` defines 10 coffee palette variables in `@theme`:

```css
@theme {
  --color-coffee-50: #faf6f1;
  --color-coffee-100: #f0e6d6;
  --color-coffee-200: #e0ccb0;
  --color-coffee-300: #c9a96e;
  --color-coffee-400: #b8914f;
  --color-coffee-500: #6f4e37;
  --color-coffee-600: #5a3e2b;
  --color-coffee-700: #4a3222;
  --color-coffee-800: #3e2723;
  --color-coffee-900: #2c1a12;
}
```

Search for `coffee-` across all component files returns **zero results**. No component uses `bg-coffee-500`, `text-coffee-300`, or any other Tailwind class generated from these values.

Components use `var(--accent-primary)`, `var(--bg-secondary)`, etc., which happen to resolve to coffee tones through the theme system. The `@theme` palette variables exist but generate unused CSS utility classes.

### Impact

- 10 unused CSS custom properties bloat the Tailwind output
- Misleading to contributors who might think these classes are used somewhere
- Minimal real-world impact (a few bytes of CSS)

### Action Plan

**Recommended: Option B -- Remove unused palette from `@theme`**

The semantic CSS variables (`--accent-primary`, `--bg-secondary`, etc.) already provide theming with coffee tones. The `@theme` palette is redundant.

**Step 1: Remove the palette from `apps/web/src/styles/globals.css`**

Delete lines 4-13 (the `--color-coffee-*` definitions):

```css
@theme {
  /* REMOVE: --color-coffee-50 through --color-coffee-900 */

  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
  /* ... rest stays ... */
}
```

**Step 2: Verify no regressions**

Run `deno task build:web` and confirm no build errors or visual regressions.

**Alternative: Option A -- Wire accent variables to coffee palette**

If the team wants to keep the palette for future use, wire the semantic variables to reference them:

```css
:root {
  --accent-primary: var(--color-coffee-500);
  --accent-hover: var(--color-coffee-600);
}
```

This is more work for no current benefit, so Option B is recommended.

---

## L6 -- No Pre-Commit Formatting Hooks

**Priority:** Low
**Effort:** 30 minutes

### Evidence

- No `.githooks/` directory exists
- No `.git/hooks/pre-commit` file exists
- No husky or lint-staged configuration (these are Node.js tools -- **do not use them**)
- The Makefile has `fmt-check`, `lint`, and `check` targets already, but they are not enforced automatically
- Developers can commit unformatted code that CI will later reject

### Impact

- CI failures on formatting are a waste of time -- the round-trip of push, wait for CI, fix, push again
- Inconsistent formatting in PRs creates noisy diffs

### Action Plan

**IMPORTANT: This is a pure Deno project. Do NOT use husky, lint-staged, or any npm-based tools.**

**Step 1: Create `.githooks/pre-commit`**

```bash
#!/bin/sh
# BrewForm pre-commit hook
# Runs formatting check and linting before each commit.
# Install: git config core.hooksPath .githooks
# Or: make setup-hooks

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

**Step 3: Add `setup-hooks` target to Makefile**

Add this target alongside the existing code quality targets:

```makefile
# --- Developer Setup ---

setup-hooks: ## Configure git to use project hooks (.githooks/)
	git config core.hooksPath .githooks
	@echo "Git hooks configured. Pre-commit will run 'deno fmt --check' and 'deno lint'."
```

**Step 4: Add to `.PHONY`**

Append `setup-hooks` to the existing `.PHONY` line at the bottom of the Makefile.

**Step 5: Document in AGENTS.md**

Add a note in the developer setup section:

```markdown
## Git Hooks

Run `make setup-hooks` after cloning to enable pre-commit format and lint checks.
This configures `git config core.hooksPath .githooks`.
```

### Notes

- The hook runs `deno fmt --check` (not `deno fmt`) so it does not modify files silently -- the developer must explicitly format
- This works with Docker-based workflows too: developers who run Deno locally get the hook, while CI still enforces via the existing `ci` target
- For developers without local Deno, the hook will fail gracefully (they can skip with `git commit --no-verify` and let CI catch issues)

---

## L8 -- ComparePage Route Params Naming

**Priority:** Low
**Effort:** 15 minutes

### Evidence

`apps/web/src/router.tsx:70`:
```tsx
{ path: 'recipes/compare/:id1/:id2', element: <RecipeComparePage /> },
```

`apps/web/src/pages/recipes/RecipeComparePage.tsx:13`:
```tsx
const { id1, id2 } = useParams();
```

The route parameters are named `:id1` and `:id2`, but the values passed are actually **slugs** (URL-safe strings like `"my-morning-espresso"`), not UUIDs. The `recipeApi.get()` call on line 24 accepts both slugs and UUIDs (the service layer checks the format), but the parameter names are misleading.

### Impact

- Misleading to developers -- suggests UUID format when slugs are expected
- Minor readability issue; no runtime impact

### Action Plan

**Step 1: Rename route params in `apps/web/src/router.tsx`**

```tsx
// Before:
{ path: 'recipes/compare/:id1/:id2', element: <RecipeComparePage /> },

// After:
{ path: 'recipes/compare/:slug1/:slug2', element: <RecipeComparePage /> },
```

**Step 2: Update `RecipeComparePage.tsx` to use new param names**

```tsx
// Before:
const { id1, id2 } = useParams();

// After:
const { slug1, slug2 } = useParams();
```

Update all references to `id1`/`id2` in the component (lines 13, 21, 24 at minimum) to `slug1`/`slug2`.

**Step 3: Search for other references**

Check for any `navigate()` or `<Link>` calls that construct compare URLs -- update them to use descriptive variable names if needed.

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

These are thin wrappers that call the non-deprecated `*Result()` functions and return hardcoded English strings. They exist only for backward compatibility.

**Usage analysis:**
- **Production code:** Zero usage. No component imports these functions.
- **Test files:** Used extensively in:
  - `apps/web/src/utils/relative-date.test.ts` (lines 56-237) -- dedicated test suites
  - `apps/web/src/components/recipe/BeanSection.test.tsx` (lines 39-41) -- mocked in test setup

### Impact

- Dead code in production
- Test files test deprecated functions instead of the current `*Result()` API
- Minor maintenance burden

### Action Plan

**Step 1: Remove deprecated functions from `relative-date.ts`**

Delete lines 70-94 (the comment block and all 3 functions).

**Step 2: Update `relative-date.test.ts`**

Replace tests for `roastDateLabel`, `packageOpenDateLabel`, and `grindDateLabel` with equivalent tests for `roastDateResult`, `packageOpenDateResult`, and `grindDateResult`.

Example migration:

```ts
// Before:
describe('roastDateLabel', () => {
  it('same day returns "today"', () => {
    expect(roastDateLabel(date, date)).toBe('today');
  });
  it('different days returns "N days post-roast"', () => {
    expect(roastDateLabel(roast, brew)).toBe('9 days post-roast');
  });
});

// After:
describe('roastDateResult', () => {
  it('same day returns type "today"', () => {
    expect(roastDateResult(date, date)).toEqual({ type: 'today' });
  });
  it('different days returns type "daysAgo" with count', () => {
    expect(roastDateResult(roast, brew)).toEqual({ type: 'daysAgo', days: 9 });
  });
});
```

**Step 3: Update `BeanSection.test.tsx`**

The mock on lines 39-41 references the deprecated functions. Update the mock to use the `*Result()` versions:

```ts
// Before:
roastDateLabel: (_roastDate: Date, _brewDate: Date) => '7 days post-roast',
packageOpenDateLabel: (_openDate: Date, _brewDate: Date) => '3 days since opened',
grindDateLabel: (_grindDate: Date, _brewDate: Date) => '1 days ago',

// After:
roastDateResult: (_roastDate: Date, _brewDate: Date) => ({ type: 'daysAgo', days: 7 }),
packageOpenDateResult: (_openDate: Date, _brewDate: Date) => ({ type: 'daysAgo', days: 3 }),
grindDateResult: (_grindDate: Date, _brewDate: Date) => ({ type: 'daysAgo', days: 1 }),
```

Note: The `BeanSection` component itself must already use the `*Result()` functions (since the deprecated ones are not imported in production). Verify the component code before updating the mock shape.

**Step 4: Remove deprecated imports**

Remove `roastDateLabel`, `packageOpenDateLabel`, `grindDateLabel` from the import statement in `relative-date.test.ts` (line 11).

---

## L11 -- No Declarative Page Titles

**Priority:** Low (informational -- no action required now)
**Effort:** N/A (defer unless SSR is added)

### Evidence

`apps/web/src/components/seo/SEOHead.tsx:21-22`:
```tsx
useEffect(() => {
  document.title = title ? `${title} | BrewForm` : 'BrewForm — Coffee Brewing Recipes';
```

Page titles are set imperatively via `useEffect` + `document.title`. There is no declarative route-level `handle` property or framework-level `<title>` support (e.g., React Router's `handle.title` convention).

The `SEOHead` component returns `null` (line 52) and performs all work as side effects.

### Impact

- Works correctly for a client-side SPA -- this is not a bug
- If/when SSR is added, the `useEffect` approach won't run server-side
- React Router v7.5 supports route `handle` properties that could be used for declarative titles, but this is cosmetic for an SPA

### Action Plan

**Current recommendation: No action.**

The `useEffect` approach is standard and correct for a client-rendered SPA. The `SEOHead` component is well-structured and handles `og:*` tags, `twitter:card`, `robots`, and `canonical` -- it's doing its job.

**If SSR is added in the future:**

1. Migrate to React Router's `handle` property on route definitions:
   ```tsx
   {
     path: 'recipes/:slug',
     element: <RecipeDetailPage />,
     handle: { title: (params) => `Recipe: ${params.slug}` },
   }
   ```

2. Use a framework-level `<Meta>` or `<Title>` component that works both client and server side.

3. The crawler middleware planned in Plan 01 (C1) already handles the server-rendered meta tag problem for social sharing bots, so this is purely about full SSR support.

**Ensure SEOHead coverage:**

As a minor polish task, audit all page components to verify `<SEOHead>` is rendered on every page that needs a custom title. Grep for pages that don't import `SEOHead`:

```bash
grep -rL "SEOHead" apps/web/src/pages/ --include="*.tsx"
```

Any page missing it should add a `<SEOHead title="Page Name" />` call.

---

## Summary & Recommended Execution Order

1. **L5 -- Coffee palette** (15 min) -- quick cleanup, zero risk
2. **L8 -- ComparePage params** (15 min) -- quick rename, zero risk
3. **L9 -- Deprecated functions** (20 min) -- remove dead code, update tests
4. **L6 -- Pre-commit hooks** (30 min) -- improve DX for all developers
5. **M7 Phase 1 -- Onboarding i18n** (2 hours) -- fix broken i18n consistency
6. **H1 Phase 1 -- Core JSDoc** (10-15 hours) -- document recipe module and shared types
7. **H1 Phase 2 -- Remaining JSDoc** (10-15 hours) -- document all other modules
8. **M7 Phase 2 -- Interactive onboarding** (6-10 hours) -- make wizard useful
9. **L11 -- Page titles** -- defer, no action needed
