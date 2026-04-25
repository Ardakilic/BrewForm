# BrewForm Phase 6 — Backend Domain Modules

## Status: READY

## Overview

Implement 14 domain modules following the pattern: `index.ts` (controller/routes), `service.ts` (business logic), `model.ts` (Prisma wrapper). Each module is self-contained in `apps/api/src/modules/<name>/`.

---

## Common Patterns

### Model Layer (`model.ts`)
Each model wraps Prisma calls. Never import `@prisma/client` directly in service or controller — always go through the model. This follows §6.2 portability rules.

### Service Layer (`service.ts`)
Contains business logic, validation, and orchestration. Calls model functions. Handles authorization checks.

### Controller Layer (`index.ts`)
Hono routes with Zod validation. Calls service functions. Returns standardized responses using the `success()` / `error()` / `paginated()` helpers.

---

## 1. User Module (`apps/api/src/modules/user/`)

### `model.ts`

```typescript
import { prisma } from '@brewform/db';

export async function findById(id: string) {
  return prisma.user.findUnique({
    where: { id, deletedAt: null },
    include: { preferences: true },
  });
}

export async function findByUsername(username: string) {
  return prisma.user.findUnique({
    where: { username, deletedAt: null },
    include: { preferences: true },
  });
}

export async function updateProfile(id: string, data: { displayName?: string; bio?: string; avatarUrl?: string }) {
  return prisma.user.update({
    where: { id },
    data,
    include: { preferences: true },
  });
}

export async function deleteUser(id: string) {
  return prisma.user.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export async function getUserStats(id: string) {
  const [recipeCount, followerCount, followingCount] = await Promise.all([
    prisma.recipe.count({ where: { authorId: id, deletedAt: null, visibility: 'public' } }),
    prisma.userFollow.count({ where: { followingId: id } }),
    prisma.userFollow.count({ where: { followerId: id } }),
  ]);
  return { recipeCount, followerCount, followingCount };
}

export async function searchUsers(query: string, page: number, perPage: number) {
  const where = {
    deletedAt: null,
    OR: [
      { username: { contains: query } },
      { displayName: { contains: query } },
    ],
  };
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip: (page - 1) * perPage,
      take: perPage,
      select: { id: true, username: true, displayName: true, avatarUrl: true, bio: true, createdAt: true },
    }),
    prisma.user.count({ where }),
  ]);
  return { users, total };
}
```

### `service.ts`

```typescript
import * as model from './model.ts';

export async function getProfile(userId: string) {
  const user = await model.findById(userId);
  if (!user) throw new Error('USER_NOT_FOUND');
  const { passwordHash, ...safe } = user;
  const stats = await model.getUserStats(userId);
  return { ...safe, ...stats };
}

export async function getPublicProfile(username: string) {
  const user = await model.findByUsername(username);
  if (!user) throw new Error('USER_NOT_FOUND');
  const stats = await model.getUserStats(user.id);
  const { passwordHash, email, ...safe } = user;
  return { ...safe, ...stats };
}

export async function updateProfile(userId: string, data: { displayName?: string; bio?: string; avatarUrl?: string }) {
  const user = await model.updateProfile(userId, data);
  const { passwordHash, ...safe } = user;
  return safe;
}

export async function deleteAccount(userId: string) {
  await model.deleteUser(userId);
}
```

### `index.ts`

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { UserProfileUpdateSchema } from '@brewform/shared/schemas';
import { authMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { success, error } from '../../utils/response/index.ts';

const user = new Hono();

user.get('/me', authMiddleware, async (c) => {
  const userId = c.get('userId');
  try {
    const profile = await service.getProfile(userId);
    return success(c, profile);
  } catch (err: any) {
    if (err.message === 'USER_NOT_FOUND') return error(c, 'NOT_FOUND', 'User not found', 404);
    throw err;
  }
});

user.patch('/me', authMiddleware, zValidator('json', UserProfileUpdateSchema), async (c) => {
  const userId = c.get('userId');
  const body = c.req.valid('json');
  const updated = await service.updateProfile(userId, body);
  return success(c, updated);
});

user.delete('/me', authMiddleware, async (c) => {
  const userId = c.get('userId');
  await service.deleteAccount(userId);
  return success(c, { message: 'Account deleted' });
});

user.get('/:username', async (c) => {
  const username = c.req.param('username');
  try {
    const profile = await service.getPublicProfile(username);
    return success(c, profile);
  } catch (err: any) {
    if (err.message === 'USER_NOT_FOUND') return error(c, 'NOT_FOUND', 'User not found', 404);
    throw err;
  }
});

export default user;
```

---

## 2. Recipe Module (`apps/api/src/modules/recipe/`)

The most complex module. Full source for all three files:

### `model.ts`

```typescript
import { prisma } from '@brewform/db';
import type { Prisma } from '@prisma/client';

export async function create(data: Prisma.RecipeCreateInput) {
  return prisma.recipe.create({ data, include: { versions: true } });
}

export async function findById(id: string) {
  return prisma.recipe.findUnique({
    where: { id, deletedAt: null },
    include: {
      author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      versions: {
        orderBy: { versionNumber: 'desc' },
        include: {
          tasteNotes: { include: { tasteNote: true } },
          equipment: { include: { equipment: true } },
          additionalPreparations: true,
          versionPhotos: { include: { photo: true } },
        },
      },
      photos: true,
      forkedFrom: { select: { id: true, slug: true, title: true } },
    },
  });
}

export async function findBySlug(slug: string) {
  return prisma.recipe.findUnique({
    where: { slug, deletedAt: null },
    include: {
      author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      versions: {
        orderBy: { versionNumber: 'desc' },
        include: {
          tasteNotes: { include: { tasteNote: true } },
          equipment: { include: { equipment: true } },
          additionalPreparations: true,
          versionPhotos: { include: { photo: true } },
        },
      },
      photos: true,
      forkedFrom: { select: { id: true, slug: true, title: true } },
    },
  });
}

export async function findMany(where: Prisma.RecipeWhereInput, page: number, perPage: number) {
  const [recipes, total] = await Promise.all([
    prisma.recipe.findMany({
      where: { ...where, deletedAt: null },
      skip: (page - 1) * perPage,
      take: perPage,
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        versions: { take: 1, orderBy: { versionNumber: 'desc' } },
        photos: { take: 1 },
      },
    }),
    prisma.recipe.count({ where: { ...where, deletedAt: null } }),
  ]);
  return { recipes, total };
}

export async function update(id: string, data: Prisma.RecipeUpdateInput) {
  return prisma.recipe.update({ where: { id }, data });
}

export async function softDelete(id: string) {
  return prisma.recipe.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export async function createVersion(data: Prisma.RecipeVersionCreateInput) {
  return prisma.recipeVersion.create({ data });
}

export async function forkRecipe(sourceId: string, authorId: string, title: string, slug: string) {
  const source = await findById(sourceId);
  if (!source) throw new Error('RECIPE_NOT_FOUND');

  const latestVersion = source.versions[0];
  if (!latestVersion) throw new Error('RECIPE_NO_VERSIONS');

  const newRecipe = await prisma.recipe.create({
    data: {
      slug,
      title,
      authorId,
      visibility: 'draft',
      forkedFromId: sourceId,
      versions: {
        create: {
          versionNumber: 1,
          productName: latestVersion.productName,
          coffeeBrand: latestVersion.coffeeBrand,
          coffeeProcessing: latestVersion.coffeeProcessing,
          vendorId: latestVersion.vendorId,
          roastDate: latestVersion.roastDate,
          packageOpenDate: latestVersion.packageOpenDate,
          grindDate: latestVersion.grindDate,
          brewDate: new Date(),
          brewMethod: latestVersion.brewMethod,
          drinkType: latestVersion.drinkType,
          brewerDetails: latestVersion.brewerDetails,
          grinder: latestVersion.grinder,
          grindSize: latestVersion.grindSize,
          groundWeightGrams: latestVersion.groundWeightGrams,
          extractionTimeSeconds: latestVersion.extractionTimeSeconds,
          extractionVolumeMl: latestVersion.extractionVolumeMl,
          temperatureCelsius: latestVersion.temperatureCelsius,
          brewRatio: latestVersion.brewRatio,
          flowRate: latestVersion.flowRate,
          personalNotes: latestVersion.personalNotes,
          isFavourite: false,
        },
      },
    },
    include: { versions: true },
  });

  newRecipe.currentVersionId = newRecipe.versions[0].id;
  await prisma.recipe.update({ where: { id: newRecipe.id }, data: { currentVersionId: newRecipe.versions[0].id } });
  await prisma.recipe.update({ where: { id: sourceId }, data: { forkCount: { increment: 1 } } });

  return newRecipe;
}

export async function incrementLikes(id: string) {
  return prisma.recipe.update({ where: { id }, data: { likeCount: { increment: 1 } } });
}

export async function decrementLikes(id: string) {
  return prisma.recipe.update({ where: { id }, data: { likeCount: { decrement: 1 } } });
}

export async function incrementComments(id: string) {
  return prisma.recipe.update({ where: { id }, data: { commentCount: { increment: 1 } } });
}
```

### `service.ts`

```typescript
import * as model from './model.ts';
import { computeBrewRatio, computeFlowRate } from '@brewform/shared/utils';
import { generateSlug, ensureUniqueSlug } from '@brewform/shared/utils';
import { validateGrindDateNotBeforeRoastDate } from '@brewform/shared/utils';

export async function getRecipe(slugOrId: string) {
  let recipe;
  if (slugOrId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    recipe = await model.findById(slugOrId);
  } else {
    recipe = await model.findBySlug(slugOrId);
  }
  if (!recipe) throw new Error('RECIPE_NOT_FOUND');
  return recipe;
}

export async function createRecipe(authorId: string, data: any) {
  const slug = await generateUniqueSlug(data.title);

  const brewRatio = data.groundWeightGrams && data.extractionVolumeMl
    ? computeBrewRatio(data.groundWeightGrams, data.extractionVolumeMl)
    : null;
  const flowRate = data.extractionVolumeMl && data.extractionTimeSeconds
    ? computeFlowRate(data.extractionVolumeMl, data.extractionTimeSeconds)
    : null;

  const recipe = await model.create({
    slug,
    title: data.title,
    authorId,
    visibility: data.visibility || 'draft',
    currentVersionId: '',
    versions: {
      create: {
        versionNumber: 1,
        productName: data.productName,
        coffeeBrand: data.coffeeBrand,
        coffeeProcessing: data.coffeeProcessing,
        vendorId: data.vendorId,
        roastDate: data.roastDate ? new Date(data.roastDate) : null,
        packageOpenDate: data.packageOpenDate ? new Date(data.packageOpenDate) : null,
        grindDate: data.grindDate ? new Date(data.grindDate) : null,
        brewDate: data.brewDate ? new Date(data.brewDate) : new Date(),
        brewMethod: data.brewMethod,
        drinkType: data.drinkType,
        brewerDetails: data.brewerDetails,
        grinder: data.grinder,
        grindSize: data.grindSize,
        groundWeightGrams: data.groundWeightGrams,
        extractionTimeSeconds: data.extractionTimeSeconds,
        extractionVolumeMl: data.extractionVolumeMl,
        temperatureCelsius: data.temperatureCelsius,
        brewRatio,
        flowRate,
        personalNotes: data.personalNotes,
        isFavourite: data.isFavourite || false,
        rating: data.rating,
        emojiTag: data.emojiTag,
        tasteNotes: data.tasteNoteIds ? {
          create: data.tasteNoteIds.map((id: string) => ({ tasteNoteId: id })),
        } : undefined,
        equipment: data.equipmentIds ? {
          create: data.equipmentIds.map((id: string) => ({ equipmentId: id })),
        } : undefined,
        additionalPreparations: data.additionalPreparations ? {
          create: data.additionalPreparations.map((p: any, i: number) => ({
            name: p.name, type: p.type, inputAmount: p.inputAmount,
            preparationType: p.preparationType, sortOrder: i,
          })),
        } : undefined,
      },
    },
  });

  await model.update(recipe.id, { currentVersionId: recipe.versions[0].id });
  return model.findById(recipe.id);
}

export async function updateRecipe(recipeId: string, authorId: string, data: any) {
  const recipe = await model.findById(recipeId);
  if (!recipe) throw new Error('RECIPE_NOT_FOUND');
  if (recipe.authorId !== authorId) throw new Error('FORBIDDEN');

  if (data.bumpVersion) {
    const latestVersion = recipe.versions[0];
    const newVersionNumber = latestVersion.versionNumber + 1;

    const brewRatio = data.groundWeightGrams || data.extractionVolumeMl
      ? computeBrewRatio(
          data.groundWeightGrams ?? latestVersion.groundWeightGrams ?? 0,
          data.extractionVolumeMl ?? latestVersion.extractionVolumeMl ?? 0,
        )
      : latestVersion.brewRatio;
    const flowRate = data.extractionVolumeMl || data.extractionTimeSeconds
      ? computeFlowRate(
          data.extractionVolumeMl ?? latestVersion.extractionVolumeMl ?? 0,
          data.extractionTimeSeconds ?? latestVersion.extractionTimeSeconds ?? 0,
        )
      : latestVersion.flowRate;

    const version = await model.createVersion({
      recipeId: recipe.id,
      versionNumber: newVersionNumber,
      productName: data.productName ?? latestVersion.productName,
      coffeeBrand: data.coffeeBrand ?? latestVersion.coffeeBrand,
      coffeeProcessing: data.coffeeProcessing ?? latestVersion.coffeeProcessing,
      vendorId: data.vendorId ?? latestVersion.vendorId,
      roastDate: data.roastDate ? new Date(data.roastDate) : latestVersion.roastDate,
      packageOpenDate: data.packageOpenDate ? new Date(data.packageOpenDate) : latestVersion.packageOpenDate,
      grindDate: data.grindDate ? new Date(data.grindDate) : latestVersion.grindDate,
      brewDate: new Date(),
      brewMethod: data.brewMethod ?? latestVersion.brewMethod,
      drinkType: data.drinkType ?? latestVersion.drinkType,
      brewerDetails: data.brewerDetails ?? latestVersion.brewerDetails,
      grinder: data.grinder ?? latestVersion.grinder,
      grindSize: data.grindSize ?? latestVersion.grindSize,
      groundWeightGrams: data.groundWeightGrams ?? latestVersion.groundWeightGrams,
      extractionTimeSeconds: data.extractionTimeSeconds ?? latestVersion.extractionTimeSeconds,
      extractionVolumeMl: data.extractionVolumeMl ?? latestVersion.extractionVolumeMl,
      temperatureCelsius: data.temperatureCelsius ?? latestVersion.temperatureCelsius,
      brewRatio,
      flowRate,
      personalNotes: data.personalNotes ?? latestVersion.personalNotes,
      isFavourite: data.isFavourite ?? latestVersion.isFavourite,
      rating: data.rating ?? latestVersion.rating,
      emojiTag: data.emojiTag ?? latestVersion.emojiTag,
    });

    await model.update(recipe.id, {
      title: data.title ?? recipe.title,
      visibility: data.visibility ?? recipe.visibility,
      currentVersionId: version.id,
    });
  } else {
    await model.update(recipe.id, {
      title: data.title ?? recipe.title,
      visibility: data.visibility ?? recipe.visibility,
    });
  }

  return model.findById(recipeId);
}

export async function forkRecipe(sourceId: string, authorId: string, title?: string) {
  const source = await model.findById(sourceId);
  if (!source) throw new Error('RECIPE_NOT_FOUND');
  if (source.visibility === 'draft' || source.visibility === 'private') {
    if (source.authorId !== authorId) throw new Error('FORBIDDEN');
  }

  const forkTitle = title || `Fork of ${source.title}`;
  const slug = generateSlug(forkTitle);
  const uniqueSlug = await ensureUniqueSlug(slug, []);

  return model.forkRecipe(sourceId, authorId, forkTitle, uniqueSlug);
}

export async function deleteRecipe(recipeId: string, authorId: string) {
  const recipe = await model.findById(recipeId);
  if (!recipe) throw new Error('RECIPE_NOT_FOUND');
  if (recipe.authorId !== authorId) throw new Error('FORBIDDEN');
  await model.softDelete(recipeId);
}

export async function listRecipes(filters: any, page: number, perPage: number) {
  const where: any = { visibility: 'public' };
  if (filters.authorId) where.authorId = filters.authorId;
  if (filters.brewMethod) where.versions = { some: { brewMethod: filters.brewMethod } };
  if (filters.drinkType) where.versions = { some: { drinkType: filters.drinkType } };
  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search } },
      { versions: { some: { productName: { contains: filters.search } } } },
    ];
  }
  return model.findMany(where, page, perPage);
}

private async function generateUniqueSlug(title: string): Promise<string> {
  const slug = generateSlug(title);
  const existing = await model.findBySlug(slug);
  if (!existing) return slug;
  return ensureUniqueSlug(slug, []);
}
```

### `index.ts`

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { RecipeCreateSchema, RecipeUpdateSchema, RecipeFilterSchema } from '@brewform/shared/schemas';
import { authMiddleware, optionalAuthMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { success, error, paginated } from '../../utils/response/index.ts';

const recipe = new Hono();

recipe.get('/', zValidator('query', RecipeFilterSchema), async (c) => {
  const filters = c.req.valid('query');
  const result = await service.listRecipes(filters, filters.page, filters.perPage);
  return paginated(c, result.recipes, {
    page: filters.page,
    perPage: filters.perPage,
    total: result.total,
    totalPages: Math.ceil(result.total / filters.perPage),
  });
});

recipe.get('/:slugOrId', optionalAuthMiddleware, async (c) => {
  const slugOrId = c.req.param('slugOrId');
  try {
    const r = await service.getRecipe(slugOrId);
    if (r.visibility === 'draft' || r.visibility === 'private') {
      const userId = c.get('userId');
      if (userId !== r.authorId) return error(c, 'NOT_FOUND', 'Recipe not found', 404);
    }
    return success(c, r);
  } catch (err: any) {
    if (err.message === 'RECIPE_NOT_FOUND') return error(c, 'NOT_FOUND', 'Recipe not found', 404);
    throw err;
  }
});

recipe.post('/', authMiddleware, zValidator('json', RecipeCreateSchema), async (c) => {
  const authorId = c.get('userId');
  const body = c.req.valid('json');
  try {
    const r = await service.createRecipe(authorId, body);
    return success(c, r, 201);
  } catch (err: any) {
    if (err.message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not authorized', 403);
    throw err;
  }
});

recipe.patch('/:id', authMiddleware, zValidator('json', RecipeUpdateSchema), async (c) => {
  const recipeId = c.req.param('id');
  const authorId = c.get('userId');
  const body = c.req.valid('json');
  try {
    const r = await service.updateRecipe(recipeId, authorId, body);
    return success(c, r);
  } catch (err: any) {
    if (err.message === 'RECIPE_NOT_FOUND') return error(c, 'NOT_FOUND', 'Recipe not found', 404);
    if (err.message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not your recipe', 403);
    throw err;
  }
});

recipe.delete('/:id', authMiddleware, async (c) => {
  const recipeId = c.req.param('id');
  const authorId = c.get('userId');
  try {
    await service.deleteRecipe(recipeId, authorId);
    return success(c, { message: 'Recipe deleted' });
  } catch (err: any) {
    if (err.message === 'RECIPE_NOT_FOUND') return error(c, 'NOT_FOUND', 'Recipe not found', 404);
    if (err.message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not your recipe', 403);
    throw err;
  }
});

recipe.post('/:id/fork', authMiddleware, async (c) => {
  const sourceId = c.req.param('id');
  const authorId = c.get('userId');
  const { title } = await c.req.json().catch(() => ({}));
  try {
    const forked = await service.forkRecipe(sourceId, authorId, title);
    return success(c, forked, 201);
  } catch (err: any) {
    if (err.message === 'RECIPE_NOT_FOUND') return error(c, 'NOT_FOUND', 'Recipe not found', 404);
    if (err.message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Cannot fork this recipe', 403);
    throw err;
  }
});

recipe.get('/compare/:id1/:id2', optionalAuthMiddleware, async (c) => {
  const id1 = c.req.param('id1');
  const id2 = c.req.param('id2');
  try {
    const [r1, r2] = await Promise.all([service.getRecipe(id1), service.getRecipe(id2)]);
    if (r1.visibility !== 'public' || r2.visibility !== 'public') {
      return error(c, 'FORBIDDEN', 'Only public recipes can be compared', 403);
    }
    return success(c, { recipe1: r1, recipe2: r2 });
  } catch (err: any) {
    if (err.message === 'RECIPE_NOT_FOUND') return error(c, 'NOT_FOUND', 'Recipe not found', 404);
    throw err;
  }
});

export default recipe;
```

---

## 3–13. Remaining Modules (Key Signatures)

Below are the key route definitions and service method signatures for the remaining 11 modules. Each follows the same `model.ts` → `service.ts` → `index.ts` pattern.

### 3. Equipment Module

**Routes:**
- `GET /api/v1/equipment` — list (paginated, filterable by type)
- `GET /api/v1/equipment/search?q=` — autocomplete
- `POST /api/v1/equipment` — create (auth required)
- `GET /api/v1/equipment/:id` — get
- `PATCH /api/v1/equipment/:id` — update (auth, creator only)
- `DELETE /api/v1/equipment/:id` — soft delete (auth, creator only)

**Service methods:**
- `listEquipment(type?, page, perPage)`
- `searchEquipment(query)` — autocomplete, returns top 10 matches
- `createEquipment(userId, data)`
- `updateEquipment(userId, id, data)`
- `deleteEquipment(userId, id)`

### 4. Bean Module

**Routes:**
- `GET /api/v1/beans` — list user's beans
- `POST /api/v1/beans` — create
- `PATCH /api/v1/beans/:id` — update
- `DELETE /api/v1/beans/:id` — soft delete

**Service methods:** Standard CRUD, scoped to `userId`.

### 5. Vendor Module

**Routes:**
- `GET /api/v1/vendors` — list (paginated)
- `GET /api/v1/vendors/search?q=` — autocomplete
- `POST /api/v1/vendors` — create (auth)
- `PATCH /api/v1/vendors/:id` — update (auth, admin or creator)
- `DELETE /api/v1/vendors/:id` — soft delete (admin only)

### 6. Taste Module (90% coverage requirement — FULL SOURCE)

```typescript
// apps/api/src/modules/taste/model.ts
import { prisma } from '@brewform/db';

export async function findAll() {
  return prisma.tasteNote.findMany({
    where: {},
    orderBy: [{ depth: 'asc' }, { name: 'asc' }],
  });
}

export async function findChildren(parentId: string) {
  return prisma.tasteNote.findMany({
    where: { parentId },
    orderBy: { name: 'asc' },
  });
}

export async function searchByName(query: string) {
  return prisma.tasteNote.findMany({
    where: {
      name: { contains: query },
    },
    orderBy: [{ depth: 'asc' }, { name: 'asc' }],
    take: 50,
  });
}

export async function getHierarchy() {
  const roots = await prisma.tasteNote.findMany({
    where: { parentId: null, depth: 0 },
    include: {
      children: {
        include: {
          children: true,
        },
        orderBy: { name: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  });
  return roots;
}

export async function findById(id: string) {
  return prisma.tasteNote.findUnique({ where: { id } });
}

export async function create(data: { name: string; parentId?: string; color?: string; definition?: string; depth: number }) {
  return prisma.tasteNote.create({ data });
}

export async function update(id: string, data: { name?: string; color?: string; definition?: string }) {
  return prisma.tasteNote.update({ where: { id }, data });
}

export async function remove(id: string) {
  return prisma.tasteNote.delete({ where: { id } });
}
```

```typescript
// apps/api/src/modules/taste/service.ts
import * as model from './model.ts';
import type { CacheProvider } from '../../utils/cache/index.ts';

const TASTE_CACHE_KEY = ['cache', 'taste-notes'];
const TASTE_CACHE_TTL = 86400000; // 24 hours

export async function getHierarchy(cache: CacheProvider) {
  const cached = await cache.get<any>(TASTE_CACHE_KEY);
  if (cached) return cached;

  const hierarchy = await model.getHierarchy();
  await cache.set(TASTE_CACHE_KEY, hierarchy, { ttlMs: TASTE_CACHE_TTL });
  return hierarchy;
}

export async function searchTasteNotes(query: string, cache: CacheProvider) {
  if (query.length < 3) throw new Error('QUERY_TOO_SHORT');

  const allNotes = await model.searchByName(query);

  const result = allNotes.map((note) => {
    if (note.depth === 0) {
      return allNotes;
    }
    return allNotes;
  });

  const flat = allNotes;
  const parentIds = new Set<string>();

  for (const note of flat) {
    if (note.parentId) {
      parentIds.add(note.parentId);
    }
  }

  for (const parentId of parentIds) {
    const children = await model.findChildren(parentId);
    for (const child of children) {
      if (!flat.find((n) => n.id === child.id)) {
        flat.push(child);
      }
    }
  }

  const uniqueNotes = Array.from(
    new Map(flat.map((n) => [n.id, n])).values()
  );
  uniqueNotes.sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name));

  return uniqueNotes;
}

export async function getFlatList(cache: CacheProvider) {
  const cached = await cache.get<any>(['cache', 'taste-notes-flat']);
  if (cached) return cached;

  const allNotes = await model.findAll();
  await cache.set(['cache', 'taste-notes-flat'], allNotes, { ttlMs: TASTE_CACHE_TTL });
  return allNotes;
}

export async function createTasteNote(data: { name: string; parentId?: string; color?: string; definition?: string; depth: number }, cache: CacheProvider) {
  const note = await model.create(data);
  await flushCache(cache);
  return note;
}

export async function updateTasteNote(id: string, data: { name?: string; color?: string; definition?: string }, cache: CacheProvider) {
  const note = await model.update(id, data);
  await flushCache(cache);
  return note;
}

export async function deleteTasteNote(id: string, cache: CacheProvider) {
  await model.remove(id);
  await flushCache(cache);
}

async function flushCache(cache: CacheProvider) {
  await cache.delete(TASTE_CACHE_KEY);
  await cache.delete(['cache', 'taste-notes-flat']);
  await cache.deleteByPrefix(['cache', 'taste']);
}
```

```typescript
// apps/api/src/modules/taste/index.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { TasteNoteFilterSchema } from '@brewform/shared/schemas';
import { authMiddleware, adminMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { cacheProvider } from '../../main.ts';
import { success, error, paginated } from '../../utils/response/index.ts';

const taste = new Hono();

taste.get('/hierarchy', async (c) => {
  const hierarchy = await service.getHierarchy(cacheProvider!);
  return success(c, hierarchy);
});

taste.get('/search', zValidator('query', TasteNoteFilterSchema), async (c) => {
  const { search } = c.req.valid('query');
  if (!search) {
    const allNotes = await service.getFlatList(cacheProvider!);
    return success(c, allNotes);
  }
  try {
    const results = await service.searchTasteNotes(search, cacheProvider!);
    return success(c, results);
  } catch (err: any) {
    if (err.message === 'QUERY_TOO_SHORT') {
      return error(c, 'QUERY_TOO_SHORT', 'Search query must be at least 3 characters', 400);
    }
    throw err;
  }
});

taste.get('/flat', async (c) => {
  const allNotes = await service.getFlatList(cacheProvider!);
  return success(c, allNotes);
});

taste.post('/', authMiddleware, adminMiddleware, async (c) => {
  const body = await c.req.json();
  const note = await service.createTasteNote(body, cacheProvider!);
  return success(c, note, 201);
});

taste.patch('/:id', authMiddleware, adminMiddleware, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const note = await service.updateTasteNote(id, body, cacheProvider!);
  return success(c, note);
});

taste.delete('/:id', authMiddleware, adminMiddleware, async (c) => {
  const id = c.req.param('id');
  await service.deleteTasteNote(id, cacheProvider!);
  return success(c, { message: 'Taste note deleted' });
});

export default taste;
```

### 7. Photo Module

**Routes:**
- `POST /api/v1/photos` — upload (auth, multipart form)
- `GET /api/v1/photos/recipe/:recipeId` — list photos for recipe
- `DELETE /api/v1/photos/:id` — soft delete (auth, recipe owner)

**Service methods:**
- `uploadPhoto(userId, recipeId, file, alt?, sortOrder?)` — validates image, saves to uploads dir, creates DB record, generates thumbnail
- `listPhotos(recipeId)`
- `deletePhoto(userId, id)` — soft delete

### 8. Comment Module

**Routes:**
- `POST /api/v1/comments/recipe/:recipeId` — create comment (auth)
- `GET /api/v1/comments/recipe/:recipeId` — list comments (paginated)
- `POST /api/v1/comments/:commentId/reply` — reply (auth, OP only per §3.4)
- `DELETE /api/v1/comments/:id` — soft delete (auth, comment author)

**Key business rule:** Only the recipe author can reply to a comment. The `parentCommentId` field creates threaded replies. If a non-author tries to reply, return 403.

### 9. Follow Module

**Routes:**
- `POST /api/v1/follow/:userId` — follow (auth)
- `DELETE /api/v1/follow/:userId` — unfollow (auth)
- `GET /api/v1/follow/:userId/followers` — list followers
- `GET /api/v1/follow/:userId/following` — list following
- `GET /api/v1/follow/feed` — authenticated user's feed (recipes from followed users, paginated)

**Service methods:**
- `followUser(followerId, followingId)` — create UserFollow, throws if self-follow
- `unfollowUser(followerId, followingId)` — delete UserFollow
- `getFollowers(userId, page, perPage)`
- `getFollowing(userId, page, perPage)`
- `getFeed(userId, page, perPage)` — public recipes from followed users, ordered by createdAt desc

### 10. Badge Module

**Routes:**
- `GET /api/v1/badges` — list all badge definitions
- `GET /api/v1/badges/user/:userId` — list user's badges
- `POST /api/v1/badges/evaluate/:userId` — evaluate and award badges (internal/admin)

**Service methods:**
- `listBadges()`
- `getUserBadges(userId)`
- `evaluateBadges(userId)` — checks all BadgeRule conditions and awards unearned badges. Runs as background job.

Badge evaluation logic:
```typescript
async function evaluateBadges(userId: string) {
  const userRecipes = await prisma.recipe.count({ where: { authorId: userId, deletedAt: null } });
  const userComments = await prisma.comment.count({ where: { authorId: userId, deletedAt: null } });
  const userForks = await prisma.recipe.count({ where: { authorId: userId, forkedFromId: { not: null }, deletedAt: null } });
  const userFollowers = await prisma.userFollow.count({ where: { followingId: userId } });
  const userRecipesWithLikes = await prisma.recipe.findMany({ where: { authorId: userId } });
  const maxLikes = Math.max(...userRecipesWithLikes.map(r => r.likeCount), 0);
  const distinctMethods = await prisma.recipeVersion.findMany({ where: { recipe: { authorId: userId } }, select: { brewMethod: true }, distinct: ['brewMethod'] });

  const checks: Array<{ rule: string; met: boolean }> = [
    { rule: 'first_brew', met: userRecipes >= 1 },
    { rule: 'decade_brewer', met: userRecipes >= 10 },
    { rule: 'centurion', met: userRecipes >= 100 },
    { rule: 'first_fork', met: userForks >= 1 },
    { rule: 'fan_favourite', met: maxLikes >= 10 },
    { rule: 'community_star', met: maxLikes >= 50 },
    { rule: 'conversationalist', met: userComments >= 10 },
    { rule: 'explorer', met: distinctMethods.length >= 5 },
    { rule: 'influencer', met: userFollowers >= 25 },
  ];

  for (const check of checks) {
    if (check.met) {
      const badge = await prisma.badge.findUnique({ where: { rule: check.rule as any } });
      if (badge) {
        await prisma.userBadge.upsert({
          where: { userId_badgeId: { userId, badgeId: badge.id } },
          create: { userId, badgeId: badge.id },
          update: {},
        });
      }
    }
  }
}
```

### 11. Setup Module

**Routes:**
- `GET /api/v1/setups` — list user's setups
- `POST /api/v1/setups` — create setup
- `PATCH /api/v1/setups/:id` — update setup
- `DELETE /api/v1/setups/:id` — soft delete
- `POST /api/v1/setups/:id/set-default` — set as default setup

**Service:** Standard CRUD, scoped to userId. Each user can have multiple setups. Only one can be `isDefault: true`. Setting a new default clears the previous default.

### 12. Preference Module

**Routes:**
- `GET /api/v1/preferences` — get user preferences (auth)
- `PATCH /api/v1/preferences` — update user preferences (auth)

**Service:** Direct Prisma upsert on UserPreferences table. Timezone auto-detect from client header or leave as UTC.

### 13. Search Module

**Routes:**
- `GET /api/v1/search` — search recipes by title, method, type, etc.

**Service:** Uses Prisma `contains` filter for simple search. Routes through Recipe model with dynamic where clause construction. Supports all filter params from `SearchSchema`.

### 14. QR Code Module

**Routes:**
- `GET /api/v1/qrcode/recipe/:slug.png` — generate PNG QR code for recipe
- `GET /api/v1/qrcode/recipe/:slug.svg` — generate SVG QR code for recipe

**Service:**
```typescript
import { generateQRCodePng, generateQRCodeSvg } from '../../utils/qrcode/index.ts';

export async function getRecipeQRCode(slug: string, format: 'png' | 'svg', baseUrl: string) {
  const recipe = await model.findBySlug(slug);
  if (!recipe) throw new Error('RECIPE_NOT_FOUND');
  if (recipe.visibility === 'draft' || recipe.visibility === 'private') {
    throw new Error('RECIPE_NOT_AVAILABLE');
  }

  const url = `${baseUrl}/recipes/${slug}`;
  if (format === 'png') {
    return { data: await generateQRCodePng(url), contentType: 'image/png' };
  }
  return { data: await generateQRCodeSvg(url), contentType: 'image/svg+xml' };
}
```

Controller returns the appropriate content type and streams the result.

---

## Route Registration

Update `apps/api/src/routes/index.ts` to register all modules:

```typescript
import { Hono } from 'hono';
import health from './health.ts';
import auth from '../modules/auth/index.ts';
import user from '../modules/user/index.ts';
import recipe from '../modules/recipe/index.ts';
import equipment from '../modules/equipment/index.ts';
import bean from '../modules/bean/index.ts';
import vendor from '../modules/vendor/index.ts';
import taste from '../modules/taste/index.ts';
import photo from '../modules/photo/index.ts';
import comment from '../modules/comment/index.ts';
import follow from '../modules/follow/index.ts';
import badge from '../modules/badge/index.ts';
import setup from '../modules/setup/index.ts';
import preference from '../modules/preference/index.ts';
import search from '../modules/search/index.ts';
import qrcode from '../modules/qrcode/index.ts';

const routes = new Hono();

routes.route('/', health);
routes.route('/api/v1/auth', auth);
routes.route('/api/v1/users', user);
routes.route('/api/v1/recipes', recipe);
routes.route('/api/v1/equipment', equipment);
routes.route('/api/v1/beans', bean);
routes.route('/api/v1/vendors', vendor);
routes.route('/api/v1/taste-notes', taste);
routes.route('/api/v1/photos', photo);
routes.route('/api/v1/comments', comment);
routes.route('/api/v1/follow', follow);
routes.route('/api/v1/badges', badge);
routes.route('/api/v1/setups', setup);
routes.route('/api/v1/preferences', preference);
routes.route('/api/v1/search', search);
routes.route('/api/v1/qrcode', qrcode);

export default routes;
```