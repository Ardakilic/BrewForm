# D25 — Complete OpenAPI Documentation for All Route Modules

**Severity:** Low  
**Status:** Open  
**Files:** `apps/api/src/modules/*/index.ts` (15 modules)

---

## Issue Description

Only 3 of 18 route modules have `describeRoute()` decorators from `hono-openapi`:

| Module | Has `describeRoute` | Routes |
|--------|---------------------|--------|
| recipe | Yes | 14 routes |
| admin | Yes | 5 routes |
| auth | Yes | 9 routes |
| bean | No | — |
| badge | No | — |
| coffee-variety | No | — |
| comment | No | — |
| contact | No | — |
| equipment | No | — |
| follow | No | — |
| photo | No | — |
| preference | No | — |
| qrcode | No | — |
| report | No | — |
| setup | No | — |
| taste | No | — |
| user | No | — |
| vendor | No | — |

This means 15 modules are missing from the OpenAPI spec at `/api/v1/openapi.json`.

---

## Impact

- **Incomplete API docs:** 83% of endpoints are undocumented in the OpenAPI spec.
- **Developer experience:** Consumers cannot discover or test these endpoints via the Scalar UI.
- **Client generation:** Auto-generated API clients miss most endpoints.

---

## Root Cause

OpenAPI annotations were added to recipe, admin, and auth modules during initial development. The remaining modules were added without `describeRoute()` decorators.

---

## Affected Files

| Module | File | Route Count (approx) |
|--------|------|---------------------|
| bean | `apps/api/src/modules/bean/index.ts` | ~5 |
| badge | `apps/api/src/modules/badge/index.ts` | ~3 |
| coffee-variety | `apps/api/src/modules/coffee-variety/index.ts` | ~6 |
| comment | `apps/api/src/modules/comment/index.ts` | ~5 |
| contact | `apps/api/src/modules/contact/index.ts` | ~2 |
| equipment | `apps/api/src/modules/equipment/index.ts` | ~8 |
| follow | `apps/api/src/modules/follow/index.ts` | ~4 |
| photo | `apps/api/src/modules/photo/index.ts` | ~3 |
| preference | `apps/api/src/modules/preference/index.ts` | ~3 |
| qrcode | `apps/api/src/modules/qrcode/index.ts` | ~2 |
| report | `apps/api/src/modules/report/index.ts` | ~4 |
| setup | `apps/api/src/modules/setup/index.ts` | ~5 |
| taste | `apps/api/src/modules/taste/index.ts` | ~3 |
| user | `apps/api/src/modules/user/index.ts` | ~5 |
| vendor | `apps/api/src/modules/vendor/index.ts` | ~4 |

---

## Existing Pattern (Reference)

From `apps/api/src/modules/recipe/index.ts`:

```typescript
import { describeRoute } from 'hono-openapi';

recipe.get(
  '/',
  describeRoute({
    tags: ['Recipes'],
    summary: 'List recipes',
    description: 'Paginated, filterable list of recipes.',
    responses: { 200: { description: 'Paginated list of recipes' } },
  }),
  optionalAuthMiddleware,
  zValidator('query', RecipeFilterSchema),
  async (c) => { ... },
);
```

---

## Fix Approach

Add `describeRoute()` to every route in every module, following the existing pattern. Group by module tags:

| Module | Tag |
|--------|-----|
| bean | `Beans` |
| badge | `Badges` |
| coffee-variety | `Coffee Varieties` |
| comment | `Comments` |
| contact | `Contact` |
| equipment | `Equipment` |
| follow | `Follow` |
| photo | `Photos` |
| preference | `Preferences` |
| qrcode | `QR Codes` |
| report | `Reports` |
| setup | `Setups` |
| taste | `Taste Notes` |
| user | `Users` |
| vendor | `Vendors` |

---

## Implementation Steps

1. **List** all route files missing `describeRoute()` — confirm the 15 modules above.
2. **For each module:**
   a. Read the `index.ts` file.
   b. Import `describeRoute` from `'hono-openapi'`.
   c. Add `describeRoute({ tags: [...], summary: '...', description: '...', responses: { ... } })` to each route.
   d. Use consistent tag naming per module.
3. **Verify** OpenAPI spec:
   ```bash
   curl http://localhost:8000/api/v1/openapi.json | jq '.paths | keys | length'
   ```
   Should return the total number of endpoints (~70+).
4. **Run** `make check-api` — type-check passes.
5. **Run** `make test` — all tests pass.

---

## Testing Strategy

| Test | Expected |
|------|----------|
| `GET /api/v1/openapi.json` | Contains all 18 module tags |
| `GET /api/v1/docs` (Scalar UI) | Shows all endpoints grouped by tag |
| Endpoint count in spec | Matches actual route count |
| Existing annotated routes | Unchanged |

---

## Risk Assessment

**Risk: Low**

- Documentation-only change.
- `describeRoute` is a decorator that adds metadata — no runtime behavior change.
- Can be done incrementally per module.
- Hono-OpenAPI is already a dependency.

---

## Dependencies

- None. Can be parallelized across modules.
