# D04: Recipe Fork Button Navigates to Non-Existent Route

**Severity:** Critical — Broken Feature  
**Date:** 2026-05-29  
**Status:** Proposed  
**Module:** `apps/web/src/pages/recipes` + `apps/web/src/router.tsx`

---

## Issue Description

The "Fork Recipe" button on both `RecipeDetailPage.tsx:209` and `ForkCard.tsx:16` navigates to `/recipes/:id/fork`, but **no route is defined for this path** in `apps/web/src/router.tsx`. The user sees a 404 page.

`RecipeDetailPage.tsx:209` uses `recipe.id` (UUID) in the URL, and `ForkCard.tsx:16` also uses `recipeId` (UUID). This is correct — the API endpoint `POST /api/v1/recipes/:id/fork` expects a UUID. The fork route must be registered with the `:id` param name to match the existing edit route convention.

**Current code (confirmed by codebase inspection):**

- `RecipeDetailPage.tsx:209`: `onClick={() => navigate(`/recipes/${recipe.id}/fork`)}`
- `ForkCard.tsx:16`: `<Link to={`/recipes/${recipeId}/fork`}>`
- `router.tsx`: No matching route — falls through to `*` (NotFoundPage)

## Impact

- **Broken UX:** The fork button is completely non-functional. Authenticated non-owners who click it see a 404.
- **Wasted development:** The API endpoint `POST /api/v1/recipes/:id/fork` (`apps/api/src/modules/recipe/index.ts:308`) and service (`apps/api/src/modules/recipe/service.ts:435`) are fully implemented but unreachable from the UI.
- **`recipeApi.fork()` client method also already exists** (`apps/web/src/api/index.ts`) — the entire stack is implemented except for the missing route.
- **ForkCard component exists** (`apps/web/src/components/recipe/ForkCard.tsx`) but its link target is broken.

## Root Cause

The fork route was never added to the router. The `ForkCard` component and detail page button were built assuming a route would exist, but the route was never wired up. The API, the API client, and all UI components are fully implemented.

## Affected Files

| File | Change |
|------|--------|
| `apps/web/src/router.tsx` | Add fork route (the **only required change**) |
| `apps/web/src/pages/recipes/RecipeForkPage.tsx` | New page component (Option A only) |
| `apps/web/src/components/recipe/ForkCard.tsx` | **No changes needed** — existing link resolves once route is added |
| `apps/web/src/pages/recipes/RecipeDetailPage.tsx` | **No changes needed** — existing button resolves once route is added |
| `apps/web/src/api/index.ts` | **No changes needed** — `recipeApi.fork()` already exists |

## Codebase Validation Notes

The following were verified by reading the live `main` branch before writing this plan:

- **`recipeApi.fork()` already exists** in `apps/web/src/api/index.ts`:
  ```ts
  fork: (id: string, title?: string) =>
    api.post<Record<string, unknown>>(`/recipes/${id}/fork`, { title }),
  ```
  The original plan incorrectly listed "Add `recipeApi.fork()`" as a required step. It is already implemented.

- **`RecipeForkSchema`** in `packages/shared/src/schemas/recipe.ts` is:
  ```ts
  export const RecipeForkSchema = z.object({
    title: z.string().max(200).optional(),
  });
  ```
  Title is optional (server defaults to `"Fork of <original title>"`) and capped at 200 characters.

- **Fork API response shape**: `service.forkRecipe` returns `{ ...newRecipe, versions: [...] }` where `newRecipe` includes `id` (UUID) and `slug` (generated from fork title).

- **Post-fork navigation convention**: The existing codebase uses UUID for edit URLs — `RecipeDetailPage` edit button uses `recipe.id` (UUID): `to={'/recipes/${recipe.id}/edit'}`. The fork page should follow this convention and use `result.id`, not `result.slug`.

- **`make check` for web = `deno lint`**: The web app's `check` task (`apps/web/deno.json`) runs `deno lint src/`, not TypeScript type-checking. Only the API, shared, and DB packages are type-checked by `deno check`. TypeScript errors in the web are surfaced at Vite build time (`make preview` / `make build`).

- **React Router version**: `react-router ^7.5.0` — `lazy` route pattern in the router is confirmed correct.

- **`RequireAuth` signature**: `{ children: React.ReactNode; requireAdmin?: boolean }` — used correctly in the guarded route wrapper.

- **i18n keys confirmed present**: `recipe.fork`, `recipe.forkDescription`, `recipe.forkAriaLabel` all exist in `packages/shared/src/i18n/en.json`.

- **`SEOHead` props**: Accepts `title`, `description`, `noIndex`, `canonical`. Fork page should include `noIndex` since it is a transient action page.

- **Route ordering**: Adding `recipes/:id/fork` after `recipes/:id/edit` is safe. React Router v7 uses specificity-based matching — no conflicts with existing `recipes/:slug`, `recipes/:slug/focus`, or `recipes/:slug/versions` routes.

## Fix Approach

### Option A: Create a Fork Page (Recommended)

Create a dedicated `RecipeForkPage` that:
1. Fetches the source recipe title (to pre-fill the fork name)
2. Shows a confirmation form with an optional custom title (capped at 200 chars)
3. Calls `POST /api/v1/recipes/:id/fork`
4. Navigates to the new recipe's edit page using the returned UUID (matching the edit URL convention)

**New file:** `apps/web/src/pages/recipes/RecipeForkPage.tsx`

```tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { recipeApi } from '../../api/index.ts';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';

export function RecipeForkPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [forking, setForking] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [sourceTitle, setSourceTitle] = useState('');

  useEffect(() => {
    if (!id) return;
    recipeApi.get(id).then((recipe) => {
      setSourceTitle(recipe.title);
      setTitle(`Fork of ${recipe.title}`);
    }).catch(() => {
      setError('Failed to load recipe');
    }).finally(() => setLoading(false));
  }, [id]);

  async function handleFork() {
    if (!id) return;
    setForking(true);
    setError('');
    try {
      const result = await recipeApi.fork(id, title.trim() || undefined);
      // Use result.id (UUID) to match the codebase convention for edit URLs
      navigate(`/recipes/${result.id}/edit`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fork recipe';
      setError(message);
    } finally {
      setForking(false);
    }
  }

  if (loading) {
    return <div className='mx-auto max-w-2xl px-6 py-12 text-center'>Loading...</div>;
  }

  return (
    <div className='mx-auto max-w-2xl px-6 py-8'>
      <SEOHead title={`Fork: ${sourceTitle}`} noIndex />
      <h1 className='text-2xl font-bold mb-6'>{t('recipe.fork')}</h1>

      {error && (
        <div className='mb-4 rounded p-3 text-sm' style={{ backgroundColor: 'var(--error)', color: 'white' }}>
          {error}
        </div>
      )}

      <div className='card'>
        <p className='text-sm mb-4' style={{ color: 'var(--text-secondary)' }}>
          Forking: <strong>{sourceTitle}</strong>
        </p>
        <label className='block text-sm font-medium mb-1'>Fork Title</label>
        <input
          type='text'
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          className='input-field mb-4'
        />
        <div className='flex gap-3'>
          <button onClick={handleFork} disabled={forking} className='btn-primary'>
            {forking ? 'Creating Fork...' : 'Create Fork'}
          </button>
          <button onClick={() => navigate(-1)} className='btn-secondary'>Cancel</button>
        </div>
      </div>
    </div>
  );
}
```

**Changes from original plan:**
- `navigate('/recipes/${result.slug}/edit')` → `navigate('/recipes/${result.id}/edit')` — uses UUID to match codebase convention
- `<SEOHead title={...} />` → `<SEOHead title={...} noIndex />` — prevents search indexing of a transient action page
- `<input ... />` — added `maxLength={200}` to match `RecipeForkSchema` server validation

**Router update** (`apps/web/src/router.tsx`) — add after the `recipes/:id/edit` block:

```tsx
{
  path: 'recipes/:id/fork',
  lazy: async () => {
    const { RecipeForkPage } = await import('./pages/recipes/RecipeForkPage.tsx');
    return {
      Component: function RecipeForkPageGuarded() {
        return (
          <RequireAuth>
            <RecipeForkPage />
          </RequireAuth>
        );
      },
    };
  },
},
```

**No API client changes needed.** `recipeApi.fork()` is already implemented in `apps/web/src/api/index.ts`.

### Option B: Inline Fork via onClick (Simpler)

Change the fork button to call the API directly and navigate to the result, without a dedicated page. No new file is created. Note that this means the fork action happens silently — no title customisation, no visible error state before the action completes.

```tsx
// In RecipeDetailPage.tsx — replace the existing fork button
const handleFork = async () => {
  try {
    const result = await recipeApi.fork(recipe.id) as Record<string, unknown>;
    navigate(`/recipes/${result.id}/edit`);
  } catch (err) {
    // Show error toast using your existing toast/notification system
  }
};

// Button
<button
  type='button'
  onClick={handleFork}
  className='btn-secondary text-sm min-h-11 px-3'
  aria-label={t('recipe.forkAriaLabel')}
>
  {t('recipe.fork')}
</button>
```

Update `ForkCard.tsx` similarly (convert `Link` to `button` with `onClick`):

```tsx
import { useNavigate } from 'react-router';
import { recipeApi } from '../../api/index.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';

interface Props {
  recipeId: string;
}

export function ForkCard({ recipeId }: Props) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  async function handleFork() {
    try {
      const result = await recipeApi.fork(recipeId) as Record<string, unknown>;
      navigate(`/recipes/${result.id}/edit`);
    } catch {
      // surface error
    }
  }

  return (
    <div className='card'>
      <h4 className='font-semibold mb-3' style={{ color: 'var(--text-primary)' }}>
        {t('recipe.fork')}
      </h4>
      <button onClick={handleFork} className='btn-secondary text-sm inline-block mb-3'>
        🍴 {t('recipe.fork')}
      </button>
      <p className='text-xs' style={{ color: 'var(--text-tertiary)' }}>
        {t('recipe.forkDescription')}
      </p>
    </div>
  );
}
```

**Option B affected files:**

| File | Change |
|------|--------|
| `apps/web/src/pages/recipes/RecipeDetailPage.tsx:209` | Replace `navigate` call with async `handleFork` function |
| `apps/web/src/components/recipe/ForkCard.tsx` | Convert `Link` to `button` with async `handleFork` |

**Option B does NOT require a router change.** No new route is needed.

### Recommendation

**Option A is preferred** because:

1. Provides a better UX — user can customise fork title before committing
2. Handles errors gracefully with a dedicated error state
3. Follows the pattern of other creation flows (`RecipeCreatePage`, `RecipeEditPage`)
4. The API already supports custom fork titles (`body.title` in `RecipeForkSchema`)
5. Both `RecipeDetailPage` and `ForkCard` continue working without modification

## Testing Strategy

### E2E Test

```ts
it('should fork a recipe and navigate to edit page', async () => {
  // Login as user B
  // Navigate to recipe detail (owned by user A)
  // Click fork button
  // Verify fork page loads with source recipe title pre-filled
  // (Optional) Customise the fork title
  // Click "Create Fork"
  // Verify navigation to /recipes/:newId/edit
});
```

### Unit Tests

- `RecipeForkPage`: renders loading state; shows error on failed `recipeApi.get`; submits with default title when input is unchanged; submits with custom title when input is changed; disables button during API call
- `ForkCard` (Option B only): button triggers fork flow

### Verification

```bash
make lint      # Lint passes (web + API)
make check     # Lint (web) + type-check (API, shared, db) passes
               # NOTE: make check runs `deno lint src/` for web — not TypeScript type-check.
               # TypeScript errors in the web layer surface at build time (make preview).
make test      # All tests pass
make preview   # Vite build passes — catches any TypeScript errors in web
```

### Manual Test

1. Login as User B
2. Navigate to a public recipe owned by User A
3. Click "Fork Recipe" button in the header or sidebar card
4. Verify fork page loads with source recipe title pre-filled
5. Optionally change the title
6. Click "Create Fork"
7. Verify navigation to `/recipes/:newId/edit`
8. Verify the new recipe appears as a draft in User B's recipes

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| ~~`recipeApi.fork()` client method missing~~ | ~~High~~ **Already present** | — | — |
| Fork API returns different shape than expected | Low | Medium | `result` includes `id` and `slug` from `tx.insert(recipes).returning()` — confirmed in `model.forkRecipe` |
| Race condition if user double-clicks fork button | Low | Low | Button disabled while `forking === true` |
| Private/draft source recipes cause 403 | Medium | Low | API handles visibility check; `RecipeForkPage` shows `setError(message)` |
| Very long source title causes validation error | Low | Low | `maxLength={200}` on input; server defaults title if blank |

## Dependencies

- `POST /api/v1/recipes/:id/fork` endpoint (✅ already implemented — `apps/api/src/modules/recipe/index.ts:308`)
- `recipeApi.fork()` client method (✅ already implemented — `apps/web/src/api/index.ts`)
- `RequireAuth` component for route guard (✅ confirmed signature: `{ children, requireAdmin? }`)
- i18n keys `recipe.fork`, `recipe.forkAriaLabel` (✅ confirmed present in `packages/shared/src/i18n/en.json`)