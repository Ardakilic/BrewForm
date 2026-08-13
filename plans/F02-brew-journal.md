# F02 — Brew Journal / "Brew Again" Workflow

> ✅ Shipped via OpenSpec change `f02-brew-journal` (2026-08-13).
> Implemented per the OpenSpec proposal/design/specs: `brew_log` table with composite indexes and `updatedAt`, owner-private CRUD (8 routes incl. an owner-scoped single get added during implementation), dedicated user/recipe stats endpoints (`brewCount`/`avgBrewRating`, distinct from the community `avgRating`), full OpenAPI documentation, i18n parity, and web journal pages + recipe-page brew stats/history.
>
> **Note:** The body below this line is the original pre-implementation draft plan (with its 2026-07-13 and 2026-08-13 validation banners), kept as historical context. Where it differs from what shipped (single-column indexes, optional auth on the per-recipe log list, no `GET /brew-logs/:id`, five web components), the OpenSpec change `f02-brew-journal` design and specs are the shipped contract — see `openspec/specs/brew-journal/`.
>
> **Validation status (2026-08-13): refreshed — corrections below (core design valid, net-new scope confirmed)**
>
> **Note:** The body below this line (including the 2026-07-13 banner) is the pre-refresh draft; treat the corrections below as authoritative. Verified against the codebase as of 2026-08-13.
>
> - Still net-new: no `brew_log` table, no `apps/api/src/modules/brew-log/`, no brew-log schemas anywhere. The proposed Drizzle snippet conforms — varchar(36) ids with `crypto.randomUUID()`, timestamptz columns, `real()` amounts, `check(...)` via `sql` template, `deletedAt` + `brew_log_deleted_at_idx` (parity with every soft-delete table). No JSONB/UUID columns, no raw SQL — conventions respected.
> - Line refs in the 2026-07-13 banner drifted again: `recipeVersions.rating` column is packages/db/src/schema.ts:236 with `recipe_version_rating_check` at :263 (not :238); `user_recipe_rating` table at schema.ts:706 with its 1–10 CHECK at :719 (not :664/:677). Relation targets: `usersRelations` schema.ts:1024, `recipesRelations` :1057, `recipeVersionsRelations` :1076 — extend these additively.
> - Schema gap: the table has PATCH routes but no `updatedAt` column — every soft-deletable mutable entity carries `createdAt`/`updatedAt` (see `collections` schema.ts:900-913). Add `updatedAt` to `brewLogs`.
> - Indexes: D23 convention is composite indexes serving the actual list queries — prefer `(userId, brewedAt)` and `(recipeId, brewedAt)` composites (pattern: `bean_user_created_idx`, `notification_user_created_idx`) over the plan's separate single-column `user_id`/`recipe_id`/`brewed_at` indexes.
> - OpenAPI is now mandatory (missing entirely from the plan's route snippet): every route needs `describeRoute()` + `resolver()` responses, request bodies via `jsonRequestBody()` (apps/api/src/utils/openapi/index.ts:18); add `BrewLogOutputSchema` + brew-stats output schemas to packages/shared/src/schemas/responses/ and the responses/index.ts barrel; register the new tag in apps/api/src/routes/openapi.ts. Coverage is enforced by apps/api/src/routes/openapi.coverage.test.ts. Pattern to copy: apps/api/src/modules/collection/index.ts.
> - D42 (typed web boundary) unchanged since last refresh: `apps/web/src/api/types.ts` still deleted; add a typed `brewLogApi` to apps/web/src/api/index.ts using `z.infer` from `@brewform/shared/schemas` and `api.getWithMeta<PaginatedResponse<T>>` (client.ts:126; `PaginatedResponse` at packages/shared/src/schemas/response.ts:74).
> - D40 (i18n) unchanged: every UI string in BOTH packages/shared/src/i18n/en.json and tr.json; parity enforced by packages/shared/src/i18n/i18n.test.ts.
> - Web routing confirmed: loader pattern is now pervasive — `profileLoader` (apps/web/src/router.tsx:38,207-208), `detailLoader` (:17,129-130), `RequireAuth` (:3). The plan's `element:`-only route snippets should attach a `loader:` too. Logger convention `createLogger('brew-log-service')` matches (collection/service.ts:9).
> - Pagination: offset `paginated()` (apps/api/src/utils/response/index.ts:39) + `PaginationSchema` (packages/shared/src/schemas/common.ts:4) remains correct for these lists; cursor pagination (D27, `cursorPaginated()` :72) exists but is not required here.
> - Naming collision risk: `RecipeDetailOutputSchema` already exposes `avgRating`/`ratingCount` (community rating from `user_recipe_rating`, D21 — packages/shared/src/schemas/responses/recipe.ts:282-283). The brew-log "average personal rating" is a DIFFERENT metric — name it distinctly (e.g. `brewCount`/`avgBrewRating`) when extending that schema.
> - No scope overlap with shipped F01/F04/F05/F08/F09/F11 or D27/D12/D23/D21/D42/D28 — none touch brew logs. F05's notification fan-out does not include brews (`notificationTypeEnum` is mention/follow/like/comment only); no notification work needed here.
> - Still a prerequisite for F03, F20, and F25's brew-log sync (plans/ROADMAP.md:34,47).
>

> **Validation status (2026-07-13): ⚠️ Outdated — corrections below (core design valid)**
>
> - Core still sound: `brew_log` is net-new (no brew-log module/table exists). The 1–10 `personalRating` CHECK matches the D21 scale; line refs drifted — `recipeVersions.rating` CHECK is now schema.ts:238, the `user_recipe_rating` table + 1–10 CHECK at schema.ts:664/677. Offset helpers `paginated` + `PaginationSchema`, `optionalAuthMiddleware`, and `success/error/paginated/isEmailVerified` all exist as assumed (utils/response/index.ts).
> - NEW — D42 (typed web boundary) not reflected in plan: `apps/web/src/api/types.ts` is DELETED. Each new endpoint needs Zod output schemas under `packages/shared/src/schemas/responses/` (e.g. `BrewLogOutputSchema`, `BrewStatsOutputSchema`), exported via `responses/index.ts`, plus a typed `brewLogApi` in `apps/web/src/api/index.ts` using `z.infer` types (+ `api.getWithMeta<PaginatedResponse<T>>` for the paginated lists).
> - NEW — D40 (i18n): every new UI string must be added to BOTH `packages/shared/src/i18n/en.json` and `tr.json`. The parity test (`i18n.test.ts`) asserts identical key sets (`expect(enKeys).toEqual(trKeys)`), so English-only strings fail `make test`.
> - Web-pattern note: current data pages use react-router v8 loaders + `useLoaderData` (e.g. UserProfilePage, RecipeDetailPage) — prefer a `loader` for `BrewLogListPage` over an in-component `useEffect` fetch. The router `element:`/`lazy:` snippets remain valid.
> - Still a prerequisite for F03 (blocked until this lands), F20, and the F25 offline-sync part.

## Overview

Allow users to log brew events (date, deviations from recipe, personal rating) when brewing a recipe. Populate a user's brew history with personal notes, actual measurements, and ratings. Provide recipe-level aggregation (times brewed, average personal rating) and user-level stats (total brews, brew frequency).

## Goals

1. Let users log each time they brew a recipe with actual measurements
2. Track deviations from the original recipe parameters
3. Capture personal ratings (1–10) per brew event
4. Show brew history on both the recipe page and user profile
5. Compute recipe-level stats (times brewed, average personal rating)
6. Compute user-level stats (total brews, brewing frequency)

## User Stories

| # | As a… | I want to… | So that… |
|---|-------|-----------|----------|
| US-1 | Authenticated user | Log a brew event for a recipe with date, actual yield, actual dose, notes, and rating | I can track my brewing results |
| US-2 | Authenticated user | View my brew history for a specific recipe | I can see how my brews have evolved |
| US-3 | Authenticated user | View all my brew logs across all recipes (paginated) | I can see my complete brewing history |
| US-4 | Authenticated user | Edit a brew log entry | I can correct mistakes or add notes later |
| US-5 | Authenticated user | Delete a brew log entry | I can remove entries I no longer want |
| US-6 | Visitor | See "times brewed" and "average personal rating" on a recipe | I can gauge how popular/reliable a recipe is |
| US-7 | Authenticated user | See my brewing frequency over time on my profile | I can track my brewing habits |
| US-8 | Authenticated user | Use a "Brew Again" button on a recipe to quickly log a new brew | I can quickly start tracking a new session |

## Technical Design

### Database Schema (Drizzle ORM)

Add to `packages/db/src/schema.ts`:

```ts
export const brewLogs = pgTable(
  'brew_log',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
    recipeId: varchar('recipe_id', { length: 36 }).notNull().references(() => recipes.id),
    recipeVersionId: varchar('recipe_version_id', { length: 36 }).references(
      () => recipeVersions.id,
    ),
    brewedAt: timestamp('brewed_at', { withTimezone: true }).notNull().defaultNow(),
    yieldActual: real('yield_actual'),
    doseActual: real('dose_actual'),
    notes: text('notes'),
    personalRating: integer('personal_rating'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('brew_log_user_id_idx').on(table.userId),
    index('brew_log_recipe_id_idx').on(table.recipeId),
    index('brew_log_recipe_version_id_idx').on(table.recipeVersionId),
    index('brew_log_brewed_at_idx').on(table.brewedAt),
    index('brew_log_deleted_at_idx').on(table.deletedAt),
    check('brew_log_personal_rating_check', sql`${table.personalRating} BETWEEN 1 AND 10`),
    check('brew_log_yield_actual_check', sql`${table.yieldActual} > 0`),
    check('brew_log_dose_actual_check', sql`${table.doseActual} > 0`),
  ],
);
```

**Relations to add:**

```ts
export const usersRelations = relations(users, ({ one, many }) => ({
  // ... existing relations
  brewLogs: many(brewLogs),
}));

export const recipesRelations = relations(recipes, ({ one, many }) => ({
  // ... existing relations
  brewLogs: many(brewLogs),
}));

export const recipeVersionsRelations = relations(recipeVersions, ({ one, many }) => ({
  // ... existing relations
  brewLogs: many(brewLogs),
}));

export const brewLogsRelations = relations(brewLogs, ({ one }) => ({
  user: one(users, {
    fields: [brewLogs.userId],
    references: [users.id],
  }),
  recipe: one(recipes, {
    fields: [brewLogs.recipeId],
    references: [recipes.id],
  }),
  recipeVersion: one(recipeVersions, {
    fields: [brewLogs.recipeVersionId],
    references: [recipeVersions.id],
  }),
}));
```

### Migration

Run `make db-generate` to produce the SQL migration. **Never write manual SQL.**

### Shared Schemas

Add `packages/shared/src/schemas/brew-log.ts`:

```ts
import { z } from 'zod';

export const BrewLogCreateSchema = z.object({
  recipeId: z.uuid(),
  recipeVersionId: z.uuid().optional(),
  brewedAt: z.string().datetime().optional(), // ISO 8601, defaults to now
  yieldActual: z.number().positive().optional(),
  doseActual: z.number().positive().optional(),
  notes: z.string().max(5000).optional(),
  personalRating: z.number().int().min(1).max(10).optional(),
});

export const BrewLogUpdateSchema = z.object({
  brewedAt: z.string().datetime().optional(),
  yieldActual: z.number().positive().nullable().optional(),
  doseActual: z.number().positive().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  personalRating: z.number().int().min(1).max(10).nullable().optional(),
});
```

Export from `packages/shared/src/schemas/index.ts`.

### API Module: `modules/brew-log/`

#### `model.ts`

```ts
import { db } from '@brewform/db';
import { brewLogs, recipes, recipeVersions, users } from '@brewform/db/schema';
import { and, avg, count, desc, eq, isNull } from 'drizzle-orm';

export async function findById(id: string) { /* ... */ }
export async function findByUserId(userId: string, page: number, perPage: number) { /* ... */ }
export async function findByRecipeId(recipeId: string, page: number, perPage: number) { /* ... */ }
export async function create(data: typeof brewLogs.$inferInsert) { /* ... */ }
export async function update(id: string, data: Partial<typeof brewLogs.$inferInsert>) { /* ... */ }
export async function softDelete(id: string) { /* ... */ }
export async function getRecipeBrewStats(recipeId: string) { /* ... */ }
export async function getUserBrewStats(userId: string) { /* ... */ }
```

#### `service.ts`

```ts
import * as model from './model.ts';
import { createLogger } from '../../utils/logger/index.ts';

const logger = createLogger('brew-log-service');

export async function createBrewLog(userId: string, data: { recipeId: string; recipeVersionId?: string; brewedAt?: string; yieldActual?: number; doseActual?: number; notes?: string; personalRating?: number }) {
  // Validate recipe exists and is accessible
  // Validate recipeVersion belongs to recipe (if provided)
  // Create brew log
  // Log entry
}

export async function updateBrewLog(userId: string, brewLogId: string, data: { brewedAt?: string; yieldActual?: number | null; doseActual?: number | null; notes?: string | null; personalRating?: number | null }) {
  // Permission check: only owner can update
}

export async function deleteBrewLog(userId: string, brewLogId: string) {
  // Permission check: only owner can delete
}

export async function listUserBrewLogs(userId: string, page: number, perPage: number) { /* ... */ }
export async function listRecipeBrewLogs(recipeId: string, page: number, perPage: number) { /* ... */ }
export async function getRecipeBrewStats(recipeId: string) { /* ... */ }
export async function getUserBrewStats(userId: string) { /* ... */ }
```

#### `index.ts` (Hono Routes)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/brew-logs` | Required | List current user's brew logs (paginated) |
| `GET` | `/brew-logs/recipe/:recipeId` | Optional | List brew logs for a recipe (paginated) |
| `POST` | `/brew-logs` | Required | Create a new brew log entry |
| `PATCH` | `/brew-logs/:id` | Required | Update a brew log entry |
| `DELETE` | `/brew-logs/:id` | Required | Soft-delete a brew log entry |
| `GET` | `/brew-logs/stats/user` | Required | Get current user's brew stats |
| `GET` | `/brew-logs/stats/recipe/:recipeId` | Optional | Get recipe brew stats |

Route pattern (follows existing module conventions):

```ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { BrewLogCreateSchema, BrewLogUpdateSchema, PaginationSchema } from '@brewform/shared/schemas';
import { authMiddleware, optionalAuthMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { error, isEmailVerified, paginated, success } from '../../utils/response/index.ts';
import type { AppEnv } from '../../types/hono.ts';

const brewLog = new Hono<AppEnv>();

brewLog.get('/', authMiddleware, zValidator('query', PaginationSchema), async (c) => { /* ... */ });
brewLog.get('/recipe/:recipeId', optionalAuthMiddleware, zValidator('query', PaginationSchema), async (c) => { /* ... */ });
brewLog.post('/', authMiddleware, zValidator('json', BrewLogCreateSchema), async (c) => { /* ... */ });
brewLog.patch('/:id', authMiddleware, zValidator('json', BrewLogUpdateSchema), async (c) => { /* ... */ });
brewLog.delete('/:id', authMiddleware, async (c) => { /* ... */ });
brewLog.get('/stats/user', authMiddleware, async (c) => { /* ... */ });
brewLog.get('/stats/recipe/:recipeId', optionalAuthMiddleware, async (c) => { /* ... */ });

export default brewLog;
```

Register in `apps/api/src/routes/index.ts`:

```ts
import brewLog from '../modules/brew-log/index.ts';
routes.route('/api/v1/brew-logs', brewLog);
```

### Frontend Components

#### New Pages

| Page | Route | Description |
|------|-------|-------------|
| `BrewLogListPage` | `/brew-logs` | Paginated list of user's brew history |
| `BrewLogFormPage` | `/brew-logs/new?recipeId=...` | Form to create a new brew log (can also be modal) |

#### New Components

| Component | Location | Description |
|-----------|----------|-------------|
| `BrewLogForm` | `components/brew-log/BrewLogForm.tsx` | Form for creating/editing brew logs (yield, dose, notes, rating) |
| `BrewLogCard` | `components/brew-log/BrewLogCard.tsx` | Card displaying a single brew log entry |
| `BrewHistorySection` | `components/brew-log/BrewHistorySection.tsx` | Section on RecipeDetailPage showing brew logs for that recipe |
| `BrewAgainButton` | `components/brew-log/BrewAgainButton.tsx` | Button on RecipeDetailPage that opens BrewLogForm pre-filled with recipe data |
| `RecipeBrewStats` | `components/brew-log/RecipeBrewStats.tsx` | Displays "X brews, avg rating Y" on RecipeDetailPage |

#### Modifications to Existing Pages

- **RecipeDetailPage**: Add `BrewAgainButton` and `BrewHistorySection` (shows brew logs + stats)
- **UserProfilePage**: Add a "Brew History" tab showing paginated brew logs

#### Router Changes

Add to `apps/web/src/router.tsx`:

```tsx
{
  path: 'brew-logs',
  element: <RequireAuth><BrewLogListPage /></RequireAuth>,
},
{
  path: 'brew-logs/new',
  lazy: async () => {
    const { BrewLogFormPage } = await import('./pages/brew-logs/BrewLogFormPage.tsx');
    return { Component: () => <RequireAuth><BrewLogFormPage /></RequireAuth> };
  },
},
```

## Acceptance Criteria

- [ ] User can log a brew event with: brewed date, actual yield (ml), actual dose (g), personal notes, personal rating (1–10)
- [ ] User can view their brew history (paginated, newest first)
- [ ] User can view brew history for a specific recipe
- [ ] User can edit a brew log entry (only their own)
- [ ] User can delete a brew log entry (only their own)
- [ ] RecipeDetailPage shows "times brewed" and "average personal rating" across all users
- [ ] RecipeDetailPage shows "Brew Again" button that opens the brew log form
- [ ] RecipeDetailPage shows recent brew history section
- [ ] UserProfilePage shows brew history tab
- [ ] User-level brew stats are available (total brews, frequency)
- [ ] Personal rating is constrained to 1–10 via CHECK constraint
- [ ] All queries use soft-delete pattern (`isNull(deletedAt)`)
- [ ] Type-check passes (`make check`)
- [ ] Lint passes (`make lint`)
- [ ] Tests pass (`make test`)

## Implementation Steps

1. Add Drizzle schema changes (`brewLogs` table, relations) to `packages/db/src/schema.ts`
2. Run `make db-generate` to create migration
3. Run `make db-migrate` to apply migration
4. Add Zod schemas to `packages/shared/src/schemas/brew-log.ts` and export from `index.ts`
5. Create `apps/api/src/modules/brew-log/model.ts` — data-access functions
6. Create `apps/api/src/modules/brew-log/service.ts` — business logic with permission checks
7. Create `apps/api/src/modules/brew-log/index.ts` — Hono route handlers
8. Register route in `apps/api/src/routes/index.ts`
9. Create frontend pages: `BrewLogListPage.tsx`, `BrewLogFormPage.tsx`
10. Create frontend components: `BrewLogForm.tsx`, `BrewLogCard.tsx`, `BrewHistorySection.tsx`, `BrewAgainButton.tsx`, `RecipeBrewStats.tsx`
11. Add routes to `apps/web/src/router.tsx`
12. Modify `RecipeDetailPage` to include brew stats and brew history section
13. Modify `UserProfilePage` to include brew history tab
14. Write tests for model, service, and API endpoints
15. Run `make check && make lint && make test`

## Dependencies

- Existing `recipes` table (for foreign key references)
- Existing `recipeVersions` table (for optional version tracking)
- Existing `users` table (for ownership)
- Existing `authMiddleware` / `optionalAuthMiddleware`
- Existing response helpers (`success`, `error`, `paginated`)
