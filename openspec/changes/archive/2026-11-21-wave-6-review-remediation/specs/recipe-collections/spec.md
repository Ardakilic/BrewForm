## MODIFIED Requirements

### Requirement: API model layer — pure Drizzle data-access

The system SHALL create `apps/api/src/modules/collection/model.ts` with these functions, all using
`isNull(collections.deletedAt)` for soft-delete filtering:

```ts
/** Fetch a single collection by UUID, excluding soft-deleted rows. */
export async function findById(id: string);

/** Fetch a paginated list of a user's collections (all visibilities), with recipeCount counted for the owner as viewer. */
export async function findByUserId(userId: string, page: number, perPage: number, visibility?: Visibility, recipeId?: string);

/** Fetch a paginated list of a user's public collections only, with recipeCount counted for an anonymous viewer. */
export async function findPublicByUserId(userId: string, page: number, perPage: number);

/** Fetch all public collections across users, with recipeCount counted for an anonymous viewer. */
export async function findAllPublic(page: number, perPage: number);

/** Fetch the current visibility/author/deletion state of the given recipes (one query; used to filter collection items and mask their fork sources on every read). */
export async function getRecipeVisibilityStates(recipeIds: string[]): Promise<Array<{ id: string; visibility: Visibility; authorId: string; deletedAt: Date | null }>>;

/** Insert a new collection row and return it. */
export async function create(data: typeof collections.$inferInsert);

/** Patch a collection row with partial data. Returns the updated row or null. */
export async function update(id: string, data: Partial<typeof collections.$inferInsert>);

/** Soft-delete a collection by setting deletedAt. Returns the updated row or null. */
export async function softDelete(id: string);

/** Add a recipe to a collection with a sortOrder. Throws on unique-constraint violation. */
export async function addItem(collectionId: string, recipeId: string, sortOrder?: number);

/** Hard-delete a collection_item row. Returns true if a row was deleted. */
export async function removeItem(collectionId: string, recipeId: string);

/** Reorder all items in a collection by assigning sortOrder = index in a transaction. */
export async function reorderItems(collectionId: string, itemIds: string[]);

/** Fetch public collections that contain a given recipe (for RecipeDetailPage). */
export async function getCollectionsForRecipe(recipeId: string);
```

The `findByUserId`, `findPublicByUserId` and `findAllPublic` functions SHALL compute `recipeCount`
with one batched `db.select({ collectionId, count: count() }).from(collectionItems)` query that
`innerJoin`s `recipes` on `collectionItems.recipeId` and counts only items whose recipe the list
audience may list. The filter is the shared condition imported from `../recipe/model.ts` (capability
`recipe-visibility`): `listableRecipeCondition(userId)` for `findByUserId` (the owner's own list:
not deleted, and `public` or authored by the owner), and `listableRecipeCondition(null)` for
`findPublicByUserId` and `findAllPublic` (anonymous audience: not deleted and `public`; `unlisted`
recipes are not counted). An audience parameter on the shared count helper lets
`findPublicByUserId` count as anonymous, although it delegates to `findByUserId`. Counting raw
`collection_item` rows without the recipe join, or comparing `recipes.visibility` inline, is a
violation of this requirement. The
`getRecipeVisibilityStates` function SHALL select only `id`, `visibility`, `authorId` and `deletedAt`
from `recipes` with `inArray(recipes.id, recipeIds)` (returning `[]` without querying when the list
is empty) and SHALL deliberately NOT filter `deletedAt`, so callers can detect deletions. It is an
exempt unit in the `recipe-visibility` enforcement test. Collection items are read only through
`findById` (unfiltered) and filtered by the service with `getRecipeVisibilityStates`; the model has
no separate item-list function. The `create` function uses `db.insert(collections).values(data).returning()`.
The `softDelete` function applies `isNull(collections.deletedAt)` in the WHERE to prevent double-soft-delete.

#### Scenario: findById excludes soft-deleted collections

- **WHEN** `findById('some-id')` is called for a collection with `deletedAt` set
- **THEN** the function returns `undefined`

#### Scenario: removeItem hard-deletes the join row

- **WHEN** `removeItem(collectionId, recipeId)` is called
- **THEN** the `collection_item` row is deleted from the database (no `deletedAt` set — join tables are hard-deleted)

#### Scenario: List recipeCount excludes soft-deleted and hidden recipes

- **WHEN** a public collection holds 4 items whose recipes are public, soft-deleted, another author's private recipe and another author's unlisted recipe
- **AND** `findPublicByUserId` or `findAllPublic` returns that collection
- **THEN** its `recipeCount` is `1`

#### Scenario: Owner list counts the owner's own non-public recipes

- **WHEN** the owner's collection holds one public recipe, one draft recipe and one unlisted recipe authored by the owner, and one unlisted recipe by another author
- **AND** `findByUserId(ownerId, 1, 20)` returns that collection
- **THEN** its `recipeCount` is `3`

#### Scenario: getRecipeVisibilityStates reports deletions

- **WHEN** `getRecipeVisibilityStates([publicId, deletedId])` is called
- **THEN** it returns both rows, and the row for `deletedId` has a non-null `deletedAt`

### Requirement: Shared response Output Schemas for collections

The system SHALL add `packages/shared/src/schemas/responses/collection.ts` with schemas derived
from the actual `service.ts` return shapes:

```ts
import { z } from 'zod';
import { RecipeListItemOutputSchema } from './recipe.ts';
import { RecipeAuthorMiniSchema } from './_shared.ts';

export const CollectionOutputSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  visibility: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});
export type CollectionOutput = z.infer<typeof CollectionOutputSchema>;

export const CollectionListItemOutputSchema = CollectionOutputSchema.extend({
  recipeCount: z.number().int(),
  // Populated only when the list request carries a recipe context (`recipeId` query param on
  // `GET /api/v1/collections`) so AddToCollectionModal can initialize checkmarks and toggle
  // membership without separate detail fetches; `collectionApi.list()` accepts the recipe
  // context and passes it through.
  containsRecipe: z.boolean().optional(),
});
export type CollectionListItemOutput = z.infer<typeof CollectionListItemOutputSchema>;

export const CollectionItemOutputSchema = z.object({
  id: z.string(),
  collectionId: z.string(),
  recipeId: z.string(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
  recipe: RecipeListItemOutputSchema,
});
export type CollectionItemOutput = z.infer<typeof CollectionItemOutputSchema>;

export const CollectionDetailOutputSchema = CollectionOutputSchema.extend({
  author: RecipeAuthorMiniSchema.nullable(), // null when the owner's account was deleted (account-deletion)
  items: z.array(CollectionItemOutputSchema),
  recipeCount: z.number().int(),
});
export type CollectionDetailOutput = z.infer<typeof CollectionDetailOutputSchema>;
```

The system SHALL re-export the value schemas from `packages/shared/src/schemas/responses/index.ts`
and the inferred types from `packages/shared/src/schemas/index.ts` via explicit
`export type { ... } from './responses/collection.ts'` blocks.

#### Scenario: CollectionDetailOutputSchema parses a realistic detail payload

- **WHEN** a payload matching the `service.getCollection` return shape (with `author`, `items[]`
  each containing a nested `recipe`, and `recipeCount`) is passed through `wire()` (JSON
  round-trip) and then `CollectionDetailOutputSchema.safeParse()`
- **THEN** `result.success` is `true`
- **AND** `result.data` equals the wired payload

#### Scenario: CollectionListItemOutputSchema rejects missing recipeCount

- **WHEN** `CollectionListItemOutputSchema.safeParse({ ...collectionRow })` is called without `recipeCount`
- **THEN** `result.success` is `false`

#### Scenario: CollectionDetailOutputSchema accepts a deleted owner

- **WHEN** a detail payload whose owner account was deleted (`author: null`) is passed through `wire()` and then `CollectionDetailOutputSchema.safeParse()`
- **THEN** `result.success` is `true`
