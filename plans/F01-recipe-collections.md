# F01 — Recipe Collections (Playlists)

> **Validation status (2026-07-04): ✅ Valid**
>
> - Net-new collections module; matches all current patterns (react-router v8 loaders, route registration via `routes.route(...)` in apps/api/src/routes/index.ts).
> - Offset pagination is fine here (both offset and cursor envelopes exist in apps/api/src/utils/response/index.ts).

## Overview

Allow users to create named collections (e.g., "Morning Pour-overs", "Espresso Experiments") that group multiple recipes. Collections can be public or private, enabling users to organize their own recipes or curate public recipes into themed playlists. Other users can discover and follow public collections.

## Goals

1. Let users organise recipes into named, reorderable collections
2. Support public/private visibility per collection
3. Allow adding any public recipe (not just the user's own) to a collection
4. Provide a browsable collection list on user profiles and a standalone collection detail page
5. Enable other users to view and clone public collections

## User Stories

| # | As a… | I want to… | So that… |
|---|-------|-----------|----------|
| US-1 | Authenticated user | Create a named collection with description and visibility | I can group related recipes |
| US-2 | Authenticated user | Add a public recipe to one of my collections | I can curate recipes I want to try later |
| US-3 | Authenticated user | Remove a recipe from a collection | I can keep my collections up to date |
| US-4 | Authenticated user | Reorder recipes within a collection | I can prioritise what to brew first |
| US-5 | Authenticated user | Edit collection name, description, visibility | I can refine my collections over time |
| US-6 | Authenticated user | Delete a collection | I can clean up collections I no longer need |
| US-7 | Visitor | View public collections on a user's profile | I can discover curated recipe lists |
| US-8 | Visitor | View a public collection detail page with all recipes | I can explore a themed set of recipes |
| US-9 | Authenticated user | See collections a recipe belongs to on RecipeDetailPage | I can discover related collections |

## Technical Design

### Database Schema (Drizzle ORM)

Add to `packages/db/src/schema.ts`:

```ts
import { pgEnum } from 'drizzle-orm/pg-core';

// Reuse existing visibilityEnum — no new enum needed

export const recipeCollections = pgTable(
  'recipe_collection',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    visibility: visibilityEnum('visibility').notNull().default('private'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('recipe_collection_user_id_idx').on(table.userId),
    index('recipe_collection_visibility_idx').on(table.visibility),
    index('recipe_collection_created_at_idx').on(table.createdAt),
    index('recipe_collection_deleted_at_idx').on(table.deletedAt),
  ],
);

export const recipeCollectionItems = pgTable(
  'recipe_collection_item',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    collectionId: varchar('collection_id', { length: 36 }).notNull().references(
      () => recipeCollections.id,
      { onDelete: 'cascade' },
    ),
    recipeId: varchar('recipe_id', { length: 36 }).notNull().references(() => recipes.id),
    sortOrder: integer('sort_order').notNull().default(0),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('recipe_collection_item_collection_id_recipe_id_unique').on(
      table.collectionId,
      table.recipeId,
    ),
    index('recipe_collection_item_collection_id_idx').on(table.collectionId),
    index('recipe_collection_item_recipe_id_idx').on(table.recipeId),
  ],
);
```

**Relations to add:**

```ts
export const usersRelations = relations(users, ({ one, many }) => ({
  // ... existing relations
  collections: many(recipeCollections),
}));

export const recipeCollectionsRelations = relations(recipeCollections, ({ one, many }) => ({
  user: one(users, {
    fields: [recipeCollections.userId],
    references: [users.id],
  }),
  items: many(recipeCollectionItems),
}));

export const recipeCollectionItemsRelations = relations(recipeCollectionItems, ({ one }) => ({
  collection: one(recipeCollections, {
    fields: [recipeCollectionItems.collectionId],
    references: [recipeCollections.id],
  }),
  recipe: one(recipes, {
    fields: [recipeCollectionItems.recipeId],
    references: [recipes.id],
  }),
}));

export const recipesRelations = relations(recipes, ({ one, many }) => ({
  // ... existing relations
  collectionItems: many(recipeCollectionItems),
}));
```

### Migration

Run `make db-generate` to produce the SQL migration from the Drizzle schema changes. **Never write manual SQL.**

### Shared Schemas

Add `packages/shared/src/schemas/collection.ts`:

```ts
import { z } from 'zod';

export const CollectionCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  visibility: z.enum(['draft', 'private', 'unlisted', 'public']).default('private'),
});

export const CollectionUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  visibility: z.enum(['draft', 'private', 'unlisted', 'public']).optional(),
});

export const CollectionAddRecipeSchema = z.object({
  recipeId: z.uuid(),
  sortOrder: z.number().int().min(0).optional(),
});

export const CollectionReorderSchema = z.object({
  itemIds: z.array(z.uuid()).min(1),
});
```

Export from `packages/shared/src/schemas/index.ts`.

### API Module: `modules/collection/`

#### `model.ts`

```ts
// Pure Drizzle data-access — no business logic.
import { db } from '@brewform/db';
import { recipeCollections, recipeCollectionItems, recipes } from '@brewform/db/schema';
import { and, asc, count, desc, eq, isNull } from 'drizzle-orm';

export async function findById(id: string) { /* ... */ }
export async function findByUserId(userId: string, page: number, perPage: number) { /* ... */ }
export async function findPublicByUserId(userId: string, page: number, perPage: number) { /* ... */ }
export async function create(data: typeof recipeCollections.$inferInsert) { /* ... */ }
export async function update(id: string, data: Partial<typeof recipeCollections.$inferInsert>) { /* ... */ }
export async function softDelete(id: string) { /* ... */ }
export async function addItem(collectionId: string, recipeId: string, sortOrder?: number) { /* ... */ }
export async function removeItem(collectionId: string, recipeId: string) { /* ... */ }
export async function reorderItems(collectionId: string, itemIds: string[]) { /* ... */ }
export async function getCollectionItems(collectionId: string) { /* ... */ }
export async function getCollectionsForRecipe(recipeId: string) { /* ... */ }
```

#### `service.ts`

```ts
// Business logic — permission checks, validation, side-effects.
import * as model from './model.ts';

export async function createCollection(userId: string, data: { name: string; description?: string; visibility: string }) { /* ... */ }
export async function updateCollection(userId: string, collectionId: string, data: { name?: string; description?: string; visibility?: string }) { /* ... */ }
export async function deleteCollection(userId: string, collectionId: string) { /* ... */ }
export async function getCollection(userId: string | null, collectionId: string) { /* ... */ }
export async function listUserCollections(userId: string, page: number, perPage: number) { /* ... */ }
export async function addRecipeToCollection(userId: string, collectionId: string, recipeId: string, sortOrder?: number) { /* ... */ }
export async function removeRecipeFromCollection(userId: string, collectionId: string, recipeId: string) { /* ... */ }
export async function reorderCollection(userId: string, collectionId: string, itemIds: string[]) { /* ... */ }
```

#### `index.ts` (Hono Routes)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/collections` | Required | List current user's collections (paginated) |
| `GET` | `/collections/:id` | Optional | Get collection detail (checks visibility) |
| `POST` | `/collections` | Required | Create a new collection |
| `PATCH` | `/collections/:id` | Required | Update collection name/description/visibility |
| `DELETE` | `/collections/:id` | Required | Soft-delete a collection |
| `POST` | `/collections/:id/recipes` | Required | Add a recipe to a collection |
| `DELETE` | `/collections/:id/recipes/:recipeId` | Required | Remove a recipe from a collection |
| `PATCH` | `/collections/:id/reorder` | Required | Reorder recipes in a collection |

Route pattern (follows `apps/api/src/modules/comment/index.ts`):

```ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  CollectionCreateSchema,
  CollectionUpdateSchema,
  CollectionAddRecipeSchema,
  CollectionReorderSchema,
} from '@brewform/shared/schemas';
import { authMiddleware, optionalAuthMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { error, isEmailVerified, paginated, success } from '../../utils/response/index.ts';
import type { AppEnv } from '../../types/hono.ts';

const collection = new Hono<AppEnv>();

collection.get('/', authMiddleware, async (c) => { /* ... */ });
collection.get('/:id', optionalAuthMiddleware, async (c) => { /* ... */ });
collection.post('/', authMiddleware, zValidator('json', CollectionCreateSchema), async (c) => { /* ... */ });
collection.patch('/:id', authMiddleware, zValidator('json', CollectionUpdateSchema), async (c) => { /* ... */ });
collection.delete('/:id', authMiddleware, async (c) => { /* ... */ });
collection.post('/:id/recipes', authMiddleware, zValidator('json', CollectionAddRecipeSchema), async (c) => { /* ... */ });
collection.delete('/:id/recipes/:recipeId', authMiddleware, async (c) => { /* ... */ });
collection.patch('/:id/reorder', authMiddleware, zValidator('json', CollectionReorderSchema), async (c) => { /* ... */ });

export default collection;
```

Register in `apps/api/src/routes/index.ts`:

```ts
import collection from '../modules/collection/index.ts';
routes.route('/api/v1/collections', collection);
```

### Frontend Components

#### New Pages

| Page | Route | Description |
|------|-------|-------------|
| `CollectionListPage` | `/collections` | List current user's collections |
| `CollectionDetailPage` | `/collections/:id` | View a collection with all recipes |

#### New Components

| Component | Location | Description |
|-----------|----------|-------------|
| `AddToCollectionModal` | `components/collection/AddToCollectionModal.tsx` | Modal to add a recipe to an existing or new collection (triggered from RecipeDetailPage) |
| `CollectionCard` | `components/collection/CollectionCard.tsx` | Card displaying collection name, recipe count, visibility badge |
| `CollectionRecipeList` | `components/collection/CollectionRecipeList.tsx` | Drag-and-drop reorderable recipe list within a collection |

#### Router Changes

Add to `apps/web/src/router.tsx`:

```tsx
{ path: 'collections', element: <RequireAuth><CollectionListPage /></RequireAuth> },
{ path: 'collections/:id', element: <CollectionDetailPage /> },
```

#### API Client

```ts
// apps/web/src/api/collections.ts (or inline usage via api.get/post/patch/delete)
api.get('/collections')                    // user's collections
api.get(`/collections/${id}`)              // single collection
api.post('/collections', { name, description, visibility })
api.patch(`/collections/${id}`, { name, description, visibility })
api.delete(`/collections/${id}`)
api.post(`/collections/${id}/recipes`, { recipeId, sortOrder })
api.delete(`/collections/${id}/recipes/${recipeId}`)
api.patch(`/collections/${id}/reorder`, { itemIds })
```

## Acceptance Criteria

- [ ] User can create a collection with name, optional description, and visibility (private by default)
- [ ] User can add any public recipe to their collection via "Add to Collection" button on RecipeDetailPage
- [ ] User can remove a recipe from a collection
- [ ] User can reorder recipes within a collection (drag-and-drop or manual sort order)
- [ ] User can edit collection name, description, and visibility
- [ ] User can soft-delete a collection
- [ ] Private collections are only visible to the owner
- [ ] Public collections are visible to all visitors on the user's profile
- [ ] Collection detail page shows all recipes with their metadata
- [ ] Collection appears on RecipeDetailPage (which collections this recipe belongs to)
- [ ] Duplicate recipe-in-collection is prevented by unique constraint
- [ ] All new queries use `isNull(deletedAt)` soft-delete pattern
- [ ] Type-check passes (`make check`)
- [ ] Lint passes (`make lint`)
- [ ] Tests pass (`make test`)

## Implementation Steps

1. Add Drizzle schema changes (`recipeCollections`, `recipeCollectionItems`, relations) to `packages/db/src/schema.ts`
2. Run `make db-generate` to create migration
3. Run `make db-migrate` to apply migration
4. Add Zod schemas to `packages/shared/src/schemas/collection.ts` and export from `index.ts`
5. Create `apps/api/src/modules/collection/model.ts` — pure data-access functions
6. Create `apps/api/src/modules/collection/service.ts` — business logic with permission checks
7. Create `apps/api/src/modules/collection/index.ts` — Hono route handlers
8. Register route in `apps/api/src/routes/index.ts`
9. Create frontend pages: `CollectionListPage.tsx`, `CollectionDetailPage.tsx`
10. Create frontend components: `AddToCollectionModal.tsx`, `CollectionCard.tsx`, `CollectionRecipeList.tsx`
11. Add routes to `apps/web/src/router.tsx`
12. Add "Add to Collection" button to `RecipeDetailPage`
13. Show collections on `UserProfilePage` (new tab or section)
14. Write tests for model, service, and API endpoints
15. Run `make check && make lint && make test`

## Dependencies

- Existing `recipes` table (for foreign key references)
- Existing `users` table (for ownership)
- Existing `visibilityEnum` (reused for collection visibility)
- Existing `authMiddleware` / `optionalAuthMiddleware`
- Existing response helpers (`success`, `error`, `paginated`)
