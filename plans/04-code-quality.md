# Plan 04 -- Code Quality & Type Safety

**Priority:** High
**Estimated effort:** 3--4 days
**Dependencies:** None (all changes are independent of Plans 01--03)

---

## Tech Context

| Layer | Technology |
|-------|-----------|
| Runtime | Deno 2.x |
| Validation | Zod v4 (shared schemas in `packages/shared/src/schemas/`) |
| ORM | Drizzle ORM 0.45 (`packages/db/`) |
| Shared types | `packages/shared/src/types/` (exported via `@brewform/shared/types`) |
| Shared constants | `packages/shared/src/constants/` (exported via `@brewform/shared/constants`) |
| API pattern | `model.ts` -> `service.ts` -> `index.ts` (controller) |
| Frontend API client | `apps/web/src/api/client.ts` -- `return data.data as T` strips meta wrapper |
| Lint exclusions | `no-explicit-any`, `require-await`, `no-empty`, `no-import-prefix`, `no-unversioned-import` |

---

## Table of Contents

| ID | Issue | Severity | Section |
|----|-------|----------|---------|
| H6 | `any` type abuse in frontend (~36 occurrences) | High | [1](#1-h6--any-type-abuse-in-frontend) |
| H9 | Hardcoded English strings (i18n bypass) | High | [2](#2-h9--hardcoded-english-strings-i18n) |
| H14 | No server-side content sanitization | High | [3](#3-h14--no-server-side-content-sanitization) |
| H15 | Search has no debounce + pagination bug | High | [4](#4-h15--search-no-debounce--pagination-bug) |
| M12 | `authRateLimitMiddleware` dead code | Medium | [5](#5-m12--authratelimitmiddleware-dead-code) |
| M13 | Password strength is length-only | Medium | [6](#6-m13--password-strength-length-only) |
| M15 | 14+ stale Prisma refs in docs + README | Medium | [7](#7-m15--stale-prisma-references-in-docs) |
| N2 | `console.log` in production code | Nit | [8](#8-n2--consolelog-in-production-code) |
| N4 | Hono Variables type uses `unknown` for user | Nit | [9](#9-n4--hono-variables-type-uses-unknown) |

---

## 1. H6 -- `any` Type Abuse in Frontend

### Evidence

Exact counts from non-test files in `apps/web/src/`:

| File | `any` count | Key instances |
|------|-------------|---------------|
| `pages/recipes/RecipeDetailPage.tsx` | 14 | `useState<any>(null)` (line 32), `useState<any[]>([])` (line 35), `(result as any).avgRating` (line 309), `data as any[]` (line 40), `EMOJI_TAGS.find((e: any) =>` (line 85), `tasteNotes: any[]` (line 87), `equipment: any[]` (line 89), `(prev: any) =>` (line 306) |
| `pages/recipes/RecipeCreatePage.tsx` | 19 | `BREW_METHODS as unknown as any[]` (line 16), `DRINK_TYPES as unknown as any[]` (line 18), `VISIBILITY_STATES as unknown as any[]` (line 20), `EMOJI_TAGS as unknown as any[]` (line 22), `useState<any[]>([])` (lines 53--54), `(data as any[])` (lines 62, 65), iterators `(v: any)`, `(m: any)`, `(d: any)`, `(s: any)`, `(eq: any)`, `(t: any)` |
| `pages/recipes/RecipeEditPage.tsx` | 16 | Same 4 `as unknown as any[]` casts (lines 16--22), `const r: any = data` (line 59), `(r as any).tasteNotes.map((t: any) =>` (line 78), iterators `(v: any)`, `(m: any)`, `(d: any)`, `(t: any)` |
| `pages/recipes/RecipeListPage.tsx` | 10 | Same 3 `as unknown as any[]` casts (lines 15--19), iterators `(m: any)`, `(d: any)`, `(v: any)` |
| `pages/recipes/StarredRecipesPage.tsx` | 7 | 2 `as unknown as any[]` casts (lines 15--17), iterators `(m: any)`, `(d: any)` |
| `modules/auth/index.ts` (API) | 1 | `sanitizeUser(user: any)` (line 211) |

**Root cause:** The `as const` arrays in `@brewform/shared/constants` are readonly tuples. When these are iterated with `.map()` or `.filter()`, TypeScript narrows their element types to union literals, which is incompatible with the mutable array types expected by JSX `<option>` patterns. Instead of fixing the type mismatch properly, `as unknown as any[]` was used as a blanket cast.

### Impact

- No compile-time safety on recipe data structures -- runtime crashes possible
- Impossible to refactor shared types without manually auditing every `any` consumer
- The `data.data as T` pattern in `client.ts` discards the pagination `meta` wrapper, forcing list pages to use `items.length` as total count

### Action Plan

#### Step 1: Create typed constant interfaces in shared

**File: `packages/shared/src/constants/brew-methods.ts`** -- add a mutable helper type at the end:

```ts
// At the bottom of the existing file, add:
export type BrewMethodOption = {
  value: BrewMethodValue;
  label: string;
  equipmentTypes: string[];
};

/** Mutable copy for use in .map()/.filter() in React components */
export const BREW_METHODS_LIST: BrewMethodOption[] = [...BREW_METHODS];
```

**File: `packages/shared/src/constants/drink-types.ts`** -- same pattern:

```ts
export type DrinkTypeOption = {
  value: DrinkTypeValue;
  label: string;
  compatibleMethods: string[];
};

export const DRINK_TYPES_LIST: DrinkTypeOption[] = [...DRINK_TYPES];
```

**File: `packages/shared/src/constants/visibility.ts`**:

```ts
export type VisibilityOption = {
  value: string;
  label: string;
  description: string;
};

export const VISIBILITY_STATES_LIST: VisibilityOption[] = [...VISIBILITY_STATES];
```

**File: `packages/shared/src/constants/emoji-tags.ts`**:

```ts
export type EmojiTagOption = {
  value: EmojiTagKey;
  emoji: string;
  label: string;
};

/** key is aliased to value for consistent option pattern */
export const EMOJI_TAGS_LIST: EmojiTagOption[] = EMOJI_TAGS.map((t) => ({
  value: t.key,
  emoji: t.emoji,
  label: t.label,
}));
```

**File: `packages/shared/src/constants/index.ts`** -- add barrel re-exports for all new symbols:

```ts
// Add to existing exports:
export { BREW_METHODS_LIST, type BrewMethodOption } from './brew-methods.ts';
export { DRINK_TYPES_LIST, type DrinkTypeOption } from './drink-types.ts';
export { VISIBILITY_STATES_LIST, type VisibilityOption } from './visibility.ts';
export { EMOJI_TAGS_LIST, type EmojiTagOption } from './emoji-tags.ts';
```

#### Step 2: Create typed API response interfaces for the frontend

**File: `apps/web/src/api/types.ts`** (new file):

```ts
import type {
  Equipment,
  Recipe,
  RecipeVersion,
  TasteNote,
  User,
} from '@brewform/shared/types';

// ── Recipe detail (what GET /recipes/:slug returns after client unwrap) ──

export interface RecipeDetailResponse {
  id: string;
  slug: string;
  title: string;
  authorId: string;
  visibility: string;
  likeCount: number;
  commentCount: number;
  forkCount: number;
  forkedFromId: string | null;
  featured: boolean;
  createdAt: string;
  updatedAt: string;
  versionCount: number;
  currentVersion: RecipeVersionResponse | null;
  author: RecipeAuthorResponse | null;
  tasteNotes: RecipeTasteNoteResponse[];
  equipment: RecipeEquipmentResponse[];
  bean: RecipeBeanResponse | null;
  photos: RecipePhotoResponse[];
  avgRating: number | null;
  ratingCount: number;
  userRating: number | null;
  userLiked: boolean;
  userFavourited: boolean;
  favouriteCount: number;
}

export interface RecipeVersionResponse {
  id: string;
  versionNumber: number;
  brewMethod: string;
  drinkType: string;
  productName: string | null;
  coffeeBrand: string | null;
  coffeeProcessing: string | null;
  grinder: string | null;
  grindSize: string | null;
  brewerDetails: string | null;
  groundWeightGrams: number | null;
  extractionTimeSeconds: number | null;
  extractionVolumeMl: number | null;
  temperatureCelsius: number | null;
  brewRatio: number | null;
  flowRate: number | null;
  preInfusionTimeSeconds: number | null;
  personalNotes: string | null;
  preparationNotes: string | null;
  rating: number | null;
  emojiTag: string | null;
  roastDate: string | null;
  packageOpenDate: string | null;
  grindDate: string | null;
  brewDate: string | null;
  bean: RecipeBeanResponse | null;
}

export interface RecipeAuthorResponse {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface RecipeTasteNoteResponse {
  id: string;
  name: string;
  intensity: number | null;
  category: string | null;
  parentId: string | null;
}

export interface RecipeEquipmentResponse {
  id: string;
  name: string;
  type: string;
  brand: string | null;
}

export interface RecipeBeanResponse {
  id: string;
  name: string;
  roaster: string | null;
  origin: string | null;
}

export interface RecipePhotoResponse {
  id: string;
  url: string;
}

// ── Recipe list item (what GET /recipes and GET /recipes/starred return per item) ──

export interface RecipeListItem {
  id: string;
  slug: string;
  title: string;
  visibility: string;
  brewMethod: string;
  drinkType: string;
  likeCount: number;
  commentCount: number;
  forkCount: number;
  featured: boolean;
  createdAt: string;
  updatedAt: string;
  author: RecipeAuthorResponse | null;
  currentVersion: Pick<RecipeVersionResponse, 'brewMethod' | 'drinkType' | 'emojiTag' | 'rating'> | null;
  avgRating: number | null;
  userLiked: boolean;
  userFavourited: boolean;
}

// ── Rate response ──

export interface RateResponse {
  avgRating: number;
  ratingCount: number;
}

// ── Equipment / Setup list items ──

export interface EquipmentListItem {
  id: string;
  name: string;
  type: string;
  brand: string | null;
}

export interface SetupListItem {
  id: string;
  name: string;
  grinder: string | null;
  brewerDetails: string | null;
  isDefault: boolean;
}

// ── Taste note flat ──

export interface TasteNoteFlatItem {
  id: string;
  name: string;
  category: string | null;
  parentId: string | null;
}

// ── Paginated response (for when we need the meta wrapper) ──

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}
```

#### Step 3: Add a `requestWithMeta` method to the API client

**File: `apps/web/src/api/client.ts`** -- add alongside the existing `request` function:

```ts
// Add this interface above the request function
interface ApiResponseWithMeta<T> {
  data: T;
  meta?: {
    requestId?: string;
    pagination?: {
      page: number;
      perPage: number;
      total: number;
      totalPages: number;
    };
  };
}

// Add this new function after the existing request() function
async function requestWithMeta<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<ApiResponseWithMeta<T>> {
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
  });

  if (response.status === 401 && token) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
      });
    } else {
      clearTokens();
      globalThis.location.href = '/login';
      throw new Error('Session expired');
    }
  }

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data.error?.code || 'UNKNOWN_ERROR',
      data.error?.message || 'Request failed',
      data.error?.details,
      response.status,
    );
  }

  return { data: data.data as T, meta: data.meta };
}

// Add to the exported api object:
export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint, { method: 'GET' }),
  getWithMeta: <T>(endpoint: string) =>
    requestWithMeta<T>(endpoint, { method: 'GET' }),
  // ... existing methods unchanged
};
```

#### Step 4: Replace `any` in RecipeDetailPage.tsx

**File: `apps/web/src/pages/recipes/RecipeDetailPage.tsx`**:

```ts
// Replace import section — add type imports:
import type {
  RecipeDetailResponse,
  RateResponse,
  TasteNoteFlatItem,
} from '../../api/types.ts';

// Replace the any-typed state variables:
// BEFORE:
//   const [recipe, setRecipe] = useState<any>(null);
//   const [allTasteNotes, setAllTasteNotes] = useState<any[]>([]);
// AFTER:
const [recipe, setRecipe] = useState<RecipeDetailResponse | null>(null);
const [allTasteNotes, setAllTasteNotes] = useState<TasteNoteFlatItem[]>([]);

// Replace the tasteApi fetch:
// BEFORE:
//   tasteApi.flat().then((data) => {
//     setAllTasteNotes(Array.isArray(data) ? data as any[] : []);
//   })
// AFTER:
tasteApi.flat().then((data) => {
  setAllTasteNotes(Array.isArray(data) ? (data as TasteNoteFlatItem[]) : []);
})

// Replace the emojiInfo line (remove (e: any)):
// BEFORE:
//   const emojiInfo = v?.emojiTag ? EMOJI_TAGS.find((e: any) => e.key === v.emojiTag) : null;
// AFTER:
const emojiInfo = v?.emojiTag
  ? EMOJI_TAGS.find((e) => e.key === v.emojiTag)
  : null;

// Replace the taste/equipment lines:
// BEFORE:
//   const tasteNotes: any[] = Array.isArray(recipe.tasteNotes) ? recipe.tasteNotes : [];
//   const equipment: any[] = Array.isArray(recipe.equipment) ? recipe.equipment : [];
// AFTER:
const tasteNotes = Array.isArray(recipe.tasteNotes) ? recipe.tasteNotes : [];
const equipment = Array.isArray(recipe.equipment) ? recipe.equipment : [];

// Replace the onRate callback:
// BEFORE:
//   const result = await recipeApi.rate(recipe.id, rating);
//   setRecipe((prev: any) => ({
//     ...prev,
//     userRating: rating,
//     avgRating: (result as any).avgRating,
//     ratingCount: (result as any).ratingCount,
//   }));
// AFTER:
const result = await recipeApi.rate(recipe.id, rating) as RateResponse;
setRecipe((prev) =>
  prev
    ? {
        ...prev,
        userRating: rating,
        avgRating: result.avgRating,
        ratingCount: result.ratingCount,
      }
    : prev
);
```

#### Step 5: Replace `any` in RecipeCreatePage.tsx

**File: `apps/web/src/pages/recipes/RecipeCreatePage.tsx`**:

```ts
// Remove the 4 blanket casts at the top:
// REMOVE:
//   const BREW_METHODS_ANY = BREW_METHODS as unknown as any[];
//   const DRINK_TYPES_ANY = DRINK_TYPES as unknown as any[];
//   const VISIBILITY_ANY = VISIBILITY_STATES as unknown as any[];
//   const EMOJI_ANY = EMOJI_TAGS as unknown as any[];

// REPLACE WITH imports:
import {
  BREW_METHODS_LIST,
  DRINK_TYPES_LIST,
  VISIBILITY_STATES_LIST,
  EMOJI_TAGS_LIST,
} from '@brewform/shared/constants';
// (keep existing BREW_METHODS, DRINK_TYPES, etc. imports if still needed for type inference)

import type {
  EquipmentListItem,
  SetupListItem,
} from '../../api/types.ts';

// Replace equipment/setup state:
// BEFORE:
//   const [equipmentList, setEquipmentList] = useState<any[]>([]);
//   const [setupList, setSetupList] = useState<any[]>([]);
// AFTER:
const [equipmentList, setEquipmentList] = useState<EquipmentListItem[]>([]);
const [setupList, setSetupList] = useState<SetupListItem[]>([]);

// Replace the data fetches:
// BEFORE:
//   equipmentApi.list().then((data) => setEquipmentList(data as any[]))
//   setupApi.list().then((data) => setSetupList(data as any[]))
// AFTER:
equipmentApi.list().then((data) => setEquipmentList(data as EquipmentListItem[]))
setupApi.list().then((data) => setSetupList(data as SetupListItem[]))

// Replace compatibleDrinks:
// BEFORE:
//   const compatibleDrinks = DRINK_TYPES_ANY.filter((d: any) =>
//     d.compatibleMethods.includes(brewMethod)
//   );
// AFTER:
const compatibleDrinks = DRINK_TYPES_LIST.filter((d) =>
  d.compatibleMethods.includes(brewMethod)
);

// Replace all JSX iterators using _ANY constants:
// BEFORE:  VISIBILITY_ANY.map((v: any) => ...)
// AFTER:   VISIBILITY_STATES_LIST.map((v) => ...)
//
// BEFORE:  BREW_METHODS_ANY.map((m: any) => ...)
// AFTER:   BREW_METHODS_LIST.map((m) => ...)
//
// BEFORE:  compatibleDrinks.map((d: any) => ...)
// AFTER:   compatibleDrinks.map((d) => ...)
//
// BEFORE:  EMOJI_ANY.map((t: any) => ...)
// AFTER:   EMOJI_TAGS_LIST.map((t) => ...)
//
// ⚠️ NOTE: EMOJI_TAGS_LIST[n].value corresponds to EMOJI_TAGS[n].key — the field was renamed.
// Any JSX option value={t.key} must be updated to value={t.value}.
// The original EMOJI_TAGS array (with .key) is still used in RecipeDetailPage for .find() lookups.
//
// BEFORE:  setupList.map((s: any) => ...)
// AFTER:   setupList.map((s) => ...)
//
// BEFORE:  equipmentList.map((eq: any) => ...)
// AFTER:   equipmentList.map((eq) => ...)
```

#### Step 6: Replace `any` in RecipeEditPage.tsx

Same pattern as Step 5 for the constant casts. Additionally:

```ts
import type { RecipeDetailResponse } from '../../api/types.ts';

// Replace the data fetch:
// BEFORE:
//   recipeApi.get(id).then((data) => {
//     const r: any = data;
// AFTER:
recipeApi.get(id).then((data) => {
  const r = data as RecipeDetailResponse;

// Replace taste note mapping:
// BEFORE:
//   setTasteNoteIds((r as any).tasteNotes.map((t: any) => t.id));
//   for (const t of (r as any).tasteNotes) {
// AFTER:
setTasteNoteIds(r.tasteNotes.map((t) => t.id));
for (const t of r.tasteNotes) {
```

#### Step 7: Replace `any` in RecipeListPage.tsx and StarredRecipesPage.tsx

```ts
// In both files, replace:
//   const BREW_METHODS_ANY = BREW_METHODS as unknown as any[];
//   const DRINK_TYPES_ANY = DRINK_TYPES as unknown as any[];
//   const VISIBILITY_ANY = VISIBILITY_STATES as unknown as any[];  // (RecipeListPage only)

// With:
import {
  BREW_METHODS_LIST,
  DRINK_TYPES_LIST,
  VISIBILITY_STATES_LIST,  // RecipeListPage only
} from '@brewform/shared/constants';

// Replace all JSX iterators: BREW_METHODS_ANY -> BREW_METHODS_LIST, etc.
// Remove all (m: any), (d: any), (v: any) annotations — types are now inferred.
```

#### Step 8: Type `sanitizeUser` in auth controller

**File: `apps/api/src/modules/auth/index.ts`**:

```ts
// BEFORE (line 211):
// function sanitizeUser(user: any): Record<string, unknown> {
//   const { passwordHash: _passwordHash, ...safe } = user;
//   return safe;
// }

// AFTER:
import type { User } from '@brewform/shared/types';

interface UserWithPasswordHash extends Omit<User, 'preferences'> {
  passwordHash: string;
  preferences?: User['preferences'];
}

function sanitizeUser(user: UserWithPasswordHash): Omit<UserWithPasswordHash, 'passwordHash'> {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}
```

### Verification

```bash
# Confirm zero any casts remain in modified files (excluding test files)
grep -rn "as unknown as any\|: any\|<any>" apps/web/src/pages/recipes/ --include="*.tsx" | grep -v ".test."

# Should return 0 lines after all changes
```

---

## 2. H9 -- Hardcoded English Strings (i18n)

### Evidence

**`apps/web/src/pages/recipes/RecipeDetailPage.tsx`** lines 146--174:
- Line 152: `Print` (hardcoded) -- i18n key `recipe.print` exists in `en.json:52`
- Line 160: `Focus` (hardcoded) -- i18n key `recipe.focusMode` exists in `en.json:51`
- Line 173: `Fork Recipe` (hardcoded) -- i18n key `recipe.fork` exists in `en.json:28`
- Line 150: `aria-label='Print recipe'` (hardcoded)
- Line 159: `aria-label='Focus mode'` (hardcoded)
- Line 171: `aria-label='Fork recipe'` (hardcoded)

**`apps/web/src/components/onboarding/OnboardingWizard.tsx`** -- all 5 step components have hardcoded English despite i18n keys existing:
- Line 44: `Skip` -- key `onboarding.skip` exists
- Line 52: `Next` -- no key exists, needs adding
- Line 55: `Get Started!` -- no key exists, needs adding
- Line 77: `Welcome to BrewForm!` -- key `onboarding.welcome` exists
- Line 79: `Let's set up your brewing profile...` -- no key exists, needs adding
- Line 90: `Add Your Equipment` -- key `onboarding.equipment` exists
- Line 93: `Set up your espresso machine...` -- no key exists, needs adding
- Line 97: `Set Up Equipment` -- no key exists, needs adding
- Line 107: `Add Your Beans` -- key `onboarding.beans` exists
- Line 109: `Add the coffee beans you currently have...` -- no key exists, needs adding
- Line 112: `Add Beans` -- no key exists, needs adding
- Line 123: `Log Your First Brew` -- key `onboarding.firstBrew` exists
- Line 125: `Time to record your first recipe!...` -- no key exists, needs adding
- Line 129: `Create Recipe` -- can use existing `recipe.create`
- Line 141: `Explore & Discover` -- key `onboarding.explore` exists (close, but text differs)
- Line 143: `Browse popular recipes...` -- no key exists, needs adding
- Line 147: `Browse Recipes` -- no key exists, needs adding

### Impact

- Turkish users see English-only strings on these pages
- Inconsistent UX -- some parts translated, others not

### Action Plan

#### Step 1: Add missing i18n keys

**File: `packages/shared/src/i18n/en.json`** -- add after existing onboarding keys:

```json
  "onboarding.welcomeDescription": "Let's set up your brewing profile so you can start logging and sharing your coffee recipes.",
  "onboarding.equipmentDescription": "Set up your espresso machine, grinder, and accessories. You can create setups for different brewing configurations.",
  "onboarding.equipmentAction": "Set Up Equipment",
  "onboarding.beansDescription": "Add the coffee beans you currently have so you can track them in your recipes.",
  "onboarding.beansAction": "Add Beans",
  "onboarding.firstBrewDescription": "Time to record your first recipe! Fill in the brew parameters, taste notes, and personal observations.",
  "onboarding.firstBrewAction": "Create Recipe",
  "onboarding.exploreTitle": "Explore & Discover",
  "onboarding.exploreDescription": "Browse popular recipes, follow other brewers, and discover new techniques. You're all set!",
  "onboarding.exploreAction": "Browse Recipes",
  "onboarding.next": "Next",
  "onboarding.getStarted": "Get Started!",
  "recipe.printAriaLabel": "Print recipe",
  "recipe.focusModeAriaLabel": "Focus mode",
  "recipe.forkAriaLabel": "Fork recipe",
```

**File: `packages/shared/src/i18n/tr.json`** -- add corresponding keys:

```json
  "onboarding.welcomeDescription": "Kahve tariflerinizi kaydetmeye ve paylasmaya baslamak icin demleme profilinizi ayarlayalim.",
  "onboarding.equipmentDescription": "Espresso makinenizi, degirmeninizi ve aksesuarlarinizi ekleyin. Farkli demleme yapilandirmalari icin kurulumlar olusturabilirsiniz.",
  "onboarding.equipmentAction": "Ekipman Kur",
  "onboarding.beansDescription": "Su anda sahip oldugunuz kahve cekirdeklerini ekleyin, boylece tariflerinizde takip edebilirsiniz.",
  "onboarding.beansAction": "Cekirdek Ekle",
  "onboarding.firstBrewDescription": "Ilk tarifinizi kaydetme zamani! Demleme parametrelerini, tat notlarini ve kisisel gozlemlerinizi doldurun.",
  "onboarding.firstBrewAction": "Tarif Olustur",
  "onboarding.exploreTitle": "Kesfet",
  "onboarding.exploreDescription": "Populer tariflere goz atin, diger demlemecileri takip edin ve yeni teknikleri kesfedin. Hazirsiniz!",
  "onboarding.exploreAction": "Tariflere Goz At",
  "onboarding.next": "Ileri",
  "onboarding.getStarted": "Baslayalim!",
  "recipe.printAriaLabel": "Tarifi yazdir",
  "recipe.focusModeAriaLabel": "Odak modu",
  "recipe.forkAriaLabel": "Tarifi catal",
```

#### Step 2: Update RecipeDetailPage.tsx button section

**File: `apps/web/src/pages/recipes/RecipeDetailPage.tsx`** lines 145--175:

```tsx
{/* BEFORE: */}
{/* Print button */}
<button
  type='button'
  onClick={() => globalThis.print()}
  className='btn-secondary text-sm min-h-11 px-3'
  aria-label='Print recipe'
>
  Print
</button>

{/* Focus button */}
<button
  type='button'
  onClick={() => navigate(`/recipes/${recipe.slug}/focus`)}
  className='btn-secondary text-sm min-h-11 px-3'
  aria-label='Focus mode'
>
  Focus
</button>

{/* Fork Recipe button */}
{isAuthenticated && !isOwner && (
  <button
    type='button'
    onClick={() => navigate(`/recipes/${recipe.id}/fork`)}
    className='btn-secondary text-sm min-h-11 px-3'
    aria-label='Fork recipe'
  >
    Fork Recipe
  </button>
)}

{/* AFTER: */}
{/* Print button */}
<button
  type='button'
  onClick={() => globalThis.print()}
  className='btn-secondary text-sm min-h-11 px-3'
  aria-label={t('recipe.printAriaLabel')}
>
  {t('recipe.print')}
</button>

{/* Focus button */}
<button
  type='button'
  onClick={() => navigate(`/recipes/${recipe.slug}/focus`)}
  className='btn-secondary text-sm min-h-11 px-3'
  aria-label={t('recipe.focusModeAriaLabel')}
>
  {t('recipe.focusMode')}
</button>

{/* Fork Recipe button */}
{isAuthenticated && !isOwner && (
  <button
    type='button'
    onClick={() => navigate(`/recipes/${recipe.id}/fork`)}
    className='btn-secondary text-sm min-h-11 px-3'
    aria-label={t('recipe.forkAriaLabel')}
  >
    {t('recipe.fork')}
  </button>
)}
```

#### Step 3: Update OnboardingWizard.tsx

**File: `apps/web/src/components/onboarding/OnboardingWizard.tsx`**:

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../contexts/I18nContext';
import { api } from '../../api/client';

const STEPS = ['welcome', 'equipment', 'beans', 'first-brew', 'explore'] as const;

type StepProps = { t: ReturnType<typeof useTranslation>['t'] };

export function OnboardingWizard() {
  const { user: _user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [step, setStep] = useState(0);

  async function skip() {
    try {
      await api.patch('/preferences', { onboardingCompleted: true } as Record<string, unknown>);
      await refreshUser();
      navigate('/');
    } catch {
      navigate('/');
    }
  }

  async function complete() {
    try {
      await api.patch('/preferences', { onboardingCompleted: true } as Record<string, unknown>);
      await refreshUser();
      navigate('/');
    } catch {
      navigate('/');
    }
  }

  const currentStep = STEPS[step];

  return (
    <div className='mx-auto max-w-lg px-6 py-12 text-center'>
      {currentStep === 'welcome' && <WelcomeStep t={t} />}
      {currentStep === 'equipment' && <EquipmentStep t={t} />}
      {currentStep === 'beans' && <BeansStep t={t} />}
      {currentStep === 'first-brew' && <FirstBrewStep t={t} />}
      {currentStep === 'explore' && <ExploreStep t={t} />}

      <div className='mt-8 flex justify-between'>
        <button type='button' onClick={skip} className='btn-secondary'>
          {t('onboarding.skip')}
        </button>
        {step < STEPS.length - 1
          ? (
            <button
              type='button'
              onClick={() => setStep(Math.min(step + 1, STEPS.length - 1))}
              className='btn-primary'
            >
              {t('onboarding.next')}
            </button>
          )
          : (
            <button type='button' onClick={complete} className='btn-primary'>
              {t('onboarding.getStarted')}
            </button>
          )}
      </div>

      <div className='mt-6 flex justify-center gap-2'>
        {STEPS.map((_, i) => (
          <div
            key={i}
            className='w-2 h-2 rounded-full'
            style={{
              backgroundColor: i === step ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
            }}
          />
        ))}
      </div>
    </div>
  );
}

function WelcomeStep({ t }: StepProps) {
  return (
    <>
      <div className='text-6xl mb-4'>&#9749;</div>
      <h1 className='text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
        {t('onboarding.welcome')}
      </h1>
      <p className='mt-2' style={{ color: 'var(--text-secondary)' }}>
        {t('onboarding.welcomeDescription')}
      </p>
    </>
  );
}

function EquipmentStep({ t }: StepProps) {
  return (
    <>
      <div className='text-6xl mb-4'>&#128295;</div>
      <h2 className='text-xl font-bold' style={{ color: 'var(--text-primary)' }}>
        {t('onboarding.equipment')}
      </h2>
      <p className='mt-2' style={{ color: 'var(--text-secondary)' }}>
        {t('onboarding.equipmentDescription')}
      </p>
      <div className='mt-4'>
        <a href='/setups' className='btn-primary inline-block'>
          {t('onboarding.equipmentAction')}
        </a>
      </div>
    </>
  );
}

function BeansStep({ t }: StepProps) {
  return (
    <>
      <div className='text-6xl mb-4'>&#129451;</div>
      <h2 className='text-xl font-bold' style={{ color: 'var(--text-primary)' }}>
        {t('onboarding.beans')}
      </h2>
      <p className='mt-2' style={{ color: 'var(--text-secondary)' }}>
        {t('onboarding.beansDescription')}
      </p>
      <div className='mt-4'>
        <a href='/beans' className='btn-primary inline-block'>
          {t('onboarding.beansAction')}
        </a>
      </div>
    </>
  );
}

function FirstBrewStep({ t }: StepProps) {
  return (
    <>
      <div className='text-6xl mb-4'>&#128221;</div>
      <h2 className='text-xl font-bold' style={{ color: 'var(--text-primary)' }}>
        {t('onboarding.firstBrew')}
      </h2>
      <p className='mt-2' style={{ color: 'var(--text-secondary)' }}>
        {t('onboarding.firstBrewDescription')}
      </p>
      <div className='mt-4'>
        <a href='/recipes/new' className='btn-primary inline-block'>
          {t('onboarding.firstBrewAction')}
        </a>
      </div>
    </>
  );
}

function ExploreStep({ t }: StepProps) {
  return (
    <>
      <div className='text-6xl mb-4'>&#127757;</div>
      <h2 className='text-xl font-bold' style={{ color: 'var(--text-primary)' }}>
        {t('onboarding.exploreTitle')}
      </h2>
      <p className='mt-2' style={{ color: 'var(--text-secondary)' }}>
        {t('onboarding.exploreDescription')}
      </p>
      <div className='mt-4'>
        <a href='/recipes' className='btn-primary inline-block'>
          {t('onboarding.exploreAction')}
        </a>
      </div>
    </>
  );
}
```

### Verification

```bash
# Grep for hardcoded English strings in modified files (should be zero non-test results)
grep -n "'>Print<\|'>Focus<\|'>Fork Recipe<\|'>Skip<\|'>Next<\|'>Get Started" \
  apps/web/src/pages/recipes/RecipeDetailPage.tsx \
  apps/web/src/components/onboarding/OnboardingWizard.tsx

# Verify all new keys exist in both locale files
grep -c "onboarding\.\|recipe\.print\|recipe\.focusMode\|recipe\.fork" \
  packages/shared/src/i18n/en.json packages/shared/src/i18n/tr.json
```

---

## 3. H14 -- No Server-Side Content Sanitization

### Evidence

- Zero imports of DOMPurify, sanitize-html, or any sanitization library in the codebase
- `apps/api/src/modules/comment/service.ts:55-60` -- stores `effectiveContent` directly into the database via `model.create()` without any sanitization
- `apps/api/src/modules/recipe/service.ts:39` -- `createRecipe(authorId: string, data: any)` passes `data.personalNotes`, `data.preparationNotes` straight to the database
- `apps/web/src/components/recipe/CommentSection.tsx:28` -- `renderInlineMarkdown()` processes text with regex-based bold/italic/underline but does NOT strip HTML tags -- if comment content contains `<script>` or `<img onerror=...>`, the raw text is rendered into React nodes. React's JSX auto-escaping prevents XSS for plain text nodes, but the function does not guard against stored malicious content that could be consumed by other clients (RSS feeds, email notifications, API consumers).

### Impact

- Stored XSS risk if any non-React consumer renders comment/recipe data
- Zero-width character injection can create invisible spam
- Excessive whitespace wastes storage and degrades UI

### Action Plan

#### Step 1: Create server-side sanitize utility

**File: `apps/api/src/utils/sanitize.ts`** (new file):

```ts
/**
 * Server-side text sanitization utilities.
 *
 * Uses simple regex-based stripping — no external dependencies.
 * This is intentionally NOT a full HTML sanitizer (we don't allow
 * any HTML in user content). All user-generated text fields should
 * be plain text or limited markdown (bold/italic only).
 */

/** Strip all HTML tags from a string */
function stripHtmlTags(text: string): string {
  return text.replace(/<[^>]*>/g, '');
}

/** Remove zero-width and other invisible Unicode characters */
function stripZeroWidthChars(text: string): string {
  // Zero-width space, zero-width non-joiner, zero-width joiner,
  // left-to-right mark, right-to-left mark, byte order mark, soft hyphen
  return text.replace(/[​‌‍‎‏﻿­]/g, '');
}

/** Collapse runs of whitespace (preserving single newlines for markdown) */
function normalizeWhitespace(text: string): string {
  // Collapse multiple spaces/tabs into one space
  let result = text.replace(/[^\S\n]+/g, ' ');
  // Collapse 3+ consecutive newlines into 2
  result = result.replace(/\n{3,}/g, '\n\n');
  return result.trim();
}

/**
 * Sanitize user-generated text content.
 *
 * Strips HTML tags, zero-width characters, and normalizes whitespace.
 * Returns the cleaned string, or empty string for null/undefined.
 */
export function sanitizeText(input: string | null | undefined): string {
  if (!input) return '';
  let text = input;
  text = stripHtmlTags(text);
  text = stripZeroWidthChars(text);
  text = normalizeWhitespace(text);
  return text;
}

/**
 * Sanitize a username or display name.
 *
 * Same as sanitizeText but also removes newlines entirely
 * (names should be single-line).
 */
export function sanitizeName(input: string | null | undefined): string {
  if (!input) return '';
  let text = sanitizeText(input);
  text = text.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return text;
}
```

#### Step 2: Apply to comment service

**File: `apps/api/src/modules/comment/service.ts`**:

```ts
// Add import at the top:
import { sanitizeText } from '../../utils/sanitize.ts';

// In createComment(), sanitize before storing:
// BEFORE (line 20):
//   let effectiveContent = content;
// AFTER:
let effectiveContent = sanitizeText(content);

// BEFORE (line 50, the @mention prepend):
//   effectiveContent = `@${directTarget.author.username} ${content}`;
// AFTER:
effectiveContent = `@${directTarget.author.username} ${sanitizeText(content)}`;
```

#### Step 3: Apply to recipe service

**File: `apps/api/src/modules/recipe/service.ts`**:

```ts
// Add import at the top:
import { sanitizeText, sanitizeName } from '../../utils/sanitize.ts';

// In createRecipe(), sanitize before passing to DB:
// BEFORE (around line 40):
//   const slug = await generateUniqueSlug(data.title);
// AFTER:
const safeTitle = sanitizeText(data.title);
const slug = await generateUniqueSlug(safeTitle);

// In the tx.insert(recipes) call, use safeTitle:
//   title: safeTitle,

// In the tx.insert(recipeVersions) call, sanitize text fields:
//   personalNotes: sanitizeText(data.personalNotes),
//   preparationNotes: sanitizeText(data.preparationNotes),

// Apply the same pattern in updateRecipe() for the same fields.
```

#### Step 4: Apply to user service

**File: `apps/api/src/modules/user/service.ts`**:

```ts
// Add import at the top:
import { sanitizeText, sanitizeName } from '../../utils/sanitize.ts';

// In updateProfile(), sanitize before storing:
// Sanitize displayName and bio fields when they are present in the update data:
//   if (data.displayName !== undefined) data.displayName = sanitizeName(data.displayName);
//   if (data.bio !== undefined) data.bio = sanitizeText(data.bio);
```

### Verification

```bash
# Test sanitization manually
deno eval "
import { sanitizeText } from './apps/api/src/utils/sanitize.ts';
console.log(sanitizeText('<script>alert(1)</script>Hello'));    // 'alert(1)Hello'
console.log(sanitizeText('normal text'));                       // 'normal text'
console.log(sanitizeText('has​zero​width'));          // 'haszerowidth'
console.log(sanitizeText('  too   many    spaces  '));          // 'too many spaces'
"
```

---

## 4. H15 -- Search No Debounce + Pagination Bug

### Evidence

**No debounce:**
- `apps/web/src/pages/recipes/RecipeListPage.tsx:287` -- `onChange={(e) => updateFilter('search', e.target.value)}` fires on every keystroke, triggering a `useEffect` that calls `recipeApi.list()`. Typing "espresso" sends 8 API requests.
- Same pattern in `apps/web/src/pages/recipes/StarredRecipesPage.tsx:285`.

**Pagination bug:**
- `apps/web/src/api/client.ts:94` -- `return data.data as T` strips the meta wrapper. The `paginated()` helper in `apps/api/src/utils/response/index.ts:31` returns `{ data: T[], meta: { pagination: { page, perPage, total, totalPages } } }` but the frontend never sees the `meta` object.
- `RecipeListPage.tsx:142` -- `setTotal(items.length)` uses the length of the current page's array (max 12) instead of the server-provided `meta.pagination.total`.
- `RecipeListPage.tsx:197` -- `const totalPages = Math.ceil(total / 12)` always equals 1 when `total <= 12`.
- Exact same bug in `StarredRecipesPage.tsx:142` and `:195`.

### Impact

- Typing in search fires N API requests per query (no debounce)
- Pagination never shows page 2+ because `total` is always equal to `items.length` (at most 12)
- Users cannot browse beyond the first page of results

### Action Plan

#### Step 1: Create useDebounce hook

**File: `apps/web/src/hooks/useDebounce.ts`** (new file):

```ts
import { useEffect, useState } from 'react';

/**
 * Debounce a value by the specified delay.
 * Returns the debounced value, which updates only after
 * `delay` ms of inactivity.
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}
```

#### Step 2: Add `getWithMeta` to the API client

**File: `apps/web/src/api/client.ts`** -- see Step 3 in H6 above (same change). The `requestWithMeta` function returns `{ data, meta }` so list pages can access `meta.pagination.total`.

#### Step 3: Update `recipeApi.list` and `recipeApi.starred` to optionally return meta

**File: `apps/web/src/api/index.ts`**:

```ts
// Add import at top:
import type { RecipeListItem } from './types.ts';

// Replace recipeApi.list and recipeApi.starred:
export const recipeApi = {
  list: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.getWithMeta<RecipeListItem[]>(`/recipes${query}`);
  },
  starred: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.getWithMeta<RecipeListItem[]>(`/recipes/starred${query}`);
  },
  // ... rest unchanged, still use api.get
};
```

#### Step 4: Fix RecipeListPage.tsx

**File: `apps/web/src/pages/recipes/RecipeListPage.tsx`**:

```tsx
// Add import:
import { useDebounce } from '../../hooks/useDebounce.ts';

// Inside RecipeListPage(), add debounced search:
const search = searchParams.get('search') || '';
const debouncedSearch = useDebounce(search, 300);

// In the recipe-fetching useEffect, replace `search` with `debouncedSearch`
// in both the params object and the dependency array:

useEffect(() => {
  setLoading(true);
  const params: Record<string, string> = { page: String(page), perPage: '12', sortBy };
  if (brewMethod) params.brewMethod = brewMethod;
  if (drinkType) params.drinkType = drinkType;
  if (visibility && user?.isAdmin === true) params.visibility = visibility;
  if (debouncedSearch) params.search = debouncedSearch;  // <-- debouncedSearch
  if (equipmentId && isValidUuid(equipmentId)) params.equipmentId = equipmentId;
  if (mainBrewer) params.mainBrewer = mainBrewer;
  if (tasteNoteIds.length > 0) params.tasteNoteIds = tasteNoteIds.join(',');

  recipeApi.list(params).then((response) => {
    // response is now { data, meta } from getWithMeta
    const items = Array.isArray(response.data) ? response.data : [];
    setRecipes(items);
    // Use server-provided total instead of items.length
    const serverTotal = response.meta?.pagination?.total ?? items.length;
    setTotal(serverTotal);
  }).catch(() => {
  }).finally(() => setLoading(false));
}, [
  page,
  brewMethod,
  drinkType,
  visibility,
  sortBy,
  debouncedSearch,  // <-- debouncedSearch
  user,
  equipmentId,
  mainBrewer,
  tasteNoteIds,
]);
```

#### Step 5: Fix StarredRecipesPage.tsx (same pattern)

**File: `apps/web/src/pages/recipes/StarredRecipesPage.tsx`** -- apply identical changes:

```tsx
import { useDebounce } from '../../hooks/useDebounce.ts';

// Add inside StarredRecipesPage():
const debouncedSearch = useDebounce(search, 300);

// In the useEffect:
recipeApi.starred(params).then((response) => {
  const items = Array.isArray(response.data) ? response.data : [];
  setRecipes(items);
  const serverTotal = response.meta?.pagination?.total ?? items.length;
  setTotal(serverTotal);
})

// Dependency array: replace `search` with `debouncedSearch`
```

### Verification

```bash
# Test that debounce hook compiles
deno check apps/web/src/hooks/useDebounce.ts

# Verify pagination: navigate to /recipes, confirm page 2 appears when >12 recipes exist
# Verify debounce: type in search, confirm network tab shows ~1 request instead of N
```

---

## 5. M12 -- `authRateLimitMiddleware` Dead Code

### Evidence

- `apps/api/src/middleware/rateLimit.ts:57` -- `authRateLimitMiddleware()` is defined and exported
- Zero imports of `authRateLimitMiddleware` anywhere in the codebase (confirmed via `grep -rn`)
- The auth controller at `apps/api/src/modules/auth/index.ts` does not apply any rate limiting to `/register`, `/login`, or `/forgot-password` endpoints
- The middleware uses an in-memory `Map` (`loginAttempts`, line 4), which will not work on Deno Deploy (multi-instance). However, rewriting to use `CacheProvider` is deferred to Plan 01.

### Impact

- Auth endpoints have no brute-force protection beyond the global 100 req/min rate limit
- Login/register/password-reset are high-value targets that need stricter limits

### Action Plan

#### Step 1: Wire `authRateLimitMiddleware` to auth routes

**File: `apps/api/src/modules/auth/index.ts`**:

```ts
// Add import at the top:
import { authRateLimitMiddleware } from '../../middleware/rateLimit.ts';

// After `const auth = new Hono();` (line 18), add:
// Apply stricter rate limiting to all auth endpoints (5 attempts per 15 minutes per IP)
auth.use('*', authRateLimitMiddleware());
```

This wires the already-defined middleware to all auth routes (`/register`, `/login`, `/refresh`, `/forgot-password`, `/reset-password`).

**Note:** The in-memory `Map` storage is a known limitation -- it works correctly for single-instance deployments and for development. Plan 01 covers the migration to `CacheProvider` (Deno KV) for multi-instance environments.

### Verification

```bash
# Confirm the middleware is now imported
grep -n "authRateLimitMiddleware" apps/api/src/modules/auth/index.ts
# Should show both the import line and the use() line

# Confirm the middleware still works (functional test):
# Hit /auth/login 6 times rapidly and verify the 6th returns 429
```

---

## 6. M13 -- Password Strength Length-Only

### Evidence

- `packages/shared/src/schemas/auth.ts:6` -- register password: `z.string().min(8).max(128)` -- no complexity requirements
- `packages/shared/src/schemas/auth.ts:11` -- login password: `z.string()` -- no `.min()` at all, accepts empty string
- `packages/shared/src/schemas/auth.ts:26` -- reset password: `z.string().min(8).max(128)` -- same length-only as register

### Impact

- Users can register with `aaaaaaaa` (8 identical characters)
- Login accepts empty password (wastes a DB round-trip and bcrypt comparison)
- Reset password has same weak requirements as registration

### Action Plan

#### Step 1: Create a shared password validation schema

**File: `packages/shared/src/schemas/auth.ts`**:

```ts
import { z } from 'zod';

/**
 * Password complexity requirements:
 * - 8--128 characters
 * - At least one lowercase letter
 * - At least one uppercase letter
 * - At least one digit
 * - At least one special character
 */
const passwordSchema = z
  .string()
  .min(8, 'password.tooShort')
  .max(128, 'password.tooLong')
  .regex(/[a-z]/, 'password.needsLowercase')
  .regex(/[A-Z]/, 'password.needsUppercase')
  .regex(/[0-9]/, 'password.needsDigit')
  .regex(/[^a-zA-Z0-9]/, 'password.needsSpecial');

export const AuthRegisterSchema = z.object({
  email: z.email(),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/),
  password: passwordSchema,
  displayName: z.string().max(50).optional(),
});

export const AuthLoginSchema = z.object({
  email: z.email(),
  password: z.string().min(1, 'password.required'),
  rememberMe: z.boolean().optional().default(false),
});

export const AuthRefreshSchema = z.object({
  refreshToken: z.string(),
  rememberMe: z.boolean().optional().default(false),
});

export const PasswordResetSchema = z.object({
  email: z.email(),
});

export const PasswordResetConfirmSchema = z.object({
  token: z.string(),
  newPassword: passwordSchema,
});
```

#### Step 2: Add i18n keys for validation messages

**File: `packages/shared/src/i18n/en.json`** -- add:

```json
  "password.tooShort": "Password must be at least 8 characters",
  "password.tooLong": "Password must be at most 128 characters",
  "password.needsLowercase": "Password must contain at least one lowercase letter",
  "password.needsUppercase": "Password must contain at least one uppercase letter",
  "password.needsDigit": "Password must contain at least one digit",
  "password.needsSpecial": "Password must contain at least one special character",
  "password.required": "Password is required",
  "password.requiresLength": "At least 8 characters",
  "password.requiresLowercase": "One lowercase letter",
  "password.requiresUppercase": "One uppercase letter",
  "password.requiresDigit": "One number",
  "password.requiresSpecial": "One special character",
```

**File: `packages/shared/src/i18n/tr.json`** -- add:

```json
  "password.tooShort": "Sifre en az 8 karakter olmalidir",
  "password.tooLong": "Sifre en fazla 128 karakter olmalidir",
  "password.needsLowercase": "Sifre en az bir kucuk harf icermelidir",
  "password.needsUppercase": "Sifre en az bir buyuk harf icermelidir",
  "password.needsDigit": "Sifre en az bir rakam icermelidir",
  "password.needsSpecial": "Sifre en az bir ozel karakter icermelidir",
  "password.required": "Sifre gereklidir",
  "password.requiresLength": "En az 8 karakter",
  "password.requiresLowercase": "Bir kucuk harf",
  "password.requiresUppercase": "Bir buyuk harf",
  "password.requiresDigit": "Bir rakam",
  "password.requiresSpecial": "Bir ozel karakter",
```

#### Step 3: Update frontend registration form (optional UX enhancement)

**File: `apps/web/src/pages/auth/RegisterPage.tsx`** -- add a password strength indicator below the password field:

```tsx
{/* After the password input field, add: */}
{password.length > 0 && (
  <ul className='mt-1 text-xs space-y-0.5' style={{ color: 'var(--text-tertiary)' }}>
    <li style={{ color: password.length >= 8 ? 'var(--success)' : 'var(--text-tertiary)' }}>
      {password.length >= 8 ? '✓' : '○'} {t('password.requiresLength')}
    </li>
    <li style={{ color: /[a-z]/.test(password) ? 'var(--success)' : 'var(--text-tertiary)' }}>
      {/[a-z]/.test(password) ? '✓' : '○'} {t('password.requiresLowercase')}
    </li>
    <li style={{ color: /[A-Z]/.test(password) ? 'var(--success)' : 'var(--text-tertiary)' }}>
      {/[A-Z]/.test(password) ? '✓' : '○'} {t('password.requiresUppercase')}
    </li>
    <li style={{ color: /[0-9]/.test(password) ? 'var(--success)' : 'var(--text-tertiary)' }}>
      {/[0-9]/.test(password) ? '✓' : '○'} {t('password.requiresDigit')}
    </li>
    <li
      style={{
        color: /[^a-zA-Z0-9]/.test(password) ? 'var(--success)' : 'var(--text-tertiary)',
      }}
    >
      {/[^a-zA-Z0-9]/.test(password) ? '✓' : '○'} {t('password.requiresSpecial')}
    </li>
  </ul>
)}
```

### Verification

```bash
# Run schema tests to confirm validation rejects weak passwords
deno test packages/shared/

# Manual test:
# - Try registering with "aaaaaaaa" -- should fail with needsUppercase, needsDigit, needsSpecial
# - Try registering with "Abc12345!" -- should succeed
# - Try logging in with empty password -- should fail with "password.required"
```

---

## 7. M15 -- Stale Prisma References in Docs

### Evidence

10 Prisma references remain in documentation files despite the project having migrated to Drizzle ORM:

| File | Line | Reference |
|------|------|-----------|
| `docs/decisions.md` | 94 | `"services never import @prisma/client"` |
| `docs/request-lifecycle.md` | 180 | `"services never import @prisma/client"` |
| `docs/notifications.md` | 84 | `"(Prisma + migration)"` |
| `docs/requirements-audit-report.md` | 96 | `"Prisma queries"` |
| `docs/requirements-audit-report.md` | 273 | `"Prisma used as DB abstraction"` |
| `docs/requirements-audit-report.md` | 299 | `"@prisma/client"` |
| `docs/requirements-audit-report.md` | 300 | `"Deno's npm compat cannot resolve import { Prisma }"` |
| `docs/requirements-audit-report.md` | 437 | `"import { Prisma } from '@prisma/client' fails"` |
| `docs/requirements-audit-report.md` | 483 | `"Fix Prisma/Deno runtime compatibility"` |
| `docs/requirements-audit-report.md` | 484 | `"switch to a Prisma version"` |

Additionally, the **`README.md`** still describes the full Prisma stack verbatim:

| File | Reference |
|------|-----------|
| `README.md` | "Backend > Database: PostgreSQL with **Prisma ORM**" |
| `README.md` | "Available Commands: `make db-generate` — **Generate Prisma client**" |
| `README.md` | "Available Commands: `make db-studio` — **Open Prisma Studio**" |
| `README.md` | Troubleshooting section: "API container fails to start with **Prisma errors**" |
| `README.md` | "Runtime: Node.js 24" (should be Deno 2.x) |

The `Makefile` should also be verified for any lingering Prisma-specific language in target descriptions.

### Impact

- New developers reading docs will be confused about the actual ORM in use
- README is the first file any contributor reads -- an onboarding developer will try `make db-generate` expecting Prisma
- The troubleshooting section actively misleads anyone encountering runtime errors
- Onboarding documentation is misleading
- The requirements audit report lists a resolved Prisma bug (C1) as still open

### Action Plan

#### Step 1: Update `docs/decisions.md` line 94

```
BEFORE: `@prisma/client`" is enforceable simply by grepping.
AFTER:  `drizzle-orm`" is enforceable simply by grepping.
```

#### Step 2: Update `docs/request-lifecycle.md` line 180

```
BEFORE: the module's `model.ts` only — services never import `@prisma/client`
AFTER:  the module's `model.ts` only — services never import `drizzle-orm` directly
```

#### Step 3: Update `docs/notifications.md` line 84

```
BEFORE: `UserPreferences` (Prisma + migration), update the preference DTO
AFTER:  `UserPreferences` (Drizzle schema + migration), update the preference DTO
```

#### Step 4: Update `docs/requirements-audit-report.md`

Multiple edits needed:

Line 96:
```
BEFORE: `RecipeVersionPhoto` junction is included in Prisma queries but NEVER populated
AFTER:  `RecipeVersionPhoto` junction is included in Drizzle queries but NEVER populated
```

Line 273:
```
BEFORE: Prisma used as DB abstraction. No raw SQL found.
AFTER:  Drizzle ORM used as DB abstraction. No raw SQL found.
```

Lines 299--300:
```
BEFORE: `SyntaxError: The requested module '@prisma/client' does not provide an export named 'Prisma'`
        (`errorHandler.ts:3`). Deno's npm compat cannot resolve `import { Prisma } from '@prisma/client'`
AFTER:  ~~RESOLVED: Migrated from Prisma to Drizzle ORM. This error no longer applies.~~
```

Line 437:
```
BEFORE: | C1 | App container crashes at runtime: `import { Prisma } from '@prisma/client'` fails under Deno npm compat | ...
AFTER:  | ~~C1~~ | ~~RESOLVED: Migrated to Drizzle ORM. Prisma import error no longer applies.~~ | ... |
```

Lines 483--484:
```
BEFORE: 1. **Fix Prisma/Deno runtime compatibility** (C1): Change `import { Prisma } from '@prisma/client'`
           to use Prisma's error code strings directly, or switch to a Prisma version with better Deno
AFTER:  1. ~~**RESOLVED** (C1): Migrated from Prisma to Drizzle ORM. This issue no longer applies.~~
```

#### Step 5: Update `README.md`

```
Tech Stack section:
BEFORE: Node.js 24 (or any Node.js version)
AFTER:  Deno 2.x

BEFORE: PostgreSQL with Prisma ORM
AFTER:  PostgreSQL with Drizzle ORM

Available Commands section:
BEFORE: make db-generate — Generate Prisma client
AFTER:  make db-generate — Generate Drizzle schema types

BEFORE: make db-studio — Open Prisma Studio
AFTER:  make db-studio — Open Drizzle Studio

Remove the entire "API container fails to start with Prisma errors" troubleshooting section.
```

#### Step 6: Verify `Makefile`

```
Check db target descriptions for Prisma references.
If any are found, replace with Drizzle equivalents matching the README changes above.
```

### Verification

```bash
# Confirm zero Prisma references remain in docs (excluding resolved annotations)
grep -rn "prisma\|Prisma\|@prisma" docs/ | grep -v "RESOLVED\|Migrated\|no longer applies"
# Should return 0 lines

# Confirm README no longer references Prisma
grep -in "prisma\|Prisma" README.md
# Should return 0 lines

# Confirm Makefile db targets don't reference Prisma
grep -in "prisma\|Prisma" Makefile
# Should return 0 lines
```

---

## 8. N2 -- `console.log` in Production Code

### Evidence

8 `console.*` calls found in non-test API code:

| File | Line | Call |
|------|------|------|
| `apps/api/src/setup.ts` | 7 | `console.log('BrewForm Admin Setup')` |
| `apps/api/src/setup.ts` | 8 | `console.log('====================')` |
| `apps/api/src/setup.ts` | 16 | `console.log(\`Admin users already exist...\`)` |
| `apps/api/src/setup.ts` | 24 | `console.log(\`Creating admin user...\`)` |
| `apps/api/src/setup.ts` | 25 | `console.log(...)` |
| `apps/api/src/setup.ts` | 50 | `console.log(\`Admin user created...\`)` |
| `apps/api/src/setup.ts` | 54 | `console.error('Setup failed:', err)` |
| `apps/api/src/config/env.ts` | 91 | `console.error('Invalid environment variables:', ...)` |

**Note:** Zero `console.log` calls found in frontend code (`apps/web/src/`).

### Impact

- `setup.ts` is a one-shot CLI script -- `console.log` is acceptable here because it runs before the logger is initialized, but it should use a logger for consistency.
- `env.ts` uses `console.error` before the logger is available (the logger depends on the config). This is a valid edge case.

### Action Plan

#### Step 1: Replace console.log in setup.ts with createLogger

**File: `apps/api/src/setup.ts`**:

```ts
// Add import at top:
import { createLogger } from './utils/logger/index.ts';

const logger = createLogger('setup');

// Replace all console.log with logger.info:
// console.log('BrewForm Admin Setup');       -> logger.info('BrewForm Admin Setup');
// console.log('====================');        -> (remove — decorative only)
// console.log(`Admin users already exist...`) -> logger.info(`Admin users already exist (${adminCount} found). Skipping setup.`);
// console.log(`Creating admin user...`)       -> logger.info(`Creating admin user: ${username} (${email})`);
// console.log(...)                            -> logger.info(...);
// console.log(`Admin user created...`)        -> logger.info(`Admin user created: ${user.id}`);
// console.error('Setup failed:', err)         -> logger.error({ err }, 'Setup failed');
```

#### Step 2: Leave env.ts console.error as-is

The `console.error` in `apps/api/src/config/env.ts:91` runs during config validation, before the logger is available (the logger imports config). This is an acceptable bootstrapping edge case. Add a comment:

```ts
// Logger is not available here — config must be validated before logger can be initialized.
console.error('Invalid environment variables:', result.error.flatten().fieldErrors);
```

### Verification

```bash
# Confirm no more console.log/warn/info/debug in production code (excluding env.ts bootstrap)
grep -rn "console\.\(log\|warn\|info\|debug\)" apps/api/src/ --include="*.ts" | grep -v "test\." | grep -v ".test." | grep -v "env.ts"
# Should return 0 lines
```

---

## 9. N4 -- Hono Variables Type Uses `unknown`

### Evidence

**`apps/api/src/main.ts:40-41`**:
```ts
type Variables = {
  requestId: string;
  cache: CacheProvider;
  userId: string | null;
  user: unknown | null;   // <-- should be typed
};
```

**`apps/api/src/types/hono.ts:4`**:
```ts
export type AppVariables = {
  requestId: string;
  cache: CacheProvider;
  userId: string | null;
  user: unknown | null;   // <-- same issue
};
```

The `User` type from `@brewform/shared/types` defines the full user shape. Both files should reference it (minus `passwordHash` which is never set on the context).

### Impact

- Every middleware and route handler that reads `c.get('user')` gets `unknown | null`, requiring manual casts
- No autocomplete or type checking on user properties in route handlers

### Action Plan

#### Step 1: Create a context-safe user type

**File: `apps/api/src/types/hono.ts`**:

```ts
import type { CacheProvider } from '../utils/cache/index.ts';
import type { User } from '@brewform/shared/types';

/**
 * The user object stored in the Hono context.
 * Mirrors the shared User type with `preferences` made optional,
 * since not all middleware paths guarantee preferences are loaded.
 */
export type ContextUser = Omit<User, 'preferences'> & {
  preferences?: User['preferences'];
};

export type AppVariables = {
  requestId: string;
  cache: CacheProvider;
  userId: string | null;
  user: ContextUser | null;
};

export type AppEnv = {
  Variables: AppVariables;
};
```

#### Step 2: Update main.ts to use AppVariables

**File: `apps/api/src/main.ts`**:

```ts
// Remove the local Variables type definition (lines 36-41)
// Replace with import:
import type { AppEnv } from './types/hono.ts';

// BEFORE:
// type Variables = {
//   requestId: string;
//   cache: CacheProvider;
//   userId: string | null;
//   user: unknown | null;
// };
// const app = new Hono<{ Variables: Variables }>();

// AFTER:
const app = new Hono<AppEnv>();
```

### Verification

```bash
# Type check the API to confirm no new errors
cd apps/api && deno check src/main.ts

# Confirm the local Variables type is removed
grep -n "type Variables" apps/api/src/main.ts
# Should return 0 lines
```

---

## Execution Order

The issues in this plan can be addressed in any order as they are independent. However, the recommended order for maximum early value is:

| Order | ID | Reason |
|-------|-----|--------|
| 1 | H6 (Step 1--2) | Create shared types, constants, barrel exports, and API response interfaces first -- other H6 and H15 steps depend on them |
| 2 | H15 | Fixes a user-visible bug (pagination never shows page 2). **Depends on H6 Step 2** (`RecipeListItem` must be defined in `api/types.ts` before H15 Steps 3--5). |
| 3 | H6 (Steps 3--8) | Replace `any` across all frontend pages |
| 4 | H14 | Security: add server-side sanitization |
| 5 | M13 | Security: strengthen password validation |
| 6 | M12 | Security: wire auth rate limiting |
| 7 | H9 | i18n completeness |
| 8 | N4 | Type safety improvement in API |
| 9 | N2 | Console.log cleanup |
| 10 | M15 | Documentation cleanup (can be done anytime) |

---

## Files Modified (Summary)

### New Files

| File | Purpose |
|------|---------|
| `apps/web/src/api/types.ts` | Typed API response interfaces for frontend |
| `apps/web/src/hooks/useDebounce.ts` | Debounce hook for search inputs |
| `apps/api/src/utils/sanitize.ts` | Server-side text sanitization utility |

### Modified Files

| File | Changes |
|------|---------|
| `packages/shared/src/constants/brew-methods.ts` | Add `BrewMethodOption` type + `BREW_METHODS_LIST` |
| `packages/shared/src/constants/drink-types.ts` | Add `DrinkTypeOption` type + `DRINK_TYPES_LIST` |
| `packages/shared/src/constants/visibility.ts` | Add `VisibilityOption` type + `VISIBILITY_STATES_LIST` |
| `packages/shared/src/constants/emoji-tags.ts` | Add `EmojiTagOption` type + `EMOJI_TAGS_LIST` |
| `packages/shared/src/constants/index.ts` | Re-export all new `*_LIST` constants and their Option types |
| `packages/shared/src/schemas/auth.ts` | Password complexity rules + `.min(1)` on login |
| `packages/shared/src/i18n/en.json` | New keys: onboarding descriptions, password errors, aria labels |
| `packages/shared/src/i18n/tr.json` | Turkish translations for all new keys |
| `apps/web/src/api/client.ts` | Add `requestWithMeta()` + `api.getWithMeta()` |
| `apps/web/src/api/index.ts` | Use `getWithMeta` for list/starred endpoints |
| `apps/web/src/pages/recipes/RecipeDetailPage.tsx` | Replace ~14 `any` with typed interfaces, use `t()` for buttons |
| `apps/web/src/pages/recipes/RecipeCreatePage.tsx` | Replace ~19 `any` with typed constants and interfaces |
| `apps/web/src/pages/recipes/RecipeEditPage.tsx` | Replace ~16 `any` with typed constants and interfaces |
| `apps/web/src/pages/recipes/RecipeListPage.tsx` | Replace ~10 `any`, add debounce, fix pagination total |
| `apps/web/src/pages/recipes/StarredRecipesPage.tsx` | Replace ~7 `any`, add debounce, fix pagination total |
| `apps/web/src/components/onboarding/OnboardingWizard.tsx` | Replace all hardcoded English with `t()` calls |
| `apps/web/src/pages/auth/RegisterPage.tsx` | Optional: add password strength indicator |
| `apps/api/src/main.ts` | Use `AppEnv` type instead of local `Variables` |
| `apps/api/src/types/hono.ts` | Add `ContextUser` type, type `user` properly |
| `apps/api/src/modules/auth/index.ts` | Type `sanitizeUser`, wire `authRateLimitMiddleware` |
| `apps/api/src/modules/comment/service.ts` | Add `sanitizeText()` before storing comments |
| `apps/api/src/modules/recipe/service.ts` | Add `sanitizeText()` for title, notes fields |
| `apps/api/src/modules/user/service.ts` | Add `sanitizeName()`/`sanitizeText()` for profile fields |
| `apps/api/src/setup.ts` | Replace `console.log` with `createLogger` |
| `docs/decisions.md` | Prisma -> Drizzle |
| `docs/request-lifecycle.md` | Prisma -> Drizzle |
| `docs/notifications.md` | Prisma -> Drizzle |
| `docs/requirements-audit-report.md` | Mark Prisma issues as resolved, update terminology |
| `README.md` | Update stale Node.js/Prisma references in Tech Stack, Commands, Troubleshooting |
| `Makefile` | Verify and fix any Prisma-specific language in db target descriptions |
