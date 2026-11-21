# recipe-collections Specification

## Purpose
TBD - created by archiving change f01-recipe-collections. Update Purpose after archive.
## Requirements
### Requirement: Database tables for collections and collection items

The system SHALL add two tables to `packages/db/src/schema.ts`:

```ts
export const collections = pgTable(
  'collection',
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
    index('collection_user_id_idx').on(table.userId),
    index('collection_visibility_idx').on(table.visibility),
    index('collection_created_at_idx').on(table.createdAt),
    index('collection_deleted_at_idx').on(table.deletedAt),
  ],
);

export const collectionItems = pgTable(
  'collection_item',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    collectionId: varchar('collection_id', { length: 36 }).notNull().references(
      () => collections.id,
      { onDelete: 'cascade' },
    ),
    recipeId: varchar('recipe_id', { length: 36 }).notNull().references(() => recipes.id),
    sortOrder: integer('sort_order').notNull().default(0),
    /** Audit timestamp — when the recipe was added to this collection. */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('collection_item_collection_id_recipe_id_unique').on(
      table.collectionId,
      table.recipeId,
    ),
    index('collection_item_collection_id_idx').on(table.collectionId),
    index('collection_item_recipe_id_idx').on(table.recipeId),
  ],
);
```

The `collection_items` table SHALL use `onDelete: 'cascade'` on `collectionId` (items die with the
collection) and NO `onDelete` on `recipeId` (default `no action` — soft-deleted recipes leave the
join row in place; the query filters via `isNull(recipes.deletedAt)`).

#### Scenario: Migration creates both tables

- **WHEN** `make db-generate && make db-migrate` runs after the schema changes
- **THEN** drizzle-kit auto-generates a new migration file (the next sequential number; the shipped migration was `0009_worthless_typhoid_mary.sql`)
- **AND** it contains `CREATE TABLE "collection" (...)` and `CREATE TABLE "collection_item" (...)`
- **AND** it creates the indexes and the composite unique constraint
- **AND** the migration is applied without errors

#### Scenario: Index assertions pass

- **WHEN** `make test-specific filter=schema-indexes.test.ts` runs
- **THEN** assertions for `collection_user_id_idx`, `collection_visibility_idx`,
  `collection_created_at_idx`, `collection_deleted_at_idx` (on `collections`) and
  `collection_item_collection_id_idx`, `collection_item_recipe_id_idx` (on `collectionItems`) pass
- **AND** the composite unique `collection_item_collection_id_recipe_id_unique` is asserted with
  `isUnique: true`

#### Scenario: createdAt audit column assertions pass

- **WHEN** `make test-specific filter=schema-columns.test.ts` runs
- **THEN** `collectionItems.createdAt` is defined, `notNull`, and has a default expression

---

### Requirement: Drizzle relations for collections

The system SHALL add these relations to `packages/db/src/schema.ts`:

```ts
export const collectionsRelations = relations(collections, ({ one, many }) => ({
  user: one(users, {
    fields: [collections.userId],
    references: [users.id],
  }),
  items: many(collectionItems),
}));

export const collectionItemsRelations = relations(collectionItems, ({ one }) => ({
  collection: one(collections, {
    fields: [collectionItems.collectionId],
    references: [collections.id],
  }),
  recipe: one(recipes, {
    fields: [collectionItems.recipeId],
    references: [recipes.id],
  }),
}));
```

The system SHALL add `collections: many(collections)` to the existing `usersRelations` block and
`collectionItems: many(collectionItems)` to the existing `recipesRelations` block. These are
additive and do not alter existing relations.

#### Scenario: Relations enable relational queries

- **WHEN** `db.query.collections.findFirst({ with: { user: true, items: { with: { recipe: true } } } })` is called
- **THEN** the result includes the owner `user` and an `items` array, each with its nested `recipe`

---

### Requirement: Shared Zod input schemas for collections

The system SHALL add `packages/shared/src/schemas/collection.ts` with:

```ts
import { z } from 'zod';
import { VISIBILITY_VALUES } from '../constants/index.ts';

const VisibilityEnum = z.enum(VISIBILITY_VALUES);

export const CollectionCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  visibility: VisibilityEnum.default('private'),
});

export const CollectionUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  visibility: VisibilityEnum.optional(),
});

export const CollectionAddRecipeSchema = z.object({
  recipeId: z.uuid(),
  sortOrder: z.number().int().min(0).optional(),
});

export const CollectionReorderSchema = z.object({
  itemIds: z.array(z.uuid()).min(1),
});

export const CollectionListFilterSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
  visibility: VisibilityEnum.optional(),
});

export type CollectionCreate = z.infer<typeof CollectionCreateSchema>;
export type CollectionUpdate = z.infer<typeof CollectionUpdateSchema>;
```

The system SHALL re-export these from `packages/shared/src/schemas/index.ts` via an
`export { ... } from './collection.ts'` block and an `export type { ... } from './collection.ts'` block.

#### Scenario: CollectionCreateSchema validates and defaults

- **WHEN** `CollectionCreateSchema.safeParse({ name: 'My V60s' })` is called
- **THEN** `result.success` is `true`
- **AND** `result.data.visibility` is `'private'`
- **AND** `result.data.description` is `undefined`

#### Scenario: CollectionCreateSchema rejects empty name

- **WHEN** `CollectionCreateSchema.safeParse({ name: '' })` is called
- **THEN** `result.success` is `false`
- **AND** `result.error.issues` includes a path containing `'name'`

#### Scenario: CollectionReorderSchema requires at least one itemId

- **WHEN** `CollectionReorderSchema.safeParse({ itemIds: [] })` is called
- **THEN** `result.success` is `false`

---

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
  author: RecipeAuthorMiniSchema,
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

---

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

/** Fetch all collection_items for a collection, with nested recipe (excluding soft-deleted recipes), ordered by sortOrder. */
export async function getItems(collectionId: string);

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
exempt unit in the `recipe-visibility` enforcement test. The `getItems` function SHALL join `recipes` and filter `isNull(recipes.deletedAt)` so
soft-deleted recipes do not appear. The `create` function uses `db.insert(collections).values(data).returning()`.
The `softDelete` function applies `isNull(collections.deletedAt)` in the WHERE to prevent double-soft-delete.

#### Scenario: findById excludes soft-deleted collections

- **WHEN** `findById('some-id')` is called for a collection with `deletedAt` set
- **THEN** the function returns `undefined`

#### Scenario: getItems excludes soft-deleted recipes

- **WHEN** a collection contains an item whose recipe has `deletedAt` set
- **AND** `getItems(collectionId)` is called
- **THEN** the soft-deleted recipe's item is NOT in the returned array

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

### Requirement: API service layer — business logic and permissions

The system SHALL create `apps/api/src/modules/collection/service.ts` with a module-scoped logger
`const logger = createLogger('collection-service')` and these functions:

```ts
/** Create a collection for the authenticated user. */
export async function createCollection(userId: string, data: CollectionCreate): Promise<CollectionDetailOutput>;

/** Update a collection. Throws 'COLLECTION_NOT_FOUND' or 'FORBIDDEN'. */
export async function updateCollection(userId: string, collectionId: string, data: CollectionUpdate): Promise<CollectionDetailOutput>;

/** Soft-delete a collection. Throws 'COLLECTION_NOT_FOUND' or 'FORBIDDEN'. */
export async function deleteCollection(userId: string, collectionId: string): Promise<void>;

/** Get a collection by ID with visibility check. Throws 'COLLECTION_NOT_FOUND' or 'FORBIDDEN'. */
export async function getCollection(userId: string | null, collectionId: string): Promise<CollectionDetailOutput>;

/** List the authenticated user's collections (paginated). */
export async function listMyCollections(userId: string, page: number, perPage: number, visibility?: string): Promise<{ collections: CollectionListItemOutput[]; total: number }>;

/** List a user's public collections (paginated). */
export async function listPublicCollections(userId: string, page: number, perPage: number): Promise<{ collections: CollectionListItemOutput[]; total: number }>;

/** Add a recipe to a collection. Throws 'COLLECTION_NOT_FOUND', 'FORBIDDEN', 'RECIPE_NOT_FOUND', or 'ALREADY_IN_COLLECTION'. */
export async function addRecipeToCollection(userId: string, collectionId: string, recipeId: string, sortOrder?: number): Promise<void>;

/** Remove a recipe from a collection. Throws 'COLLECTION_NOT_FOUND' or 'FORBIDDEN'. */
export async function removeRecipeFromCollection(userId: string, collectionId: string, recipeId: string): Promise<void>;

/** Reorder recipes in a collection. Throws 'COLLECTION_NOT_FOUND', 'FORBIDDEN', or 'REORDER_MISMATCH'. */
export async function reorderCollection(userId: string, collectionId: string, itemIds: string[]): Promise<void>;
```

Every function SHALL include `logger.debug({ relevantIds }, 'functionName started')` entry logs and
`logger.debug({ relevantIds }, 'functionName completed')` exit logs. Error logs SHALL include the
`err` object: `logger.error({ err, ...context }, 'what failed')`.

**Permission rules:**
- Mutations: `if (collection.userId !== userId) throw new Error('FORBIDDEN')`
- Reads on private/draft collections: `if (collection.userId !== userId) throw new Error('FORBIDDEN')`
- Reads on unlisted/public collections: allowed for any caller (including unauthenticated). An `unlisted` collection is reachable only through its direct link, and the list endpoints never return it to non-owners (capability `recipe-visibility`, "Collections follow the same listing rule")
- `addRecipeToCollection`: fetch recipe; `if (!recipe) throw new Error('RECIPE_NOT_FOUND')`; THEN check visibility `if (recipe.visibility !== 'public' && recipe.authorId !== userId) throw new Error('FORBIDDEN')` (null-check BEFORE property access)
- `addRecipeToCollection`: catch unique-constraint violation and throw `new Error('ALREADY_IN_COLLECTION')`. Detection SHALL use `isUniqueViolation(err, 'collection_item_collection_id_recipe_id_unique')` from `apps/api/src/utils/errors.ts`; searching `err.message` or `err.cause.message` for `unique`/`duplicate` is a violation of this requirement
- Item visibility: every `CollectionDetailOutput` returned by `getCollection`, `createCollection` and `updateCollection` SHALL contain only the items listable by the viewer as defined by the "Collection items show only recipes the viewer may list" requirement, which uses `canListRecipe` from `recipe/service.ts` (for `createCollection`/`updateCollection` the viewer is the owner). Each returned item's `recipe.forkedFromId` SHALL be masked to `null` unless its fork source is `public` and not soft-deleted, and `recipeCount` SHALL equal the number of returned items
- `reorderCollection`: the "visible set" is the items whose recipe the owner may list (`canListRecipe(recipe, ownerId)`, the same filter as the detail output). Validate that `itemIds` has no duplicates and is exactly the visible set (same size, every id belongs to it), else throw `new Error('REORDER_MISMATCH')`. Items hidden from the owner (another author's recipe that is or became unlisted, private or draft, or a soft-deleted recipe) SHALL keep their relative order and SHALL be assigned the `sortOrder` values after the visible items, in one transaction
- `removeRecipeFromCollection`: SHALL remove the item by `recipeId` whether or not the recipe is currently visible

All service failures are thrown as `Error` instances whose `message` is a stable UPPER_SNAKE code;
the route layer maps each code to its HTTP response (COLLECTION_NOT_FOUND/RECIPE_NOT_FOUND → 404
with envelope code `NOT_FOUND`, FORBIDDEN → 403, ALREADY_IN_COLLECTION → 409,
REORDER_MISMATCH → 400) rather than 500.

#### Scenario: Non-owner cannot update a collection

- **WHEN** `updateCollection('user-B', 'col-owned-by-A', { name: 'hacked' })` is called
- **THEN** the function throws `new Error('FORBIDDEN')`

#### Scenario: Non-owner cannot view a private collection

- **WHEN** `getCollection('user-B', 'private-col-owned-by-A')` is called
- **THEN** the function throws `new Error('FORBIDDEN')`

#### Scenario: Unauthenticated user can view a public collection

- **WHEN** `getCollection(null, 'public-col')` is called
- **THEN** the function returns the collection detail (no error)

#### Scenario: Adding a private recipe owned by someone else throws FORBIDDEN

- **WHEN** `addRecipeToCollection('user-A', 'col-A', 'private-recipe-owned-by-B')` is called
- **THEN** the function throws `new Error('FORBIDDEN')`

#### Scenario: Adding a recipe that is already in the collection throws ALREADY_IN_COLLECTION

- **WHEN** `addRecipeToCollection` triggers a unique-constraint violation
- **THEN** the function throws `new Error('ALREADY_IN_COLLECTION')`

#### Scenario: Reorder with wrong number of items throws REORDER_MISMATCH

- **WHEN** `reorderCollection('user-A', 'col-A', ['id-1', 'id-2'])` is called but the collection has 3 items
- **THEN** the function throws `new Error('REORDER_MISMATCH')`

#### Scenario: Reorder succeeds when the collection holds hidden items

- **WHEN** the owner's collection holds visible items `i1`, `i2` and an item `h1` whose recipe (by another author) became private or unlisted
- **AND** the owner calls `reorderCollection(ownerId, colId, ['i2', 'i1'])` (the ids the web page shows)
- **THEN** the call succeeds, `i2.sortOrder = 0`, `i1.sortOrder = 1` and `h1.sortOrder = 2`

#### Scenario: Reorder that includes a hidden item id is rejected

- **WHEN** the owner calls `reorderCollection(ownerId, colId, ['i2', 'i1', 'h1'])` for the collection above
- **THEN** the function throws `new Error('REORDER_MISMATCH')`

### Requirement: API route layer — 8 Hono routes with OpenAPI metadata

The system SHALL create `apps/api/src/modules/collection/index.ts` with a `new Hono<AppEnv>()`
instance and these routes, each preceded by `describeRoute({ tags: ['Collections'], ... })`:

| Method | Path | Auth | Middleware | Validator | Success Response |
|--------|------|------|-----------|-----------|------------------|
| `GET` | `/` | Required | `authMiddleware` | `zValidator('query', CollectionListFilterSchema)` | `paginated(c, collections, { page, perPage, total, totalPages })` |
| `GET` | `/:id` | Optional | `optionalAuthMiddleware` | none | `success(c, collection)` |
| `POST` | `/` | Required | `authMiddleware` | `zValidator('json', CollectionCreateSchema, zodValidationHook)` | `success(c, collection, 201)` |
| `PATCH` | `/:id` | Required | `authMiddleware` | `zValidator('json', CollectionUpdateSchema, zodValidationHook)` | `success(c, collection)` |
| `DELETE` | `/:id` | Required | `authMiddleware` | none | `success(c, { message: 'Collection deleted' })` |
| `POST` | `/:id/recipes` | Required | `authMiddleware` | `zValidator('json', CollectionAddRecipeSchema, zodValidationHook)` | `success(c, { message: 'Recipe added' }, 201)` |
| `DELETE` | `/:id/recipes/:recipeId` | Required | `authMiddleware` | none | `success(c, { message: 'Recipe removed' })` |
| `PATCH` | `/:id/reorder` | Required | `authMiddleware` | `zValidator('json', CollectionReorderSchema, zodValidationHook)` | `success(c, { message: 'Collection reordered' })` |

Every route's `describeRoute` SHALL include:
- `security: [{ bearerAuth: [] }]` on auth-guarded routes
- `parameters` for path params (`id`, `recipeId`) and query params (`page`, `perPage`, `visibility`)
- `requestBody: jsonRequestBody(Schema)` for POST/PATCH bodies (NOT `resolver()`)
- `responses` with `resolver(successEnvelope(XOutputSchema))` or `resolver(paginatedEnvelope(XOutputSchema))` for 2xx, and `resolver(ErrorEnvelopeSchema)` for every documented error (401 on auth routes, plus 400/403/404/409 where mapped)

The route handler SHALL catch string errors from the service and map them:
- `COLLECTION_NOT_FOUND` → `error(c, 'NOT_FOUND', 'Collection not found', 404)`
- `FORBIDDEN` → `error(c, 'FORBIDDEN', 'Not your collection', 403)` (or context-appropriate message)
- `RECIPE_NOT_FOUND` → `error(c, 'NOT_FOUND', 'Recipe not found', 404)`
- `ALREADY_IN_COLLECTION` → `error(c, 'CONFLICT', 'Recipe already in this collection', 409)`
- `REORDER_MISMATCH` → `error(c, 'BAD_REQUEST', 'Item IDs do not match collection contents', 400)`

#### Scenario: POST /collections creates a collection

- **WHEN** an authenticated user POSTs `{ name: 'My V60s', visibility: 'public' }` to `/api/v1/collections`
- **THEN** the response is 201 with `{ success: true, data: { id, userId, name, ..., items: [], recipeCount: 0 } }`

#### Scenario: GET /collections/:id returns 403 for private collection by non-owner

- **WHEN** an authenticated user requests `/api/v1/collections/<private-col-owned-by-other>`
- **THEN** the response is 403 with `{ success: false, error: { code: 'FORBIDDEN', ... } }`

#### Scenario: POST /collections/:id/recipes returns 409 for duplicate

- **WHEN** an authenticated owner POSTs `{ recipeId: 'already-added' }` to `/api/v1/collections/:id/recipes`
- **THEN** the response is 409 with `{ success: false, error: { code: 'CONFLICT', ... } }`

#### Scenario: PATCH /collections/:id/reorder reorders items

- **WHEN** the owner PATCHes `{ itemIds: ['item-2', 'item-1', 'item-3'] }` to `/api/v1/collections/:id/reorder`
- **THEN** the response is 200 with `{ success: true, data: { message: 'Collection reordered' } }`
- **AND** the items' `sortOrder` values are `0, 1, 2` matching the array order

#### Scenario: OpenAPI coverage test passes

- **WHEN** `make test-specific filter=openapi.coverage.test.ts` runs
- **THEN** all 8 collection routes are documented, tagged with `Collections`, and no orphan tags exist
- **AND** the `Collections` tag is registered in the `tags` array

---

### Requirement: Route registration and OpenAPI tag

The system SHALL register the collection module in `apps/api/src/routes/index.ts`:

```ts
import collection from '../modules/collection/index.ts';
// ...
routes.route('/api/v1/collections', collection);
```

The system SHALL add `{ name: 'Collections', description: 'User-owned named collections of recipes' }`
to the `tags` array in `apps/api/src/routes/openapi.ts`.

The system SHALL add `'/api/v1/collections'` to the `IN_SCOPE_BASE_PATHS` array in
`apps/api/src/routes/openapi.coverage.test.ts`.

#### Scenario: Collections routes are reachable

- **WHEN** a request is made to `/api/v1/collections` after the change
- **THEN** the collection router handles it (not a 404)

---

### Requirement: Frontend API client module

The system SHALL add a `collectionApi` object to `apps/web/src/api/index.ts`:

```ts
export const collectionApi = {
  list: (params?: Record<string, string>) => api.getWithMeta<PaginatedResponse<CollectionListItemOutput>>(`/collections${query}`),
  get: (id: string) => api.get<CollectionDetailOutput>(`/collections/${id}`),
  create: (data: CollectionCreate) => api.post<CollectionDetailOutput>('/collections', data),
  update: (id: string, data: CollectionUpdate) => api.patch<CollectionDetailOutput>(`/collections/${id}`, data),
  delete: (id: string) => api.delete<{ message: string }>(`/collections/${id}`),
  addRecipe: (id: string, recipeId: string) => api.post<{ message: string }>(`/collections/${id}/recipes`, { recipeId }),
  removeRecipe: (id: string, recipeId: string) => api.delete<{ message: string }>(`/collections/${id}/recipes/${recipeId}`),
  reorder: (id: string, itemIds: string[]) => api.patch<{ message: string }>(`/collections/${id}/reorder`, { itemIds }),
  listByUser: (userId: string, params?: Record<string, string>) => api.getWithMeta<PaginatedResponse<CollectionListItemOutput>>(`/users/${userId}/collections${query}`),
};
```

The `listByUser` method targets a profile-scoped endpoint. The system SHALL either (a) add a
`GET /users/:userId/collections` route to the user module that delegates to `collectionService.listPublicCollections`,
or (b) document that the `collectionApi.listByUser` call is satisfied by the existing profile
endpoint returning collections inline. **Decision: option (a)** — a dedicated
`GET /api/v1/users/:userId/collections` route (public collections only) is added to the user module
or the collection module, registered as a sub-route, and documented with `describeRoute`.

#### Scenario: collectionApi.get returns a typed CollectionDetailOutput

- **WHEN** `collectionApi.get('some-id')` is called
- **THEN** the return type is `CollectionDetailOutput` (envelope `data` auto-unwrapped)

---

### Requirement: Frontend pages and routes

The system SHALL add two routes to `apps/web/src/router.tsx`:

```tsx
{
  path: 'collections',
  element: <RequireAuth><CollectionListPage /></RequireAuth>,
  loader: collectionListLoader,
  errorElement: <RootErrorBoundary />,
},
{
  path: 'collections/:id',
  element: <CollectionDetailPage />,
  loader: collectionDetailLoader,
  errorElement: <RootErrorBoundary />,
},
```

Both pages use eager imports + separate exported `loader` functions (matching the `RecipeListPage`
and `RecipeDetailPage` routes at `router.tsx:58-63` and `router.tsx:98-103`). The `loader` functions
are exported from the page modules and attached to the route config.

`CollectionListPage` SHALL use a react-router `loader` that calls `collectionApi.list()` and returns
typed loader data. The component SHALL use `useLoaderData()`, `useAuth()`, and `useTranslation()`.
The page SHALL create a `const log = createLogger('CollectionListPage')` and add a mount/unmount
`useEffect` with `log.debug`.

`CollectionDetailPage` SHALL use a `loader` (exported from the page module and attached to the route) that calls `collectionApi.get(id)` and
maps a 404 `ApiError` to `throw new Response('Not Found', { status: 404 })` (matching
`RecipeDetailPage.tsx:66-71`). The route uses an eager import + separate `loader` export,
matching the `RecipeDetailPage` route at `router.tsx:98-103`. The page SHALL render the collection header (name, description,
visibility badge, owner link), the `CollectionRecipeList` (reorderable), and edit/delete buttons
for the owner.

#### Scenario: CollectionListPage requires auth

- **WHEN** an unauthenticated user navigates to `/collections`
- **THEN** `RequireAuth` redirects to `/login`

#### Scenario: CollectionDetailPage renders a public collection for a visitor

- **WHEN** an unauthenticated user navigates to `/collections/<public-col-id>`
- **THEN** the page renders the collection name, description, and recipe list

#### Scenario: CollectionDetailPage shows 404 for a non-existent collection

- **WHEN** `collectionApi.get(id)` throws an `ApiError` with `status === 404`
- **THEN** the loader throws `new Response('Not Found', { status: 404 })`
- **AND** the `RootErrorBoundary` renders the 404 page

---

### Requirement: Frontend components — CollectionCard, AddToCollectionModal, CollectionRecipeList

The system SHALL create `apps/web/src/components/collections/`:

**`CollectionCard.tsx`** — a `` `<Link to={\`/collections/${c.id}\`} className='card hover:shadow-lg transition-shadow'>` ``
displaying the collection name, visibility badge (🔒 private / 🌐 public), and `recipeCount`. Matches
the `RecipeCard.tsx` pattern (Tailwind + `var(--text-*)` CSS vars).

**`AddToCollectionModal.tsx`** — a hand-rolled modal (matching `BanDialog.tsx`) controlled by
`open: boolean` / `onClose: () => void` props. It lists the user's collections loaded with
`useFetcher().load('/resources/collections/mine')` when it opens (the `web-data-loading` capability;
no `useEffect` fetch and no direct API-client import), shows a checkmark for collections that already
contain the current `recipeId`, and supports inline "create new collection" (name input + visibility
dropdown defaulting to `private`). Adding, removing and creating submit an `intent` to that resource
route's action with `fetcher.submit`; the action calls `collectionApi.addRecipe`/`removeRecipe`/`create`
and returns `{ ok, error }`. On `{ ok: false }` the modal shows an error toast and rolls back its
optimistic checkmark, except that a 409 on add keeps the membership (the recipe is already there). An
optional `recipeVisibility` prop renders `t('collection.modal.hiddenRecipeNote')` under the list when
it is `draft`, `private` or `unlisted`. The modal creates a `const log = createLogger('AddToCollectionModal')`
and logs mount/render.

**`CollectionRecipeList.tsx`** — renders the collection's items ordered by `sortOrder`. Each item shows
the recipe title (as a `<Link>` to `/recipes/:slug`) and up/down arrow buttons. Clicking an arrow
optimistically reorders the local array and fires a `useFetcher` PATCH to a resource route action
(`/collections/:id/reorder`) with the new `itemIds` order; the arrows are disabled while a reorder
fetcher is pending, so reorders are serialised. A remove button submits a `remove` intent to the
collection route action (which calls `collectionApi.removeRecipe`) instead of calling the client
directly. Creates a `const log = createLogger('CollectionRecipeList')`.

The "Add to Collection" button SHALL be added to `RecipeDetailPage.tsx` action-buttons row
(lines 192-235), gated on `isAuthenticated`:

```tsx
{isAuthenticated && <AddToCollectionButton recipeId={recipe.id} recipeVisibility={recipe.visibility} />}
```

where `AddToCollectionButton` is a thin wrapper that manages the `open` state and renders
`<AddToCollectionModal>`.

#### Scenario: AddToCollectionModal shows which collections already contain the recipe

- **WHEN** the modal opens for a recipe that is already in 2 of the user's 5 collections
- **THEN** those 2 collections show a checkmark/indicator
- **AND** clicking one submits a `remove` intent to the `resources/collections/mine` action, which calls `collectionApi.removeRecipe`
- **AND** clicking an unchecked collection submits an `add` intent, which calls `collectionApi.addRecipe`

#### Scenario: AddToCollectionModal surfaces a failed add

- **WHEN** the `add` intent returns `{ ok: false, error }` with a 500
- **THEN** the checkmark rolls back and an error toast is shown
- **AND** when the failure is a 409, the checkmark stays and no error toast is shown

#### Scenario: CollectionRecipeList up-arrow reorders optimistically

- **WHEN** the user clicks the up-arrow on item at index 2
- **THEN** the local array immediately swaps items at indices 1 and 2
- **AND** a `useFetcher` PATCH is fired with the new `itemIds` order, and the arrows stay disabled until it settles
- **AND** on success, the order persists; on error, the local state rolls back

### Requirement: Collections tab on UserProfilePage

The system SHALL modify `apps/web/src/pages/users/UserProfilePage.tsx`:

1. Add `'collections'` to the `Tab` union and `ALLOWED_TABS` array
2. Add a tab button: `{ key: 'collections', label: t('user.collections') }`
3. Add a conditional fetch branch in the `loader`:
   ```ts
   } else if (tab === 'collections') {
     collectionsData = await collectionApi.listByUser(profile.id);
   }
   ```
4. Add a conditional render block (after the `recipes` block) that renders a grid of
   `<CollectionCard>` for each collection, with an empty-state message if none.

For non-self viewers, only public collections are returned by `listByUser`. For the self viewer,
all collections are returned (the `GET /users/:userId/collections` endpoint checks
`userId === requestingUserId` and calls `listMyCollections` vs `listPublicCollections`).

#### Scenario: Non-self viewer sees only public collections

- **WHEN** user B views user A's profile and clicks the Collections tab
- **THEN** only user A's `public` collections are shown

#### Scenario: Self viewer sees all their collections

- **WHEN** user A views their own profile and clicks the Collections tab
- **THEN** all of user A's collections (private, unlisted, public) are shown

---

### Requirement: i18n keys for collections

The system SHALL add these keys to BOTH `packages/shared/src/i18n/en.json` and `packages/shared/src/i18n/tr.json`:

```text
collection.list.title
collection.list.create
collection.list.noResults
collection.detail.recipes
collection.detail.noRecipes
collection.detail.addRecipe
collection.detail.reorder
collection.detail.removeFromCollection
collection.detail.edit
collection.detail.delete
collection.detail.deleteConfirm
collection.create.name
collection.create.description
collection.create.visibility
collection.create.submit
collection.create.creating
collection.modal.title
collection.modal.selectCollection
collection.modal.createNew
collection.modal.add
collection.modal.adding
collection.modal.alreadyIn
collection.modal.success
collection.visibility.private
collection.visibility.unlisted
collection.visibility.public
collection.visibility.draft
collection.moveUp
collection.moveDown
user.collections
user.noCollections
```

The Turkish (`tr.json`) values SHALL be valid Turkish translations (not English copies).

#### Scenario: All collection i18n keys resolve in both locales

- **WHEN** `t('collection.list.title', 'en')` and `t('collection.list.title', 'tr')` are called
- **THEN** both return a non-empty, non-key string (a real translation)

---

### Requirement: Seed data for collections

The system SHALL add a `seedCollections(tx, createdUsers, createdRecipes)` helper to
`packages/db/src/seed.ts` that:
- Creates 1–2 sample collections per seeded user with `visibility: 'public'`
- Adds 2–3 seeded recipes to each collection
- Gives each seeded collection a stable seed-derived name (e.g. `` `${username}'s Favourites` ``) that is used as the lookup key, so collection rows are idempotent — existing collections are selected and reused (not re-inserted) before items are added
- Is idempotent on BOTH collection rows (select-and-reuse on `(userId, name)` excluding soft-deleted rows) and collection_item rows (`onConflictDoNothing({ target: [collectionItems.collectionId, collectionItems.recipeId] })` on the composite unique key)
- Uses the select-and-reuse pattern to resolve FK IDs from the `createdUsers` and `createdRecipes` maps
- Is called from `main()` inside the `db.transaction` block after `seedRecipes`
- Does NOT break the `if (import.meta.main)` guard
- Assigns `sortOrder` **per collection**: each collection's items are numbered `0..n-1` in
  insertion order, resetting for every collection. A single function-scoped counter running
  monotonically across all collections of all users (the shipped `let collectionSortOrder = 0` at
  `seed.ts:845` consumed as `collectionSortOrder++` at `:918`) is a violation of this requirement.
- Is covered by a seed test: the seed test suite SHALL import `collections`/`collectionItems` and
  assert that every seeded collection's item `sortOrder` values are exactly `0..n-1` (the current
  `seed.idempotent.test.ts` imports many tables at `:15-39` but neither collection table and
  mentions "collection" zero times).

Because item inserts are `onConflictDoNothing`, the per-collection numbering only manifests on a
fresh database — re-seeding an existing database does not rewrite previously-inserted wrong
`sortOrder` values. The seed-test assertion therefore runs against the freshly-seeded CI database.

#### Scenario: Seed is idempotent

- **WHEN** `make db-seed` runs twice in succession
- **THEN** the second run does not error on the unique constraint
- **AND** the collection and collection_item row counts are unchanged

#### Scenario: Each collection's items start at sortOrder 0

- **WHEN** the seed runs on a fresh database
- **THEN** for every seeded collection, the item `sortOrder` values are exactly `0..n-1` (first
  item 0), with no collection starting at a carried-over global counter value

#### Scenario: Seed test locks the per-collection numbering

- **WHEN** the `@brewform/db` seed tests run via `make test` (Vitest, `DATABASE_URL` pointing at the
  freshly provisioned `brewform_test` database from `make test-db-provision`)
- **THEN** the collections seed assertion passes, and it fails if the global-counter regression is
  reintroduced

### Requirement: Structured logging in the collection module

The system SHALL create a module-scoped logger in `apps/api/src/modules/collection/service.ts`:
`const logger = createLogger('collection-service')`.

Every public service function SHALL include:
- Entry log: `logger.debug({ userId, collectionId }, 'functionName started')`
- Exit log: `logger.debug({ userId, collectionId }, 'functionName completed')`
- Error log on caught failures: `logger.error({ err, userId, collectionId }, 'functionName failed')`

Logs SHALL NOT include payloads (recipe bodies, collection descriptions) — only traceable IDs
(`userId`, `collectionId`, `recipeId`).

Frontend pages and components SHALL create `const log = createLogger('PageName')` / `createLogger('ComponentName')`
and add mount/unmount `useEffect` debug logs (pages) or render debug logs (components).

#### Scenario: Service logs entry and exit

- **WHEN** `createCollection('user-A', { name: 'My V60s' })` is called
- **THEN** a debug log `'createCollection started'` with `{ userId: 'user-A' }` is emitted
- **AND** a debug log `'createCollection completed'` with `{ userId: 'user-A', collectionId }` is emitted

---

### Requirement: Docblocks on all new public functions

Every new exported function, type, and schema in the collection feature SHALL have a JSDoc docblock
describing its purpose, parameters, and return value. This includes:
- All `model.ts` exported functions
- All `service.ts` exported functions
- The `Hono` route module's default export (brief)
- All shared Zod schemas and inferred types in `collection.ts` and `responses/collection.ts`
- The `collectionApi` object (brief)
- Frontend page and component functions (brief)

#### Scenario: All new exported functions have docblocks

- **WHEN** code is reviewed
- **THEN** `findById`, `findByUserId`, `createCollection`, `updateCollection`, `getCollection`,
  `addRecipeToCollection`, `reorderCollection`, `CollectionCreateSchema`, `CollectionDetailOutputSchema`,
  `collectionApi`, `CollectionListPage`, `CollectionDetailPage`, `CollectionCard`,
  `AddToCollectionModal`, `CollectionRecipeList` all have JSDoc docblocks

---

### Requirement: Test coverage for all new code

The system SHALL create these test files:

**Database layer:**
- Update `packages/db/src/schema-indexes.test.ts` — index assertions for both new tables
- Update `packages/db/src/schema-columns.test.ts` — `createdAt` assertions for `collectionItems`

**Shared layer:**
- `packages/shared/src/schemas/collection.test.ts` — unit tests for `CollectionCreateSchema`, `CollectionUpdateSchema`, `CollectionAddRecipeSchema`, `CollectionReorderSchema`, `CollectionListFilterSchema` (safeParse valid/invalid, defaults)
- `packages/shared/src/schemas/responses/collection.test.ts` — unit tests for `CollectionOutputSchema`, `CollectionListItemOutputSchema`, `CollectionDetailOutputSchema`, `CollectionItemOutputSchema` (using the `wire()` JSON round-trip helper)

**API layer:**
- `apps/api/src/modules/collection/model.test.ts` — Vitest DB integration tests for each model function (real PostgreSQL `brewform_test` database, `beforeEach`/`afterEach` setup/teardown, `crypto.randomUUID()` for test IDs)
- `apps/api/src/modules/collection/service.test.ts` — Vitest DB integration tests for permission checks (non-owner FORBIDDEN, private collection visibility, adding private recipe by non-owner, duplicate ALREADY_IN_COLLECTION, reorder mismatch, hidden-item filtering, hidden-item-safe reorder, cached-hit item re-check) + entry/exit log assertions
- `apps/api/src/modules/collection/index.test.ts` — route integration tests using `createTestApp(userId)` pattern (mount real router, `app.request()`, assert status + envelope shape + error codes)

**Frontend layer:**
- `apps/web/src/components/collections/CollectionCard.test.tsx`
- `apps/web/src/components/collections/AddToCollectionModal.test.tsx`
- `apps/web/src/components/collections/CollectionRecipeList.test.tsx`
- `apps/web/src/pages/collections/CollectionListPage.test.tsx`
- `apps/web/src/pages/collections/CollectionDetailPage.test.tsx`

Test coverage SHALL be ≥80% for all new code paths. Existing tests SHALL continue to pass.

#### Scenario: All tests pass

- **WHEN** `make test` runs
- **THEN** all tests pass, including the new collection tests

#### Scenario: TypeScript compiles

- **WHEN** `make check` runs
- **THEN** no type errors exist

#### Scenario: Linting passes

- **WHEN** `make lint` runs
- **THEN** no lint errors exist

#### Scenario: Formatting passes

- **WHEN** `make fmt` runs (Biome `biome check --write`), and `pnpm run fmt-check` runs in CI
- **THEN** all files are formatted to the Biome rules in `biome.json` (lineWidth 100, indentWidth 2, single quotes, semicolons) and `fmt-check` reports no diff

### Requirement: Collection reads are cache-backed with a visibility re-check on cached hits

The collection module SHALL wire read caching through the `cacheProvider` singleton import (the
`equipment/service.ts` pattern — get `:32`, set `:42`, delete `:108/:127`), directly in
`apps/api/src/modules/collection/service.ts`. No `CacheProvider` DI parameter and no
`c.get('cache')` plumbing SHALL be introduced (taste's "DI" is itself singleton-fed at
`taste/index.ts:21`; `c.get('cache')` is read nowhere in the codebase). The cache contract:

| Concern              | Choice                                                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Detail key           | `['collection-detail', id]`, TTL **10 minutes**                                                                                                 |
| Cached-hit safety    | replay the `service.ts:157-162` visibility check against the cached object (`toDetailOutput` retains `userId`/`visibility` in the cached shape) |
| Cached shape         | viewer-independent: the collection plus every item whose recipe was not soft-deleted at fill time, each item retaining its recipe's `visibility` and `authorId` |
| Item safety (both paths) | before returning, on the cache-hit AND the cache-miss path, fetch fresh state for every item's recipe AND every item's fork source with ONE `model.getRecipeVisibilityStates([...recipeIds, ...forkSourceIds])` query; drop items whose recipe is missing, soft-deleted or fails `canListRecipe(state, viewerId)`; mask `recipe.forkedFromId` to `null` when the source state fails `canListRecipe(state, null)`; recompute `recipeCount` |
| List prefix          | `['cache', 'collections', ...]`, TTL **5 minutes**                                                                                              |
| `recipeId` handling  | when `listMyCollections` is called with its optional `recipeId` param, **bypass the cache** (read through, no store)                            |
| `createCollection`   | invalidates the **list prefix only** (fresh UUID — no detail entry can exist)                                                                   |
| Other five mutations | invalidate the detail key `['collection-detail', id]` **and** `deleteByPrefix(['cache', 'collections'])`                                        |

The mutation surface is SIX functions, not five: `createCollection` (`service.ts:97`),
`updateCollection` (`:114`), `deleteCollection` (`:136`), `addRecipeToCollection` (`:255`),
`removeRecipeFromCollection` (`:297`), `reorderCollection` (`:319`). A cache hit SHALL never widen
access: a cached `private`/`draft` collection requested by a non-owner throws `FORBIDDEN` exactly
as a cache miss would, and a cached item whose recipe has since been made `unlisted`, `private` or
`draft`, or soft-deleted, SHALL NOT be returned to any viewer who may not list that recipe, on any API replica
and with either cache driver (`memory` or `redis`), without waiting for the TTL. The per-viewer
item filter SHALL run on both the cache-hit and the cache-miss paths through one shared function,
so the two paths cannot diverge.

**Reason:** D99.1 — the collection module has zero cache involvement; `getCollection` re-runs the
4-level multi-join (`collection/model.ts:9-33`) on every GET. The visibility re-check is the
load-bearing security line (design.md Decision 5, Risk 3); the `recipeId` bypass avoids a
per-(user, recipe) key with near-zero hit rate.

#### Scenario: Detail read is served from cache within TTL

- **WHEN** `getCollection` is called twice for the same public collection within 10 minutes
- **THEN** the second call returns the cached `CollectionDetailOutput` without re-running the
  model's multi-join (asserted by swapping the provider via the test hook and counting model calls)

#### Scenario: Cached hit does not widen access

- **WHEN** the owner populates the detail cache for a `private` collection and a different user
  then requests the same collection id (cache hit)
- **THEN** the service throws `new Error('FORBIDDEN')` — identical to the cache-miss behaviour of
  `service.ts:157-162`

#### Scenario: All six mutations invalidate correctly

- **WHEN** each of the six mutations runs against a collection with warm detail and list caches
- **THEN** `createCollection` deletes the list prefix only, and the other five delete
  `['collection-detail', id]` AND `deleteByPrefix(['cache', 'collections'])`, so the next read
  reflects the mutation

#### Scenario: recipeId-scoped list bypasses the cache

- **WHEN** `listMyCollections(userId, page, perPage, visibility, recipeId)` is called with
  `recipeId` set (the AddToCollectionModal membership-marks path)
- **THEN** the result is read from the database and NOT stored in the cache, and a subsequent
  no-`recipeId` list call is unaffected by it

#### Scenario: Recipe made private disappears from a warm cached detail

- **WHEN** an anonymous visitor warms the detail cache of a public collection containing public recipe R (by author X)
- **AND** X changes R's visibility to `private`
- **AND** the anonymous visitor requests the same collection within the 10-minute TTL
- **THEN** the response does not contain R, `recipeCount` is decremented, and the response is still served without re-running the multi-join `findById`

#### Scenario: Recipe made unlisted disappears from a warm cached detail

- **WHEN** an anonymous visitor warms the detail cache of a public collection containing public recipe R (by author X)
- **AND** X changes R's visibility to `unlisted`
- **AND** the anonymous visitor, and then the collection owner, request the same collection within the 10-minute TTL
- **THEN** neither response contains R, and a request by X within the TTL does contain R

#### Scenario: Fork source made unlisted is masked in a warm cached detail

- **WHEN** the detail cache of a public collection holds public recipe F, forked from public recipe P
- **AND** P's author changes P to `unlisted`
- **THEN** the next request within the TTL returns F with `recipe.forkedFromId: null`

#### Scenario: Soft-deleted recipe disappears from a warm cached detail

- **WHEN** the detail cache of a public collection containing recipe R is warm
- **AND** R is soft-deleted (by its author or an admin)
- **AND** any viewer, including R's author and the collection owner, requests the collection within the TTL
- **THEN** the response does not contain R

### Requirement: Collections containing a recipe are surfaced on the recipe detail page

The US-9 read path SHALL be completed end-to-end. `getCollectionsForRecipe`
(`apps/api/src/modules/collection/model.ts:287`) — today model-only with zero production consumers
(no service function, no route, no web API method, no page section) — SHALL gain:

1. **Model filter widening:** the hard-coded `visibility = 'public'` WHERE clause (`model.ts:304`)
   SHALL become "public + the viewer's own collections of any visibility" (an optional `userId`
   parameter). Unlisted collections of OTHER users SHALL NOT be listed (unlisted means
   direct-link-only per `visibility.ts:4`; listing them on a recipe page would leak them). The
   existing `model_test.ts:626/666/676` assertions SHALL be extended for the new parameter — not
   deleted.
2. **Service passthrough:** a visibility-filtered `collection/service.ts` function that passes the
   caller's `userId` to the model.
3. **Read surface:** either a documented GET route or a loader-fold into the recipe detail loader
   (`RecipeDetailPage.tsx:57-80` — the loader resolves the recipe first for `recipe.id`, then runs
   a `Promise.all` for taste notes + comments; the fold adds one more parallel fetch and extends
   `DetailLoaderData` at `:45-49`).
4. **UI:** an "In collections" section on `RecipeDetailPage` rendering the containing collections
   (name + link), with i18n'd heading (en+tr keys).

**Reason:** D99.5 — the archived F01 change deferred this as optional task 11.6; the function is
integration-tested but dead. The filter policy follows the codebase's listing convention
(public-only for non-owners, `service.ts:196-201`, `index.ts:573-582`).

#### Scenario: Visitor sees only public collections containing the recipe

- **WHEN** an unauthenticated user views a recipe that is in one `public` and one `unlisted`
  collection (both owned by others)
- **THEN** the "In collections" section lists only the `public` collection

#### Scenario: Viewer's own private collections are included

- **WHEN** an authenticated user views a recipe they have added to their own `private` collection
- **THEN** that private collection appears in the user's own "In collections" view alongside any
  public collections, and it does NOT appear for any other viewer

#### Scenario: Extended model tests pass

- **WHEN** `make test-api` runs `collection/model_test.ts` after the WHERE change
- **THEN** the pre-existing `getCollectionsForRecipe` assertions (`:626-676`) still pass, extended
  with the viewer-own-visibility cases

### Requirement: Collection Create, Edit, and List pages have Vitest coverage

The three untested collection pages SHALL each have a co-located test file following the
`CollectionDetailPage.test.tsx` pattern (hoisted `vi.mock` of `../../api/index.ts` with
`collectionApi` stubs + fake `ApiError`; mocked `I18nContext`/`AuthContext`/`@/utils/logger.ts`;
rendering via `createMemoryRouter` + `RouterProvider` with `HydrateFallback`;
`beforeEach(() => vi.clearAllMocks())`):

| Page | Test file | Minimum coverage |
|---|---|---|
| `apps/web/src/pages/collections/CollectionCreatePage.tsx` | `CollectionCreatePage.test.tsx` | form renders; submit calls `collectionApi.create({name, visibility, description?})` then navigates to `/collections/${created.id}` (`:33-40`); the visibility select offers all 4 options `draft/private/unlisted/public` (`:86-89` — the D99.2 regression lock) |
| `apps/web/src/pages/collections/CollectionEditPage.tsx` | `CollectionEditPage.test.tsx` | `loader` (`:19-37`) maps a 404 `ApiError` to a thrown 404 `Response`; form pre-fills from `useLoaderData` (`:46-48`); submit calls `collectionApi.update` with `description` included only when changed (`:63-70`); 4-option select (`:119-122`) |
| `apps/web/src/pages/collections/CollectionListPage.tsx` | `CollectionListPage.test.tsx` | `loader` calls `collectionApi.list()` (`:20-30`); renders title + `/collections/new` link (`:53`); empty state `collection.list.noResults` (`:61`); `CollectionCard` grid (`:66-68`) |

**Reason:** D99.6 — these three pages have no tests AND are invisible to Vitest coverage (never
imported by any test), so the gap does not even show in the coverage numbers. The F01 spec's
test-coverage requirement listed `CollectionListPage.test.tsx` but it never landed.

#### Scenario: Three new page test files exist and pass

- **WHEN** `make test-web` (`pnpm --filter @brewform/web run test`, Vitest) runs after the change
- **THEN** `CollectionCreatePage.test.tsx`, `CollectionEditPage.test.tsx`, and
  `CollectionListPage.test.tsx` all exist next to their pages and pass with zero failures

#### Scenario: Pages become visible to coverage

- **WHEN** the web coverage report is generated after the tests land
- **THEN** all three pages appear in the report with non-zero coverage (they are imported by their
  tests, closing the invisible-file gap for the collections section)

### Requirement: Collection items show only recipes the viewer may list

The collection detail SHALL include an item only when its recipe exists, is not soft-deleted (`deletedAt` is null), and passes `canListRecipe(recipe, viewerId)` for the requesting viewer: `public` recipes are visible to everyone (including anonymous visitors), while `unlisted`, `draft` and `private` recipes are visible only to the recipe's own author.

- The predicate SHALL be the single canonical listing rule `canListRecipe` from
  `apps/api/src/modules/recipe/service.ts` (capability `recipe-visibility`, "One shared listing condition
  and predicate pair decides visibility"). The collection module SHALL NOT re-implement the visibility
  comparison. `canViewRecipe` is NOT the item predicate: it lets anyone open an `unlisted` recipe by
  link, and a collection is a listing, not a link.
- Owning the collection grants no extra visibility. A collection owner does NOT see another author's
  recipe that is, or later becomes, `unlisted`, `private` or `draft`, and nobody (including the recipe's
  author and the collection owner) sees a soft-deleted recipe. The admin flag is not considered on this
  surface (matching the recipe detail route, which calls `canViewRecipe(recipe, userId)` without
  `isAdmin`).
- The filter SHALL apply to `GET /api/v1/collections/:id` and to the detail returned by
  `POST /api/v1/collections` and `PATCH /api/v1/collections/:id`.
- Returned items SHALL always carry a non-null `recipe` whose `deletedAt` is `null`, matching
  `CollectionItemOutputSchema` (whose `recipe` is non-nullable).
- Each returned item's `recipe.forkedFromId` SHALL be `null` unless the fork source is `public` and not
  soft-deleted (`recipe-visibility`, "Fork attribution never reveals a recipe the viewer could not
  list"). This is computed from the same state lookup as the item filter.
- Filtering happens in the service after the collection-level visibility check, so a
  `private`/`draft` collection still returns `403` to non-owners before any item is considered. An
  `unlisted` collection opens for anyone holding its link, with its items filtered by this rule.

#### Scenario: Soft-deleted recipe is hidden from everyone

- **WHEN** a public collection contains recipe R and R is soft-deleted
- **AND** the collection is requested anonymously, by the collection owner, and by R's author
- **THEN** none of the three responses contains R (today all three do, with R's title, slug and author)

#### Scenario: Another author's recipe made private is hidden from the collection owner

- **WHEN** user A's public collection contains user X's recipe R and X changes R to `private`
- **AND** the collection is requested anonymously and by A
- **THEN** neither response contains R
- **AND** a request by X (R's author) does contain R

#### Scenario: Owner's own draft in a public collection is visible only to the owner

- **WHEN** user A adds A's own `draft` recipe D to A's public collection
- **THEN** `GET /api/v1/collections/:id` by A contains D
- **AND** the same request anonymously or by user B does not contain D, and its `recipeCount` excludes D

#### Scenario: Another author's unlisted recipe is hidden from everyone but its author

- **WHEN** user A's public collection contains user X's recipe U, which was public when A added it, and X changes U to `unlisted`
- **AND** the collection is requested anonymously, by user B and by A (the collection owner)
- **THEN** none of the three responses contains U, and each `recipeCount` excludes U
- **AND** a request by X (U's author) contains U

#### Scenario: Owner's own unlisted recipe is visible only to the owner

- **WHEN** user A adds A's own `unlisted` recipe U to A's public collection
- **THEN** `GET /api/v1/collections/:id` by A contains U
- **AND** the same request anonymously or by user B does not contain U, even though U itself opens for them by its direct link

#### Scenario: Private collection is still forbidden before item filtering

- **WHEN** user B requests user A's `private` collection
- **THEN** the response is `403 FORBIDDEN` and no item data is returned

#### Scenario: Unlisted collection opens by link with filtered items

- **WHEN** an anonymous visitor requests user A's `unlisted` collection K, which holds one public recipe and A's own unlisted recipe
- **THEN** the response is `200` and contains only the public recipe, with `recipeCount` `1`

### Requirement: Collection recipe counts reflect only visible items

The system SHALL compute every `recipeCount` exposed by the collection API from the items the response's audience may list, never from raw `collection_item` rows.

- Detail (`GET /api/v1/collections/:id`, and create/update responses): `recipeCount` SHALL equal
  `items.length` after the per-viewer filter.
- The owner's own list (`GET /api/v1/collections`, and `GET /api/v1/users/:userId/collections` when
  the viewer is that user): `recipeCount` SHALL count items whose recipe matches
  `listableRecipeCondition(ownerId)`. That means not soft-deleted, and either `public` or authored by
  the owner.
- Public lists (`GET /api/v1/users/:userId/collections` for other viewers, and the global browse
  endpoint `GET /api/v1/collections/public`): `recipeCount` SHALL count items whose recipe matches
  `listableRecipeCondition(null)`. That means not soft-deleted and `public`, so `unlisted` items are
  not counted.
- Cached list counts may lag a recipe's visibility change by at most the list TTL (5 minutes). They
  never expose recipe identifiers.
- `containsRecipe` (the AddToCollectionModal membership flag) SHALL keep reporting raw membership,
  because the owner is looking at a recipe they can open.

#### Scenario: Public list count matches what visitors can list

- **WHEN** user A's public collection holds a public recipe, A's own draft, A's own unlisted recipe, another author's unlisted recipe and a soft-deleted recipe
- **AND** user B lists A's collections via `GET /api/v1/users/<A>/collections`
- **THEN** the collection's `recipeCount` is `1`

#### Scenario: Owner list count includes the owner's own non-public recipes

- **WHEN** user A lists A's own collections via `GET /api/v1/collections` for the same collection
- **THEN** its `recipeCount` is `3` (the public recipe, A's draft and A's unlisted recipe)

#### Scenario: Detail count equals returned items

- **WHEN** any viewer requests any collection detail
- **THEN** `recipeCount === items.length` in the response

### Requirement: Adding a non-public recipe to a shared collection keeps it hidden from other viewers

The system SHALL keep the existing add rule (a collection owner may add any non-deleted recipe they authored, of any visibility, and only `public` recipes authored by others) and SHALL make the resulting visibility explicit: an added `draft`, `private` or `unlisted` recipe stays hidden from every viewer except its author, even in a `public` or `unlisted` collection, until the author makes it `public`.

- `POST /api/v1/collections/:id/recipes` with the owner's own `draft`/`private`/`unlisted` recipe SHALL
  return `201` (unchanged). With another author's non-`public` recipe, including an `unlisted` one, it
  SHALL return `403 FORBIDDEN` (unchanged). With a soft-deleted or unknown recipe it SHALL return
  `404 NOT_FOUND` (unchanged).
- The web `AddToCollectionModal` SHALL accept the current recipe's visibility (passed from
  `RecipeDetailPage` through `AddToCollectionButton`). When it is `draft`, `private` or `unlisted`, the
  modal SHALL render an informational note under the collection list using the i18n key
  `collection.modal.hiddenRecipeNote`. The key SHALL exist in BOTH
  `packages/shared/src/i18n/en.json` ("Only you can see this recipe in your collections until you make
  it public.") and `packages/shared/src/i18n/tr.json` ("Bu tarifi herkese açık yapana kadar
  koleksiyonlarında yalnızca sen görebilirsin.").
- When the recipe later becomes `public`, it SHALL appear to other viewers of the collection on their
  next request without any further action. The per-request item state re-check applies, not the TTL.
  Becoming `unlisted` does not reveal it.

#### Scenario: Draft added to a public collection is hidden from others

- **WHEN** user A adds A's draft recipe D to A's public collection C
- **THEN** the add returns `201`
- **AND** an anonymous `GET /api/v1/collections/<C>` does not list D

#### Scenario: Making the recipe unlisted keeps it hidden

- **WHEN** A changes D's visibility to `unlisted`
- **THEN** the next anonymous `GET /api/v1/collections/<C>` still does not list D

#### Scenario: Making the recipe public reveals the item

- **WHEN** A later changes D's visibility to `public`
- **THEN** the next anonymous `GET /api/v1/collections/<C>` lists D, even if C's detail was cached

#### Scenario: Another author's unlisted recipe cannot be added

- **WHEN** user B tries to add A's unlisted recipe U to B's collection
- **THEN** the response is `403 FORBIDDEN`

#### Scenario: Modal explains the hidden state

- **WHEN** the author opens the add-to-collection modal on their own `draft`, `private` or `unlisted` recipe
- **THEN** the modal shows the `collection.modal.hiddenRecipeNote` text in the active locale
- **AND** the note is not shown for a `public` recipe

### Requirement: Collection visibility filtering has failing-first regression coverage

The system SHALL add regression tests that fail against the pre-change code before the collection filtering is implemented, and SHALL keep structured logging on every touched service function.

- `apps/api/src/modules/collection/service.test.ts` (DB-backed, `brewform_test`):
  - a soft-deleted item is hidden;
  - another author's recipe made private is hidden from the owner and from anonymous viewers, but
    shown to its author;
  - another author's recipe made unlisted is hidden from the owner, from anonymous viewers and from a
    third user, but shown to its author;
  - the owner's own draft and own unlisted recipe are hidden from others and shown to the owner;
  - `recipeCount` equals the number of items;
  - fork masking: an item that is a public fork of an unlisted source has `forkedFromId: null`;
  - cached-hit re-check after a recipe is made private, after it is made unlisted, and after a soft
    delete;
  - reorder is safe with hidden items.
- `apps/api/src/modules/collection/model.test.ts`: list `recipeCount` with owner vs anonymous
  audience, including own-unlisted and other-unlisted items; `getRecipeVisibilityStates`, including a
  soft-deleted id and an empty input.
- `apps/api/src/modules/collection/index.test.ts`:
  - anonymous `GET /api/v1/collections/:id` omits the title and slug of both a private recipe and
    another author's unlisted recipe from the JSON body;
  - unlisted collections are absent from `GET /api/v1/collections/public` and from
    `GET /api/v1/users/:userId/collections` for non-owners;
  - an unlisted collection opens by direct link.
- `apps/web/src/components/collections/AddToCollectionModal.test.tsx`: the hidden-recipe note renders
  for `draft`, `private` and `unlisted`, and not for `public`.
- `getCollection` SHALL log `logger.debug({ userId, collectionId, hiddenCount }, 'getCollection completed')`
  (counts only, never recipe titles) on both the cache-hit and cache-miss paths.

#### Scenario: Leak test fails before the fix

- **WHEN** the "soft-deleted item hidden" and "other author's unlisted item hidden" service tests run against the pre-change `getCollection`
- **THEN** both fail because the deleted and the unlisted recipes are returned

#### Scenario: Verification passes after the fix

- **WHEN** `make check`, `make lint`, `make test-api` and `make test-web` run after the change
- **THEN** all pass

