## Architecture

No new tables. The merge endpoint reads two `recipeVersions` rows (with relations) and delegates
to the existing `createRecipe` service function, which handles slug generation, equipment
compatibility, brew ratio computation, and returns the full `RecipeDetailOutput` shape.

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend                                                        │
│                                                                  │
│  RecipeComparePage                                               │
│    ├── DiffHighlighter (per-field row, highlights diffs)         │
│    └── MergeSelector (radio grid → onMerge callback)             │
│           │                                                      │
│           ▼                                                      │
│    recipeApi.merge(body) ──POST──▶ /api/v1/recipes/merge         │
│           │                                                      │
│           ▼                                                      │
│    navigate(/recipes/${id}/edit)                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  API                                                             │
│                                                                  │
│  index.ts (route)                                                │
│    zValidator(RecipeMergeSchema) → service.mergeRecipes()        │
│                                                                  │
│  service.ts                                                      │
│    mergeRecipes(authorId, data)                                  │
│      ├── model.fetchRecipeVersionWithRelations(v1Id)             │
│      ├── model.fetchRecipeVersionWithRelations(v2Id)             │
│      ├── pick fields per selections                              │
│      └── createRecipe(authorId, mergedData) ──▶ existing flow    │
│                                                                  │
│  model.ts                                                        │
│    fetchRecipeVersionWithRelations(versionId)                    │
│      └── db.query.recipeVersions.findFirst({ with: {...} })      │
└─────────────────────────────────────────────────────────────────┘
```

## Decisions

### 1. Merged recipe is always a draft

The merge creates `visibility: 'draft'` so the user reviews before publishing. No extra
confirmation step needed — the edit page is the review.

### 2. Reuse `createRecipe` for the merge output

Rather than duplicating the creation transaction, `mergeRecipes` assembles a `RecipeCreateInput`
and calls the existing `createRecipe`. This inherits slug generation, equipment validation,
ratio computation, badge evaluation, and the full `RecipeDetailOutput` return shape for free.

### 3. Route placement before `/:slugOrId`

`POST /merge` must be registered before any `/:id` param routes on the recipe router to avoid
`"merge"` being captured as a path parameter.

### 4. DiffHighlighter is generic (reused by F09)

The component takes `labelKey`, `value1`, `value2`, and an optional `formatter`. It has no
recipe-specific logic. F09's version diff will import it directly.

### 5. Selections are all optional; server defaults to v1

Every field in `selections` is `.optional()`. Unselected scalar fields fall back to v1's values.
Unselected array fields (tasteNotes, equipment, preparations) default to empty. This keeps the
UI simple — the user only picks what they want to change.

### 6. "both" and "none" only for array fields

Scalar fields (brewMethod, grindSize, etc.) only accept `'v1' | 'v2'`. Array fields (tasteNotes,
equipment, additionalPreparations) additionally accept `'both'` (union, deduplicated) and `'none'`
(empty). The Zod schema enforces this via separate enum definitions.

## Risks

| Risk | Mitigation |
|------|-----------|
| `createRecipe` equipment validation rejects merged combos | Merged recipe is a draft; user can fix on edit page. Error surfaces as 400 with clear message. |
| Route shadowing by `/:slugOrId` | Register `/merge` before param routes; add route test asserting 201 (not 404). |
| Large taste note unions with `'both'` | Deduplicated via `Set`; no practical limit issue (< 100 taste notes total). |
