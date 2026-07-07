## Context

BrewForm has no named-grouping concept for recipes. The closest existing features are:

- **`userRecipeFavourites`** — a single flat boolean-style join (`user_id`, `recipe_id`, `created_at`), no ordering, no grouping, no visibility, no name. It is a "starred" flag, not a curated list.
- **`setups`** — equipment configurations, not recipe groupings.
- **`recipeVersions`** — version history of a single recipe, not a cross-recipe grouping.

Collections are a **new many-to-many between users and recipes through a named grouping entity**. The grouping entity itself has metadata (name, description, visibility) and lifecycle (soft-delete), while the join row carries ordering (`sortOrder`) and an audit timestamp (`createdAt`).

This design is scoped to **user-owned collections**. It does NOT introduce:
- collaborative/multi-user collections (a future feature)
- collection following/subscribing (a future feature)
- collection cloning (a future feature — the plan mentions it but it is deferred to keep scope tight)
- drag-and-drop reordering (deferred — up/down buttons first)

### Existing infrastructure this builds on

| Concern | Existing pattern | Where |
|---|---|---|
| Main-entity table | `recipes` (singular table, plural JS export, `id` varchar 36 + `crypto.randomUUID()`, `createdAt`/`updatedAt`/`deletedAt`, array-form table config with `index().on(...)`) | `packages/db/src/schema.ts:111-174` |
| Join table with `sortOrder` + `createdAt` | `recipeVersionPhotos` (surrogate `id` PK, composite unique, two FK indexes, `sortOrder integer default 0`, `createdAt` audit with JSDoc) | `packages/db/src/schema.ts:334-355` |
| Soft-delete query | `isNull(recipes.deletedAt)` composed via `and()` | `apps/api/src/modules/recipe/model.ts:243` |
| Permission check | `if (recipe.authorId !== authorId) throw new Error('FORBIDDEN')` — string-error, route maps to 403 | `apps/api/src/modules/recipe/service.ts:362-365` |
| Visibility enum | `visibilityEnum` (`['draft','private','unlisted','public']`) reused | `packages/db/src/schema.ts:43-45` |
| Module structure | `model.ts` → `service.ts` → `index.ts`, `import * as model from './model.ts'`, `const logger = createLogger('module-service')` | `apps/api/src/modules/recipe/` |
| OpenAPI metadata | `describeRoute({...})` + `jsonRequestBody(Schema)` for body + `resolver(successEnvelope(XOutputSchema))` for responses + `resolver(ErrorEnvelopeSchema)` for errors | `apps/api/src/modules/comment/index.ts:21-101` |
| Response helpers | `success(c, data, status)`, `paginated(c, data, {page,perPage,total,totalPages})`, `error(c, code, msg, status)` | `apps/api/src/utils/response/index.ts:14-119` |
| Frontend data fetching | react-router v8 `loader:` on route + `useLoaderData()` (NO TanStack Query) | `apps/web/src/pages/recipes/RecipeListPage.tsx:31-40` |
| Frontend modal | Hand-rolled `fixed inset-0 z-50` overlay + `card` content, controlled via `open/onClose/onConfirm/processing` | `apps/web/src/components/admin/BanDialog.tsx:28-83` |
| i18n | Custom flat-key `t(key)` from `@brewform/shared/i18n`; dot namespaces; `{placeholder}` substitution by caller | `packages/shared/src/i18n/index.ts:10-12` |

## Goals / Non-Goals

**Goals:**
- Let any authenticated user create named collections with `private`/`unlisted`/`public` visibility
- Let a user add any **public** recipe (not just their own) to their collections
- Prevent duplicate recipe-in-collection via a composite unique constraint
- Support manual reordering of recipes within a collection via `sortOrder` + up/down buttons
- Surface public collections on the owner's profile and on recipe detail pages
- Enforce visibility: private/unlisted collections only visible to the owner; public collections visible to all
- Full OpenAPI documentation for all 8 new routes
- Tests at every layer (DB schema assertions, shared schema unit tests, API model/service/route integration tests, frontend component tests)
- Structured logging with entry/exit debug logs in every service function

**Non-Goals:**
- Collaborative collections (multiple editors) — future feature
- Collection following / subscribing — future feature
- Collection cloning ("fork this collection") — mentioned in the plan, deferred
- Drag-and-drop reordering — deferred; up/down buttons ship first
- Cursor-based pagination for collections — offset is sufficient (collections are per-user, low-cardinality)
- Collection cover images / thumbnails — future polish
- Search/filter within a collection — future feature
- Bulk add multiple recipes at once — one recipe per request (matches the plan's `CollectionAddRecipeSchema`)
- Removing a recipe from ALL collections when it's soft-deleted — the join row stays; the query filters via `isNull(recipes.deletedAt)` so a restored recipe reappears

## Decisions

### 1. Table naming: `collection` (singular) + `collection_item` (singular), plural JS exports

**Choice:** DB table names `'collection'` and `'collection_item'`; JS exports `collections` and `collectionItems`.

**Rationale:** Every table in `schema.ts` uses a singular DB name (`'recipe'`, `'user'`, `'comment'`, `'recipe_taste_note'`, `'user_recipe_favourite'`) with a plural JS export (`recipes`, `users`, `comments`, `recipeTasteNotes`, `userRecipeFavourites`). The plan's `recipe_collection`/`recipe_collection_item` would break this convention. Collections are standalone entities (a user owns them), not recipe sub-tables, so the `recipe_` prefix is also inappropriate.

### 2. Reuse `visibilityEnum` — no new enum

**Choice:** The `collection.visibility` column uses the existing `visibilityEnum` (`['draft','private','unlisted','public']`).

**Rationale:**
- Single source of truth: one Postgres enum, one shared constant `VISIBILITY_VALUES`.
- Avoids a new `collectionVisibilityEnum` + new shared constant + new migration to create the enum type.
- `draft` is semantically acceptable: a collection with `visibility = 'draft'` is a hidden work-in-progress that no one but the owner can see (identical runtime behaviour to `private`, but signals "not ready to share" to the owner in the UI). The `CollectionCreateSchema` defaults to `'private'`; `draft` is accepted but not the default.
- If we later want to forbid `draft` for collections, a CHECK constraint or a Zod refinement can be added without a migration.

**Alternative considered:** A new `collectionVisibilityEnum` with only `['private','unlisted','public']`. Rejected — it adds a new enum type + shared constant for a 3-vs-4-value difference that doesn't affect correctness, and it diverges from the single-enum-for-visibility principle.

### 3. Join table: cascade on collection delete, NOT on recipe delete

**Choice:**
- `collectionItems.collectionId` → `references(() => collections.id, { onDelete: 'cascade' })` — when a collection is hard-deleted (which only happens during a real `DELETE` for cleanup; the API soft-deletes), the join rows die with it. This matches `recipeEquipment`→`recipeVersions` (`packages/db/src/schema.ts:269-272`).
- `collectionItems.recipeId` → `references(() => recipes.id)` with **no** `onDelete` option (default `no action`) — matches `userRecipeFavourites` (`packages/db/src/schema.ts:636`).

**Rationale:** Recipes are **soft-deleted** (`deletedAt` set), never hard-deleted by the application. So `onDelete` never fires for the recipe FK in practice. The join row stays when a recipe is soft-deleted; the collection-detail query filters via `isNull(recipes.deletedAt)` on the join, so soft-deleted recipes simply disappear from the collection view. If the recipe is later restored (a future admin feature), it reappears in the collection. This is the soft-delete philosophy: never destroy the join, filter at query time.

The cascade on `collectionId` is safe because the API soft-deletes collections (sets `deletedAt`), so the cascade only fires if an admin hard-deletes a collection row directly — in which case the orphaned join rows should indeed be cleaned up.

### 4. `createdAt` audit column on the join table (D43 house style)

**Choice:** `collectionItems.createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()` with JSDoc `/** Audit timestamp — when the recipe was added to this collection. */`.

**Rationale:** D43 (`wave-4-independent-fillers`) established that all join tables should have a `createdAt` audit column, and `schema-columns.test.ts` locks this with three assertions per table (column defined, `notNull`, default defined). The plan used `addedAt` — corrected to `createdAt` to match house style. The join table does NOT have `updatedAt` or `deletedAt` (join tables are hard-deleted, never updated in place — reordering updates `sortOrder` but not `updatedAt`).

### 5. `sortOrder` integer for manual reordering

**Choice:** `collectionItems.sortOrder: integer('sort_order').notNull().default(0)`, matching `recipeVersionPhotos.sortOrder` (`packages/db/src/schema.ts:344`).

**Rationale:**
- Integer sort order is the established pattern (also used by `recipeVersionPhotos`).
- The reorder endpoint (`PATCH /collections/:id/reorder`) accepts `itemIds: string[]` and the service assigns `sortOrder = index` in a transaction (one `UPDATE` per item, or a single `CASE` expression). This is simpler and less error-prone than asking the client to compute sort orders.
- New items are appended with `sortOrder = max(existing) + 1` (or `0` if empty).
- A partial index on `(collectionId, sortOrder)` is not needed — the collection-detail query orders by `sortOrder` via `orderBy: asc(collectionItems.sortOrder)` and the `collection_item_collection_id_idx` makes the per-collection scan efficient.

### 6. Pagination: offset (not cursor) for collection lists

**Choice:** `GET /collections` and `GET /collections/:id/items` (implicit, via the detail response) use offset pagination (`page`/`perPage` via `PaginationSchema`).

**Rationale:** Collections are per-user, low-cardinality (a user won't have 10,000 collections). Offset pagination is correct here and reuses `paginatedEnvelope` + `paginated()` + `PaginationSchema`. The plan validation note confirms: "Offset pagination is fine here." Cursor pagination is reserved for high-cardinality feeds (`GET /recipes`).

### 7. Permission model: owner-only for mutations, visibility-gated for reads

**Choice:**
- **Mutations** (create/update/delete/add/remove/reorder): only the collection's `userId` may perform them. Admin override is NOT supported in this version (collections are personal; admin moderation of collections is a future feature). Service throws `FORBIDDEN` if `collection.userId !== userId`.
- **Reads** (`GET /collections/:id`): `optionalAuthMiddleware`. If the collection is `public`, anyone can view. If `unlisted`, anyone with the direct link can view (same as recipes). If `private` or `draft`, only the owner (`collection.userId === userId`) can view. Service throws `FORBIDDEN` for non-owners viewing private/draft collections.
- **List own** (`GET /collections`): `authMiddleware`. Returns all the authenticated user's collections (including private/draft), paginated.
- **List by user** (`GET /users/:username` profile, collections tab): returns only `public` collections for non-self viewers; all collections for the self viewer. (This is enforced in the `collectionApi.listByUser` call's response filtering or a dedicated `findPublicByUserId` model function.)

**Rationale:** This mirrors the recipe visibility model (`forkRecipe` checks `visibility === 'draft' || 'private'` → `FORBIDDEN` for non-authors, `apps/api/src/modules/recipe/service.ts:383-401`). The string-error pattern (`throw new Error('COLLECTION_NOT_FOUND')`, `throw new Error('FORBIDDEN')`) is used throughout; the route layer maps to HTTP status codes (404, 403).

**Security note:** For `GET /collections/:id` on a private/draft collection by a non-owner, the service returns `FORBIDDEN` (not `NOT_FOUND`) — this leaks the existence of the collection. This matches the recipe module's behaviour (recipe `deleteRecipe` throws `RECIPE_NOT_FOUND` only if the row doesn't exist, `FORBIDDEN` if it exists but isn't owned). To avoid existence-leak, the service could return `NOT_FOUND` for both cases — but this diverges from the established pattern. The spec follows the established pattern (distinct 404/403) for consistency; a future hardening change can unify them if needed.

### 8. Adding a recipe: only `public` recipes can be added by non-owners

**Choice:** `addRecipeToCollection` checks: if the recipe's `visibility !== 'public'` AND `recipe.authorId !== userId`, throw `FORBIDDEN`. The owner of a recipe can add their own `private`/`unlisted`/`draft` recipe to their own collection. A non-owner can only add `public` recipes.

**Rationale:** This matches US-2 ("Add any public recipe to my collection") and prevents a user from adding another user's private recipe to a public collection (which would leak it). The check happens in the service layer after fetching the recipe via `recipeModel.findById`.

### 9. Reordering: `itemIds: string[]` array, service assigns `sortOrder = index`

**Choice:** `CollectionReorderSchema = z.object({ itemIds: z.array(z.uuid()).min(1) })`. The service validates that all `itemIds` belong to the collection, then updates each item's `sortOrder` to its array index inside a `db.transaction`.

**Rationale:**
- The client sends the full ordered list of item IDs (not partial moves).
- The service assigns `sortOrder = 0, 1, 2, ...` — no gaps, no floats.
- A transaction ensures atomicity.
- Validation (`itemIds.length === collectionItems.length` and all belong to the collection) prevents partial/foreign item IDs.

**Alternative considered:** `items: { id: string, sortOrder: number }[]` where the client computes sort orders. Rejected — error-prone (gaps, duplicates) and redundant (the array order IS the sort order).

### 10. Frontend reordering: up/down buttons + optimistic `useFetcher` (no DnD library)

**Choice:** `CollectionRecipeList` renders each recipe with up/down arrow buttons. Clicking an arrow reorders the local array optimistically and fires a `useFetcher` `PATCH` to a resource route `action` (`/collections/:id/reorder`) with the new `itemIds` order. On error, the fetcher's `actionData` rolls back the local state.

**Rationale:**
- The repo has NO drag-and-drop library (`@dnd-kit`, `react-beautiful-dnd`, etc.) — confirmed by exhaustive grep. Only native HTML5 drag exists, in `PhotoUpload.tsx` for file drops.
- Introducing `@dnd-kit` adds a dependency, a new pattern, bundle weight, and accessibility concerns — out of scope for this feature.
- Up/down buttons are accessible (keyboard-navigable), simple, and match the repo's "minimal dependencies" ethos.
- Drag-and-drop can be layered on later as a progressive enhancement without changing the API contract.

### 11. "Add to Collection" modal: hand-rolled, triggered from RecipeDetailPage

**Choice:** `AddToCollectionModal` is a hand-rolled modal (matching `BanDialog.tsx`) controlled by `open/onClose` props. It lists the user's collections with a "current recipe is in this collection" indicator, and supports inline "create new collection" (name + visibility). Adding/removing a recipe calls `collectionApi.addRecipe`/`removeRecipe`. The modal is triggered by a button in the `RecipeDetailPage` action-buttons row (lines 192-235), gated on `isAuthenticated`.

**Rationale:**
- Hand-rolled modals are the repo convention (no Radix/Headless UI for dialogs — `BanDialog.tsx` is the template).
- Inline create avoids a separate page navigation.
- Gating on `isAuthenticated` matches the Fork button pattern (also auth-only, also in the action-buttons row).

### 12. Collections on UserProfilePage: new `collections` tab

**Choice:** Add `'collections'` to the `Tab` union and `ALLOWED_TABS` in `UserProfilePage.tsx`. The loader conditionally fetches `collectionApi.listByUser(profile.id)` when `tab === 'collections'`. The tab shows public collections for non-self viewers, all collections for the self viewer. Each collection renders as a `<CollectionCard>` linking to `/collections/:id`.

**Rationale:** Mirrors the existing conditional-fetch pattern (`followers`/`following` are conditionally fetched in the loader, `UserProfilePage.tsx:38-43`). The `PublicUserOutputSchema` is NOT modified — collections are fetched separately, avoiding a schema change to the user profile response.

### 13. OpenAPI: new `Collections` tag, full `describeRoute` on all 8 routes

**Choice:** Register `{ name: 'Collections', description: 'User-owned named collections of recipes' }` in `routes/openapi.ts` `tags` array. Every route in `modules/collection/index.ts` gets `describeRoute({ tags: ['Collections'], ... })` with:
- `security: [{ bearerAuth: [] }]` on auth-guarded routes
- `parameters` for path (`id`, `recipeId`) and query (`page`, `perPage`) params
- `requestBody: jsonRequestBody(Schema)` for POST/PATCH bodies
- `responses` with `resolver(successEnvelope(XOutputSchema))` / `resolver(paginatedEnvelope(XOutputSchema))` / `resolver(ErrorEnvelopeSchema)` for every documented status (200/201/400/401/403/404/409)

**Rationale:** AGENTS.md mandates OpenAPI metadata on every new route. The `openapi.coverage.test.ts` enforces "every in-scope route documented, tagged, no orphan tags." The comment module (`modules/comment/index.ts`) is the template — it provides full `content` + `resolver(...)` for every response code, including DELETEs.

### 14. Seed: optional `seedCollections` helper

**Choice:** Add a `seedCollections(tx, createdUsers, createdRecipes)` helper to `packages/db/src/seed.ts` that creates 1–2 sample collections per seeded user and adds 2–3 recipes to each. Uses `onConflictDoNothing({ target: [collectionItems.collectionId, collectionItems.recipeId] })` for idempotency. Called from `main()` inside the `db.transaction` block after `seedRecipes`.

**Rationale:** Matches the seed idempotency rule in AGENTS.md. The select-and-reuse pattern (look up `createdUsers[username].id` and `createdRecipes[slug].id`) is used to resolve FK IDs. Collections are seeded with `visibility: 'public'` so they appear on the sample profiles.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| **`visibility = 'draft'` collections** are semantically odd (identical to `private` at runtime). | Document this in the spec and the JSDoc on the `visibility` column. A future CHECK constraint or Zod refinement can forbid `draft` for collections if it causes UX confusion. No correctness risk. |
| **Reordering via full `itemIds` array** is O(n) writes per reorder. For a collection with 500 recipes this is 500 `UPDATE`s. | Collections are expected to stay small (<100 recipes). The transaction is fast for this scale. If a collection grows large, a "move item from A to B" partial-update endpoint can be added later. |
| **No admin moderation** of collections — an admin cannot delete another user's public collection. | Out of scope for v1. Admin moderation (D19-style) can be added in a follow-up. The `adminMiddleware` + an admin-scoped `DELETE /admin/collections/:id` route is the established pattern. |
| **Existence leak** on `GET /collections/:id` for private collections (403 vs 404). | Matches the recipe module's behaviour (distinct 404/403). A future hardening change can unify to 404-for-both if the threat model requires it. |
| **Soft-deleted recipe stays in `collection_item`** — the join row is not cleaned up. | Intentional: a restored recipe reappears. The query filters via `isNull(recipes.deletedAt)`. If orphaned rows accumulate, a periodic cleanup job can `DELETE FROM collection_item WHERE recipeId NOT IN (SELECT id FROM recipe WHERE deletedAt IS NULL)` — but this is not needed for correctness. |
| **Frontend up/down reordering** is less UX-polished than drag-and-drop. | Deliberate scope decision (no new dependency). Drag-and-drop can be layered on later without API changes. Up/down buttons are accessible and reliable. |
| **No collection cover image / thumbnail** — collections render as text-only cards. | Out of scope for v1. A future feature can derive a thumbnail from the first recipe's photo. |

## Migration Plan

1. **Schema + migration (Phase 0 — prerequisite):** Add `collections` and `collectionItems` tables + relations to `packages/db/src/schema.ts`. Run `make db-generate && make db-migrate`. Add index assertions to `schema-indexes.test.ts` and column assertions to `schema-columns.test.ts`.
2. **Shared schemas (Phase 1):** Add `collection.ts` input schemas + `responses/collection.ts` output schemas. Re-export from barrels. Add unit tests.
3. **API module (Phase 2):** Create `modules/collection/{model,service,index}.ts`. Register route in `routes/index.ts`. Register `Collections` tag in `routes/openapi.ts`. Add `/api/v1/collections` to `IN_SCOPE_BASE_PATHS`. Add model/service/route tests.
4. **Frontend (Phase 3):** Add `collectionApi` to `api/index.ts`. Create pages, components, routes. Add `collections` tab to `UserProfilePage`. Add "Add to Collection" button to `RecipeDetailPage`. Add i18n keys. Add component/page tests.
5. **Seed (Phase 4):** Add `seedCollections` to `seed.ts`. Run `make db-seed` to verify idempotency.
6. **Format + lint + type-check + test (Phase 5):** `make fmt && make lint && make check && make test`.
7. **No rollback needed** — the feature is additive (new tables, new routes, new pages). Removing the feature reverts to the previous state without breaking anything.

## Open Questions

- Should `GET /collections/:id` return the full recipe list inline (one response) or paginate items separately (`GET /collections/:id/items`)? **Decision: return inline** — collections are expected to stay small (<100 recipes), so a single response with `items: CollectionItemOutput[]` is simpler and avoids a second round-trip. If a collection grows large, a `?perPage=` query param can paginate the items in a future change.
- Should the "Add to Collection" modal support creating a collection with `visibility` other than `private`? **Decision: yes** — the inline create form has a visibility dropdown (private/unlisted/public), defaulting to `private`. This matches `CollectionCreateSchema`.
- Should `collectionItems` have a `deletedAt` for soft-delete? **Decision: no** — join tables are hard-deleted (house style; no join table in `schema.ts` has `deletedAt`). Removing a recipe from a collection is a hard `DELETE`.