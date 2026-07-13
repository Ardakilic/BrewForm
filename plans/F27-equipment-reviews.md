# F27 — Equipment Reviews & Ratings

> **Validation status (2026-07-13): ✅ Valid**
>
> - Verified against current code with only minor line-number drift. `equipment` has no rating/review columns (`packages/db/src/schema.ts:357-384`, cited 350-377). `recipeEquipment` references `recipe_version` and now carries a `createdAt` from D43 (`schema.ts:265-285`, cited 262-280). `userRecipeRatings` pattern (`unique(userId, recipeId)` + `check rating BETWEEN 1 AND 10`) confirmed (`schema.ts:662-678`, cited 655-671).
> - Service actor-id-first confirmed (`deleteEquipment(userId, id)`, `service.ts:122`). The usage-count join `recipeEquipment → recipeVersions → recipes` already exists as `getRecipesUsingEquipment` (D03 raw SQL, `equipment/model.ts:106-149`) — note it counts via `recipes.currentVersionId`, so a "used in N recipes" stat that mirrors it is a one-liner. `optionalAuthMiddleware` exists (`middleware/auth.ts:116`).
> - `EquipmentDetailPage` useEffect fetch (`api.get('/equipment/${id}')` + `.../recipes?perPage=6`) confirmed (`EquipmentDetailPage.tsx:36-38`) — the loader conversion is valid.
> - Implementation nuance: the equipment module uses a `deps`/`authGuard` proxy + `describeRoute()` OpenAPI blocks (`equipment/index.ts`). Register `/:id/reviews` before GET `/:id` (line 204) and mirror that convention.

## Summary

Let users rate equipment on the platform-standard 1–10 scale and leave a short review. Aggregate average rating and review count onto the equipment detail and catalog pages, and derive "used in N recipes" usage stats from the existing `recipe_equipment` join table. Promotes FEATURE_SUGGESTIONS §1.5, which never received a PRD.

## Motivation

Equipment recommendations are a top need for coffee enthusiasts. The equipment catalog is currently a static list with zero user feedback, yet the community signal already exists: every recipe version links its gear through `recipe_equipment`. Adding first-class reviews turns the catalog into a decision-making tool and gives creators another reason to maintain accurate setups.

## Current state (verified)

- `equipment` table (`packages/db/src/schema.ts:350-377`): `id`, `name`, `type` (`equipmentTypeEnum`), `brand`, `model`, `description`, `createdBy`, `isSystem`, `createdAt`, `updatedAt`, `deletedAt`. **No rating/review columns.**
- `recipeEquipment` table (`packages/db/src/schema.ts:262-280`): links `recipeVersionId` → `recipe_version` (cascade) and `equipmentId` → `equipment`. Note: it references **recipe versions, not recipes** — usage stats must join through `recipeVersions` → `recipes`.
- `userRecipeRatings` (`packages/db/src/schema.ts:655-671`) is the pattern template: `unique(userId, recipeId)`, `check(rating BETWEEN 1 AND 10)`.
- Equipment API module (`apps/api/src/modules/equipment/index.ts`): GET `/`, GET `/search`, POST `/`, GET `/:id/recipes` (line 126), POST `/:id/delete-request`, GET `/:id` (line 205), PATCH `/:id`, DELETE `/:id`. Literal/multi-segment routes are already registered before GET `/:id`.
- Services take actor id first, e.g. `deleteEquipment(userId, id)` (`apps/api/src/modules/equipment/service.ts:122`); models own all Drizzle access (D29).
- `EquipmentDetailPage` (`apps/web/src/pages/equipment/EquipmentDetailPage.tsx`) fetches via the `api` client (`apps/web/src/api/client.ts`) in `useEffect`: `api.get('/equipment/${id}')` + `api.get('/equipment/${id}/recipes?perPage=6')`. `EquipmentCatalogPage` lists the catalog.

## Proposed design

### DB schema (Drizzle)

Add to `packages/db/src/schema.ts` (then `make db-generate` — never manual SQL):

```ts
export const equipmentReviews = pgTable(
  'equipment_review',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
    equipmentId: varchar('equipment_id', { length: 36 }).notNull().references(() => equipment.id),
    rating: integer('rating').notNull(), // 1–10, platform standard (D21)
    review: text('review'), // optional short review
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    unique('equipment_review_user_id_equipment_id_unique').on(table.userId, table.equipmentId),
    index('equipment_review_equipment_id_idx').on(table.equipmentId),
    index('equipment_review_user_id_idx').on(table.userId),
    index('equipment_review_deleted_at_idx').on(table.deletedAt),
    check('equipment_review_rating_check', sql`${table.rating} BETWEEN 1 AND 10`),
  ],
);
```

Relations: `equipmentReviews` → one `user`, one `equipment`; add `reviews: many(equipmentReviews)` to `equipmentRelations` and `usersRelations`.

No denormalised counters in phase 1 — aggregates computed in the model with `avg()`/`count()` grouped by `equipmentId`, guarded by `isNull(equipmentReviews.deletedAt)`.

### API endpoints

All in `apps/api/src/modules/equipment/` (module already mounted at `/api/v1/equipment` in `apps/api/src/routes/index.ts:46`). Register the new `/:id/reviews` handlers next to `/:id/recipes`, before GET `/:id`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/equipment/:id/reviews` | Optional | Paginated reviews (newest first) + aggregate block |
| `PUT` | `/api/v1/equipment/:id/reviews` | Required | Create or update caller's review (upsert on unique key) |
| `DELETE` | `/api/v1/equipment/:id/reviews` | Required | Soft-delete caller's own review |

Shared Zod schema in `packages/shared/src/schemas/equipment.ts`:

```ts
export const EquipmentReviewUpsertSchema = z.object({
  rating: z.number().int().min(1).max(10),
  review: z.string().trim().max(1000).optional(),
});
```

GET responses use `paginated()` from `apps/api/src/utils/response/index.ts`; aggregate stats ride along on the equipment detail payload:

```ts
// service.ts — actor id first, no drizzle-orm imports (D29)
export async function upsertReview(
  userId: string,
  equipmentId: string,
  input: { rating: number; review?: string },
) { /* verify equipment exists & not soft-deleted, then model.upsert */ }

export async function getEquipmentStats(equipmentId: string) {
  // model.getReviewAggregate: avg(rating), count(*) where deletedAt is null
  // model.getUsageCount: countDistinct(recipes.id) via
  //   recipeEquipment → recipeVersions → recipes
  //   where recipes.visibility = 'public' and isNull(recipes.deletedAt)
}
```

Extend `GET /api/v1/equipment/:id` and the catalog listing (`findManyWithFilters`, `apps/api/src/modules/equipment/model.ts:59`) to include `{ avgRating, reviewCount, usageCount }` (a single grouped subquery for the list to avoid N+1).

### Frontend (loader-based)

- Convert `EquipmentDetailPage` data fetching to a react-router v8 loader (import from `'react-router'`, never react-router-dom; no TanStack Query):

```ts
export const loader = async ({ params }: LoaderFunctionArgs) => {
  const [equipment, recipes, reviews] = await Promise.all([
    api.get<EquipmentDetail>(`/equipment/${params.id}`),
    api.get<{ data: RecipeEntry[] }>(`/equipment/${params.id}/recipes?perPage=6`),
    api.getWithMeta<ReviewListResponse>(`/equipment/${params.id}/reviews?perPage=10`),
  ]);
  return { equipment, recipes, reviews };
};
// component: const { equipment, recipes, reviews } = useLoaderData() as EquipmentDetailLoaderData;
```

- New components in `apps/web/src/components/equipment/`:
  - `EquipmentRatingSummary.tsx` — average (1 decimal), count, usage stat ("Used in N public recipes").
  - `EquipmentReviewList.tsx` — paginated review cards (author, rating, text, date).
  - `EquipmentReviewForm.tsx` — rating input (1–10, reuse `IntensityDots`/`StarRating` patterns from `apps/web/src/components/recipe/`) + textarea; submits via `api.put(...)` then `useRevalidator()`.
- `EquipmentCatalogPage`: show compact rating badge per card from the extended list payload.
- Review form visible only to authenticated users; editing pre-fills the caller's existing review.

### i18n & logging

- Keys under `equipment.reviews.*` (`title`, `writeReview`, `yourRating`, `reviewPlaceholder`, `submit`, `delete`, `empty`, `usedInRecipes`) added to both `packages/shared/src/i18n/en.json` and `tr.json`; render via `t()` from `I18nContext`.
- API: `createLogger('equipment-review-service')` per D26 — log upsert/delete with `{ userId, equipmentId }`, aggregate query failures with `{ err, equipmentId }`.

## Test plan

- `apps/api/src/modules/equipment/service.test.ts` (extend, `@std/testing/bdd` + `@std/expect`): upsert creates then updates (unique key respected); rating 0/11 rejected by schema; soft-deleted review excluded from aggregates; usage count only counts public, non-deleted recipes; not-found equipment → `EQUIPMENT_NOT_FOUND`.
- `apps/api/src/modules/equipment/index.test.ts`: PUT without auth → 401; envelope shape for GET reviews incl. pagination meta.
- Web colocated tests: `EquipmentReviewForm.test.tsx` (validation, submit), `EquipmentRatingSummary.test.tsx` (empty state), loader test for `EquipmentDetailPage`.

## Acceptance criteria

- [ ] Authenticated user can create, update, and soft-delete exactly one review per equipment item
- [ ] Rating constrained 1–10 in Zod and DB check constraint
- [ ] Equipment detail page shows average rating, review count, and recipe-usage count
- [ ] Catalog cards show compact rating badge without N+1 queries
- [ ] Soft-deleted reviews excluded everywhere (`isNull(deletedAt)`)
- [ ] Detail page uses a react-router loader + `useLoaderData`
- [ ] en + tr i18n keys present
- [ ] `make check && make lint && make test` pass

## Effort

**M** (3–4 days): 1 table + migration, 3 endpoints, aggregate queries, detail-page loader conversion, 3 components, tests.

## Priority

**Medium-high** — high community value, low risk, no dependency on other in-flight plans.

## Dependencies

- Existing `equipment`, `recipeEquipment`, `recipeVersions`, `recipes`, `users` tables
- `authMiddleware` / `optionalAuthMiddleware` (`apps/api/src/middleware/auth.ts`)
- Response helpers (`paginated`, `success`, `error`)
- D07 (no new enums needed), D21 (1–10 rating), D29 (service/model layering)
