# Fix: Display Recipe Author on HomePage Recipe Cards

## Problem
On the HomePage "Latest Recipes" and "Popular Recipes" sections, recipes show "by" but the author's name is missing. The author name should also be a clickable link to the author's profile at `/u/:username`.

## Root Cause
The backend recipe list endpoints (`GET /recipes` and `GET /recipes/starred`) use `db.select().from(recipes)` in `model.ts` which returns only flat recipe columns — no author/user data is joined. The frontend expects `recipe.author?.username` but it's always `undefined`.

The detail endpoint (`GET /recipes/:slugOrId`) already works correctly using `db.query.recipes.findFirst()` with a `with: { author: ... }` clause.

## Changes

### 1. Backend: `apps/api/src/modules/recipe/model.ts` — `findMany()`

Change the data query from `db.select().from(recipes)` to `db.query.recipes.findMany()` with a `with` clause including author data.

### 2. Backend: `apps/api/src/modules/recipe/model.ts` — `findStarred()`

Same transformation for `findStarred()`.

### 3. Frontend: `apps/web/src/pages/HomePage.tsx`

- Add `displayName` to `RecipeListItem.author` type
- Wrap author name in a `<Link to={/u/:username}>` with `stopPropagation` to prevent nested link issues
- Style with accent color and hover underline

## Side Effects
- `RecipeListPage` and `StarredRecipesPage` will automatically start showing author names since they already render `recipe.author?.displayName || recipe.author?.username`
- `getFeed` function automatically benefits since it delegates to `findMany`
