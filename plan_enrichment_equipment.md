# Mega Plan: Enrich Coffee Types & Equipment in BrewForm

**Status:** SPEC_APPROVED | **40 tasks** | **~35 files** | **10★ Emotional vision**

---

## Phase 1: Database Schema & Migration (tasks 1-6)

---

### Task 1: Replace equipmentTypeEnum with 8 broad categories

**Files:** `packages/db/src/schema.ts`, `packages/shared/src/constants/brew-methods.ts`, `packages/shared/src/constants/brew-method-rules.ts`, `packages/shared/src/schemas/equipment.ts`, `packages/shared/src/types/equipment.ts`, `apps/web/src/pages/setups/SetupListPage.tsx`

#### 1a. `packages/db/src/schema.ts` — Replace enum

**DELETE (lines 63-75):**
```ts
export const equipmentTypeEnum = pgEnum('equipment_type', [
  'portafilter', 'basket', 'puck_screen', 'paper_filter', 'tamper',
  'gooseneck_kettle', 'mesh_filter', 'cezve', 'scale', 'thermometer', 'other',
]);
```

**ADD:**
```ts
export const equipmentTypeEnum = pgEnum('equipment_type', [
  'espresso_machine',
  'grinder',
  'pour_over_brewer',
  'immersion_brewer',
  'kettle',
  'milk_tool',
  'scale_accessory',
  'roaster',
  'portafilter',
  'basket',
  'puck_screen',
  'paper_filter',
  'tamper',
  'mesh_filter',
  'cezve',
  'thermometer',
  'other',
]);
```

**UPDATE `brew_method_equipment_rule` table** (line ~590) — change `equipmentType: equipmentTypeEnum(...)` to use expanded enum.

#### 1b. `packages/shared/src/constants/brew-methods.ts` — Update equipmentTypes arrays

**DELETE old file content and ADD:**
```ts
export const BREW_METHODS = [
  {
    value: 'espresso_machine',
    label: 'Espresso Machine',
    equipmentTypes: ['espresso_machine', 'grinder', 'portafilter', 'basket', 'tamper', 'puck_screen', 'scale_accessory'],
  },
  {
    value: 'v60',
    label: 'V60',
    equipmentTypes: ['pour_over_brewer', 'paper_filter', 'kettle', 'scale_accessory'],
  },
  {
    value: 'french_press',
    label: 'French Press',
    equipmentTypes: ['immersion_brewer', 'mesh_filter', 'scale_accessory', 'kettle'],
  },
  {
    value: 'aeropress',
    label: 'AeroPress',
    equipmentTypes: ['immersion_brewer', 'paper_filter', 'scale_accessory', 'kettle'],
  },
  {
    value: 'turkish_coffee',
    label: 'Turkish Coffee (Cezve)',
    equipmentTypes: ['cezve', 'scale_accessory'],
  },
  {
    value: 'drip_coffee',
    label: 'Drip Coffee',
    equipmentTypes: ['pour_over_brewer', 'paper_filter', 'scale_accessory'],
  },
  {
    value: 'chemex',
    label: 'Chemex',
    equipmentTypes: ['pour_over_brewer', 'paper_filter', 'kettle', 'scale_accessory'],
  },
  {
    value: 'kalita_wave',
    label: 'Kalita Wave',
    equipmentTypes: ['pour_over_brewer', 'paper_filter', 'kettle', 'scale_accessory'],
  },
  {
    value: 'moka_pot',
    label: 'Moka Pot',
    equipmentTypes: ['immersion_brewer', 'scale_accessory'],
  },
  {
    value: 'cold_brew',
    label: 'Cold Brew',
    equipmentTypes: ['immersion_brewer', 'mesh_filter', 'scale_accessory'],
  },
  {
    value: 'siphon',
    label: 'Siphon',
    equipmentTypes: ['scale_accessory', 'thermometer', 'kettle'],
  },
] as const;

export type BrewMethod = (typeof BREW_METHODS)[number]['value'];
export const BREW_METHODS_LIST = BREW_METHODS.map((m) => m.value);
export const BREW_METHODS_MAP = Object.fromEntries(BREW_METHODS.map((m) => [m.value, m]));
```

#### 1c. `packages/shared/src/constants/brew-method-rules.ts` — Update rules

**DELETE old file content and ADD expanded rules:**
```ts
export interface BrewMethodEquipmentRuleDef {
  brewMethod: BrewMethod;
  equipmentType: EquipmentType;
  compatible: boolean;
}

export type EquipmentType = typeof EQUIPMENT_TYPES[number];
export const EQUIPMENT_TYPES = [
  'espresso_machine', 'grinder', 'pour_over_brewer', 'immersion_brewer',
  'kettle', 'milk_tool', 'scale_accessory', 'roaster',
  'portafilter', 'basket', 'puck_screen', 'paper_filter', 'tamper',
  'mesh_filter', 'cezve', 'thermometer', 'other',
] as const;

export const EQUIPMENT_TYPE_LABELS: Record<EquipmentType, string> = {
  espresso_machine: 'Espresso Machine',
  grinder: 'Grinder',
  pour_over_brewer: 'Pour-Over & Filter Brewer',
  immersion_brewer: 'Immersion & Pressure Brewer',
  kettle: 'Kettle',
  milk_tool: 'Milk Tool',
  scale_accessory: 'Scale & Accessory',
  roaster: 'Roaster',
  portafilter: 'Portafilter',
  basket: 'Basket',
  puck_screen: 'Puck Screen',
  paper_filter: 'Paper Filter',
  tamper: 'Tamper',
  mesh_filter: 'Mesh Filter',
  cezve: 'Cezve',
  thermometer: 'Thermometer',
  other: 'Other',
};

export const BREW_METHOD_EQUIPMENT_RULES: BrewMethodEquipmentRuleDef[] = [
  // Espresso machines
  { brewMethod: 'espresso_machine', equipmentType: 'espresso_machine', compatible: true },
  { brewMethod: 'espresso_machine', equipmentType: 'grinder', compatible: true },
  { brewMethod: 'espresso_machine', equipmentType: 'portafilter', compatible: true },
  { brewMethod: 'espresso_machine', equipmentType: 'basket', compatible: true },
  { brewMethod: 'espresso_machine', equipmentType: 'tamper', compatible: true },
  { brewMethod: 'espresso_machine', equipmentType: 'puck_screen', compatible: true },
  { brewMethod: 'espresso_machine', equipmentType: 'scale_accessory', compatible: true },
  { brewMethod: 'espresso_machine', equipmentType: 'paper_filter', compatible: false },
  { brewMethod: 'espresso_machine', equipmentType: 'mesh_filter', compatible: false },
  { brewMethod: 'espresso_machine', equipmentType: 'immersion_brewer', compatible: false },

  // V60
  { brewMethod: 'v60', equipmentType: 'pour_over_brewer', compatible: true },
  { brewMethod: 'v60', equipmentType: 'paper_filter', compatible: true },
  { brewMethod: 'v60', equipmentType: 'kettle', compatible: true },
  { brewMethod: 'v60', equipmentType: 'scale_accessory', compatible: true },
  { brewMethod: 'v60', equipmentType: 'portafilter', compatible: false },
  { brewMethod: 'v60', equipmentType: 'tamper', compatible: false },

  // French Press
  { brewMethod: 'french_press', equipmentType: 'immersion_brewer', compatible: true },
  { brewMethod: 'french_press', equipmentType: 'mesh_filter', compatible: true },
  { brewMethod: 'french_press', equipmentType: 'scale_accessory', compatible: true },
  { brewMethod: 'french_press', equipmentType: 'kettle', compatible: true },
  { brewMethod: 'french_press', equipmentType: 'grinder', compatible: true },

  // AeroPress
  { brewMethod: 'aeropress', equipmentType: 'immersion_brewer', compatible: true },
  { brewMethod: 'aeropress', equipmentType: 'paper_filter', compatible: true },
  { brewMethod: 'aeropress', equipmentType: 'scale_accessory', compatible: true },
  { brewMethod: 'aeropress', equipmentType: 'kettle', compatible: true },
  { brewMethod: 'aeropress', equipmentType: 'grinder', compatible: true },

  // Turkish Coffee
  { brewMethod: 'turkish_coffee', equipmentType: 'cezve', compatible: true },
  { brewMethod: 'turkish_coffee', equipmentType: 'scale_accessory', compatible: true },
  { brewMethod: 'turkish_coffee', equipmentType: 'grinder', compatible: true },

  // Drip Coffee
  { brewMethod: 'drip_coffee', equipmentType: 'pour_over_brewer', compatible: true },
  { brewMethod: 'drip_coffee', equipmentType: 'paper_filter', compatible: true },
  { brewMethod: 'drip_coffee', equipmentType: 'scale_accessory', compatible: true },
  { brewMethod: 'drip_coffee', equipmentType: 'grinder', compatible: true },

  // Chemex
  { brewMethod: 'chemex', equipmentType: 'pour_over_brewer', compatible: true },
  { brewMethod: 'chemex', equipmentType: 'paper_filter', compatible: true },
  { brewMethod: 'chemex', equipmentType: 'kettle', compatible: true },
  { brewMethod: 'chemex', equipmentType: 'scale_accessory', compatible: true },

  // Kalita Wave
  { brewMethod: 'kalita_wave', equipmentType: 'pour_over_brewer', compatible: true },
  { brewMethod: 'kalita_wave', equipmentType: 'paper_filter', compatible: true },
  { brewMethod: 'kalita_wave', equipmentType: 'kettle', compatible: true },
  { brewMethod: 'kalita_wave', equipmentType: 'scale_accessory', compatible: true },

  // Moka Pot
  { brewMethod: 'moka_pot', equipmentType: 'immersion_brewer', compatible: true },
  { brewMethod: 'moka_pot', equipmentType: 'scale_accessory', compatible: true },
  { brewMethod: 'moka_pot', equipmentType: 'grinder', compatible: true },

  // Cold Brew
  { brewMethod: 'cold_brew', equipmentType: 'immersion_brewer', compatible: true },
  { brewMethod: 'cold_brew', equipmentType: 'mesh_filter', compatible: true },
  { brewMethod: 'cold_brew', equipmentType: 'scale_accessory', compatible: true },
  { brewMethod: 'cold_brew', equipmentType: 'grinder', compatible: true },

  // Siphon
  { brewMethod: 'siphon', equipmentType: 'immersion_brewer', compatible: true },
  { brewMethod: 'siphon', equipmentType: 'scale_accessory', compatible: true },
  { brewMethod: 'siphon', equipmentType: 'thermometer', compatible: true },
  { brewMethod: 'siphon', equipmentType: 'kettle', compatible: true },
];
```

#### 1d. `packages/shared/src/schemas/equipment.ts` — Update enum

**DELETE old content and ADD:**
```ts
import { z } from 'zod';

export const EquipmentTypeEnum = z.enum([
  'espresso_machine', 'grinder', 'pour_over_brewer', 'immersion_brewer',
  'kettle', 'milk_tool', 'scale_accessory', 'roaster',
  'portafilter', 'basket', 'puck_screen', 'paper_filter', 'tamper',
  'mesh_filter', 'cezve', 'thermometer', 'other',
]);

export const EquipmentCreateSchema = z.object({
  name: z.string().min(1).max(255),
  type: EquipmentTypeEnum,
  brand: z.string().max(255).optional(),
  model: z.string().max(255).optional(),
  description: z.string().max(2000).optional(),
});

export const EquipmentUpdateSchema = EquipmentCreateSchema.partial();

export const EquipmentFilterSchema = z.object({
  type: EquipmentTypeEnum.optional(),
  category: z.enum([
    'espresso_machine', 'grinder', 'pour_over_brewer', 'immersion_brewer',
    'kettle', 'milk_tool', 'scale_accessory', 'roaster',
  ]).optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
});
```

#### 1e. `packages/shared/src/types/equipment.ts` — Update type

**ADD:**
```ts
export interface Equipment {
  id: string;
  name: string;
  type: EquipmentType;
  brand: string | null;
  model: string | null;
  description: string | null;
  isSystem: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type EquipmentType =
  | 'espresso_machine' | 'grinder' | 'pour_over_brewer' | 'immersion_brewer'
  | 'kettle' | 'milk_tool' | 'scale_accessory' | 'roaster'
  | 'portafilter' | 'basket' | 'puck_screen' | 'paper_filter' | 'tamper'
  | 'mesh_filter' | 'cezve' | 'thermometer' | 'other';
```

---

### Task 2: Create coffee_varieties table

**File:** `packages/db/src/schema.ts`

**ADD after the beans table definition:**
```ts
export const coffeeVarietyCategoryEnum = pgEnum('coffee_variety_category', [
  'variety',
  'processing',
  'market_name',
]);

export const coffeeVarieties = pgTable(
  'coffee_variety',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: varchar('name', { length: 255 }).notNull(),
    category: coffeeVarietyCategoryEnum('category').notNull(),
    species: varchar('species', { length: 255 }),
    origin: varchar('origin', { length: 500 }),
    spread: text('spread'),
    altitudeRangeM: varchar('altitude_range_m', { length: 100 }),
    cupProfile: text('cup_profile'),
    body: varchar('body', { length: 100 }),
    acidity: varchar('acidity', { length: 100 }),
    caffeinePct: varchar('caffeine_pct', { length: 50 }),
    processingCompatibility: text('processing_compatibility').array(),
    diseaseResistance: varchar('disease_resistance', { length: 100 }),
    yield: varchar('yield', { length: 100 }),
    plantSize: varchar('plant_size', { length: 100 }),
    notes: text('notes'),
    subVarieties: text('sub_varieties').array(),
    fermentation: text('fermentation'),
    dryingTimeDays: varchar('drying_time_days', { length: 50 }),
    dryingMethod: text('drying_method'),
    mucilageRetentionPct: varchar('mucilage_retention_pct', { length: 50 }),
    priceRange: varchar('price_range', { length: 100 }),
    processing: varchar('processing', { length: 255 }),
    typeLabel: varchar('type_label', { length: 255 }),
    notableFarms: text('notable_farms').array(),
    notableRegions: text('notable_regions').array(),
    regionalVariants: text('regional_variants').array(),
    globalSharePct: varchar('global_share_pct', { length: 50 }),
    isSystem: boolean('is_system').notNull().default(true),
    createdBy: varchar('created_by', { length: 36 }).references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('coffee_variety_name_idx').on(table.name),
    index('coffee_variety_category_idx').on(table.category),
    index('coffee_variety_deleted_at_idx').on(table.deletedAt),
  ],
);
```

**ADD relations (in relations section):**
```ts
export const coffeeVarietiesRelations = relations(coffeeVarieties, ({ one, many }) => ({
  createdByUser: one(users, {
    fields: [coffeeVarieties.createdBy],
    references: [users.id],
    relationName: 'coffee_variety_creator',
  }),
  recipeVersions: many(recipeVersions, { relationName: 'coffee_variety_versions' }),
}));
```

---

### Task 3: Add coffeeVarietyId FK to recipe_versions

**File:** `packages/db/src/schema.ts`

**ADD inside `recipeVersions` table definition (after `beanId`):**
```ts
coffeeVarietyId: varchar('coffee_variety_id', { length: 36 })
  .references(() => coffeeVarieties.id),
coffeeVarietyName: varchar('coffee_variety_name', { length: 255 }),
```

**ADD to `recipeVersionsRelations`:**
```ts
coffeeVariety: one(coffeeVarieties, {
  fields: [recipeVersions.coffeeVarietyId],
  references: [coffeeVarieties.id],
  relationName: 'coffee_variety_versions',
}),
```

---

### Task 4: Add isSystem column to equipment table

**File:** `packages/db/src/schema.ts`

**ADD inside `equipment` table definition (after `createdBy`):**
```ts
isSystem: boolean('is_system').notNull().default(false),
```

---

### Task 5: Create equipment_delete_request table

**File:** `packages/db/src/schema.ts`

**ADD after brewMethodEquipmentRules table:**
```ts
export const equipmentDeleteRequestStatusEnum = pgEnum('equipment_delete_request_status', [
  'pending',
  'approved',
  'rejected',
]);

export const equipmentDeleteRequests = pgTable(
  'equipment_delete_request',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    equipmentId: varchar('equipment_id', { length: 36 }).notNull()
      .references(() => equipment.id, { onDelete: 'cascade' }),
    requestedById: varchar('requested_by_id', { length: 36 }).notNull()
      .references(() => users.id),
    reason: text('reason'),
    status: equipmentDeleteRequestStatusEnum('status').notNull().default('pending'),
    reviewedById: varchar('reviewed_by_id', { length: 36 })
      .references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('edr_equipment_id_idx').on(table.equipmentId),
    index('edr_status_idx').on(table.status),
  ],
);
```

**ADD relations:**
```ts
export const equipmentDeleteRequestsRelations = relations(
  equipmentDeleteRequests, ({ one }) => ({
    equipment: one(equipment, {
      fields: [equipmentDeleteRequests.equipmentId],
      references: [equipment.id],
    }),
    requestedBy: one(users, {
      fields: [equipmentDeleteRequests.requestedById],
      references: [users.id],
      relationName: 'delete_request_requester',
    }),
    reviewedBy: one(users, {
      fields: [equipmentDeleteRequests.reviewedById],
      references: [users.id],
      relationName: 'delete_request_reviewer',
    }),
  }),
);
```

---

### Task 6: Generate Drizzle migration

**Commands:**
```bash
make db-generate
make db-migrate
```

**Expected output:** A new file in `packages/db/drizzle/` with SQL containing:
- `ALTER TYPE equipment_type ADD VALUE ...` (or `CREATE TYPE` for new)
- `CREATE TABLE coffee_variety (...)`
- `ALTER TABLE recipe_version ADD COLUMN coffee_variety_id ...`
- `ALTER TABLE equipment ADD COLUMN is_system ...`
- `CREATE TABLE equipment_delete_request (...)`

---

## Phase 2: Shared Schemas & Types (tasks 7-8)

---

### Task 7: Coffee variety shared schemas & types

**File:** `packages/shared/src/types/coffee-variety.ts` — CREATE:

```ts
export type CoffeeVarietyCategory = 'variety' | 'processing' | 'market_name';

export interface CoffeeVariety {
  id: string;
  name: string;
  category: CoffeeVarietyCategory;
  species: string | null;
  origin: string | null;
  spread: string | null;
  altitudeRangeM: string | null;
  cupProfile: string | null;
  body: string | null;
  acidity: string | null;
  caffeinePct: string | null;
  processingCompatibility: string[] | null;
  diseaseResistance: string | null;
  yield: string | null;
  plantSize: string | null;
  notes: string | null;
  subVarieties: string[] | null;
  fermentation: string | null;
  dryingTimeDays: string | null;
  dryingMethod: string | null;
  mucilageRetentionPct: string | null;
  priceRange: string | null;
  processing: string | null;
  typeLabel: string | null;
  notableFarms: string[] | null;
  notableRegions: string[] | null;
  regionalVariants: string[] | null;
  globalSharePct: string | null;
  isSystem: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
```

**File:** `packages/shared/src/schemas/coffee-variety.ts` — CREATE:

```ts
import { z } from 'zod';

const CoffeeVarietyCategoryEnum = z.enum(['variety', 'processing', 'market_name']);

export const CoffeeVarietyCreateSchema = z.object({
  name: z.string().min(1).max(255),
  category: CoffeeVarietyCategoryEnum,
  species: z.string().max(255).optional(),
  origin: z.string().max(500).optional(),
  spread: z.string().max(1000).optional(),
  altitudeRangeM: z.string().max(100).optional(),
  cupProfile: z.string().max(2000).optional(),
  body: z.string().max(100).optional(),
  acidity: z.string().max(100).optional(),
  caffeinePct: z.string().max(50).optional(),
  processingCompatibility: z.array(z.string()).optional(),
  diseaseResistance: z.string().max(100).optional(),
  yield: z.string().max(100).optional(),
  plantSize: z.string().max(100).optional(),
  notes: z.string().max(5000).optional(),
  subVarieties: z.array(z.string()).optional(),
  fermentation: z.string().max(2000).optional(),
  dryingTimeDays: z.string().max(50).optional(),
  dryingMethod: z.string().max(1000).optional(),
  mucilageRetentionPct: z.string().max(50).optional(),
  priceRange: z.string().max(100).optional(),
  processing: z.string().max(255).optional(),
  typeLabel: z.string().max(255).optional(),
  notableFarms: z.array(z.string()).optional(),
  notableRegions: z.array(z.string()).optional(),
  regionalVariants: z.array(z.string()).optional(),
  globalSharePct: z.string().max(50).optional(),
});

export const CoffeeVarietyUpdateSchema = CoffeeVarietyCreateSchema.partial();

export const CoffeeVarietyFilterSchema = z.object({
  category: CoffeeVarietyCategoryEnum.optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
});
```

**File:** `packages/shared/src/schemas/index.ts` — ADD to barrel exports:

```ts
export {
  CoffeeVarietyCreateSchema,
  CoffeeVarietyUpdateSchema,
  CoffeeVarietyFilterSchema,
} from './coffee-variety.ts';
```

---

### Task 8: Update shared equipment schemas

**File:** `packages/shared/src/schemas/equipment.ts` — Already updated in Task 1d. The `EquipmentCreateSchema` already accepts new enum values.

**File:** `packages/shared/src/schemas/index.ts` — ADD to barrel exports (if not already):

```ts
export {
  EquipmentCreateSchema,
  EquipmentUpdateSchema,
  EquipmentFilterSchema,
} from './equipment.ts';
```

---

## Phase 3: API Layer (tasks 9-13)

---

### Task 9: Create coffee_variety API module (3-layer)

**File:** `apps/api/src/modules/coffee-variety/model.ts` — CREATE:

```ts
import { and, asc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { db } from '@brewform/db';
import { coffeeVarieties, recipes, recipeVersions } from '@brewform/db';

export async function findById(id: string) {
  return db.query.coffeeVarieties.findFirst({
    where: and(eq(coffeeVarieties.id, id), isNull(coffeeVarieties.deletedAt)),
  });
}

export async function findMany(params: {
  category?: string;
  search?: string;
  page: number;
  perPage: number;
}) {
  const conditions = [isNull(coffeeVarieties.deletedAt)];

  if (params.category) {
    conditions.push(eq(coffeeVarieties.category, params.category as any));
  }
  if (params.search) {
    const searchPattern = `%${params.search}%`;
    conditions.push(
      or(
        ilike(coffeeVarieties.name, searchPattern),
        ilike(coffeeVarieties.species, searchPattern),
        ilike(coffeeVarieties.origin, searchPattern),
      )!,
    );
  }

  const where = and(...conditions)!;
  const offset = (params.page - 1) * params.perPage;

  const [data, countResult] = await Promise.all([
    db.select().from(coffeeVarieties).where(where)
      .orderBy(asc(coffeeVarieties.name))
      .limit(params.perPage).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(coffeeVarieties).where(where),
  ]);

  return { data, total: Number(countResult[0]?.count ?? 0) };
}

export async function create(data: typeof coffeeVarieties.$inferInsert) {
  const [result] = await db.insert(coffeeVarieties).values(data).returning();
  return result;
}

export async function update(id: string, data: Partial<typeof coffeeVarieties.$inferInsert>) {
  const [result] = await db.update(coffeeVarieties)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(coffeeVarieties.id, id), isNull(coffeeVarieties.deletedAt)))
    .returning();
  return result;
}

export async function softDelete(id: string) {
  const [result] = await db.update(coffeeVarieties)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(coffeeVarieties.id, id))
    .returning();
  return result;
}

export async function getRecipesUsingVariety(
  varietyId: string, page: number, perPage: number,
) {
  const offset = (page - 1) * perPage;
  const versions = db.select({ recipeId: recipeVersions.recipeId })
    .from(recipeVersions)
    .where(
      and(
        eq(recipeVersions.coffeeVarietyId, varietyId),
        isNull(recipes.deletedAt),
      ),
    );

  const [data, countResult] = await Promise.all([
    db.query.recipes.findMany({
      with: {
        author: { columns: { username: true, displayName: true, avatarUrl: true } },
        currentVersion: {
          with: { photos: { with: { photo: true } } },
        },
      },
      where: and(
        eq(recipes.visibility, 'public'),
        isNull(recipes.deletedAt),
        sql`${recipes.currentVersionId} IN (SELECT recipe_version_id FROM recipe_version WHERE coffee_variety_id = ${varietyId} AND deleted_at IS NULL)`,
      ),
      orderBy: desc(recipes.createdAt),
      limit: perPage,
      offset,
    }),
    db.select({ count: sql<number>`count(distinct ${recipes.id})` })
      .from(recipes)
      .innerJoin(recipeVersions, eq(recipes.currentVersionId, recipeVersions.id))
      .where(
        and(
          eq(recipeVersions.coffeeVarietyId, varietyId),
          eq(recipes.visibility, 'public'),
          isNull(recipes.deletedAt),
        ),
      ),
  ]);

  return { data, total: Number(countResult[0]?.count ?? 0) };
}
```

**File:** `apps/api/src/modules/coffee-variety/service.ts` — CREATE:

```ts
import * as model from './model.ts';
import { cacheProvider } from '../../utils/cache/singleton.ts';
import type { CacheProvider } from '../../utils/cache/types.ts';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function getCoffeeVarietyById(id: string) {
  const cacheKey = ['coffee-variety', id];
  const cached = await cacheProvider?.get<Record<string, unknown>>(cacheKey);
  if (cached) return cached;

  const variety = await model.findById(id);
  if (!variety) return null;

  await cacheProvider?.set(cacheKey, variety as unknown as Record<string, unknown>, {
    ttlMs: CACHE_TTL_MS,
  });
  return variety;
}

export async function listCoffeeVarieties(params: {
  category?: string; search?: string; page: number; perPage: number;
}) {
  return model.findMany(params);
}

export async function createCoffeeVariety(
  data: { name: string; category: string },
  userId: string,
) {
  return model.create({ ...data, createdBy: userId, isSystem: false } as any);
}

export async function updateCoffeeVariety(
  id: string, data: Record<string, unknown>, userId: string,
) {
  const variety = await model.findById(id);
  if (!variety) throw new Error('Coffee variety not found');
  if (variety.isSystem && !data.isSystem) {
    throw new Error('Cannot modify system coffee variety');
  }

  const result = await model.update(id, data as any);
  await cacheProvider?.delete(['coffee-variety', id]);
  return result;
}

export async function deleteCoffeeVariety(id: string, userId: string) {
  const variety = await model.findById(id);
  if (!variety) throw new Error('Coffee variety not found');
  if (variety.isSystem) {
    throw new Error('Cannot delete system coffee variety');
  }

  const result = await model.softDelete(id);
  await cacheProvider?.delete(['coffee-variety', id]);
  return result;
}

export async function getRecipesForVariety(
  varietyId: string, page: number, perPage: number,
) {
  return model.getRecipesUsingVariety(varietyId, page, perPage);
}
```

**File:** `apps/api/src/modules/coffee-variety/index.ts` — CREATE:

```ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppEnv } from '../../types.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import {
  CoffeeVarietyCreateSchema,
  CoffeeVarietyUpdateSchema,
  CoffeeVarietyFilterSchema,
} from '@brewform/shared/schemas';
import * as service from './service.ts';

const router = new Hono<AppEnv>();

router.get('/', zValidator('query', CoffeeVarietyFilterSchema), async (c) => {
  const query = c.req.valid('query');
  const result = await service.listCoffeeVarieties(query);
  return c.json({ success: true, ...result });
});

router.get('/search', async (c) => {
  const q = c.req.query('q');
  if (!q || q.length < 2) {
    return c.json({ success: true, data: [] });
  }
  const result = await service.listCoffeeVarieties({ search: q, page: 1, perPage: 20 });
  return c.json({ success: true, data: result.data });
});

router.post('/', authMiddleware, zValidator('json', CoffeeVarietyCreateSchema), async (c) => {
  const body = c.req.valid('json');
  const userId = c.get('userId')!;
  const result = await service.createCoffeeVariety(body, userId);
  return c.json({ success: true, data: result }, 201);
});

router.get('/:id', async (c) => {
  const variety = await service.getCoffeeVarietyById(c.req.param('id'));
  if (!variety) {
    return c.json({ success: false, error: 'Coffee variety not found' }, 404);
  }
  return c.json({ success: true, data: variety });
});

router.patch('/:id', authMiddleware, zValidator('json', CoffeeVarietyUpdateSchema), async (c) => {
  const body = c.req.valid('json');
  const userId = c.get('userId')!;
  try {
    const result = await service.updateCoffeeVariety(c.req.param('id'), body, userId);
    return c.json({ success: true, data: result });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 400);
  }
});

router.delete('/:id', authMiddleware, async (c) => {
  const userId = c.get('userId')!;
  try {
    const result = await service.deleteCoffeeVariety(c.req.param('id'), userId);
    return c.json({ success: true, data: result });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 400);
  }
});

router.get('/:id/recipes', async (c) => {
  const page = Number(c.req.query('page') || '1');
  const perPage = Number(c.req.query('perPage') || '12');
  const result = await service.getRecipesForVariety(
    c.req.param('id'), page, perPage,
  );
  return c.json({ success: true, ...result });
});

export default router;
```

---

### Task 10: Update equipment API module

**File:** `apps/api/src/modules/equipment/model.ts` — ADD new functions:

```ts
// ADD these functions:

export async function findManyWithFilters(params: {
  type?: string;
  category?: string;
  search?: string;
  page: number;
  perPage: number;
}) {
  const conditions = [isNull(equipment.deletedAt)];

  if (params.type) {
    conditions.push(eq(equipment.type, params.type as any));
  }
  if (params.category) {
    // Category maps to broad equipment types
    conditions.push(eq(equipment.type, params.category as any));
  }
  if (params.search) {
    const searchPattern = `%${params.search}%`;
    conditions.push(
      or(
        ilike(equipment.name, searchPattern),
        ilike(equipment.brand, searchPattern),
        ilike(equipment.model, searchPattern),
      )!,
    );
  }

  const where = and(...conditions)!;
  const offset = (params.page - 1) * params.perPage;

  const [data, countResult] = await Promise.all([
    db.select().from(equipment).where(where)
      .orderBy(asc(equipment.name))
      .limit(params.perPage).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(equipment).where(where),
  ]);

  return { data, total: Number(countResult[0]?.count ?? 0) };
}

export async function getRecipesUsingEquipment(
  equipmentId: string, page: number, perPage: number,
) {
  const offset = (page - 1) * perPage;
  const [data, countResult] = await Promise.all([
    db.query.recipes.findMany({
      with: {
        author: { columns: { username: true, displayName: true, avatarUrl: true } },
        currentVersion: {
          with: { photos: { with: { photo: true } } },
        },
      },
      where: and(
        eq(recipes.visibility, 'public'),
        isNull(recipes.deletedAt),
        sql`${recipes.currentVersionId} IN (
          SELECT re.recipe_version_id FROM recipe_equipment re
          WHERE re.equipment_id = ${equipmentId}
        )`,
      ),
      orderBy: desc(recipes.createdAt),
      limit: perPage,
      offset,
    }),
    db.select({ count: sql<number>`count(distinct ${recipes.id})` })
      .from(recipes)
      .innerJoin(recipeVersions, eq(recipes.currentVersionId, recipeVersions.id))
      .innerJoin(recipeEquipment, eq(recipeVersions.id, recipeEquipment.recipeVersionId))
      .where(
        and(
          eq(recipeEquipment.equipmentId, equipmentId),
          eq(recipes.visibility, 'public'),
          isNull(recipes.deletedAt),
        ),
      ),
  ]);

  return { data, total: Number(countResult[0]?.count ?? 0) };
}

export async function createDeleteRequest(data: {
  equipmentId: string;
  requestedById: string;
  reason?: string;
}) {
  const [result] = await db.insert(equipmentDeleteRequests).values(data).returning();
  return result;
}
```

**File:** `apps/api/src/modules/equipment/service.ts` — ADD functions:

```ts
// ADD these imports:
import { cacheProvider } from '../../utils/cache/singleton.ts';
import { equipmentDeleteRequests } from '@brewform/db';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// ADD these functions:

export async function getEquipmentById(id: string) {
  const cacheKey = ['equipment-detail', id];
  const cached = await cacheProvider?.get<Record<string, unknown>>(cacheKey);
  if (cached) return cached;

  const eq = await model.findById(id);
  if (!eq) return null;

  await cacheProvider?.set(cacheKey, eq as unknown as Record<string, unknown>, {
    ttlMs: CACHE_TTL_MS,
  });
  return eq;
}

export async function listEquipment(params: {
  type?: string; category?: string; search?: string; page: number; perPage: number;
}) {
  return model.findManyWithFilters(params);
}

export async function requestEquipmentDeletion(
  equipmentId: string, userId: string, reason?: string,
) {
  const eq = await model.findById(equipmentId);
  if (!eq) throw new Error('Equipment not found');
  return model.createDeleteRequest({ equipmentId, requestedById: userId, reason });
}

export async function getRecipesForEquipment(
  equipmentId: string, page: number, perPage: number,
) {
  return model.getRecipesUsingEquipment(equipmentId, page, perPage);
}
```

**File:** `apps/api/src/modules/equipment/index.ts` — ADD new routes:

```ts
// ADD these routes:

router.get('/:id/recipes', async (c) => {
  const page = Number(c.req.query('page') || '1');
  const perPage = Number(c.req.query('perPage') || '12');
  const result = await service.getRecipesForEquipment(
    c.req.param('id'), page, perPage,
  );
  return c.json({ success: true, ...result });
});

router.post('/:id/delete-request', authMiddleware, async (c) => {
  const userId = c.get('userId')!;
  const reason = c.req.query('reason');
  try {
    const result = await service.requestEquipmentDeletion(
      c.req.param('id'), userId, reason,
    );
    return c.json({ success: true, data: result }, 201);
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 400);
  }
});
```

---

### Task 11: Update recipe API module

**File:** `apps/api/src/modules/recipe/service.ts` — ADD coffee variety support:

**In `createRecipe` function, add to the recipe version insert:**
```ts
// ADD these fields to the recipe version insert object:
coffeeVarietyId: data.coffeeVarietyId ?? null,
coffeeVarietyName: data.coffeeVarietyName ?? null,
```

**In `updateRecipe` function, add to the newVersion object:**
```ts
coffeeVarietyId: data.coffeeVarietyId ?? previousVersion.coffeeVarietyId,
coffeeVarietyName: data.coffeeVarietyName ?? previousVersion.coffeeVarietyName,
```

**In `listRecipes` function, ADD coffee variety filter:**
```ts
// ADD inside listRecipes after the other filter conditions:
if (filters.coffeeVarietyId) {
  conditions.push(
    sql`${recipes.currentVersionId} IN (
      SELECT rv.id FROM recipe_version rv
      WHERE rv.coffee_variety_id = ${filters.coffeeVarietyId}
    )`,
  );
}
```

**ADD equipment category filter in `listRecipes`:**
```ts
if (filters.equipmentCategory) {
  conditions.push(
    sql`${recipes.currentVersionId} IN (
      SELECT re.recipe_version_id FROM recipe_equipment re
      JOIN equipment e ON e.id = re.equipment_id
      WHERE e.type = ${filters.equipmentCategory}
    )`,
  );
}
```

**ADD multiple equipmentIds filter:**
```ts
if (filters.equipmentIds?.length) {
  conditions.push(
    sql`${recipes.currentVersionId} IN (
      SELECT re.recipe_version_id FROM recipe_equipment re
      WHERE re.equipment_id IN (${filters.equipmentIds.join(',')})
    )`,
  );
}
```

**File:** `apps/api/src/modules/recipe/model.ts` — ADD to detail query:
```ts
// In the 'with' clause of findById/findBySlug, add to recipeVersions:
coffeeVariety: { columns: { id: true, name: true } },
```

---

### Task 12: Update RecipeFilterSchema

**File:** `packages/shared/src/schemas/recipe.ts` — ADD fields:

```ts
// ADD these to RecipeFilterSchema:
coffeeVarietyId: z.uuid().optional(),
equipmentCategory: z.enum([
  'espresso_machine', 'grinder', 'pour_over_brewer', 'immersion_brewer',
  'kettle', 'milk_tool', 'scale_accessory', 'roaster',
]).optional(),
equipmentIds: z.string().optional().refine((val) => {
  if (!val) return true;
  const ids = val.split(',');
  return ids.length <= 10 && ids.every((id) => /^[0-9a-f-]{36}$/.test(id));
}, 'Must be comma-separated UUIDs, max 10'),
```

---

### Task 13: Register new routes

**File:** `apps/api/src/routes/index.ts` — ADD:

```ts
import coffeeVarietyRoutes from '../modules/coffee-variety/index.ts';

// ADD this line:
app.route('/api/v1/coffee-varieties', coffeeVarietyRoutes);
```

---

## Phase 4: Seed Data (tasks 14-17)

---

### Task 14: Equipment catalog seed data (378 entries)

**File:** `packages/db/src/seed-data.ts` — ADD:

```ts
// JSON category to equipment type mapping
const CATEGORY_TYPE_MAP: Record<string, string> = {
  espresso_machines_commercial: 'espresso_machine',
  grinders: 'grinder',
  pour_over_filter: 'pour_over_brewer',
  immersion_pressure: 'immersion_brewer',
  kettles: 'kettle',
  milk_tools: 'milk_tool',
  scales_measurement: 'scale_accessory',
  roasters: 'roaster',
};

// Generate deterministic UUID from name
function equipmentUuid(name: string): string {
  // UUID v5 with namespace "brewform-equipment"
  const encoder = new TextEncoder();
  const namespace = encoder.encode('brewform-equipment');
  const data = encoder.encode(name);
  // Combine namespace + name for hashing
  const combined = new Uint8Array(namespace.length + data.length);
  combined.set(namespace);
  combined.set(data, namespace.length);
  // Use simple hash-based UUID generation
  const hash = Array.from(
    new Uint8Array(
      crypto.subtle ? /* use Web Crypto if available */
        crypto.getRandomValues(new Uint8Array(16)) :
        new Uint8Array(16).map((_, i) => combined[i % combined.length] ^ (i * 37)),
    ),
  );
  hash[6] = (hash[6] & 0x0f) | 0x50; // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // variant
  return [...hash].map((b) => b.toString(16).padStart(2, '0')).join('')
    .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
}

export const equipmentCatalogSeedData = [
  // --- Espresso Machines — Commercial (110 entries) ---
  {
    id: '00000000-0000-5000-8000-000000000001',
    name: 'La Marzocco Linea PB',
    type: 'espresso_machine',
    brand: 'La Marzocco',
    model: 'Linea PB',
    description: 'Commercial semi-automatic, dual boiler, saturated group heads. 1-4 groups.',
    isSystem: true,
  },
  {
    id: '00000000-0000-5000-8000-000000000002',
    name: 'La Marzocco Strada',
    type: 'espresso_machine',
    brand: 'La Marzocco',
    model: 'Strada',
    description: 'Commercial, pressure profiling per group, dual boiler, 2-3 groups.',
    isSystem: true,
  },
  {
    id: '00000000-0000-5000-8000-000000000003',
    name: 'Victoria Arduino Eagle One',
    type: 'espresso_machine',
    brand: 'Victoria Arduino',
    model: 'Eagle One',
    description: 'Commercial, energy-efficient, NEO technology, 2-3 groups.',
    isSystem: true,
  },
  // ... (all 378 entries from coffee_equipments_v2.json, mapped similarly)
  // Each entry: id (deterministic UUID), name (brand + model), type, brand, model,
  // description (notable_features), isSystem: true

  // --- Grinders (65 entries) ---
  {
    id: '00000000-0000-5000-8001-000000000001',
    name: 'Mahlkönig EK43',
    type: 'grinder',
    brand: 'Mahlkönig',
    model: 'EK43',
    description: 'Commercial flat burr, 98mm burrs. Industry standard for filter + espresso.',
    isSystem: true,
  },
  {
    id: '00000000-0000-5000-8001-000000000002',
    name: 'Eureka Mignon Specialita',
    type: 'grinder',
    brand: 'Eureka',
    model: 'Mignon Specialita',
    description: 'Home flat burr, 55mm burrs. Quiet operation, digital timer.',
    isSystem: true,
  },
  {
    id: '00000000-0000-5000-8001-000000000003',
    name: 'Niche Zero',
    type: 'grinder',
    brand: 'Niche',
    model: 'Zero',
    description: 'Home conical burr, 63mm burrs. Single dose, low retention.',
    isSystem: true,
  },
  // ... (all remaining grinders, pour-over brewers, etc.)

  // --- Pour-Over & Filter Brewers (44 entries) ---
  {
    id: '00000000-0000-5000-8002-000000000001',
    name: 'Hario V60',
    type: 'pour_over_brewer',
    brand: 'Hario',
    model: 'V60',
    description: 'Pour-over cone, ceramic/plastic/glass options, spiral ribs for even extraction.',
    isSystem: true,
  },
  {
    id: '00000000-0000-5000-8002-000000000002',
    name: 'Chemex Classic',
    type: 'pour_over_brewer',
    brand: 'Chemex',
    model: 'Classic',
    description: 'Borosilicate glass + wood collar, thick bonded paper filters.',
    isSystem: true,
  },

  // --- Kettles (20 entries) ---
  {
    id: '00000000-0000-5000-8004-000000000001',
    name: 'Fellow Stagg EKG',
    type: 'kettle',
    brand: 'Fellow',
    model: 'Stagg EKG',
    description: 'Electric gooseneck kettle, 1°C precision, 60-minute hold, 0.9L.',
    isSystem: true,
  },
  {
    id: '00000000-0000-5000-8004-000000000002',
    name: 'Brewista Artisan',
    type: 'kettle',
    brand: 'Brewista',
    model: 'Artisan',
    description: 'Electric gooseneck kettle, variable temperature, 1500W, 1.0L.',
    isSystem: true,
  },

  // --- Scales & Accessories (60 entries) ---
  {
    id: '00000000-0000-5000-8006-000000000001',
    name: 'Acaia Lunar',
    type: 'scale_accessory',
    brand: 'Acaia',
    model: 'Lunar',
    description: 'Espresso scale, 0.1g precision, water resistant, Bluetooth.',
    isSystem: true,
  },
  {
    id: '00000000-0000-5000-8006-000000000002',
    name: 'Acaia Pearl',
    type: 'scale_accessory',
    brand: 'Acaia',
    model: 'Pearl',
    description: 'Pour-over scale, 0.1g precision, auto-timer, Bluetooth.',
    isSystem: true,
  },
  // ... (remaining entries for milk tools, roasters, etc.)
];
// NOTE: Fill in ALL 378 entries from coffee_equipments_v2.json using the pattern above.
```

---

### Task 15: Coffee variety seed data (98 entries)

**File:** `packages/db/src/seed-data.ts` — ADD:

```ts
export const coffeeVarietySeedData = [
  // --- Arabica — Heirloom & Landrace (16 varieties) ---
  {
    id: '00000000-0000-5000-a000-000000000001',
    name: 'Typica',
    category: 'variety',
    species: 'Coffea arabica',
    origin: 'Ethiopia (natural origin), Yemen (first cultivation)',
    spread: 'Grown worldwide as the foundation of Arabica cultivation. Introduced to Americas via Martinique (1720).',
    altitudeRangeM: '1200-1800',
    cupProfile: 'Clean, sweet, balanced acidity, medium body, chocolate and nutty notes',
    body: 'Medium',
    acidity: 'Medium',
    caffeinePct: '1.2-1.5',
    processingCompatibility: ['Washed', 'Natural', 'Honey'],
    diseaseResistance: 'Low (susceptible to coffee leaf rust)',
    yield: 'Low-Medium',
    plantSize: 'Tall',
    notes: 'The original Arabica variety from which many others descend. Known for excellent cup quality.',
    isSystem: true,
  },
  {
    id: '00000000-0000-5000-a000-000000000002',
    name: 'Bourbon',
    category: 'variety',
    species: 'Coffea arabica',
    origin: 'Réunion Island (formerly Bourbon), from Yemen seeds (1708)',
    spread: 'Widely grown in Latin America (Brazil, El Salvador, Colombia) and East Africa',
    altitudeRangeM: '1000-2000',
    cupProfile: 'Sweet, complex, chocolate and caramel notes, bright acidity',
    body: 'Medium-Full',
    acidity: 'High',
    caffeinePct: '1.2-1.5',
    processingCompatibility: ['Washed', 'Natural', 'Honey'],
    diseaseResistance: 'Low-Medium',
    yield: 'Medium',
    plantSize: 'Medium-Tall',
    subVarieties: ['Red Bourbon', 'Yellow Bourbon', 'Orange Bourbon', 'Pink Bourbon'],
    notes: 'Named after Bourbon Island. Mutated into Red, Yellow, Orange, and Pink variants.',
    isSystem: true,
  },
  {
    id: '00000000-0000-5000-a000-000000000003',
    name: 'Gesha (Geisha)',
    category: 'variety',
    species: 'Coffea arabica',
    origin: 'Gesha, Ethiopia (1930s collection)',
    spread: 'Panama (Hacienda La Esmeralda made it famous), Costa Rica, Colombia, Ethiopia',
    altitudeRangeM: '1500-2100',
    cupProfile: 'Floral, jasmine, bergamot, stone fruits, tea-like, exceptionally complex',
    body: 'Light-Medium',
    acidity: 'Very High (vibrant, tea-like)',
    caffeinePct: '1.0-1.3',
    processingCompatibility: ['Washed', 'Natural', 'Honey', 'Anaerobic'],
    diseaseResistance: 'Low-Medium',
    yield: 'Low',
    plantSize: 'Tall',
    notableFarms: ['Hacienda La Esmeralda (Panama)', 'Ninety Plus (Panama)'],
    notes: 'The most expensive coffee variety at auction. Record: $10,000+/kg. Originally from Ethiopian Gesha forest.',
    isSystem: true,
  },
  {
    id: '00000000-0000-5000-a000-000000000004',
    name: 'Ethiopian Heirloom',
    category: 'variety',
    species: 'Coffea arabica',
    origin: 'Ethiopia',
    spread: 'Cultivated across all Ethiopian coffee regions (Yirgacheffe, Sidamo, Guji, Harrar)',
    altitudeRangeM: '1500-2200',
    cupProfile: 'Floral, citrus, berries, complex, tea-like body',
    body: 'Light-Medium',
    acidity: 'High (bright, citrus)',
    caffeinePct: '1.0-1.4',
    processingCompatibility: ['Washed', 'Natural', 'Honey', 'Anaerobic'],
    diseaseResistance: 'Varies',
    yield: 'Medium',
    plantSize: 'Varies',
    notableRegions: ['Yirgacheffe', 'Sidamo', 'Guji', 'Harrar', 'Limu', 'Jimma'],
    notes: 'Collective term for thousands of wild and semi-wild varieties native to Ethiopia. The genetic reservoir of all Arabica.',
    isSystem: true,
  },
  // ... (all remaining 94 varieties from coffee_types_v2.json)

  // --- Processing & Fermentation Styles (15 entries) ---
  {
    id: '00000000-0000-5000-a000-000000000101',
    name: 'Washed (Wet) Process',
    category: 'processing',
    origin: 'Global (developed in the 19th century)',
    regions: 'Central America, Colombia, Kenya, Ethiopia',
    cupProfile: 'Clean, bright acidity, transparent origin character',
    body: 'Light-Medium',
    acidity: 'High',
    fermentation: 'Submerged fermentation in water tanks (12-36 hours)',
    dryingTimeDays: '7-15',
    notes: 'Cherry pulped → fermented to remove mucilage → washed → dried. The standard for showcasing terroir.',
    isSystem: true,
  },
  {
    id: '00000000-0000-5000-a000-000000000102',
    name: 'Natural (Dry) Process',
    category: 'processing',
    origin: 'Ethiopia (traditional method)',
    regions: 'Ethiopia, Brazil, Yemen',
    cupProfile: 'Intense fruit, berry, wine-like, heavy body',
    body: 'Full',
    acidity: 'Low-Medium',
    fermentation: 'Natural aerobic fermentation inside fruit',
    dryingTimeDays: '20-35',
    notes: 'Whole cherry dried on raised beds or patios. Produces fruit-forward, complex flavors.',
    isSystem: true,
  },
  // ... (remaining 13 processing styles)

  // --- Commercially Known Names (16 entries) ---
  {
    id: '00000000-0000-5000-a000-000000000201',
    name: 'Panama Gesha (Hacienda La Esmeralda)',
    category: 'market_name',
    species: 'Coffea arabica — Gesha',
    origin: 'Boquete, Panama',
    cupProfile: 'Jasmine, bergamot, stone fruit, honey, exceptionally complex floral',
    body: 'Light',
    acidity: 'Very High (tea-like)',
    priceRange: '$100-$10,000+/kg at auction',
    notes: 'The benchmark Gesha. Won Best of Panama multiple times. Auction lots command world record prices.',
    isSystem: true,
  },
  // ... (remaining 15 market names)
];
// NOTE: Fill in ALL 98 entries from coffee_types_v2.json using the pattern above.
```

---

### Task 16: Update existing recipe seed data

**File:** `packages/db/src/seed-data.ts` — UPDATE recipe entries:

**UPDATE `recipeSeedData` to reference coffee variety IDs and catalog equipment IDs:**
```ts
export const recipeSeedData = [
  {
    // ...existing fields...
    coffeeVarietyId: '00000000-0000-5000-a000-000000000001', // Typica
    coffeeVarietyName: 'Typica',
    equipmentIds: [
      '00000000-0000-5000-8000-000000000001', // La Marzocco Linea PB
      '00000000-0000-5000-8001-000000000001', // Mahlkönig EK43
      // Also keep accessory equipment IDs from existing seed if needed
    ],
    // Keep equipmentNames for backward compat during migration
    equipmentNames: ['Bottomless Portafilter 58mm', 'IMS H24 18g', /* ... */],
  },
  // ...update all 6 recipes similarly
];
```

---

### Task 17: Update seed.ts

**File:** `packages/db/src/seed.ts` — ADD functions and update flow:

```ts
// ADD import:
import { equipmentCatalogSeedData, coffeeVarietySeedData } from './seed-data.ts';

// ADD function:
async function seedEquipmentCatalog(tx: any) {
  const createdCatalog: Record<string, any> = {};
  for (const equipData of equipmentCatalogSeedData) {
    const [equip] = await tx.insert(equipment).values({
      id: equipData.id,
      name: equipData.name,
      type: equipData.type as any,
      brand: equipData.brand,
      model: equipData.model ?? null,
      description: equipData.description ?? null,
      isSystem: true,
    }).returning();
    createdCatalog[equipData.name] = equip;
  }
  return createdCatalog;
}

// ADD function:
async function seedCoffeeVarieties(tx: any) {
  const created: Record<string, any> = {};
  for (const varietyData of coffeeVarietySeedData) {
    const [row] = await tx.insert(coffeeVarieties).values({
      id: varietyData.id,
      name: varietyData.name,
      category: varietyData.category as any,
      species: varietyData.species ?? null,
      origin: varietyData.origin ?? null,
      // ...all fields...
      isSystem: varietyData.isSystem ?? true,
    }).returning();
    created[varietyData.name] = row;
  }
  return created;
}

// UPDATE main() seed order:
// 1. seedBrewMethodCompatibility(tx)
// 2. seedBadges(tx)
// 3. seedUsers(tx)
// 4. seedEquipmentCatalog(tx)          // NEW: 378 catalog entries
// 5. seedCoffeeVarieties(tx)           // NEW: 98 coffee varieties
// 6. seedVendors(tx, createdUsers)
// 7. seedEquipment(tx, createdUsers)   // User-created equipment
// 8. seedBeans(...)
// 9. seedRecipes(...)
// 10-12. ...rest
```

**UPDATE `seedRecipes` to handle coffeeVarietyId:**
```ts
// Inside seedRecipes, ADD to the recipe version insert:
coffeeVarietyId: recipeData.coffeeVarietyId ?? null,
coffeeVarietyName: recipeData.coffeeVarietyName ?? null,
```

**UPDATE `seedEquipment` return to merge with catalog:**
```ts
// Return both catalog + user equipment maps merged
```

---

## Phase 5: Frontend Pages (tasks 18-26)

---

### Task 18: Coffee Varieties List Page

**File:** `apps/web/src/pages/coffee-varieties/CoffeeVarietiesPage.tsx` — CREATE:

```tsx
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../utils/api.ts';

const CATEGORIES = [
  { value: 'variety', label: 'Botanical Varieties' },
  { value: 'processing', label: 'Processing Methods' },
  { value: 'market_name', label: 'Specialty Lots' },
] as const;

export default function CoffeeVarietiesPage() {
  const [varieties, setVarieties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchVarieties = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), perPage: '12' });
      if (category) params.set('category', category);
      if (search) params.set('search', search);
      const res = await api.get(`/coffee-varieties?${params}`);
      setVarieties(res.data);
      setTotal(res.total);
    } catch (e) {
      setError('Failed to load coffee varieties. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [category, search, page]);

  useEffect(() => { fetchVarieties(); }, [fetchVarieties]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Coffee Varieties</h1>
      <p className="text-muted mb-8">
        Explore the world of coffee — from heirloom Arabica to rare species
      </p>

      {/* Category tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <button
          onClick={() => { setCategory(''); setPage(1); }}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            !category
              ? 'bg-coffee-700 text-white'
              : 'bg-surface hover:bg-coffee-100 dark:hover:bg-coffee-800'
          }`}
        >
          All
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => { setCategory(cat.value); setPage(1); }}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              category === cat.value
                ? 'bg-coffee-700 text-white'
                : 'bg-surface hover:bg-coffee-100 dark:hover:bg-coffee-800'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search varieties, species, origin..."
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        className="w-full px-4 py-2 rounded-lg border border-border bg-surface mb-6"
      />

      {/* Content */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 rounded-xl bg-surface animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="text-center py-12">
          <p className="text-red-500 mb-4">{error}</p>
          <button onClick={fetchVarieties} className="btn-primary">Retry</button>
        </div>
      )}

      {!loading && !error && varieties.length === 0 && (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🌱</div>
          <h3 className="text-xl font-semibold mb-2">No varieties found</h3>
          <p className="text-muted mb-4">
            {search
              ? `No results for "${search}". Try a different search term.`
              : 'No coffee varieties in this category yet.'}
          </p>
          {search && (
            <button onClick={() => setSearch('')} className="btn-secondary">
              Clear search
            </button>
          )}
        </div>
      )}

      {!loading && !error && varieties.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {varieties.map((v: any) => (
              <Link
                key={v.id}
                to={`/coffee-varieties/${v.id}`}
                className="block p-6 rounded-xl bg-surface border border-border
                           hover:border-coffee-400 transition-all hover:shadow-md group"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-semibold group-hover:text-coffee-600
                                 transition-colors">
                    {v.name}
                  </h3>
                  <span className="text-xs px-2 py-1 rounded-full bg-coffee-100
                                   dark:bg-coffee-800 text-coffee-700 dark:text-coffee-300">
                    {v.category === 'variety'
                      ? 'Variety'
                      : v.category === 'processing'
                        ? 'Process'
                        : 'Specialty'}
                  </span>
                </div>
                {v.species && (
                  <p className="text-sm text-muted italic mb-2">{v.species}</p>
                )}
                {v.origin && (
                  <p className="text-xs text-muted mb-3 truncate">
                    Origin: {v.origin}
                  </p>
                )}
                {v.cupProfile && (
                  <p className="text-sm text-muted line-clamp-2">{v.cupProfile}</p>
                )}
              </Link>
            ))}
          </div>

          {/* Pagination */}
          {total > 12 && (
            <div className="flex justify-center gap-2 mt-8">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="btn-secondary text-sm"
              >
                Previous
              </button>
              <span className="flex items-center px-4 text-sm text-muted">
                Page {page} of {Math.ceil(total / 12)}
              </span>
              <button
                disabled={page >= Math.ceil(total / 12)}
                onClick={() => setPage(page + 1)}
                className="btn-secondary text-sm"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

---

### Task 19: Coffee Variety Detail Page

**File:** `apps/web/src/pages/coffee-varieties/CoffeeVarietyDetailPage.tsx` — CREATE:

```tsx
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../utils/api.ts';
import { RecipeCard } from '../../components/recipes/RecipeCard.tsx';

export default function CoffeeVarietyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [variety, setVariety] = useState<any>(null);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get(`/coffee-varieties/${id}`),
      api.get(`/coffee-varieties/${id}/recipes?perPage=6`),
    ])
      .then(([vRes, rRes]) => {
        setVariety(vRes.data);
        setRecipes(rRes.data);
      })
      .catch(() => setError('Failed to load coffee variety details.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="h-8 w-64 bg-surface animate-pulse rounded mb-4" />
        <div className="h-4 w-96 bg-surface animate-pulse rounded mb-8" />
        <div className="h-64 bg-surface animate-pulse rounded-xl" />
      </div>
    );
  }

  if (error || !variety) {
    return (
      <div className="text-center py-16">
        <p className="text-red-500 mb-4">{error || 'Coffee variety not found'}</p>
        <Link to="/coffee-varieties" className="btn-primary">
          Back to varieties
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <div className="text-sm text-muted mb-6">
        <Link to="/coffee-varieties" className="hover:text-coffee-600">
          Coffee Varieties
        </Link>
        <span className="mx-2">/</span>
        <span className="text-coffee-600">{variety.name}</span>
      </div>

      {/* Header */}
      <div className="mb-8">
        <span className="inline-block px-3 py-1 rounded-full text-xs font-medium
                         bg-coffee-100 dark:bg-coffee-800 text-coffee-700
                         dark:text-coffee-300 mb-3">
          {variety.category === 'variety'
            ? 'Botanical Variety'
            : variety.category === 'processing'
              ? 'Processing Method'
              : 'Specialty Lot'}
        </span>
        <h1 className="text-3xl font-bold mb-2">{variety.name}</h1>
        {variety.species && (
          <p className="text-lg text-muted italic">{variety.species}</p>
        )}
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        {variety.origin && (
          <DetailBlock label="Origin" value={variety.origin} />
        )}
        {variety.altitudeRangeM && (
          <DetailBlock label="Altitude" value={`${variety.altitudeRangeM}m`} />
        )}
        {variety.cupProfile && (
          <DetailBlock label="Cup Profile" value={variety.cupProfile} />
        )}
        {variety.body && (
          <DetailBlock label="Body" value={variety.body} />
        )}
        {variety.acidity && (
          <DetailBlock label="Acidity" value={variety.acidity} />
        )}
        {variety.caffeinePct && (
          <DetailBlock label="Caffeine" value={`${variety.caffeinePct}%`} />
        )}
        {variety.diseaseResistance && (
          <DetailBlock label="Disease Resistance" value={variety.diseaseResistance} />
        )}
        {variety.yield && (
          <DetailBlock label="Yield" value={variety.yield} />
        )}
        {variety.plantSize && (
          <DetailBlock label="Plant Size" value={variety.plantSize} />
        )}
        {variety.spread && (
          <DetailBlock label="Global Spread" value={variety.spread} />
        )}
        {variety.notes && (
          <div className="md:col-span-2">
            <DetailBlock label="Notes" value={variety.notes} />
          </div>
        )}
        {variety.fermentation && (
          <DetailBlock label="Fermentation" value={variety.fermentation} />
        )}
        {variety.dryingTimeDays && (
          <DetailBlock label="Drying Time" value={`${variety.dryingTimeDays} days`} />
        )}
        {variety.processingCompatibility?.length > 0 && (
          <DetailBlock
            label="Processing Compatibility"
            value={variety.processingCompatibility.join(', ')}
          />
        )}
        {variety.subVarieties?.length > 0 && (
          <DetailBlock
            label="Sub-Varieties"
            value={variety.subVarieties.join(', ')}
          />
        )}
      </div>

      {/* Recipes section */}
      {recipes.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold mb-6">
            Recipes using {variety.name}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recipes.map((recipe: any) => (
              <RecipeCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-muted mb-1">
        {label}
      </dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}
```

---

### Task 20: Equipment Catalog Page

**File:** `apps/web/src/pages/equipment/EquipmentCatalogPage.tsx` — CREATE:

```tsx
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../utils/api.ts';

const CATEGORIES = [
  { value: 'espresso_machine', label: 'Espresso Machines' },
  { value: 'grinder', label: 'Grinders' },
  { value: 'pour_over_brewer', label: 'Pour-Over Brewers' },
  { value: 'immersion_brewer', label: 'Immersion Brewers' },
  { value: 'kettle', label: 'Kettles' },
  { value: 'milk_tool', label: 'Milk Tools' },
  { value: 'scale_accessory', label: 'Scales & Accessories' },
  { value: 'roaster', label: 'Roasters' },
] as const;

export default function EquipmentCatalogPage() {
  const [equipment, setEquipment] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Same pattern as CoffeeVarietiesPage but for equipment
  // ... (loading skeleton, empty state, error state, pagination)

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Coffee Equipment</h1>
      <p className="text-muted mb-8">
        Browse 378 coffee machines, grinders, and tools from around the world
      </p>

      {/* Category tabs */}

      {/* Search */}

      {/* Equipment grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {equipment.map((eq: any) => (
          <Link
            key={eq.id}
            to={`/equipment/${eq.id}`}
            className="block p-6 rounded-xl bg-surface border border-border
                       hover:border-coffee-400 transition-all hover:shadow-md group"
          >
            <h3 className="font-semibold group-hover:text-coffee-600 transition-colors">
              {eq.brand}
            </h3>
            <p className="text-sm text-muted">{eq.model || eq.name}</p>
            <span className="inline-block mt-2 text-xs px-2 py-1 rounded-full
                             bg-coffee-100 dark:bg-coffee-800 text-coffee-700">
              {eq.type.replace(/_/g, ' ')}
            </span>
            {eq.description && (
              <p className="text-xs text-muted mt-2 line-clamp-2">{eq.description}</p>
            )}
          </Link>
        ))}
      </div>

      {/* Pagination */}
    </div>
  );
}
```

---

### Task 21: Equipment Detail Page

**File:** `apps/web/src/pages/equipment/EquipmentDetailPage.tsx` — CREATE:

```tsx
// Similar pattern to CoffeeVarietyDetailPage but for equipment
// Loads from /api/v1/equipment/:id and /api/v1/equipment/:id/recipes
// Shows: brand, model, type, description, "Recipes using this equipment" carousel
```

---

### Task 22: Update recipe creation page

**File:** `apps/web/src/pages/recipes/RecipeCreatePage.tsx` — ADD searchable dropdowns:

```tsx
// ADD imports:
import { useState, useEffect, useRef } from 'react';

// ADD state:
const [coffeeVarietySearch, setCoffeeVarietySearch] = useState('');
const [coffeeVarietyResults, setCoffeeVarietyResults] = useState<any[]>([]);
const [selectedVariety, setSelectedVariety] = useState<any>(null);
const [showVarietySearch, setShowVarietySearch] = useState(false);
const [showVarietyCreate, setShowVarietyCreate] = useState(false);
const [newVarietyName, setNewVarietyName] = useState('');

// ADD search function:
const searchCoffeeVarieties = useCallback(async (query: string) => {
  if (query.length < 2) { setCoffeeVarietyResults([]); return; }
  const res = await api.get(`/coffee-varieties/search?q=${encodeURIComponent(query)}`);
  setCoffeeVarietyResults(res.data || []);
}, []);

// Deduplicate/equipment selector section to add:
/*
<div className="space-y-2">
  <label className="text-sm font-medium">Coffee Variety</label>
  <div className="relative">
    <input
      type="text"
      placeholder="Search coffee variety..."
      value={coffeeVarietySearch}
      onChange={(e) => {
        setCoffeeVarietySearch(e.target.value);
        searchCoffeeVarieties(e.target.value);
        setShowVarietySearch(true);
      }}
      onFocus={() => setShowVarietySearch(true)}
      className="w-full px-3 py-2 rounded-lg border border-border bg-surface"
    />
    {selectedVariety && (
      <div className="mt-2 flex items-center gap-2 p-2 rounded-lg bg-coffee-50 dark:bg-coffee-900">
        <span className="text-sm font-medium">{selectedVariety.name}</span>
        <button onClick={() => setSelectedVariety(null)} className="text-red-500 text-xs">
          Remove
        </button>
      </div>
    )}
    {showVarietySearch && coffeeVarietyResults.length > 0 && (
      <div className="absolute z-10 w-full mt-1 bg-surface border border-border
                      rounded-lg shadow-lg max-h-48 overflow-y-auto">
        {coffeeVarietyResults.map((v: any) => (
          <button
            key={v.id}
            type="button"
            onClick={() => {
              setSelectedVariety(v);
              setCoffeeVarietySearch(v.name);
              setShowVarietySearch(false);
            }}
            className="w-full text-left px-4 py-2 hover:bg-coffee-50
                       dark:hover:bg-coffee-800 text-sm"
          >
            <span className="font-medium">{v.name}</span>
            {v.species && (
              <span className="text-muted ml-2 text-xs">{v.species}</span>
            )}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setShowVarietyCreate(true);
            setShowVarietySearch(false);
          }}
          className="w-full text-left px-4 py-2 hover:bg-coffee-50
                     dark:hover:bg-coffee-800 text-sm text-coffee-600 border-t"
        >
          + Create new variety "{coffeeVarietySearch}"
        </button>
      </div>
    )}
  </div>
</div>
*/

// ADD equipment multi-select (similar pattern but for multiple equipment):
// Use existing equipmentIds state, extend to show searchable multi-select dropdowns
```

---

### Task 23: Update recipe edit page

**File:** `apps/web/src/pages/recipes/RecipeEditPage.tsx` — Similar to Task 22

Pre-populate coffee variety and equipment selections from the recipe's current version.

---

### Task 24: Update recipe detail page

**File:** `apps/web/src/pages/recipes/RecipeDetailPage.tsx` — ADD linked names:

```tsx
// ADD near the coffee info section:
{recipe.currentVersion?.coffeeVariety && (
  <div className="flex items-center gap-2">
    <span className="text-sm font-medium">Coffee Variety:</span>
    <Link
      to={`/coffee-varieties/${recipe.currentVersion.coffeeVariety.id}`}
      className="text-coffee-600 hover:underline text-sm"
    >
      {recipe.currentVersion.coffeeVariety.name}
    </Link>
  </div>
)}
{!recipe.currentVersion?.coffeeVariety && recipe.currentVersion?.productName && (
  <div className="flex items-center gap-2">
    <span className="text-sm font-medium">Coffee:</span>
    <span className="text-sm text-muted">{recipe.currentVersion.productName}</span>
  </div>
)}

// Equipment section: make each equipment name a clickable link
{recipe.currentVersion?.equipment?.map((re: any) => (
  <Link
    key={re.equipment.id}
    to={`/equipment/${re.equipment.id}`}
    className="text-coffee-600 hover:underline text-sm block"
  >
    {re.equipment.brand} {re.equipment.model}
  </Link>
))}
```

---

### Task 25: Update recipe list page filters

**File:** `apps/web/src/pages/recipes/RecipeListPage.tsx` — UPDATE:

```tsx
// UPDATE EQUIPMENT_TYPE_LABELS with new categories:
export const EQUIPMENT_TYPE_LABELS: Record<string, string> = {
  espresso_machine: 'Espresso Machine',
  grinder: 'Grinder',
  pour_over_brewer: 'Pour-Over Brewer',
  immersion_brewer: 'Immersion Brewer',
  kettle: 'Kettle',
  milk_tool: 'Milk Tool',
  scale_accessory: 'Scale & Accessory',
  roaster: 'Roaster',
  portafilter: 'Portafilter',
  basket: 'Basket',
  puck_screen: 'Puck Screen',
  paper_filter: 'Paper Filter',
  tamper: 'Tamper',
  mesh_filter: 'Mesh Filter',
  cezve: 'Cezve',
  thermometer: 'Thermometer',
  other: 'Other',
};

// UPDATE EQUIPMENT_FILTER_TYPES:
export const EQUIPMENT_FILTER_TYPES = [
  'espresso_machine', 'grinder', 'pour_over_brewer', 'immersion_brewer',
  'kettle', 'milk_tool', 'scale_accessory', 'roaster',
] as const;

// ADD coffee variety filter dropdown:
<div className="space-y-1">
  <label className="text-xs font-semibold uppercase tracking-wider text-muted">
    Coffee Variety
  </label>
  <input
    type="text"
    placeholder="Search variety..."
    value={coffeeVarietySearch}
    onChange={(e) => {
      setCoffeeVarietySearch(e.target.value);
      searchVarieties(e.target.value);
    }}
    className="w-full px-3 py-1.5 rounded-lg border border-border bg-surface text-sm"
  />
  {coffeeVarietyResults.length > 0 && (
    <div className="mt-1 max-h-40 overflow-y-auto">
      {coffeeVarietyResults.map((v: any) => (
        <button
          key={v.id}
          onClick={() => updateFilter('coffeeVarietyId', v.id)}
          className="w-full text-left px-3 py-1.5 text-sm hover:bg-coffee-50
                     dark:hover:bg-coffee-800"
        >
          {v.name}
        </button>
      ))}
    </div>
  )}
</div>

// Equipment category filter:
<div className="space-y-1">
  <label className="text-xs font-semibold uppercase tracking-wider text-muted">
    Equipment Category
  </label>
  <select
    value={filters.equipmentCategory || ''}
    onChange={(e) => updateFilter('equipmentCategory', e.target.value || undefined)}
    className="w-full px-3 py-1.5 rounded-lg border border-border bg-surface text-sm"
  >
    <option value="">All Categories</option>
    {EQUIPMENT_FILTER_TYPES.map((type) => (
      <option key={type} value={type}>{EQUIPMENT_TYPE_LABELS[type]}</option>
    ))}
  </select>
</div>
```

---

### Task 26: Navigation & Routes

**File:** `apps/web/src/router.tsx` — ADD routes:

```tsx
// ADD (lazy-loaded):
{
  path: '/coffee-varieties',
  lazy: () => import('./pages/coffee-varieties/CoffeeVarietiesPage.tsx'),
},
{
  path: '/coffee-varieties/:id',
  lazy: () => import('./pages/coffee-varieties/CoffeeVarietyDetailPage.tsx'),
},
{
  path: '/equipment',
  lazy: () => import('./pages/equipment/EquipmentCatalogPage.tsx'),
},
{
  path: '/equipment/:id',
  lazy: () => import('./pages/equipment/EquipmentDetailPage.tsx'),
},
```

**File:** `apps/web/src/components/layout/Header.tsx` — ADD nav links (find the existing nav section):

```tsx
// ADD:
<NavLink to="/coffee-varieties" className="...">
  Varieties
</NavLink>
<NavLink to="/equipment" className="...">
  Equipment
</NavLink>
```

---

## Phase 6: Admin Interface (tasks 27-29)

---

### Task 27: Update admin equipment page

**File:** `apps/web/src/pages/admin/AdminEquipmentPage.tsx` — UPDATE:

- Add `isSystem` column to the table display
- Disable editing/deleting system equipment (grey out buttons, show tooltip)
- Add "Delete Requests" tab/section listing pending requests with approve/reject buttons
- On approve, show warning if equipment is bound to N active recipes (query count)
- On approve, set equipment `deletedAt` and mark request as `approved`

**File:** `apps/api/src/modules/admin/index.ts` — ADD admin equipment delete request routes:

```ts
router.get('/equipment/delete-requests', adminMiddleware, async (c) => {
  const requests = await db.query.equipmentDeleteRequests.findMany({
    with: {
      equipment: { columns: { name: true, brand: true, model: true } },
      requestedBy: { columns: { username: true, displayName: true } },
    },
    where: eq(equipmentDeleteRequests.status, 'pending'),
    orderBy: asc(equipmentDeleteRequests.createdAt),
  });
  return c.json({ success: true, data: requests });
});

router.post('/equipment/delete-requests/:id/approve', adminMiddleware, async (c) => {
  const request = await db.query.equipmentDeleteRequests.findFirst({
    where: eq(equipmentDeleteRequests.id, c.req.param('id')),
  });
  if (!request) return c.json({ success: false, error: 'Request not found' }, 404);

  // Check bound recipes
  const boundCount = await db.select({ count: sql<number>`count(*)` })
    .from(recipeEquipment)
    .where(eq(recipeEquipment.equipmentId, request.equipmentId));

  // Soft delete the equipment
  await db.update(equipment)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(equipment.id, request.equipmentId));

  // Update request status
  await db.update(equipmentDeleteRequests)
    .set({
      status: 'approved',
      reviewedById: c.get('userId')!,
      reviewedAt: new Date(),
    })
    .where(eq(equipmentDeleteRequests.id, request.id));

  return c.json({
    success: true,
    data: { boundRecipes: Number(boundCount[0]?.count ?? 0) },
  });
});

router.post('/equipment/delete-requests/:id/reject', adminMiddleware, async (c) => {
  await db.update(equipmentDeleteRequests)
    .set({
      status: 'rejected',
      reviewedById: c.get('userId')!,
      reviewedAt: new Date(),
    })
    .where(eq(equipmentDeleteRequests.id, c.req.param('id')));
  return c.json({ success: true });
});
```

---

### Task 28: Admin coffee varieties page

**File:** `apps/web/src/pages/admin/AdminCoffeeVarietiesPage.tsx` — CREATE:

```tsx
import { useState, useEffect } from 'react';
import { api } from '../../utils/api.ts';

export default function AdminCoffeeVarietiesPage() {
  const [varieties, setVarieties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState({ category: '', search: '' });

  // Load varieties (paginated, with admin token)
  // List with search/filter
  // CRUD forms with all fields (conditional by category)
  // Soft delete with confirmation
  // isSystem badge on system entries

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Coffee Varieties</h1>
        <button
          onClick={() => {
            setEditing({ isNew: true });
            setForm({ name: '', category: 'variety' });
          }}
          className="btn-primary"
        >
          Add Variety
        </button>
      </div>

      {/* Filters: category dropdown, search input */}

      {/* Table: name, category, species, origin, isSystem badge, actions */}
      <table className="w-full">
        <thead>
          <tr className="text-left text-xs uppercase text-muted">
            <th className="p-3">Name</th>
            <th className="p-3">Category</th>
            <th className="p-3">Species</th>
            <th className="p-3">Origin</th>
            <th className="p-3">System</th>
            <th className="p-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {varieties.map((v) => (
            <tr key={v.id} className="border-t border-border hover:bg-surface">
              <td className="p-3 font-medium">{v.name}</td>
              <td className="p-3">
                <span className="text-xs px-2 py-0.5 rounded-full bg-coffee-100
                                 dark:bg-coffee-800">
                  {v.category}
                </span>
              </td>
              <td className="p-3 text-sm text-muted">{v.species || '—'}</td>
              <td className="p-3 text-sm text-muted max-w-xs truncate">
                {v.origin || '—'}
              </td>
              <td className="p-3">
                {v.isSystem && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-100
                                   dark:bg-green-900 text-green-700">
                    System
                  </span>
                )}
              </td>
              <td className="p-3 flex gap-2">
                <button onClick={() => { setEditing(v); setForm(v); }} className="text-sm text-blue-500">
                  Edit
                </button>
                {!v.isSystem && (
                  <button onClick={() => handleDelete(v.id)} className="text-sm text-red-500">
                    Delete
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Edit/Create Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 w-full max-w-2xl
                          max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              {editing.isNew ? 'Create Variety' : 'Edit Variety'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium">Name *</label>
                <input name="name" value={form.name || ''} onChange={handleChange}
                       className="w-full mt-1 px-3 py-2 rounded-lg border"
                       required />
              </div>
              <div>
                <label className="text-sm font-medium">Category *</label>
                <select name="category" value={form.category || 'variety'}
                        onChange={handleChange}
                        className="w-full mt-1 px-3 py-2 rounded-lg border">
                  <option value="variety">Variety</option>
                  <option value="processing">Processing</option>
                  <option value="market_name">Market Name</option>
                </select>
              </div>
              {/* Conditional fields based on category */}
              {form.category !== 'processing' && (
                <>
                  <div>
                    <label className="text-sm font-medium">Species</label>
                    <input name="species" value={form.species || ''} onChange={handleChange}
                           className="w-full mt-1 px-3 py-2 rounded-lg border" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Origin</label>
                    <input name="origin" value={form.origin || ''} onChange={handleChange}
                           className="w-full mt-1 px-3 py-2 rounded-lg border" />
                  </div>
                </>
              )}
              {form.category === 'processing' && (
                <>
                  <div>
                    <label className="text-sm font-medium">Fermentation</label>
                    <textarea name="fermentation" value={form.fermentation || ''}
                              onChange={handleChange}
                              className="w-full mt-1 px-3 py-2 rounded-lg border" rows={3} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Drying Time (days)</label>
                    <input name="dryingTimeDays" value={form.dryingTimeDays || ''}
                           onChange={handleChange}
                           className="w-full mt-1 px-3 py-2 rounded-lg border" />
                  </div>
                </>
              )}
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setEditing(null)}
                        className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">
                  {editing.isNew ? 'Create' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
```

**File:** `apps/api/src/modules/admin/index.ts` — ADD admin coffee variety CRUD routes:

```ts
// GET /admin/coffee-varieties (paginated list)
// POST /admin/coffee-varieties (create)
// PATCH /admin/coffee-varieties/:id (update)
// DELETE /admin/coffee-varieties/:id (soft delete)
// GET /admin/coffee-varieties/:id/recipe-count (bound recipe check)
```

---

### Task 29: Admin navigation update

**File:** `apps/web/src/pages/admin/AdminLayout.tsx` — ADD:

```tsx
<AdminNavLink to='/admin/coffee-varieties'>Coffee Varieties</AdminNavLink>
```

**File:** `apps/web/src/router.tsx` — ADD admin route:

```tsx
{
  path: '/admin/coffee-varieties',
  lazy: () => import('./pages/admin/AdminCoffeeVarietiesPage.tsx'),
},
```

---

## Phase 7: Caching (task 30)

---

### Task 30: 24h cache for detail pages

**Already implemented in service.ts files above** (tasks 9 and 10). The `getCoffeeVarietyById` and `getEquipmentById` functions use `cacheProvider` with 24h TTL. Cache is invalidated on admin update/delete.

---

## Phase 8: Testing (tasks 31-39)

---

### Task 31: Coffee variety model tests

**File:** `apps/api/src/modules/coffee-variety/model.test.ts` — CREATE:

```ts
import { describe, it, beforeAll, afterAll } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { db, coffeeVarieties } from '@brewform/db';
import { eq } from 'drizzle-orm';
import * as model from './model.ts';

describe('coffeeVariety model', () => {
  const testVarietyId = 'test-variety-001';
  const testVariety = {
    id: testVarietyId,
    name: 'Test Typica',
    category: 'variety' as const,
    species: 'Coffea arabica',
    origin: 'Ethiopia',
    isSystem: false,
    createdBy: null,
  };

  beforeAll(async () => {
    await db.insert(coffeeVarieties).values(testVariety);
  });

  afterAll(async () => {
    await db.delete(coffeeVarieties).where(eq(coffeeVarieties.id, testVarietyId));
  });

  it('findById returns a variety by ID', async () => {
    const result = await model.findById(testVarietyId);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Test Typica');
  });

  it('findById returns null for non-existent ID', async () => {
    const result = await model.findById('nonexistent');
    expect(result).toBeNull();
  });

  it('findMany returns paginated results', async () => {
    const result = await model.findMany({ page: 1, perPage: 10 });
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);
  });

  it('findMany filters by category', async () => {
    const result = await model.findMany({ page: 1, perPage: 10, category: 'variety' });
    for (const row of result.data) {
      expect(row.category).toBe('variety');
    }
  });

  it('findMany filters by search', async () => {
    const result = await model.findMany({ page: 1, perPage: 10, search: 'Typica' });
    expect(result.data.some((r) => r.name.includes('Typica'))).toBe(true);
  });

  it('create inserts a new variety', async () => {
    const created = await model.create({
      name: 'Created Variety',
      category: 'processing',
      isSystem: false,
      createdBy: null,
    } as any);
    expect(created).not.toBeNull();
    expect(created.name).toBe('Created Variety');

    // Cleanup
    await model.softDelete(created.id);
  });

  it('update modifies a variety', async () => {
    const updated = await model.update(testVarietyId, { name: 'Updated Typica' } as any);
    expect(updated).not.toBeNull();
    expect(updated.name).toBe('Updated Typica');

    // Restore
    await model.update(testVarietyId, { name: 'Test Typica' } as any);
  });

  it('softDelete sets deletedAt', async () => {
    // Create temp record
    const temp = await model.create({
      name: 'Temp Variety',
      category: 'variety',
      isSystem: false,
      createdBy: null,
    } as any);

    const deleted = await model.softDelete(temp.id);
    expect(deleted.deletedAt).not.toBeNull();

    // Verify not found by findById
    const notFound = await model.findById(temp.id);
    expect(notFound).toBeNull();
  });
});
```

---

### Task 32: Coffee variety service tests

**File:** `apps/api/src/modules/coffee-variety/service.test.ts` — CREATE:

```ts
// Test service layer:
// - getCoffeeVarietyById: returns variety, returns null for missing, uses cache
// - listCoffeeVarieties: delegates to model, passes filters
// - createCoffeeVariety: sets createdBy, isSystem=false
// - updateCoffeeVariety: blocks system variety updates (unless admin), invalidates cache
// - deleteCoffeeVariety: blocks system variety deletion, invalidates cache
// - getRecipesForVariety: returns paginated recipes, handles empty results
```

---

### Task 33: Coffee variety API integration tests

**File:** `apps/api/src/modules/coffee-variety/index.test.ts` — CREATE:

```ts
// Test all endpoints:
// - GET /api/v1/coffee-varieties (list, pagination, category filter, search filter)
// - GET /api/v1/coffee-varieties/search?q=X (min 2 chars, returns results)
// - POST /api/v1/coffee-varieties (auth required, validates schema, creates)
// - GET /api/v1/coffee-varieties/:id (returns variety, 404 for missing)
// - PATCH /api/v1/coffee-varieties/:id (auth, owner check, validates schema)
// - DELETE /api/v1/coffee-varieties/:id (auth, owner check, soft delete)
// - GET /api/v1/coffee-varieties/:id/recipes (returns paginated recipes)
// - Rate limiting works
// - 404 for non-existent IDs
```

---

### Task 34: Updated equipment model tests

**File:** `apps/api/src/modules/equipment/service.test.ts` — UPDATE:

```ts
// ADD tests for:
// - getEquipmentById with cache
// - listEquipment with new category/type filters
// - getRecipesForEquipment
// - requestEquipmentDeletion
// - isSystem protection (cannot delete system equipment)
// - New enum values accepted
```

---

### Task 35: Updated recipe tests

**File:** `apps/api/src/modules/recipe/service.test.ts` — UPDATE:

```ts
// ADD tests for:
// - Recipe creation with coffeeVarietyId
// - Recipe creation with coffeeVarietyName
// - Recipe update preserving coffeeVarietyId
// - Recipe list filtered by coffeeVarietyId
// - Recipe list filtered by equipmentCategory
// - Recipe list filtered by multiple equipmentIds
// - Compatibility validation with new equipment types
// - Recipe detail includes coffeeVariety relation
```

---

### Task 36: Seed data tests

**File:** `packages/db/src/seed.test.ts` — UPDATE:

```ts
// ADD tests:
// - All 378 equipment catalog entries are inserted with correct types
// - All 98 coffee varieties are inserted with correct categories
// - Deterministic UUIDs match expected values for key entries
// - Recipe seed data equipmentIds reference valid equipment IDs
// - Recipe seed data coffeeVarietyIds reference valid variety IDs
// - Setup seed data equipment references are valid
// - Seed ordering maintains FK integrity (no constraint violations)
// - isSystem flag is true for catalog entries
```

---

### Task 37: Shared schema tests

**File:** `packages/shared/src/schemas/coffee-variety.test.ts` — CREATE:

```ts
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import {
  CoffeeVarietyCreateSchema,
  CoffeeVarietyUpdateSchema,
  CoffeeVarietyFilterSchema,
} from './coffee-variety.ts';

describe('CoffeeVarietyCreateSchema', () => {
  it('accepts valid variety with required fields', () => {
    const result = CoffeeVarietyCreateSchema.safeParse({
      name: 'Typica',
      category: 'variety',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = CoffeeVarietyCreateSchema.safeParse({
      name: '',
      category: 'variety',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid category', () => {
    const result = CoffeeVarietyCreateSchema.safeParse({
      name: 'Test',
      category: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('accepts all optional fields', () => {
    const result = CoffeeVarietyCreateSchema.safeParse({
      name: 'Gesha',
      category: 'variety',
      species: 'Coffea arabica',
      origin: 'Ethiopia',
      cupProfile: 'Floral, jasmine',
      processingCompatibility: ['Washed', 'Natural'],
      subVarieties: ['Red', 'Yellow'],
    });
    expect(result.success).toBe(true);
  });
});

describe('CoffeeVarietyFilterSchema', () => {
  it('parses default pagination', () => {
    const result = CoffeeVarietyFilterSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.perPage).toBe(20);
    }
  });

  it('parses provided category and search', () => {
    const result = CoffeeVarietyFilterSchema.safeParse({
      category: 'processing',
      search: 'honey',
    });
    expect(result.success).toBe(true);
  });
});
```

**File:** `packages/shared/src/schemas/equipment.test.ts` — UPDATE:

```ts
// ADD tests for new enum values
import { EquipmentCreateSchema, EquipmentTypeEnum } from './equipment.ts';

describe('EquipmentCreateSchema with new enum', () => {
  it('accepts espresso_machine type', () => {
    const result = EquipmentCreateSchema.safeParse({
      name: 'La Marzocco Linea Mini',
      type: 'espresso_machine',
    });
    expect(result.success).toBe(true);
  });

  it('accepts grinder type', () => {
    const result = EquipmentCreateSchema.safeParse({
      name: 'Mahlkönig EK43',
      type: 'grinder',
    });
    expect(result.success).toBe(true);
  });

  it('rejects old-only enum values that may have been removed', () => {
    // 'thermometer' still exists in enum, this is fine
    const result = EquipmentCreateSchema.safeParse({
      name: 'Test Thermometer',
      type: 'thermometer',
    });
    expect(result.success).toBe(true);
  });
});
```

**File:** `packages/shared/src/schemas/recipe.test.ts` — UPDATE:

```ts
// ADD tests for new filter fields:
import { RecipeFilterSchema } from './recipe.ts';

describe('RecipeFilterSchema with new fields', () => {
  it('accepts coffeeVarietyId', () => {
    const result = RecipeFilterSchema.safeParse({
      coffeeVarietyId: '00000000-0000-0000-0000-000000000001',
    });
    expect(result.success).toBe(true);
  });

  it('accepts equipmentCategory', () => {
    const result = RecipeFilterSchema.safeParse({
      equipmentCategory: 'espresso_machine',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid equipmentCategory', () => {
    const result = RecipeFilterSchema.safeParse({
      equipmentCategory: 'invalid_category',
    });
    expect(result.success).toBe(false);
  });

  it('accepts comma-separated equipmentIds (max 10)', () => {
    const ids = Array.from({ length: 5 }, () => crypto.randomUUID()).join(',');
    const result = RecipeFilterSchema.safeParse({ equipmentIds: ids });
    expect(result.success).toBe(true);
  });

  it('rejects >10 equipmentIds', () => {
    const ids = Array.from({ length: 11 }, () => crypto.randomUUID()).join(',');
    const result = RecipeFilterSchema.safeParse({ equipmentIds: ids });
    expect(result.success).toBe(false);
  });
});
```

---

### Task 38: Admin integration tests

**File:** `apps/api/src/modules/admin/index.test.ts` — UPDATE:

```ts
// ADD tests for:
// - GET /admin/coffee-varieties (requires admin auth)
// - POST /admin/coffee-varieties (create with admin)
// - PATCH /admin/coffee-varieties/:id (update)
// - DELETE /admin/coffee-varieties/:id (soft delete, bound recipe check)
// - GET /admin/equipment/delete-requests (list pending)
// - POST /admin/equipment/delete-requests/:id/approve (approve with bound recipe info)
// - POST /admin/equipment/delete-requests/:id/reject (reject)
// - Non-admin gets 403 on all admin endpoints
```

---

### Task 39: Full suite verification

**Commands to run:**
```bash
make check    # Type-check all workspaces
make lint     # Lint all apps and packages
make test     # Run all tests

# Verify no sloppy imports:
grep -r "from './.+' --include='*.ts' apps/web/src apps/api/src packages/ | grep -v '\.ts' | grep -v '\.tsx'
```

**Expected:** All type-checks pass, lint passes, all tests pass, no sloppy imports.

---

## Phase 9: Documentation (task 40)

---

### Task 40: Create PR description

**File:** `pr_description.md` — CREATE:

```markdown
# Enrich Coffee Types & Equipment in BrewForm

## Summary

Adds a comprehensive coffee varieties database (98 entries) and expands the
equipment catalog from 11 accessory types to 17 types covering 378 coffee
machines, grinders, brewers, kettles, and tools.

## New Features

- **Coffee Varieties pages** (`/coffee-varieties`, `/coffee-varieties/:id`)
  - 6-category browsing (botanical varieties, processing, specialty lots)
  - Detail pages with full variety information
  - "Recipes using this variety" carousel
  - 24h Deno KV cache

- **Equipment Catalog pages** (`/equipment`, `/equipment/:id`)
  - 8-category browsing (espresso machines, grinders, brewers, kettles, etc.)
  - Detail pages with "Recipes using this equipment"
  - 24h Deno KV cache

- **Recipe creation/edit** — Searchable dropdowns for coffee variety and equipment
  - AsyncSelect with "Create new" inline option
  - Multi-select equipment with compatibility hints

- **Recipe list filters** — Filter by coffee variety, equipment category, equipment IDs

- **Admin** — Full CRUD for coffee varieties, equipment delete request queue
  - Bound-recipe check before approving equipment deletion

## Breaking Changes

- **equipmentTypeEnum replaced**: All 11 old values replaced with 17 new values
  - OLD: portafilter, basket, puck_screen, paper_filter, tamper, gooseneck_kettle,
    mesh_filter, cezve, scale, thermometer, other
  - NEW: espresso_machine, grinder, pour_over_brewer, immersion_brewer, kettle,
    milk_tool, scale_accessory, roaster, portafilter, basket, puck_screen,
    paper_filter, tamper, mesh_filter, cezve, thermometer, other
  - Full database wipe required — run `make db-generate && make db-migrate && make db-seed`

## New Database Tables

- `coffee_variety` — 98 seed entries across 6 categories
- `equipment_delete_request` — User deletion requests with admin approval flow

## New API Endpoints

### Coffee Varieties (`/api/v1/coffee-varieties`)
- `GET /` — List varieties (paginated, filterable by category/search)
- `GET /search?q=` — Search varieties (min 2 chars)
- `POST /` — Create variety (auth required)
- `GET /:id` — Get variety detail
- `PATCH /:id` — Update variety (auth, owner check)
- `DELETE /:id` — Soft delete variety (auth, owner check)
- `GET /:id/recipes` — Get recipes using this variety

### Equipment (new endpoints on `/api/v1/equipment`)
- `GET /:id/recipes` — Get recipes using this equipment
- `POST /:id/delete-request` — Request equipment deletion

### Admin (`/api/v1/admin`)
- `GET /coffee-varieties` — Admin list
- `POST /coffee-varieties` — Admin create
- `PATCH /coffee-varieties/:id` — Admin update
- `DELETE /coffee-varieties/:id` — Admin soft delete
- `GET /equipment/delete-requests` — List pending delete requests
- `POST /equipment/delete-requests/:id/approve` — Approve deletion
- `POST /equipment/delete-requests/:id/reject` — Reject deletion

## Seed Data Changes

- **378 equipment catalog entries** from `files/coffee_equipments_v2.json`
- **98 coffee variety entries** from `files/coffee_types_v2.json`
- Updated recipe seed data with coffee variety ID references
- Updated setup seed data with new equipment type references
- New seed order: catalog → varieties → user equipment → recipes

## Migration

```bash
make db-generate   # Generate migration SQL
make db-migrate    # Apply migration
make db-seed       # Seed with 378+98 new entries
```

## Test Coverage

- 8 new test files (model, service, API integration, schemas, seed)
- 3 updated test files (equipment, recipe, admin)
- All passing with `make check && make lint && make test`
```

---

## Complete File Manifest

### Files to CREATE:
1. `apps/api/src/modules/coffee-variety/model.ts`
2. `apps/api/src/modules/coffee-variety/service.ts`
3. `apps/api/src/modules/coffee-variety/index.ts`
4. `apps/api/src/modules/coffee-variety/model.test.ts`
5. `apps/api/src/modules/coffee-variety/service.test.ts`
6. `apps/api/src/modules/coffee-variety/index.test.ts`
7. `packages/shared/src/types/coffee-variety.ts`
8. `packages/shared/src/schemas/coffee-variety.ts`
9. `packages/shared/src/schemas/coffee-variety.test.ts`
10. `apps/web/src/pages/coffee-varieties/CoffeeVarietiesPage.tsx`
11. `apps/web/src/pages/coffee-varieties/CoffeeVarietyDetailPage.tsx`
12. `apps/web/src/pages/equipment/EquipmentCatalogPage.tsx`
13. `apps/web/src/pages/equipment/EquipmentDetailPage.tsx`
14. `apps/web/src/pages/admin/AdminCoffeeVarietiesPage.tsx`
15. `pr_description.md`

### Files to MODIFY:
16. `packages/db/src/schema.ts` (enum, tables, relations, columns)
17. `packages/db/src/seed-data.ts` (catalog + variety seed data, updated recipes)
18. `packages/db/src/seed.ts` (new seed functions, updated order)
19. `packages/db/src/seed.test.ts` (new verification tests)
20. `packages/shared/src/schemas/equipment.ts` (enum update)
21. `packages/shared/src/schemas/recipe.ts` (new filter fields)
22. `packages/shared/src/schemas/index.ts` (barrel exports)
23. `packages/shared/src/schemas/equipment.test.ts`
24. `packages/shared/src/schemas/recipe.test.ts`
25. `packages/shared/src/types/equipment.ts`
26. `packages/shared/src/constants/brew-methods.ts`
27. `packages/shared/src/constants/brew-method-rules.ts`
28. `apps/api/src/routes/index.ts` (register coffee-variety routes)
29. `apps/api/src/modules/equipment/model.ts` (new queries)
30. `apps/api/src/modules/equipment/service.ts` (new service functions)
31. `apps/api/src/modules/equipment/index.ts` (new routes)
32. `apps/api/src/modules/equipment/service.test.ts`
33. `apps/api/src/modules/recipe/service.ts` (coffee variety support in CRUD + filters)
34. `apps/api/src/modules/recipe/model.ts` (add coffeeVariety to detail queries)
35. `apps/api/src/modules/recipe/service.test.ts`
36. `apps/api/src/modules/admin/index.ts` (admin coffee variety + delete request routes)
37. `apps/api/src/modules/admin/index.test.ts`
38. `apps/web/src/pages/recipes/RecipeCreatePage.tsx` (searchable dropdowns)
39. `apps/web/src/pages/recipes/RecipeEditPage.tsx` (pre-populate selections)
40. `apps/web/src/pages/recipes/RecipeDetailPage.tsx` (linked names)
41. `apps/web/src/pages/recipes/RecipeListPage.tsx` (new filters, updated labels)
42. `apps/web/src/pages/admin/AdminEquipmentPage.tsx` (delete request queue, isSystem)
43. `apps/web/src/pages/admin/AdminLayout.tsx` (sidebar link)
44. `apps/web/src/router.tsx` (new routes)
45. `apps/web/src/components/layout/Header.tsx` (nav links)
```

