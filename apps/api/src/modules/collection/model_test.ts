// deno-lint-ignore-file no-explicit-any require-await

/**
 * DB integration tests for the collection model layer.
 *
 * Each test creates its own users, collections, and recipes (cleaned up in
 * afterEach / afterAll) and exercises the model functions directly against
 * a PostgreSQL test database.
 */

import '../../test-setup.ts';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { db } from '@brewform/db';
import { collectionItems, collections, recipes, users } from '@brewform/db/schema';
import { eq, inArray } from 'drizzle-orm';
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
  // cascade-friendly: delete collection_items referencing their collections,
  // then collections, then recipes, then users
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
  { name: 'collection model — findById', sanitizeResources: false, sanitizeOps: false },
  () => {
    let user: typeof users.$inferSelect;
    let col: typeof collections.$inferSelect;
    const colIds: string[] = [];

    beforeEach(async () => {
      user = await createUser('col-findById');
      col = await createCollectionRow(user.id, 'My Col');
      colIds.push(col.id);
    });

    afterEach(async () => {
      await cleanupCollections(colIds);
      colIds.length = 0;
      await db.delete(users).where(eq(users.id, user.id));
    });

    it('returns the collection with user and items relations', async () => {
      const found = await model.findById(col.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(col.id);
      expect(found!.name).toBe('My Col');
      expect(found!.user).toBeDefined();
      expect(found!.user.username).toBe(user.username);
      expect(Array.isArray(found!.items)).toBe(true);
      expect(found!.items.length).toBe(0);
    });

    it('returns undefined when the collection does not exist', async () => {
      const found = await model.findById(crypto.randomUUID());
      expect(found).toBeUndefined();
    });

    it('excludes soft-deleted collections', async () => {
      await db.update(collections).set({ deletedAt: new Date() }).where(eq(collections.id, col.id));
      const found = await model.findById(col.id);
      expect(found).toBeUndefined();
    });
  },
);

describe(
  { name: 'collection model — findByUserId', sanitizeResources: false, sanitizeOps: false },
  () => {
    let user: typeof users.$inferSelect;
    let otherUser: typeof users.$inferSelect;
    const colIds: string[] = [];
    const recipeIds: string[] = [];

    beforeAll(async () => {
      user = await createUser('col-findByUserId');
      otherUser = await createUser('col-findByUserId-other');
      // user owns 3 collections (1 private, 2 public); other user owns 1
      const c1 = await createCollectionRow(user.id, 'Private One', 'private');
      const c2 = await createCollectionRow(user.id, 'Public One', 'public');
      const c3 = await createCollectionRow(user.id, 'Public Two', 'public');
      colIds.push(c1.id, c2.id, c3.id);
      const otherCol = await createCollectionRow(otherUser.id, "Other's", 'public');
      colIds.push(otherCol.id);

      // Add 2 recipes to c2, 1 to c1, 0 to c3
      const r1 = await createRecipe(user.id);
      const r2 = await createRecipe(user.id);
      const r3 = await createRecipe(user.id);
      recipeIds.push(r1.id, r2.id, r3.id);
      await db.insert(collectionItems).values({
        collectionId: c2.id,
        recipeId: r1.id,
        sortOrder: 0,
      });
      await db.insert(collectionItems).values({
        collectionId: c2.id,
        recipeId: r2.id,
        sortOrder: 1,
      });
      await db.insert(collectionItems).values({
        collectionId: c1.id,
        recipeId: r3.id,
        sortOrder: 0,
      });
    });

    afterAll(async () => {
      await cleanupCollections(colIds);
      await cleanupRecipes(recipeIds);
      await cleanupUsers([user.id, otherUser.id]);
    });

    it('returns paginated collections for the user with correct total', async () => {
      const result = await model.findByUserId(user.id, 1, 10);
      expect(result.total).toBe(3);
      expect(Array.isArray(result.collections)).toBe(true);
      expect(result.collections.length).toBe(3);
      // Each row should have recipeCount
      for (const c of result.collections) {
        expect(typeof (c as any).recipeCount).toBe('number');
      }
    });

    it('computes recipeCount per collection correctly', async () => {
      const result = await model.findByUserId(user.id, 1, 10);
      const byName = new Map(result.collections.map((c) => [(c as any).name, c as any]));
      expect(byName.get('Private One').recipeCount).toBe(1);
      expect(byName.get('Public One').recipeCount).toBe(2);
      expect(byName.get('Public Two').recipeCount).toBe(0);
    });

    it('respects the visibility filter', async () => {
      const result = await model.findByUserId(user.id, 1, 10, 'public');
      expect(result.total).toBe(2);
      for (const c of result.collections) {
        expect((c as any).visibility).toBe('public');
      }
    });

    it('paginates with perPage', async () => {
      const page1 = await model.findByUserId(user.id, 1, 2);
      expect(page1.collections.length).toBe(2);
      const page2 = await model.findByUserId(user.id, 2, 2);
      expect(page2.collections.length).toBe(1);
    });

    it('does not return collections owned by other users', async () => {
      const result = await model.findByUserId(user.id, 1, 10);
      for (const c of result.collections) {
        expect((c as any).userId).toBe(user.id);
      }
    });
  },
);

describe(
  { name: 'collection model — findPublicByUserId', sanitizeResources: false, sanitizeOps: false },
  () => {
    let user: typeof users.$inferSelect;
    const colIds: string[] = [];

    beforeAll(async () => {
      user = await createUser('col-findPublic');
      const c1 = await createCollectionRow(user.id, 'Private', 'private');
      const c2 = await createCollectionRow(user.id, 'Public A', 'public');
      const c3 = await createCollectionRow(user.id, 'Public B', 'public');
      const c4 = await createCollectionRow(user.id, 'Draft', 'draft');
      colIds.push(c1.id, c2.id, c3.id, c4.id);
    });

    afterAll(async () => {
      await cleanupCollections(colIds);
      await cleanupUsers([user.id]);
    });

    it('returns only public collections', async () => {
      const result = await model.findPublicByUserId(user.id, 1, 10);
      expect(result.total).toBe(2);
      for (const c of result.collections) {
        expect((c as any).visibility).toBe('public');
      }
    });
  },
);

describe(
  { name: 'collection model — create', sanitizeResources: false, sanitizeOps: false },
  () => {
    let user: typeof users.$inferSelect;
    const colIds: string[] = [];

    beforeEach(async () => {
      user = await createUser('col-create');
    });

    afterEach(async () => {
      await cleanupCollections(colIds);
      colIds.length = 0;
      await db.delete(users).where(eq(users.id, user.id));
    });

    it('inserts and returns the created row', async () => {
      const row = await model.create({
        userId: user.id,
        name: 'Created',
        visibility: 'public',
      });
      colIds.push(row.id);
      expect(row).toBeDefined();
      expect(row.id).toBeDefined();
      expect(row.name).toBe('Created');
      expect(row.visibility).toBe('public');
      expect(row.userId).toBe(user.id);
    });
  },
);

describe(
  { name: 'collection model — update', sanitizeResources: false, sanitizeOps: false },
  () => {
    let user: typeof users.$inferSelect;
    let col: typeof collections.$inferSelect;
    const colIds: string[] = [];

    beforeEach(async () => {
      user = await createUser('col-update');
      col = await createCollectionRow(user.id, 'Original');
      colIds.push(col.id);
    });

    afterEach(async () => {
      await cleanupCollections(colIds);
      colIds.length = 0;
      await db.delete(users).where(eq(users.id, user.id));
    });

    it('updates the row and returns it', async () => {
      const updated = await model.update(col.id, { name: 'Updated Name', visibility: 'public' });
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('Updated Name');
      expect(updated!.visibility).toBe('public');
      expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(col.updatedAt.getTime());
    });

    it('returns null when the collection does not exist (or is soft-deleted)', async () => {
      const updated = await model.update(crypto.randomUUID(), { name: 'Nope' });
      expect(updated).toBeNull();
    });
  },
);

describe(
  { name: 'collection model — softDelete', sanitizeResources: false, sanitizeOps: false },
  () => {
    let user: typeof users.$inferSelect;
    let col: typeof collections.$inferSelect;
    const colIds: string[] = [];

    beforeEach(async () => {
      user = await createUser('col-softDelete');
      col = await createCollectionRow(user.id, 'ToDelete');
      colIds.push(col.id);
    });

    afterEach(async () => {
      await cleanupCollections(colIds);
      colIds.length = 0;
      await db.delete(users).where(eq(users.id, user.id));
    });

    it('sets deletedAt and returns the row', async () => {
      const deleted = await model.softDelete(col.id);
      expect(deleted).not.toBeNull();
      expect(deleted!.deletedAt).toBeInstanceOf(Date);
    });

    it('excludes the row from findById after soft delete', async () => {
      await model.softDelete(col.id);
      const found = await model.findById(col.id);
      expect(found).toBeUndefined();
    });

    it('returns null when already deleted or not found', async () => {
      await model.softDelete(col.id);
      const second = await model.softDelete(col.id);
      expect(second).toBeNull();
    });
  },
);

describe(
  { name: 'collection model — addItem', sanitizeResources: false, sanitizeOps: false },
  () => {
    let user: typeof users.$inferSelect;
    let col: typeof collections.$inferSelect;
    let r1: typeof recipes.$inferSelect;
    let r2: typeof recipes.$inferSelect;
    const colIds: string[] = [];
    const recipeIds: string[] = [];

    beforeEach(async () => {
      user = await createUser('col-addItem');
      col = await createCollectionRow(user.id, 'AddItem Col');
      colIds.push(col.id);
      r1 = await createRecipe(user.id);
      r2 = await createRecipe(user.id);
      recipeIds.push(r1.id, r2.id);
    });

    afterEach(async () => {
      await cleanupCollections(colIds);
      await cleanupRecipes(recipeIds);
      colIds.length = 0;
      recipeIds.length = 0;
      await db.delete(users).where(eq(users.id, user.id));
    });

    it('appends with auto-incremented sortOrder when omitted', async () => {
      const item1 = await model.addItem(col.id, r1.id);
      expect(item1.sortOrder).toBe(0);
      const item2 = await model.addItem(col.id, r2.id);
      expect(item2.sortOrder).toBe(1);
    });

    it('uses the provided sortOrder when given', async () => {
      const item = await model.addItem(col.id, r1.id, 42);
      expect(item.sortOrder).toBe(42);
    });

    it('throws on duplicate (collectionId, recipeId) unique violation', async () => {
      await model.addItem(col.id, r1.id);
      await expect(model.addItem(col.id, r1.id)).rejects.toThrow();
    });
  },
);

describe(
  { name: 'collection model — removeItem', sanitizeResources: false, sanitizeOps: false },
  () => {
    let user: typeof users.$inferSelect;
    let col: typeof collections.$inferSelect;
    let r1: typeof recipes.$inferSelect;
    const colIds: string[] = [];
    const recipeIds: string[] = [];

    beforeEach(async () => {
      user = await createUser('col-removeItem');
      col = await createCollectionRow(user.id, 'RemoveItem Col');
      colIds.push(col.id);
      r1 = await createRecipe(user.id);
      recipeIds.push(r1.id);
      await db.insert(collectionItems).values({
        collectionId: col.id,
        recipeId: r1.id,
        sortOrder: 0,
      });
    });

    afterEach(async () => {
      await cleanupCollections(colIds);
      await cleanupRecipes(recipeIds);
      colIds.length = 0;
      recipeIds.length = 0;
      await db.delete(users).where(eq(users.id, user.id));
    });

    it('hard-deletes the row and returns it', async () => {
      const deleted = await model.removeItem(col.id, r1.id);
      expect(deleted).toBeDefined();
      expect(deleted!.recipeId).toBe(r1.id);
      // verify gone
      const items = await model.getItems(col.id);
      expect(items.length).toBe(0);
    });

    it('returns undefined when the row does not exist', async () => {
      const deleted = await model.removeItem(col.id, crypto.randomUUID());
      expect(deleted).toBeUndefined();
    });
  },
);

describe(
  { name: 'collection model — reorderItems', sanitizeResources: false, sanitizeOps: false },
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
      user = await createUser('col-reorder');
      col = await createCollectionRow(user.id, 'Reorder Col');
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

    it('assigns sortOrder = array index for each item', async () => {
      // reverse the order
      const reordered = [itemIds[2], itemIds[1], itemIds[0]];
      await model.reorderItems(col.id, reordered);
      const items = await model.getItems(col.id);
      expect(items.length).toBe(3);
      expect(items[0].id).toBe(itemIds[2]);
      expect(items[0].sortOrder).toBe(0);
      expect(items[1].id).toBe(itemIds[1]);
      expect(items[1].sortOrder).toBe(1);
      expect(items[2].id).toBe(itemIds[0]);
      expect(items[2].sortOrder).toBe(2);
    });
  },
);

describe(
  { name: 'collection model — getItems', sanitizeResources: false, sanitizeOps: false },
  () => {
    let user: typeof users.$inferSelect;
    let col: typeof collections.$inferSelect;
    let r1: typeof recipes.$inferSelect;
    let r2: typeof recipes.$inferSelect;
    const colIds: string[] = [];
    const recipeIds: string[] = [];

    beforeEach(async () => {
      user = await createUser('col-getItems');
      col = await createCollectionRow(user.id, 'GetItems Col');
      colIds.push(col.id);
      r1 = await createRecipe(user.id);
      r2 = await createRecipe(user.id);
      recipeIds.push(r1.id, r2.id);
      // Insert in reverse to verify ordering by sortOrder
      await db.insert(collectionItems).values({
        collectionId: col.id,
        recipeId: r2.id,
        sortOrder: 1,
      });
      await db.insert(collectionItems).values({
        collectionId: col.id,
        recipeId: r1.id,
        sortOrder: 0,
      });
    });

    afterEach(async () => {
      await cleanupCollections(colIds);
      await cleanupRecipes(recipeIds);
      colIds.length = 0;
      recipeIds.length = 0;
      await db.delete(users).where(eq(users.id, user.id));
    });

    it('returns items ordered by sortOrder', async () => {
      const items = await model.getItems(col.id);
      expect(items.length).toBe(2);
      expect(items[0].recipeId).toBe(r1.id);
      expect(items[1].recipeId).toBe(r2.id);
    });

    it('includes the nested recipe with author relation', async () => {
      const items = await model.getItems(col.id);
      expect(items[0].recipe).toBeDefined();
      expect(items[0].recipe!.id).toBe(r1.id);
      expect(items[0].recipe!.author).toBeDefined();
      expect(items[0].recipe!.author.id).toBe(user.id);
    });

    it('excludes soft-deleted recipes', async () => {
      await db.update(recipes).set({ deletedAt: new Date() }).where(eq(recipes.id, r1.id));
      const items = await model.getItems(col.id);
      expect(items.length).toBe(1);
      expect(items[0].recipeId).toBe(r2.id);
    });
  },
);

describe(
  {
    name: 'collection model — getCollectionsForRecipe',
    sanitizeResources: false,
    sanitizeOps: false,
  },
  () => {
    let user: typeof users.$inferSelect;
    let otherUser: typeof users.$inferSelect;
    let publicCol: typeof collections.$inferSelect;
    let privateCol: typeof collections.$inferSelect;
    let r1: typeof recipes.$inferSelect;
    const colIds: string[] = [];
    const recipeIds: string[] = [];

    beforeAll(async () => {
      user = await createUser('col-forRecipe');
      otherUser = await createUser('col-forRecipe-other');
      publicCol = await createCollectionRow(otherUser.id, 'Public', 'public');
      privateCol = await createCollectionRow(otherUser.id, 'Private', 'private');
      colIds.push(publicCol.id, privateCol.id);
      r1 = await createRecipe(user.id);
      recipeIds.push(r1.id);
      await db.insert(collectionItems).values({
        collectionId: publicCol.id,
        recipeId: r1.id,
        sortOrder: 0,
      });
      await db.insert(collectionItems).values({
        collectionId: privateCol.id,
        recipeId: r1.id,
        sortOrder: 0,
      });
    });

    afterAll(async () => {
      await cleanupCollections(colIds);
      await cleanupRecipes(recipeIds);
      await cleanupUsers([user.id, otherUser.id]);
    });

    it('returns only public collections containing the recipe', async () => {
      const rows = await model.getCollectionsForRecipe(r1.id);
      expect(rows.length).toBe(1);
      expect(rows[0].id).toBe(publicCol.id);
      expect(rows[0].visibility).toBe('public');
    });

    it('excludes soft-deleted collections', async () => {
      await db.update(collections).set({ deletedAt: new Date() }).where(
        eq(collections.id, publicCol.id),
      );
      const rows = await model.getCollectionsForRecipe(r1.id);
      expect(rows.length).toBe(0);
    });
  },
);
