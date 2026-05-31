# D04: Recipe Fork Button Navigates to Non-Existent Route

**Severity:** Critical — Broken Feature  
**Date:** 2026-05-29  
**Status:** Proposed  
**Module:** `apps/web/src/pages/recipes` + `apps/web/src/router.tsx`

---

## Issue Description

The "Fork Recipe" button on both `RecipeDetailPage.tsx:209` and `ForkCard.tsx:16` navigates to `/recipes/:id/fork`, but **no route is defined for this path** in `apps/web/src/router.tsx`. The user sees a 404 page.

Additionally, `RecipeDetailPage.tsx:209` uses `recipe.id` (UUID) in the URL, while `ForkCard.tsx:16` also uses `recipeId` (UUID). The fork route in the router would need to handle UUID params, but the API endpoint `POST /api/v1/recipes/:id/fork` expects the same UUID.

**Current code:**
- `RecipeDetailPage.tsx:209`: `onClick={() => navigate(`/recipes/${recipe.id}/fork`)}`
- `ForkCard.tsx:16`: `<Link to={`/recipes/${recipeId}/fork`}>`
- `router.tsx`: No matching route — falls through to `*` (NotFoundPage)

## Impact

- **Broken UX:** The fork button is completely non-functional. Authenticated non-owners who click it see a 404.
- **Wasted development:** The API endpoint `POST /api/v1/recipes/:id/fork` (`apps/api/src/modules/recipe/index.ts:308`) and service (`apps/api/src/modules/recipe/service.ts:435`) are fully implemented but unreachable from the UI.
- **ForkCard component exists** (`apps/web/src/components/recipe/ForkCard.tsx`) but its link target is broken.

## Root Cause

The fork route was never added to the router. The `ForkCard` component and detail page button were built assuming a route would exist, but the route was never wired up. The API was built separately and is functional.

## Affected Files

| File | Change |
|------|--------|
| `apps/web/src/router.tsx` | Add fork route |
| `apps/web/src/pages/recipes/RecipeForkPage.tsx` | New page component (if Option A) |
| `apps/web/src/components/recipe/ForkCard.tsx:16` | May need update depending on approach |
| `apps/web/src/pages/recipes/RecipeDetailPage.tsx:209` | May need update depending on approach |

## Fix Approach

### Option A: Create a Fork Page (Recommended)

Create a dedicated `RecipeForkPage` that:
1. Fetches the source recipe metadata (title, brew method)
2. Shows a confirmation/form with optional custom title
3. Calls `POST /api/v1/recipes/:id/fork`
4. Navigates to the new recipe's edit page

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
      navigate(`/recipes/${result.slug}/edit`);
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
      <SEOHead title={`Fork: ${sourceTitle}`} />
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

**Router update** (`apps/web/src/router.tsx`):
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

**API client update** — ensure `recipeApi.fork()` exists:
```ts
// apps/web/src/api/index.ts
fork(id: string, title?: string) {
  return client.post(`/recipes/${id}/fork`, { title });
}
```

### Option B: Inline Fork via onClick (Simpler)

Change the fork button to call the API directly and navigate to the result, without a dedicated page:

```tsx
// In RecipeDetailPage.tsx
const handleFork = async () => {
  try {
    const result = await recipeApi.fork(recipe.id);
    navigate(`/recipes/${result.slug}/edit`);
  } catch (err) {
    // Show error toast
  }
};

// Button
<button type='button' onClick={handleFork} className='btn-secondary text-sm min-h-11 px-3'>
  {t('recipe.fork')}
</button>
```

And update `ForkCard.tsx` similarly:
```tsx
<button onClick={handleFork} className='btn-secondary text-sm inline-block mb-3'>
  🍴 {t('recipe.fork')}
</button>
```

**Recommendation:** Option A is preferred because:
1. Provides a better UX (user can customize fork title before creating)
2. Handles errors gracefully with a dedicated error state
3. Follows the pattern of other creation flows (recipe create, equipment create)
4. The API already supports custom fork titles (`body.title` in `apps/api/src/modules/recipe/index.ts:327`)

## Testing Strategy

### E2E Test

```ts
it('should fork a recipe and navigate to edit page', async () => {
  // Login as user B
  // Navigate to recipe detail (owned by user A)
  // Click fork button
  // Verify fork page loads with source recipe title
  // Click "Create Fork"
  // Verify navigation to /recipes/:newSlug/edit
});
```

### Unit Tests

- `RecipeForkPage`: renders loading state, shows error on failed fetch, calls API on submit
- `ForkCard`: button triggers fork flow (if Option B)

### Verification

```bash
make check    # Type-check passes
make lint     # Lint passes
make test     # All tests pass
```

### Manual Test

1. Login as User B
2. Navigate to a public recipe owned by User A
3. Click "Fork Recipe" button
4. Verify fork page loads (or API call succeeds with Option B)
5. Verify new recipe appears in User B's recipes

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `recipeApi.fork()` client method missing | High | High | Verify and add if needed before implementation |
| Fork API returns different shape than expected | Low | Medium | Check `apps/api/src/modules/recipe/index.ts:328` response |
| Race condition if user double-clicks fork button | Low | Low | Disable button during API call |
| Private/draft source recipes cause 403 | Medium | Low | API already handles visibility check; show clear error |

## Dependencies

- `POST /api/v1/recipes/:id/fork` endpoint (already implemented)
- `recipeApi.fork()` client method (verify exists in `apps/web/src/api/index.ts`)
- `RequireAuth` component for route guard
- Reference: [Context7 — Hono routing](/websites/hono_dev)
