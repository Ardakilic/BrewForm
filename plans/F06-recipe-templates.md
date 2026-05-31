# F06 — Recipe Templates

## Overview

System-defined and user-defined templates that pre-fill brew parameters with sensible defaults per brew method. Users select a template when creating a recipe, reducing friction and establishing consistent starting points for common brewing styles.

## Goals

- Reduce recipe creation time by pre-filling known defaults
- Provide curated system templates for each brew method
- Let users save their own recipes as reusable templates
- Maintain the existing 3-layer module pattern (`model.ts` → `service.ts` → `index.ts`)

## User Stories

1. **As a user**, I want to pick a template (e.g. "Classic Espresso") when creating a recipe so I don't have to fill every field from scratch.
2. **As a user**, I want to save any of my recipes as a template so I can reuse my preferred parameters.
3. **As a user**, I want to edit and delete my own templates.
4. **As a user**, I want to see system templates alongside my own in a single list.
5. **As an admin**, I want system templates to be immutable by regular users.

## Technical Design

### Database Schema

All SQL migrations use Drizzle ORM schema definitions. Use `make db-generate` to create migrations after schema changes.

Add to `packages/db/src/schema.ts`:

```ts
export const recipeTemplates = pgTable(
  'recipe_template',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: varchar('user_id', { length: 36 }).references(() => users.id, {
      onDelete: 'cascade',
    }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    brewMethod: brewMethodEnum('brew_method').notNull(),
    isSystem: boolean('is_system').notNull().default(false),
    // Template config columns — match RecipeVersion fields (no JSONB)
    drinkType: drinkTypeEnum('drink_type'),
    grindSize: varchar('grind_size', { length: 50 }),
    temperatureCelsius: real('temperature_celsius'),
    groundWeightGrams: real('ground_weight_grams'),
    extractionTimeSeconds: integer('extraction_time_seconds'),
    extractionVolumeMl: real('extraction_volume_ml'),
    brewRatio: real('brew_ratio'),
    flowRate: real('flow_rate'),
    preInfusionTimeSeconds: integer('pre_infusion_time_seconds'),
    brewerDetails: varchar('brewer_details', { length: 500 }),
    grinder: varchar('grinder', { length: 255 }),
    personalNotes: text('personal_notes'),
    preparationNotes: text('preparation_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('recipe_template_user_id_idx').on(table.userId),
    index('recipe_template_brew_method_idx').on(table.brewMethod),
    index('recipe_template_is_system_idx').on(table.isSystem),
    index('recipe_template_deleted_at_idx').on(table.deletedAt),
  ],
);
```

Add relations:

```ts
export const recipeTemplatesRelations = relations(recipeTemplates, ({ one }) => ({
  user: one(users, {
    fields: [recipeTemplates.userId],
    references: [users.id],
  }),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  // ... existing relations ...
  templates: many(recipeTemplates),
}));
```

### Shared Schema (Zod)

Add to `packages/shared/src/schemas/recipe-template.ts`:

```ts
import { z } from 'zod';

const BrewMethodEnum = z.enum([
  'espresso_machine', 'v60', 'french_press', 'aeropress',
  'turkish_coffee', 'drip_coffee', 'chemex', 'kalita_wave',
  'moka_pot', 'cold_brew', 'siphon',
]);

const DrinkTypeEnum = z.enum([
  'espresso', 'americano', 'flat_white', 'latte', 'cappuccino',
  'cortado', 'macchiato', 'turkish_coffee', 'pour_over',
  'cold_brew', 'french_press', 'aeropress', 'drip_coffee',
  'moka_pot', 'siphon',
]);

export const TemplateCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  brewMethod: BrewMethodEnum,
  drinkType: DrinkTypeEnum.optional(),
  grindSize: z.string().max(50).optional(),
  temperatureCelsius: z.number().min(-40).max(100).optional(),
  groundWeightGrams: z.number().min(0).optional(),
  extractionTimeSeconds: z.number().positive().optional(),
  extractionVolumeMl: z.number().min(0).optional(),
  brewRatio: z.number().min(0).optional(),
  flowRate: z.number().min(0).optional(),
  preInfusionTimeSeconds: z.number().int().min(1).optional(),
  brewerDetails: z.string().max(500).optional(),
  grinder: z.string().max(255).optional(),
  personalNotes: z.string().max(10000).optional(),
  preparationNotes: z.string().max(10000).optional(),
});

export const TemplateUpdateSchema = TemplateCreateSchema.partial();

export const TemplateFilterSchema = z.object({
  brewMethod: BrewMethodEnum.optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
});
```

Export from `packages/shared/src/schemas/index.ts`:

```ts
export { TemplateCreateSchema, TemplateUpdateSchema, TemplateFilterSchema } from './recipe-template.ts';
```

### Shared Types

Add to `packages/shared/src/types/recipe-template.ts`:

```ts
import type { BrewMethod, DrinkType } from './recipe.ts';

export interface RecipeTemplate {
  id: string;
  userId: string | null;
  name: string;
  description: string | null;
  brewMethod: BrewMethod;
  isSystem: boolean;
  drinkType: DrinkType | null;
  grindSize: string | null;
  temperatureCelsius: number | null;
  groundWeightGrams: number | null;
  extractionTimeSeconds: number | null;
  extractionVolumeMl: number | null;
  brewRatio: number | null;
  flowRate: number | null;
  preInfusionTimeSeconds: number | null;
  brewerDetails: string | null;
  grinder: string | null;
  personalNotes: string | null;
  preparationNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

### API Module

#### `apps/api/src/modules/template/model.ts`

Data-access layer. Pure Drizzle operations, no business logic.

```ts
import { db } from '@brewform/db';
import { recipeTemplates } from '@brewform/db/schema';
import { and, asc, count, desc, eq, ilike, isNull, SQL } from 'drizzle-orm';

export async function findById(id: string) {
  return db.query.recipeTemplates.findFirst({
    where: and(eq(recipeTemplates.id, id), isNull(recipeTemplates.deletedAt)),
    with: {
      user: { columns: { id: true, username: true, displayName: true } },
    },
  });
}

export async function findMany(
  where: SQL | undefined,
  page: number,
  perPage: number,
) {
  const finalWhere = where
    ? and(isNull(recipeTemplates.deletedAt), where)
    : isNull(recipeTemplates.deletedAt);

  const [data, totalResult] = await Promise.all([
    db.query.recipeTemplates.findMany({
      where: finalWhere,
      orderBy: desc(recipeTemplates.createdAt),
      limit: perPage,
      offset: (page - 1) * perPage,
      with: {
        user: { columns: { id: true, username: true, displayName: true } },
      },
    }),
    db.select({ count: count() }).from(recipeTemplates).where(finalWhere),
  ]);

  return { templates: data, total: totalResult[0].count };
}

export async function create(data: typeof recipeTemplates.$inferInsert) {
  const [result] = await db.insert(recipeTemplates).values(data).returning();
  return result;
}

export async function update(id: string, data: Partial<typeof recipeTemplates.$inferInsert>) {
  const [result] = await db.update(recipeTemplates).set(data)
    .where(eq(recipeTemplates.id, id)).returning();
  return result ?? null;
}

export async function softDelete(id: string) {
  const [result] = await db.update(recipeTemplates).set({ deletedAt: new Date() })
    .where(and(eq(recipeTemplates.id, id), isNull(recipeTemplates.deletedAt))).returning();
  return result ?? null;
}
```

#### `apps/api/src/modules/template/service.ts`

Business-logic layer.

```ts
import * as model from './model.ts';
import { and, eq, ilike, isNull } from 'drizzle-orm';
import { recipeTemplates } from '@brewform/db/schema';
import { computeBrewRatio } from '@brewform/shared/utils';

export async function listTemplates(filters: any, userId: string | null) {
  const conditions: any[] = [];

  // System templates are visible to everyone
  // User templates are visible only to their owner
  if (userId) {
    conditions.push(
      // isSystem OR belongs to user
      // Drizzle doesn't have native OR on columns, so use SQL
      // For simplicity, fetch system + user's own in service layer
    );
  } else {
    conditions.push(eq(recipeTemplates.isSystem, true));
  }

  if (filters.brewMethod) {
    conditions.push(eq(recipeTemplates.brewMethod, filters.brewMethod));
  }
  if (filters.search) {
    conditions.push(ilike(recipeTemplates.name, `%${filters.search}%`));
  }

  const where = conditions.length > 1 ? and(...conditions) : conditions[0];
  return model.findMany(where, filters.page, filters.perPage);
}

export async function getTemplate(id: string) {
  const template = await model.findById(id);
  if (!template) throw new Error('TEMPLATE_NOT_FOUND');
  return template;
}

export async function createTemplate(userId: string, data: any) {
  // Compute brew ratio if dose and yield provided
  const brewRatio = data.groundWeightGrams && data.extractionVolumeMl
    ? computeBrewRatio(data.groundWeightGrams, data.extractionVolumeMl)
    : data.brewRatio ?? null;

  return model.create({
    userId,
    name: data.name,
    description: data.description,
    brewMethod: data.brewMethod,
    isSystem: false,
    drinkType: data.drinkType,
    grindSize: data.grindSize,
    temperatureCelsius: data.temperatureCelsius,
    groundWeightGrams: data.groundWeightGrams,
    extractionTimeSeconds: data.extractionTimeSeconds,
    extractionVolumeMl: data.extractionVolumeMl,
    brewRatio,
    flowRate: data.flowRate,
    preInfusionTimeSeconds: data.preInfusionTimeSeconds,
    brewerDetails: data.brewerDetails,
    grinder: data.grinder,
    personalNotes: data.personalNotes,
    preparationNotes: data.preparationNotes,
  });
}

export async function updateTemplate(id: string, userId: string, data: any) {
  const template = await model.findById(id);
  if (!template) throw new Error('TEMPLATE_NOT_FOUND');
  if (template.isSystem) throw new Error('FORBIDDEN');
  if (template.userId !== userId) throw new Error('FORBIDDEN');

  const brewRatio = data.groundWeightGrams && data.extractionVolumeMl
    ? computeBrewRatio(data.groundWeightGrams, data.extractionVolumeMl)
    : data.brewRatio ?? template.brewRatio;

  return model.update(id, { ...data, brewRatio });
}

export async function deleteTemplate(id: string, userId: string) {
  const template = await model.findById(id);
  if (!template) throw new Error('TEMPLATE_NOT_FOUND');
  if (template.isSystem) throw new Error('FORBIDDEN');
  if (template.userId !== userId) throw new Error('FORBIDDEN');
  return model.softDelete(id);
}
```

#### `apps/api/src/modules/template/index.ts`

Hono route controller.

```ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { describeRoute } from 'hono-openapi';
import { TemplateCreateSchema, TemplateFilterSchema, TemplateUpdateSchema } from '@brewform/shared/schemas';
import { authMiddleware, optionalAuthMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { error, paginated, success, zodValidationHook } from '../../utils/response/index.ts';
import type { AppEnv } from '../../types/hono.ts';

const template = new Hono<AppEnv>();

template.get(
  '/',
  describeRoute({
    tags: ['Templates'],
    summary: 'List recipe templates',
    description: 'Returns system templates and the authenticated user\'s own templates.',
    responses: { 200: { description: 'Paginated list of templates' } },
  }),
  optionalAuthMiddleware,
  zValidator('query', TemplateFilterSchema),
  async (c) => {
    const filters = c.req.valid('query');
    const userId = c.get('userId') ?? null;
    const result = await service.listTemplates(filters, userId);
    return paginated(c, result.templates, {
      page: filters.page,
      perPage: filters.perPage,
      total: result.total,
      totalPages: Math.ceil(result.total / filters.perPage),
    });
  },
);

template.get(
  '/:id',
  describeRoute({
    tags: ['Templates'],
    summary: 'Get a template by ID',
    responses: {
      200: { description: 'Template payload' },
      404: { description: 'Template not found' },
    },
  }),
  optionalAuthMiddleware,
  async (c) => {
    const id = c.req.param('id')!;
    try {
      const t = await service.getTemplate(id);
      return success(c, t);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'TEMPLATE_NOT_FOUND') return error(c, 'NOT_FOUND', 'Template not found', 404);
      throw err;
    }
  },
);

template.post(
  '/',
  describeRoute({
    tags: ['Templates'],
    summary: 'Create a recipe template',
    security: [{ bearerAuth: [] }],
    responses: {
      201: { description: 'Template created' },
      401: { description: 'Unauthorized' },
    },
  }),
  authMiddleware,
  zValidator('json', TemplateCreateSchema, zodValidationHook),
  async (c) => {
    const userId = c.get('userId') as string;
    const body = c.req.valid('json');
    const t = await service.createTemplate(userId, body);
    return success(c, t, 201);
  },
);

template.patch(
  '/:id',
  describeRoute({
    tags: ['Templates'],
    summary: 'Update a recipe template',
    security: [{ bearerAuth: [] }],
    responses: {
      200: { description: 'Template updated' },
      403: { description: 'Not your template or system template' },
      404: { description: 'Template not found' },
    },
  }),
  authMiddleware,
  zValidator('json', TemplateUpdateSchema, zodValidationHook),
  async (c) => {
    const id = c.req.param('id')!;
    const userId = c.get('userId') as string;
    const body = c.req.valid('json');
    try {
      const t = await service.updateTemplate(id, userId, body);
      return success(c, t);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'TEMPLATE_NOT_FOUND') return error(c, 'NOT_FOUND', 'Template not found', 404);
      if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not authorized', 403);
      throw err;
    }
  },
);

template.delete(
  '/:id',
  describeRoute({
    tags: ['Templates'],
    summary: 'Delete a recipe template',
    security: [{ bearerAuth: [] }],
    responses: {
      200: { description: 'Template deleted' },
      403: { description: 'Not your template or system template' },
      404: { description: 'Template not found' },
    },
  }),
  authMiddleware,
  async (c) => {
    const id = c.req.param('id')!;
    const userId = c.get('userId') as string;
    try {
      await service.deleteTemplate(id, userId);
      return success(c, { message: 'Template deleted' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'TEMPLATE_NOT_FOUND') return error(c, 'NOT_FOUND', 'Template not found', 404);
      if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not authorized', 403);
      throw err;
    }
  },
);

export default template;
```

Register in main API router (`apps/api/src/index.ts`):

```ts
import template from './modules/template/index.ts';
app.route('/api/v1/templates', template);
```

### Frontend Components

#### New pages

| Component | Path | Description |
|-----------|------|-------------|
| `TemplateListPage` | `/templates` | Grid/list of system + user templates, filterable by brew method |
| `TemplateForm` | Used inside `TemplateListPage` | Modal or inline form for creating/editing templates |

#### Modifications

| File | Change |
|------|--------|
| `apps/web/src/pages/recipes/RecipeCreatePage.tsx` | Add "Use Template" button that loads template defaults into form state |
| `apps/web/src/router.tsx` | Add route for `/templates` |
| `apps/web/src/api/index.ts` | Add `templateApi` with CRUD methods |

#### `TemplateListPage` component outline

```tsx
// apps/web/src/pages/templates/TemplateListPage.tsx
// - Fetches GET /templates?brewMethod=&page=&perPage=
// - Renders grid of template cards
// - Each card shows: name, brew method badge, description snippet
// - "Use Template" button → navigates to /recipes/new?templateId=<id>
// - "Edit" / "Delete" buttons for user's own templates
// - "Create Template" button opens TemplateForm modal
// - Filter bar with brew method dropdown
```

#### "Use Template" integration in `RecipeCreatePage`

```tsx
// In RecipeCreatePage.tsx, add effect to load template from URL param:
useEffect(() => {
  const templateId = searchParams.get('templateId');
  if (!templateId) return;
  templateApi.get(templateId).then((t) => {
    if (t.brewMethod) setBrewMethod(t.brewMethod);
    if (t.drinkType) setDrinkType(t.drinkType);
    if (t.grindSize) setGrindSize(t.grindSize);
    if (t.temperatureCelsius) setTemperatureCelsius(String(t.temperatureCelsius));
    if (t.groundWeightGrams) setGroundWeightGrams(String(t.groundWeightGrams));
    if (t.extractionTimeSeconds) setExtractionTimeSeconds(String(t.extractionTimeSeconds));
    if (t.extractionVolumeMl) setExtractionVolumeMl(String(t.extractionVolumeMl));
    if (t.grinder) setGrinder(t.grinder);
    if (t.brewerDetails) setBrewerDetails(t.brewerDetails);
    if (t.preparationNotes) setPreparationNotes(t.preparationNotes);
    if (t.personalNotes) setPersonalNotes(t.personalNotes);
  }).catch(() => {});
}, [searchParams]);
```

### Seed Data

Create `packages/db/src/seed-templates.ts` with system templates:

```ts
export const systemTemplates = [
  {
    name: 'Classic Espresso',
    description: 'Standard espresso shot with balanced extraction',
    brewMethod: 'espresso_machine',
    isSystem: true,
    drinkType: 'espresso',
    groundWeightGrams: 18,
    extractionVolumeMl: 36,
    extractionTimeSeconds: 25,
    temperatureCelsius: 93,
    grindSize: 'fine',
    brewRatio: 2.0,
    preparationNotes: 'Preheat portafilter and cup. Distribute and tamp evenly. Start extraction immediately.',
  },
  {
    name: 'V60 Pour Over',
    description: 'Clean, bright pour-over using the Hario V60',
    brewMethod: 'v60',
    isSystem: true,
    drinkType: 'pour_over',
    groundWeightGrams: 15,
    extractionVolumeMl: 250,
    extractionTimeSeconds: 180,
    temperatureCelsius: 96,
    grindSize: 'medium-fine',
    brewRatio: 16.7,
    preparationNotes: 'Rinse filter. Bloom with 2x coffee weight for 30s. Pour in concentric circles.',
  },
  {
    name: 'French Press',
    description: 'Full-bodied immersion brew',
    brewMethod: 'french_press',
    isSystem: true,
    drinkType: 'french_press',
    groundWeightGrams: 30,
    extractionVolumeMl: 500,
    extractionTimeSeconds: 240,
    temperatureCelsius: 96,
    grindSize: 'coarse',
    brewRatio: 16.7,
    preparationNotes: 'Add coffee, pour water, stir gently. Steep 4 minutes. Press slowly and serve immediately.',
  },
  {
    name: 'Aeropress Standard',
    description: 'Versatile AeroPress recipe',
    brewMethod: 'aeropress',
    isSystem: true,
    drinkType: 'aeropress',
    groundWeightGrams: 15,
    extractionVolumeMl: 200,
    extractionTimeSeconds: 120,
    temperatureCelsius: 85,
    grindSize: 'medium-fine',
    brewRatio: 13.3,
    preparationNotes: 'Inverted method. Steep 90s, flip and press 30s.',
  },
  {
    name: 'Cold Brew Concentrate',
    description: 'Smooth cold brew concentrate for dilution',
    brewMethod: 'cold_brew',
    isSystem: true,
    drinkType: 'cold_brew',
    groundWeightGrams: 100,
    extractionVolumeMl: 700,
    extractionTimeSeconds: 28800, // 8 hours
    temperatureCelsius: 4,
    grindSize: 'very coarse',
    brewRatio: 7.0,
    preparationNotes: 'Combine coarse grounds with cold water. Steep 12-24 hours in refrigerator. Filter and dilute 1:1 with water or milk.',
  },
  {
    name: 'Moka Pot',
    description: 'Stovetop espresso-style coffee',
    brewMethod: 'moka_pot',
    isSystem: true,
    drinkType: 'moka_pot',
    groundWeightGrams: 20,
    extractionVolumeMl: 100,
    extractionTimeSeconds: 300,
    temperatureCelsius: 100,
    grindSize: 'fine-medium',
    brewRatio: 5.0,
    preparationNotes: 'Fill basket with ground coffee, do not tamp. Fill base with hot water up to valve. Assemble and heat on medium. Remove from heat when gurgling.',
  },
];
```

Run via `make db-seed` or add to existing seed script.

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/templates` | Optional | List system + user's templates |
| `GET` | `/api/v1/templates/:id` | Optional | Get single template |
| `POST` | `/api/v1/templates` | Required | Create user template |
| `PATCH` | `/api/v1/templates/:id` | Required | Update user template |
| `DELETE` | `/api/v1/templates/:id` | Required | Soft-delete user template |

## Frontend Components

| Component | File | Description |
|-----------|------|-------------|
| `TemplateListPage` | `apps/web/src/pages/templates/TemplateListPage.tsx` | Browsable grid of templates |
| `TemplateForm` | `apps/web/src/components/template/TemplateForm.tsx` | Create/edit form (modal) |
| `TemplateCard` | `apps/web/src/components/template/TemplateCard.tsx` | Card displaying template info |
| `UseTemplateButton` | `apps/web/src/components/template/UseTemplateButton.tsx` | CTA to apply template |

## Acceptance Criteria

- [ ] `recipe_template` table created via `make db-generate` and `make db-migrate`
- [ ] System templates seeded for all 11 brew methods
- [ ] `GET /templates` returns system templates for unauthenticated users
- [ ] `GET /templates` returns system + user templates for authenticated users
- [ ] `POST /templates` creates a user-owned template
- [ ] Users can only edit/delete their own templates
- [ ] System templates (`isSystem: true`) cannot be edited or deleted by non-admins
- [ ] `RecipeCreatePage` loads template defaults from `?templateId=` URL param
- [ ] Template list page is filterable by brew method
- [ ] Type-check passes (`make check`)
- [ ] Lint passes (`make lint`)
- [ ] All tests pass (`make test`)

## Implementation Steps

1. Add `recipeTemplates` table + relations to `packages/db/src/schema.ts`
2. Run `make db-generate && make db-migrate` to create migration
3. Create `packages/shared/src/schemas/recipe-template.ts` with Zod schemas
4. Create `packages/shared/src/types/recipe-template.ts` with TypeScript types
5. Export new schemas and types from barrel files
6. Create `apps/api/src/modules/template/model.ts`
7. Create `apps/api/src/modules/template/service.ts`
8. Create `apps/api/src/modules/template/index.ts` with Hono routes
9. Register template routes in main API router
10. Create `packages/db/src/seed-templates.ts` with system template data
11. Add seed call to `packages/db/src/seed.ts`
12. Run `make db-seed` to populate templates
13. Add `templateApi` to `apps/web/src/api/index.ts`
14. Create `TemplateListPage`, `TemplateForm`, `TemplateCard` components
15. Add `/templates` route to `apps/web/src/router.tsx`
16. Modify `RecipeCreatePage` to support `?templateId=` pre-fill
17. Run `make check && make lint && make test`

## Dependencies

- Existing: `brewMethodEnum`, `drinkTypeEnum` in `packages/db/src/schema.ts`
- Existing: `computeBrewRatio` from `@brewform/shared/utils`
- Existing: `authMiddleware`, `optionalAuthMiddleware` from API middleware
- Existing: `RecipeCreatePage` form infrastructure
- New: Drizzle migration for `recipe_template` table
