// deno-lint-ignore-file no-explicit-any require-await

/**
 * DB integration tests for the collection service layer.
 *
 * Verifies permission checks, visibility logic, and error mapping by
 * exercising the service functions against real DB rows.
 */

import '../../test-setup.ts';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { db } from '@brewform/db';
import { collectionItems, collections, recipes, users } from '@brewform/db/schema';
import { eq, inArray } from 'drizzle-orm';
import * as service from './service.ts';
import * as model from './model.ts';

async function createUser(prefix: string) {
  const id = crypto.randomUUID();
  const [user] = await db.insert(users).values({
    id,
    email: `${prefix}-${id}@example.com`,
    username: `${prefix}-${id.slice(0, 8)}`,
    passwordHash: 'hash',
  }).returning();
  return user;
}

async function createRecipe(authorId: string, visibility = 'public') {
  const id = crypto.randomUUID();
  const [recipe] = await db.insert(recipes).values({
    id,
    slug: `slug-${id.slice(0, 8)}`,
    title: `Recipe ${id.slice(0, 4)}`,
    authorId,
    visibility,
    createdAt: new Date(),
  }).returning();
  return recipe;
}

async function createCollectionRow(
  userId: string,
  name: string,
  visibility: 'private' | 'public' | 'draft' | 'unlisted' = 'private',
) {
  const id = crypto.randomUUID();
  const [col] = await db.insert(collections).values({
    id,
    userId,
    name,
    visibility,
  }).returning();
  return col;
}

async function cleanupCollections(collectionIds: string[]) {
  if (collectionIds.length === 0) return;
  await db.delete(collectionItems).where(inArray(collectionItems.collectionId, collectionIds));
  await db.delete(collections).where(inArray(collections.id, collectionIds));
}

async function cleanupRecipes(recipeIds: string[]) {
  if (recipeIds.length === 0) return;
  await db.delete(collectionItems).where(inArray(collectionItems.recipeId, recipeIds));
  await db.delete(recipes).where(inArray(recipes.id, recipeIds));
}

async function cleanupUsers(userIds: string[]) {
  if (userIds.length === 0) return;
  const userCollIds = await db.select({ id: collections.id }).from(collections).where(
    inArray(collections.userId, userIds),
  );
  if (userCollIds.length) {
    await db.delete(collectionItems).where(
      inArray(collectionItems.collectionId, userCollIds.map((r) => r.id)),
    );
    await db.delete(collections).where(inArray(collections.id, userCollIds.map((r) => r.id)));
  }
  await db.delete(recipes).where(inArray(recipes.authorId, userIds));
  await db.delete(users).where(inArray(users.id, userIds));
}

describe(
  { name: 'collection service — createCollection', sanitizeResources: false, sanitizeOps: false },
  () => {
    let user: typeof users.$inferSelect;
    const colIds: string[] = [];

    beforeEach(async () => {
      user = await createUser('svc-create');
    });

    afterEach(async () => {
      await cleanupCollections(colIds);
      colIds.length = 0;
      await db.delete(users).where(eq(users.id, user.id));
    });

    it('returns the rich shape with author, items, and recipeCount', async () => {
      const result = await service.createCollection(user.id, {
        name: 'My V60s',
        description: 'Best pours',
        visibility: 'public',
      });
      colIds.push(result!.id);
      expect(result).toBeDefined();
      expect(result!.id).toBeDefined();
      expect(result!.name).toBe('My V60s');
      expect(result!.description).toBe('Best pours');
      expect(result!.visibility).toBe('public');
      expect(result!.userId).toBe(user.id);
      expect(result!.author).toBeDefined();
      expect(result!.author.username).toBe(user.username);
      expect(Array.isArray(result!.items)).toBe(true);
      expect(result!.items.length).toBe(0);
      expect(result!.recipeCount).toBe(0);
    });

    it('defaults visibility to private when omitted', async () => {
      const result = await service.createCollection(user.id, { name: 'Default Vis' });
      colIds.push(result!.id);
      expect(result!.visibility).toBe('private');
    });
  },
);

describe(
  { name: 'collection service — updateCollection', sanitizeResources: false, sanitizeOps: false },
  () => {
    let userA: typeof users.$inferSelect;
    let userB: typeof users.$inferSelect;
    let colA: typeof collections.$inferSelect;
    const colIds: string[] = [];

    beforeAll(async () => {
      userA = await createUser('svc-update-a');
      userB = await createUser('svc-update-b');
      colA = await createCollectionRow(userA.id, 'Original', 'private');
      colIds.push(colA.id);
    });

    afterAll(async () => {
      await cleanupCollections(colIds);
      await cleanupUsers([userA.id, userB.id]);
    });

    it('owner succeeds and returns the updated rich shape', async () => {
      const result = await service.updateCollection(userA.id, colA.id, {
        name: 'Renamed',
        visibility: 'public',
      });
      expect(result).toBeDefined();
      expect(result!.name).toBe('Renamed');
      expect(result!.visibility).toBe('public');
      expect(result!.userId).toBe(userA.id);
    });

    it('non-owner throws FORBIDDEN', async () => {
      await expect(
        service.updateCollection(userB.id, colA.id, { name: 'hacked' }),
      ).rejects.toThrow('FORBIDDEN');
    });

    it('not-found throws COLLECTION_NOT_FOUND', async () => {
      await expect(
        service.updateCollection(userA.id, crypto.randomUUID(), { name: 'nope' }),
      ).rejects.toThrow('COLLECTION_NOT_FOUND');
    });
  },
);

describe(
  { name: 'collection service — getCollection', sanitizeResources: false, sanitizeOps: false },
  () => {
    let userA: typeof users.$inferSelect;
    let userB: typeof users.$inferSelect;
    let publicCol: typeof collections.$inferSelect;
    let privateCol: typeof collections.$inferSelect;
    const colIds: string[] = [];

    beforeAll(async () => {
      userA = await createUser('svc-get-a');
      userB = await createUser('svc-get-b');
      publicCol = await createCollectionRow(userA.id, 'Public', 'public');
      privateCol = await createCollectionRow(userA.id, 'Private', 'private');
      colIds.push(publicCol.id, privateCol.id);
    });

    afterAll(async () => {
      await cleanupCollections(colIds);
      await cleanupUsers([userA.id, userB.id]);
    });

    it('public collection visible to anyone (including null userId)', async () => {
      const result = await service.getCollection(null, publicCol.id);
      expect(result).toBeDefined();
      expect(result!.id).toBe(publicCol.id);
      expect(result!.visibility).toBe('public');
    });

    it('public collection visible to a different user', async () => {
      const result = await service.getCollection(userB.id, publicCol.id);
      expect(result).toBeDefined();
      expect(result!.id).toBe(publicCol.id);
    });

    it('private collection visible to the owner', async () => {
      const result = await service.getCollection(userA.id, privateCol.id);
      expect(result).toBeDefined();
      expect(result!.id).toBe(privateCol.id);
    });

    it('private collection throws FORBIDDEN for non-owner', async () => {
      await expect(service.getCollection(userB.id, privateCol.id)).rejects.toThrow('FORBIDDEN');
    });

    it('private collection throws FORBIDDEN for unauthenticated user', async () => {
      await expect(service.getCollection(null, privateCol.id)).rejects.toThrow('FORBIDDEN');
    });

    it('not-found throws COLLECTION_NOT_FOUND', async () => {
      await expect(service.getCollection(userA.id, crypto.randomUUID())).rejects.toThrow(
        'COLLECTION_NOT_FOUND',
      );
    });
  },
);

describe(
  {
    name: 'collection service — addRecipeToCollection',
    sanitizeResources: false,
    sanitizeOps: false,
  },
  () => {
    let userA: typeof users.$inferSelect;
    let userB: typeof users.$inferSelect;
    let colA: typeof collections.$inferSelect;
    let publicRecipe: typeof recipes.$inferSelect;
    let privateRecipe: typeof recipes.$inferSelect;
    const colIds: string[] = [];
    const recipeIds: string[] = [];

    beforeAll(async () => {
      userA = await createUser('svc-add-a');
      userB = await createUser('svc-add-b');
      colA = await createCollectionRow(userA.id, 'Col', 'public');
      colIds.push(colA.id);
      publicRecipe = await createRecipe(userB.id, 'public');
      privateRecipe = await createRecipe(userB.id, 'private');
      recipeIds.push(publicRecipe.id, privateRecipe.id);
    });

    afterAll(async () => {
      await cleanupCollections(colIds);
      await cleanupRecipes(recipeIds);
      await cleanupUsers([userA.id, userB.id]);
    });

    it('public recipe by non-owner succeeds', async () => {
      await service.addRecipeToCollection(userA.id, colA.id, publicRecipe.id);
      const items = await model.getItems(colA.id);
      expect(items.some((i) => i.recipeId === publicRecipe.id)).toBe(true);
    });

    it('private recipe by non-owner throws FORBIDDEN', async () => {
      await expect(
        service.addRecipeToCollection(userA.id, colA.id, privateRecipe.id),
      ).rejects.toThrow('FORBIDDEN');
    });

    it('private recipe by its own author succeeds (owner === recipe.authorId)', async () => {
      const ownCol = await createCollectionRow(userB.id, 'OwnCol', 'public');
      colIds.push(ownCol.id);
      await service.addRecipeToCollection(userB.id, ownCol.id, privateRecipe.id);
      const items = await model.getItems(ownCol.id);
      expect(items.some((i) => i.recipeId === privateRecipe.id)).toBe(true);
    });

    it('not-found recipe throws RECIPE_NOT_FOUND', async () => {
      await expect(
        service.addRecipeToCollection(userA.id, colA.id, crypto.randomUUID()),
      ).rejects.toThrow('RECIPE_NOT_FOUND');
    });

    it('duplicate (collectionId, recipeId) throws ALREADY_IN_COLLECTION', async () => {
      // Use a fresh recipe so the first add is guaranteed to succeed
      const dupRecipe = await createRecipe(userB.id, 'public');
      recipeIds.push(dupRecipe.id);
      await service.addRecipeToCollection(userA.id, colA.id, dupRecipe.id);
      await expect(
        service.addRecipeToCollection(userA.id, colA.id, dupRecipe.id),
      ).rejects.toThrow('ALREADY_IN_COLLECTION');
    });

    it('non-owner of collection throws FORBIDDEN', async () => {
      await expect(
        service.addRecipeToCollection(userB.id, colA.id, publicRecipe.id),
      ).rejects.toThrow('FORBIDDEN');
    });

    it('not-found collection throws COLLECTION_NOT_FOUND', async () => {
      await expect(
        service.addRecipeToCollection(userA.id, crypto.randomUUID(), publicRecipe.id),
      ).rejects.toThrow('COLLECTION_NOT_FOUND');
    });
  },
);

describe(
  { name: 'collection service — reorderCollection', sanitizeResources: false, sanitizeOps: false },
  () => {
    let user: typeof users.$inferSelect;
    let col: typeof collections.$inferSelect;
    let r1: typeof recipes.$inferSelect;
    let r2: typeof recipes.$inferSelect;
    let r3: typeof recipes.$inferSelect;
    let itemIds: string[];
    const colIds: string[] = [];
    const recipeIds: string[] = [];

    beforeEach(async () => {
      user = await createUser('svc-reorder');
      col = await createCollectionRow(user.id, 'Reorder', 'public');
      colIds.push(col.id);
      r1 = await createRecipe(user.id);
      r2 = await createRecipe(user.id);
      r3 = await createRecipe(user.id);
      recipeIds.push(r1.id, r2.id, r3.id);
      const i1 = await model.addItem(col.id, r1.id, 0);
      const i2 = await model.addItem(col.id, r2.id, 1);
      const i3 = await model.addItem(col.id, r3.id, 2);
      itemIds = [i1.id, i2.id, i3.id];
    });

    afterEach(async () => {
      await cleanupCollections(colIds);
      await cleanupRecipes(recipeIds);
      colIds.length = 0;
      recipeIds.length = 0;
      await db.delete(users).where(eq(users.id, user.id));
    });

    it('correct full order succeeds and assigns sortOrder = index', async () => {
      const reordered = [itemIds[2], itemIds[1], itemIds[0]];
      await service.reorderCollection(user.id, col.id, reordered);
      const items = await model.getItems(col.id);
      expect(items[0].id).toBe(itemIds[2]);
      expect(items[0].sortOrder).toBe(0);
      expect(items[1].id).toBe(itemIds[1]);
      expect(items[1].sortOrder).toBe(1);
      expect(items[2].id).toBe(itemIds[0]);
      expect(items[2].sortOrder).toBe(2);
    });

    it('wrong count throws REORDER_MISMATCH', async () => {
      await expect(
        service.reorderCollection(user.id, col.id, [itemIds[0], itemIds[1]]),
      ).rejects.toThrow('REORDER_MISMATCH');
    });

    it('foreign item ID throws REORDER_MISMATCH', async () => {
      await expect(
        service.reorderCollection(user.id, col.id, [itemIds[0], itemIds[1], crypto.randomUUID()]),
      ).rejects.toThrow('REORDER_MISMATCH');
    });

    it('non-owner throws FORBIDDEN', async () => {
      const other = await createUser('svc-reorder-other');
      try {
        await expect(
          service.reorderCollection(other.id, col.id, [itemIds[0], itemIds[1], itemIds[2]]),
        ).rejects.toThrow('FORBIDDEN');
      } finally {
        await db.delete(users).where(eq(users.id, other.id));
      }
    });

    it('not-found throws COLLECTION_NOT_FOUND', async () => {
      await expect(
        service.reorderCollection(user.id, crypto.randomUUID(), itemIds),
      ).rejects.toThrow('COLLECTION_NOT_FOUND');
    });
  },
);

describe(
  { name: 'collection service — deleteCollection', sanitizeResources: false, sanitizeOps: false },
  () => {
    let userA: typeof users.$inferSelect;
    let userB: typeof users.$inferSelect;
    let col: typeof collections.$inferSelect;
    const colIds: string[] = [];

    beforeAll(async () => {
      userA = await createUser('svc-del-a');
      userB = await createUser('svc-del-b');
      col = await createCollectionRow(userA.id, 'ToDelete', 'private');
      colIds.push(col.id);
    });

    afterAll(async () => {
      await cleanupCollections(colIds);
      await cleanupUsers([userA.id, userB.id]);
    });

    it('non-owner throws FORBIDDEN', async () => {
      await expect(service.deleteCollection(userB.id, col.id)).rejects.toThrow('FORBIDDEN');
    });

    it('not-found throws COLLECTION_NOT_FOUND', async () => {
      await expect(service.deleteCollection(userA.id, crypto.randomUUID())).rejects.toThrow(
        'COLLECTION_NOT_FOUND',
      );
    });

    it('owner soft-deletes successfully', async () => {
      await service.deleteCollection(userA.id, col.id);
      const found = await model.findById(col.id);
      expect(found).toBeUndefined();
    });
  },
);

describe(
  {
    name: 'collection service — removeRecipeFromCollection',
    sanitizeResources: false,
    sanitizeOps: false,
  },
  () => {
    let userA: typeof users.$inferSelect;
    let userB: typeof users.$inferSelect;
    let col: typeof collections.$inferSelect;
    let r1: typeof recipes.$inferSelect;
    const colIds: string[] = [];
    const recipeIds: string[] = [];

    beforeAll(async () => {
      userA = await createUser('svc-rem-a');
      userB = await createUser('svc-rem-b');
      col = await createCollectionRow(userA.id, 'RemoveCol', 'public');
      colIds.push(col.id);
      r1 = await createRecipe(userB.id, 'public');
      recipeIds.push(r1.id);
      await db.insert(collectionItems).values({
        collectionId: col.id,
        recipeId: r1.id,
        sortOrder: 0,
      });
    });

    afterAll(async () => {
      await cleanupCollections(colIds);
      await cleanupRecipes(recipeIds);
      await cleanupUsers([userA.id, userB.id]);
    });

    it('non-owner throws FORBIDDEN', async () => {
      await expect(
        service.removeRecipeFromCollection(userB.id, col.id, r1.id),
      ).rejects.toThrow('FORBIDDEN');
    });

    it('owner removes the recipe', async () => {
      await service.removeRecipeFromCollection(userA.id, col.id, r1.id);
      const items = await model.getItems(col.id);
      expect(items.length).toBe(0);
    });
  },
);

describe(
  { name: 'collection service — listMyCollections', sanitizeResources: false, sanitizeOps: false },
  () => {
    let user: typeof users.$inferSelect;
    const colIds: string[] = [];

    beforeAll(async () => {
      user = await createUser('svc-list');
      const c1 = await createCollectionRow(user.id, 'C1', 'private');
      const c2 = await createCollectionRow(user.id, 'C2', 'public');
      colIds.push(c1.id, c2.id);
    });

    afterAll(async () => {
      await cleanupCollections(colIds);
      await cleanupUsers([user.id]);
    });

    it("returns all of the user's collections with total", async () => {
      const result = await service.listMyCollections(user.id, 1, 10);
      expect(result.total).toBe(2);
      expect(result.collections.length).toBe(2);
    });

    it('respects the visibility filter', async () => {
      const result = await service.listMyCollections(user.id, 1, 10, 'public');
      expect(result.total).toBe(1);
      for (const c of result.collections) {
        expect((c as any).visibility).toBe('public');
      }
    });
  },
);

describe(
  {
    name: 'collection service — listPublicCollections',
    sanitizeResources: false,
    sanitizeOps: false,
  },
  () => {
    let user: typeof users.$inferSelect;
    const colIds: string[] = [];

    beforeAll(async () => {
      user = await createUser('svc-listpub');
      const c1 = await createCollectionRow(user.id, 'Priv', 'private');
      const c2 = await createCollectionRow(user.id, 'Pub', 'public');
      colIds.push(c1.id, c2.id);
    });

    afterAll(async () => {
      await cleanupCollections(colIds);
      await cleanupUsers([user.id]);
    });

    it('returns only public collections', async () => {
      const result = await service.listPublicCollections(user.id, 1, 10);
      expect(result.total).toBe(1);
      expect((result.collections[0] as any).name).toBe('Pub');
    });
  },
);
