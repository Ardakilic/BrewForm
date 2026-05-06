# BrewForm: Prisma → Drizzle ORM Migration Plan

## 1. Executive Summary

**Goal:** Completely replace Prisma with Drizzle ORM across the entire BrewForm stack while preserving all 24 models, 12 enums, relations, indexes, seed data, and CI/CD workflows. The API contract remains unchanged.

**Approach:** Big-bang migration in a feature branch. All Prisma artifacts removed in a single PR after full validation.

**Driver Choice:** `postgres-js` (lightweight, Deno-compatible, works on Deno Deploy) wrapped by `drizzle-orm/postgres-js`.

---

## 2. Current State Audit

### 2.1 Schema Inventory (Prisma)
- **24 models:** `User`, `UserPreferences`, `Recipe`, `RecipeVersion`, `RecipeTasteNote`, `RecipeEquipment`, `RecipeAdditionalPreparation`, `Photo`, `RecipeVersionPhoto`, `Equipment`, `Bean`, `Vendor`, `TasteNote`, `Setup`, `Comment`, `UserFollow`, `UserRecipeFavourite`, `UserRecipeLike`, `Badge`, `UserBadge`, `BrewMethodEquipmentRule`, `AuditLog`, `PasswordReset`, `Report`
- **12 enums:** `Visibility`, `BrewMethod`, `DrinkType`, `EquipmentType`, `EmojiTag`, `BadgeRule`, `UnitSystem`, `TemperatureUnit`, `Theme`, `DateFormat`, `AdditionalPreparationType`
- **Relations:** Self-referencing `TasteNote` hierarchy, `Recipe↔RecipeVersion`, `Recipe↔RecipeFork`, `User↔UserFollow` (bi-directional), `Setup→Equipment` (5 nullable FKs), `Comment` self-replies
- **Indexes:** 40+ `@@index` declarations across models

### 2.2 Files Using Prisma (must migrate)

| File | Prisma Usage |
|---|---|
| `packages/db/src/index.ts` | PrismaClient singleton export |
| `packages/db/prisma/seed.ts` | Full seed script via Prisma create |
| `apps/api/src/main.ts` | `prisma.$disconnect()` in shutdown |
| `apps/api/src/setup.ts` | Admin setup via Prisma |
| `apps/api/src/routes/health.ts` | `prisma.$queryRaw` readiness probe |
| `apps/api/src/middleware/auth.ts` | `prisma.user.findFirst` |
| `apps/api/src/utils/notify/index.ts` | `prisma.user.findFirst`, `prisma.userFollow.findMany` |
| `apps/api/src/modules/auth/model.ts` | User CRUD, password reset |
| `apps/api/src/modules/user/model.ts` | User lookups, stats |
| `apps/api/src/modules/recipe/model.ts` | Complex nested creates, increments, fork logic |
| `apps/api/src/modules/recipe/service.ts` | Direct `prisma.setup.findUnique` |
| `apps/api/src/modules/equipment/model.ts` | CRUD + `Prisma.EquipmentWhereInput` type import |
| `apps/api/src/modules/comment/model.ts` | Nested replies include |
| `apps/api/src/modules/follow/model.ts` | Follow CRUD |
| `apps/api/src/modules/badge/model.ts` | Badge evaluation with `distinct`, `_count` |
| `apps/api/src/modules/admin/model.ts` | Analytics, admin CRUD, `recipes: { _count: 'desc' }` |
| `apps/api/src/modules/setup/model.ts` | Setup CRUD |
| `apps/api/src/modules/preference/model.ts` | Preferences CRUD |
| `apps/api/src/modules/vendor/model.ts` | Vendor CRUD |
| `apps/api/src/modules/bean/model.ts` | Bean CRUD |
| `apps/api/src/modules/taste/model.ts` | Taste note CRUD |
| `apps/api/src/modules/photo/model.ts` | Photo CRUD |
| `apps/api/src/modules/qrcode/model.ts` | QR lookup |
| `apps/api/src/modules/report/model.ts` | Report CRUD |

### 2.3 Infrastructure Files Referencing Prisma
- `package.json` — `prisma` devDep, `@prisma/client` dep, `db:generate`/`db:migrate` scripts
- `packages/db/package.json` — `@prisma/client`, `@prisma/extension-accelerate`, `prisma`
- `Makefile` — `db-generate`, `db-migrate`, `db-dev-migrate`, `db-seed`, `db-studio`, `db-reset`
- `Dockerfile` — `deno run -A npm:prisma@^6.19.3 generate`
- `.github/workflows/ci.yml` — `deno task db:generate`, `deno task db:migrate`, seed via Prisma
- `.github/workflows/pr.yml` — `deno run -A npm:prisma@^6.19.3 generate`
- `deno.json` — test includes `packages/db/prisma/`
- `docs/architecture.md` — ADR-004 (Prisma decision), portability rules
- `docs/deployment.md` — Prisma Postgres / Accelerate references
- `README.md` — Prisma in tech stack table, all `make db-*` commands

---

## 3. Target State Architecture

### 3.1 DB Package Restructure
```
packages/db/
├── drizzle.config.ts      # drizzle-kit config (dialect: postgresql)
├── src/
│   ├── index.ts           # exports `db` drizzle instance + `client`
│   ├── schema.ts          # all pgTable definitions, enums, relations
│   └── seed.ts            # rewritten seed script using Drizzle insert
├── drizzle/               # generated SQL migrations
│   └── 0000_init.sql
└── package.json           # drizzle-orm, drizzle-kit, postgres
```

### 3.2 Driver Configuration
```typescript
// packages/db/src/index.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.ts';

const connectionString = Deno.env.get('DATABASE_URL')!;
const client = postgres(connectionString, { max: 10 }); // connection pool
export const db = drizzle(client, { schema });
```

> **Deno Deploy Note:** `postgres-js` is pure JS (no native bindings) and works in Deno Deploy isolates. No separate connection pooler required for moderate load.

---

## 4. Detailed Migration Steps

### Phase 0: Foundation (Schema & Driver)

**Step 0.1 — Create `packages/db/src/schema.ts`**
Translate every Prisma model to `pgTable`, every enum to `pgEnum`, every relation to `relations()`, every index to Drizzle `index()`.

Key mapping rules:
- `uuid` @default(uuid()) → `varchar('id', { length: 36 }).primaryKey()` with `gen_random_uuid()` default, or use `uuid` type if preferred
- `DateTime` → `timestamp('created_at', { withTimezone: true }).defaultNow()`
- `Float` → `real` or `doublePrecision`
- `Int` → `integer`
- `String` → `varchar({ length: N })` or `text`
- `Boolean` → `boolean`
- Enums → `pgEnum('visibility', ['draft', 'private', 'unlisted', 'public'])`
- `@relation(fields, references)` → explicit foreign key columns + `relations()` helpers
- `@@unique` → `unique()` in table config
- `@@index` → `index()` in table config

**Critical schema fidelity checks:**
- `RecipeVersion.vendorId` nullable FK → `varchar('vendor_id', { length: 36 })`
- `Setup` has 5 nullable FKs to `Equipment` → all `varchar(...)` nullable
- `TasteNote.parentId` self-referencing nullable → same pattern
- `Recipe.forkedFromId` self-referencing nullable → same pattern
- `Comment.parentCommentId` self-referencing nullable → same pattern
- `Recipe.currentVersionId` is a nullable string FK (not formally declared as FK in Prisma but logically is)

**Step 0.2 — Create `packages/db/drizzle.config.ts`**
```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: Deno.env.get('DATABASE_URL')!,
  },
});
```

**Step 0.3 — Update `packages/db/src/index.ts`**
Replace Prisma conditional import with postgres-js + drizzle export. Remove `prisma` export. Add `db` and `client` exports.

**Step 0.4 — Generate Initial Migration**
```bash
deno run -A npm:drizzle-kit@latest generate
```
Inspect generated `0000_init.sql`. Ensure:
- All 24 tables created
- All 12 enums created as PostgreSQL enums
- All indexes created
- All foreign keys and `onDelete` behaviors match Prisma (most are `onDelete: Cascade` in Prisma for pivot tables)

### Phase 1: Seed Data Migration

**Step 1.1 — Rewrite `packages/db/src/seed.ts`**
Convert every `prisma.xxx.create({ data: ... })` to `db.insert(xxx).values(...).returning()`.

**Seed Data Audit (must match exactly):**

| Data | Records | Verification |
|---|---|---|
| SCAA Taste Notes | ~100 nodes (3-level hierarchy) | Exact `parent_id` chain preserved |
| Brew Method Compatibility Rules | ~22 rules | Same `brewMethod` + `equipmentType` + `compatible` pairs |
| Badges | 10 badges | Same `rule`, `threshold`, `name`, `icon`, `description` |
| Users | 3 users (admin, alice, bob) | Same emails, usernames, password hashes, preferences |
| Equipment | 7 items | Same names, types, brands, `createdBy` links |
| Vendor | 1 vendor | Heart Coffee Roasters |
| Bean | 1 bean | Linked to vendor and user1 |
| Recipes | 2 recipes | Same slugs, titles, versions, equipment links |
| Recipe Versions | 2 versions | All 30+ fields identical |
| Social Data | 1 follow, 1 like, 1 favourite, 2 comments | Same relationships |
| Setups | 2 setups | Same equipment links |
| UserBadge | 1 awarded | First Brew to alice |

> **Critical:** The Prisma seed uses nested creates (e.g. `user.create({ preferences: { create: {} } })`). In Drizzle, this becomes two separate inserts with the returned user ID passed to the preferences insert.

**Step 1.2 — Move seed file**
`packages/db/prisma/seed.ts` → `packages/db/src/seed.ts` (or keep path and update imports).

### Phase 2: API Model Migration (20 files)

Migrate each `model.ts` from Prisma queries to Drizzle queries. The model function signatures should stay as close as possible to minimize service-layer changes.

**Query Pattern Mapping:**

| Prisma Pattern | Drizzle Equivalent |
|---|---|
| `prisma.user.findUnique({ where: { id } })` | `db.select().from(users).where(eq(users.id, id)).limit(1)` |
| `prisma.user.findFirst({ where: { email, deletedAt: null } })` | `db.select().from(users).where(and(eq(users.email, email), isNull(users.deletedAt))).limit(1)` |
| `prisma.user.findMany({ where, skip, take, orderBy })` | `db.select().from(users).where(where).orderBy(...).limit(take).offset(skip)` |
| `prisma.user.count({ where })` | `db.select({ count: count() }).from(users).where(where)` |
| `prisma.user.create({ data })` | `db.insert(users).values(data).returning()` |
| `prisma.user.update({ where: { id }, data })` | `db.update(users).set(data).where(eq(users.id, id)).returning()` |
| `prisma.user.delete({ where: { id } })` | `db.delete(users).where(eq(users.id, id)).returning()` |
| `prisma.recipe.update({ data: { likeCount: { increment: 1 } } })` | `db.update(recipes).set({ likeCount: sql`${recipes.likeCount} + 1` }).where(eq(recipes.id, id))` |
| Nested `include: { versions: true }` | Use Drizzle `with` relational queries or explicit joins |

**Complex Cases:**

**`recipe/model.ts` — `findById` / `findBySlug`**
These have deep includes: `author`, `versions` (with `tasteNotes.tasteNote`, `equipment.equipment`, `additionalPreparations`, `versionPhotos.photo`), `photos`, `forkedFrom`.

Option A: Use Drizzle relational queries (`db.query.recipes.findFirst({ with: { ... } })`) — requires `relations()` defined in schema.

Option B: Decompose into multiple queries in the service layer (e.g. fetch recipe, then fetch versions, then fetch taste notes per version).

> **Recommendation:** Define `relations()` in schema and use Drizzle relational queries for deep includes. This is the closest semantic match to Prisma's `include`.

**`recipe/model.ts` — `forkRecipe`**
Copies a recipe and creates a new version with duplicated data. In Prisma this is a nested create. In Drizzle: insert recipe, insert version, update `currentVersionId` — wrapped in a transaction.

**`recipe/model.ts` — `toggleLike` / `toggleFavourite`**
Uses `findUnique` on compound unique (`userId_recipeId`). In Drizzle: `db.select().from(userRecipeLikes).where(and(eq(...), eq(...))).limit(1)`.

**`badge/model.ts` — `evaluateBadges`**
Uses `prisma.recipeVersion.findMany({ distinct: ['brewMethod'] })`. Drizzle doesn't have a direct `distinct` operator in relational queries. Use `groupBy` or `select distinct` via `sql` helper.

**`admin/model.ts` — `getTopUsers`**
Uses `orderBy: { recipes: { _count: 'desc' } }`. In Drizzle: join + groupBy + count ordering.

**`equipment/model.ts` — `findMany`**
Accepts `Prisma.EquipmentWhereInput`. After migration, this becomes a generic `SQL | undefined` parameter built from conditions.

### Phase 3: Service & Utility Migration

**`recipe/service.ts`**
Contains one direct Prisma call: `prisma.setup.findUnique({ where: { id: data.setupId, deletedAt: null } })`. Replace with `db.select().from(setups)...`.

**`notify/index.ts`**
Uses `prisma.user.findFirst`, `prisma.userFollow.findMany`, `prisma.user.findMany`. Replace all with Drizzle equivalents.

**`auth/model.ts`**
`createUser` does nested `preferences: { create: {} }`. In Drizzle: two inserts in sequence (or transaction).

**`setup.ts`**
`prisma.user.count`, `prisma.user.create` with nested preferences. Same pattern.

### Phase 4: Middleware & Entry Points

**`middleware/auth.ts`**
Replace `prisma.user.findFirst(...)` with `db.select().from(users)...`.

**`routes/health.ts`**
Replace `prisma.$queryRaw` with `db.execute(sql`SELECT 1`)` or `client` raw query.

**`main.ts`**
Replace `prisma.$disconnect()` with `await client.end()` (postgres-js client cleanup).

### Phase 5: Dependency & Config Updates

**`packages/db/package.json`**
```json
{
  "dependencies": {
    "@brewform/shared": "workspace:*",
    "drizzle-orm": "^0.42.0",
    "postgres": "^3.4.5"
  },
  "devDependencies": {
    "drizzle-kit": "^0.31.0"
  }
}
```

**Root `package.json`**
- Remove: `@prisma/client`, `prisma`
- Add: `drizzle-kit`
- Update scripts:
  - `"db:generate": "deno run -A npm:drizzle-kit@latest generate --config=packages/db/drizzle.config.ts"`
  - `"db:migrate": "deno run -A npm:drizzle-kit@latest migrate --config=packages/db/drizzle.config.ts"`
  - `"db:push": "deno run -A npm:drizzle-kit@latest push --config=packages/db/drizzle.config.ts"`
  - `"db:studio": "deno run -A npm:drizzle-kit@latest studio --config=packages/db/drizzle.config.ts"`
  - `"db:seed": "deno run --allow-all packages/db/src/seed.ts"`

**`Makefile`**
Replace all Prisma commands:
- `db-generate` → `drizzle-kit generate`
- `db-migrate` → `drizzle-kit migrate`
- `db-dev-migrate` → `drizzle-kit push` (or remove)
- `db-studio` → `drizzle-kit studio`
- `db-reset` → drop DB + recreate + migrate + seed (manual or script)
- `db-seed` → `deno run --allow-all packages/db/src/seed.ts`

**`Dockerfile`**
Remove:
```dockerfile
RUN deno run -A npm:prisma@^6.19.3 generate --schema=packages/db/prisma/schema.prisma
```
Add if needed:
```dockerfile
RUN deno run -A npm:drizzle-kit@latest generate --config=packages/db/drizzle.config.ts
```

**`deno.json`**
- Update test include paths: remove `packages/db/prisma/`, add `packages/db/src/`
- Add `packages/db/drizzle/` to lint/fmt exclude if desired

**`.github/workflows/ci.yml` & `pr.yml`**
- Replace `deno task db:generate` with drizzle-kit generate
- Replace `deno task db:migrate` with drizzle-kit migrate
- Update seed path: `deno run --allow-all packages/db/src/seed.ts`

### Phase 6: Documentation Updates

**`docs/architecture.md`**
- Update ADR-004: replace Prisma rationale with Drizzle rationale
- Update "Portability Rules": remove Prisma-specific rules, add Drizzle rules (no raw SQL still applies)
- Update package table: `@brewform/db` description → "Drizzle schema, migrations, seed data, client"

**`docs/deployment.md`**
- Remove Prisma Postgres / Accelerate references
- Update env vars table: remove `DATABASE_PROVIDER` if no longer needed
- Update local dev commands

**`docs/decisions.md`**
- Revise ADR-004 entirely

**`README.md`**
- Tech stack table: ORM row → `Drizzle ORM`
- Quick start commands: `make db-generate`, `make db-migrate`, etc. (already mapped via Makefile)
- Project structure: update `packages/db/` description

---

## 5. Query Pattern Reference (Prisma → Drizzle)

### 5.1 Basic CRUD

```typescript
// FIND UNIQUE
// Prisma:
prisma.user.findUnique({ where: { id } })

// Drizzle:
db.select().from(users).where(eq(users.id, id)).limit(1).then(r => r[0] ?? null)


// FIND MANY WITH PAGINATION
// Prisma:
prisma.user.findMany({ where: { deletedAt: null }, skip: 20, take: 10, orderBy: { createdAt: 'desc' } })

// Drizzle:
db.select().from(users)
  .where(isNull(users.deletedAt))
  .orderBy(desc(users.createdAt))
  .limit(10)
  .offset(20)


// CREATE
// Prisma:
prisma.user.create({ data: { email, username, passwordHash } })

// Drizzle:
db.insert(users).values({ email, username, passwordHash }).returning().then(r => r[0])


// UPDATE
// Prisma:
prisma.user.update({ where: { id }, data: { displayName } })

// Drizzle:
db.update(users).set({ displayName }).where(eq(users.id, id)).returning().then(r => r[0])


// SOFT DELETE
// Prisma:
prisma.user.update({ where: { id }, data: { deletedAt: new Date() } })

// Drizzle:
db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, id))


// COUNT
// Prisma:
prisma.user.count({ where: { deletedAt: null } })

// Drizzle:
db.select({ count: count() }).from(users).where(isNull(users.deletedAt)).then(r => r[0].count)


// INCREMENT
// Prisma:
prisma.recipe.update({ where: { id }, data: { likeCount: { increment: 1 } } })

// Drizzle:
db.update(recipes).set({ likeCount: sql`${recipes.likeCount} + 1` }).where(eq(recipes.id, id))
```

### 5.2 Relations & Includes

```typescript
// Prisma:
prisma.recipe.findUnique({
  where: { id },
  include: {
    author: { select: { id, username } },
    versions: { include: { tasteNotes: { include: { tasteNote: true } } } }
  }
})

// Drizzle (relational queries):
db.query.recipes.findFirst({
  where: eq(recipes.id, id),
  with: {
    author: { columns: { id: true, username: true } },
    versions: {
      with: {
        tasteNotes: { with: { tasteNote: true } }
      }
    }
  }
})
```

### 5.3 Transactions

```typescript
// Prisma:
await prisma.$transaction([
  prisma.user.create({ data: userData }),
  prisma.preferences.create({ data: { userId: user.id } })
])

// Drizzle:
await db.transaction(async (tx) => {
  const [user] = await tx.insert(users).values(userData).returning();
  await tx.insert(userPreferences).values({ userId: user.id });
});
```

---

## 6. Risk Register & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Type mismatches between Prisma and Drizzle schema | Medium | High | Generate migration, diff against existing tables, run on fresh DB first |
| Seed script misses data or breaks hierarchy | Low | High | Audit every seed function against Prisma seed line-by-line |
| Complex relational queries (deep includes) don't map cleanly | Medium | Medium | Use Drizzle relational queries where possible; decompose into multiple queries if needed |
| `postgres-js` compatibility issues on Deno Deploy | Low | High | Test locally first; `postgres-js` is Deno-deploy-friendly pure JS |
| CI breaking due to missing Prisma binary | Medium | Medium | Update CI before merging; run CI on feature branch |
| Model files still import `@prisma/client` after migration | Medium | Low | Global grep for `@prisma/client` and `@brewform/db` old patterns |

---

## 7. Verification Checklist

### 7.1 Static Verification
- [ ] `deno check --unstable-sloppy-imports apps/api/src/main.ts` passes
- [ ] `deno lint apps/ packages/` passes
- [ ] `deno fmt --check apps/ packages/` passes
- [ ] Zero imports from `@prisma/client` remain in `apps/api/src/`
- [ ] Zero references to `prisma` variable remain in API code

### 7.2 Database Verification
- [ ] `drizzle-kit generate` produces SQL matching existing schema
- [ ] `drizzle-kit migrate` applies cleanly to fresh PostgreSQL container
- [ ] Seed script runs without errors
- [ ] All 24 tables have correct row counts after seed
- [ ] All enums have correct values
- [ ] All indexes exist
- [ ] Foreign keys have correct `onDelete` behavior

### 7.3 Functional Verification
- [ ] `GET /health` returns `ok`
- [ ] `GET /ready` returns `ready` with DB connected
- [ ] User registration creates user + preferences
- [ ] User login issues JWT
- [ ] Create recipe with version, equipment, taste notes
- [ ] Fork recipe copies data correctly
- [ ] Like / favourite / comment / follow work
- [ ] Badge evaluation runs and awards badges
- [ ] Admin dashboard stats load
- [ ] Photo upload still works (unrelated to DB layer but good E2E)
- [ ] Email notifications still fire

---

## 8. Rollback Plan

If catastrophic failure after merge:
1. Revert the PR in Git
2. Restore PostgreSQL from pre-migration backup (if production data existed)
3. Re-run Prisma migrations to restore Prisma-managed schema state
4. Redeploy previous working revision

> **Note:** For existing production data, the Drizzle migration must be **additive only** — no column renames or type changes that break existing rows. Since we're replicating the same schema, this should hold, but verify `0000_init.sql` against a dump of the current DB.

---

## 9. Execution Order (Recommended)

1. **Branch:** `spec/migrate-brewform-database-layer-prisma-drizzle`
2. **Phase 0:** Schema + config + generate migration
3. **Phase 1:** Seed script rewrite + test on fresh DB
4. **Phase 2:** Migrate model files in dependency order:
   - auth → user → recipe → equipment → comment → follow → badge → admin → others
5. **Phase 3:** Services, middleware, health, setup, notify
6. **Phase 4:** main.ts shutdown cleanup
7. **Phase 5:** Dependencies, Makefile, Dockerfile, CI, deno.json
8. **Phase 6:** Documentation
9. **Phase 7:** Full test suite + lint + type check + seed verification
10. **Phase 8:** Manual smoke test
11. **Phase 9:** PR review + merge
