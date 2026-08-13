/**
 * Tests that composite indexes are defined in the Drizzle schema.
 *
 * These tests validate the schema definition layer — they confirm that
 * the expected Drizzle `index(...)` calls exist with the correct names,
 * columns, and uniqueness. They do NOT verify that the indexes actually
 * exist in the running PostgreSQL database (that is the migration's
 * responsibility).
 *
 * Uses the public, stable `getTableConfig` function from
 * `drizzle-orm/pg-core` to introspect index configurations.
 *
 * Coverage:
 *  - All 17 new indexes across 11 tables: 16 composite indexes + 1
 *    single-column parity index on tasteNotes.deletedAt
 */

import { beforeAll, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { getTableConfig } from 'drizzle-orm/pg-core';
import type { IndexedColumn, PgTableWithColumns } from 'drizzle-orm/pg-core';
import {
  beans,
  brewLogs,
  coffeeVarieties,
  collectionItems,
  collections,
  comments,
  equipment,
  photos,
  recipes,
  recipeVersions,
  reports,
  setups,
  tasteNotes,
  userFollows,
} from './schema.ts';

/**
 * Extract index definitions from a Drizzle `pgTable` instance.
 *
 * Uses the public, stable {@link getTableConfig} function from
 * `drizzle-orm/pg-core`. The returned `Index` objects expose a `.config`
 * property with `name`, `columns`, and `unique` fields.
 *
 * @param table - A Drizzle `pgTable` instance (e.g., `recipes`, `comments`)
 * @returns Array of `{ name, columns, isUnique }` for each defined index
 */
// deno-lint-ignore no-explicit-any -- test any usage
function getTableIndexes(table: PgTableWithColumns<any>): {
  name: string;
  columns: (string | null)[];
  isUnique: boolean;
}[] {
  const { indexes } = getTableConfig(table);
  return indexes.map((idx) => ({
    name: idx.config.name ?? '',
    columns: idx.config.columns.map((col) => {
      // IndexedColumn has a `.name` property; SQL expressions don't
      if ('name' in col) return (col as IndexedColumn).name ?? null;
      return null; // raw SQL expression — column name not extractable
    }),
    isUnique: idx.config.unique ?? false,
  }));
}

/**
 * Extract unique-constraint definitions from a Drizzle `pgTable` instance.
 *
 * Drizzle stores `unique(...)` constraints in `getTableConfig().uniqueConstraints`
 * (separate from `indexes`). Each entry's `.config` exposes `name` and `columns`.
 *
 * @param table - A Drizzle `pgTable` instance
 * @returns Array of `{ name, columns }` for each defined unique constraint
 */
// deno-lint-ignore no-explicit-any -- test any usage
function getTableUniqueConstraints(table: PgTableWithColumns<any>): {
  name: string;
  columns: (string | null)[];
}[] {
  const { uniqueConstraints } = getTableConfig(table);
  return uniqueConstraints.map((uc) => ({
    name: uc.name ?? '',
    // Unique-constraint columns are concrete PgColumn instances (drizzle
    // `unique().on(...)` takes columns only — never SQL expressions like
    // index columns can), so `.name` is always present without a cast.
    columns: uc.columns.map((col) => col.name ?? null),
  }));
}

describe('Recipe table composite indexes', () => {
  let indexes: ReturnType<typeof getTableIndexes>;

  beforeAll(() => {
    indexes = getTableIndexes(recipes);
  });

  it('has recipe_author_visibility_idx on (authorId, visibility)', () => {
    const idx = indexes.find((i) => i.name === 'recipe_author_visibility_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['author_id', 'visibility']);
    expect(idx!.isUnique).toBe(false);
  });

  it('has recipe_visibility_created_idx on (visibility, createdAt)', () => {
    const idx = indexes.find((i) => i.name === 'recipe_visibility_created_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['visibility', 'created_at']);
    expect(idx!.isUnique).toBe(false);
  });

  it('has recipe_visibility_like_count_idx on (visibility, likeCount)', () => {
    const idx = indexes.find((i) => i.name === 'recipe_visibility_like_count_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['visibility', 'like_count']);
    expect(idx!.isUnique).toBe(false);
  });

  it('has recipe_visibility_featured_idx on (visibility, featured)', () => {
    const idx = indexes.find((i) => i.name === 'recipe_visibility_featured_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['visibility', 'featured']);
    expect(idx!.isUnique).toBe(false);
  });

  it('has recipe_created_at_id_idx on (createdAt, id)', () => {
    const idx = indexes.find((i) => i.name === 'recipe_created_at_id_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['created_at', 'id']);
    expect(idx!.isUnique).toBe(false);
  });
});

describe('Recipe versions table composite indexes', () => {
  let indexes: ReturnType<typeof getTableIndexes>;

  beforeAll(() => {
    indexes = getTableIndexes(recipeVersions);
  });

  it('has recipe_version_coffee_variety_idx on (coffeeVarietyId, recipeId)', () => {
    const idx = indexes.find((i) => i.name === 'recipe_version_coffee_variety_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['coffee_variety_id', 'recipe_id']);
    expect(idx!.isUnique).toBe(false);
  });
});

describe('Comments table composite indexes', () => {
  let indexes: ReturnType<typeof getTableIndexes>;

  beforeAll(() => {
    indexes = getTableIndexes(comments);
  });

  it('has comment_recipe_parent_created_idx on (recipeId, parentCommentId, createdAt)', () => {
    const idx = indexes.find((i) => i.name === 'comment_recipe_parent_created_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['recipe_id', 'parent_comment_id', 'created_at']);
    expect(idx!.isUnique).toBe(false);
  });

  it('has comment_parent_created_idx on (parentCommentId, createdAt)', () => {
    const idx = indexes.find((i) => i.name === 'comment_parent_created_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['parent_comment_id', 'created_at']);
    expect(idx!.isUnique).toBe(false);
  });
});

describe('User follows table composite indexes', () => {
  let indexes: ReturnType<typeof getTableIndexes>;

  beforeAll(() => {
    indexes = getTableIndexes(userFollows);
  });

  it('has user_follow_following_created_idx on (followingId, createdAt)', () => {
    const idx = indexes.find((i) => i.name === 'user_follow_following_created_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['following_id', 'created_at']);
    expect(idx!.isUnique).toBe(false);
  });

  it('has user_follow_follower_created_idx on (followerId, createdAt)', () => {
    const idx = indexes.find((i) => i.name === 'user_follow_follower_created_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['follower_id', 'created_at']);
    expect(idx!.isUnique).toBe(false);
  });
});

describe('Setups table composite indexes', () => {
  let indexes: ReturnType<typeof getTableIndexes>;

  beforeAll(() => {
    indexes = getTableIndexes(setups);
  });

  it('has setup_user_created_idx on (userId, createdAt)', () => {
    const idx = indexes.find((i) => i.name === 'setup_user_created_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['user_id', 'created_at']);
    expect(idx!.isUnique).toBe(false);
  });
});

describe('Beans table composite indexes', () => {
  let indexes: ReturnType<typeof getTableIndexes>;

  beforeAll(() => {
    indexes = getTableIndexes(beans);
  });

  it('has bean_user_created_idx on (userId, createdAt)', () => {
    const idx = indexes.find((i) => i.name === 'bean_user_created_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['user_id', 'created_at']);
    expect(idx!.isUnique).toBe(false);
  });
});

describe('Photos table composite indexes', () => {
  let indexes: ReturnType<typeof getTableIndexes>;

  beforeAll(() => {
    indexes = getTableIndexes(photos);
  });

  it('has photo_recipe_sort_order_idx on (recipeId, sortOrder)', () => {
    const idx = indexes.find((i) => i.name === 'photo_recipe_sort_order_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['recipe_id', 'sort_order']);
    expect(idx!.isUnique).toBe(false);
  });
});

describe('Taste notes table indexes', () => {
  let indexes: ReturnType<typeof getTableIndexes>;

  beforeAll(() => {
    indexes = getTableIndexes(tasteNotes);
  });

  it('has taste_note_deleted_at_idx on (deletedAt)', () => {
    const idx = indexes.find((i) => i.name === 'taste_note_deleted_at_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['deleted_at']);
    expect(idx!.isUnique).toBe(false);
  });

  it('has taste_note_parent_name_idx on (parentId, name)', () => {
    const idx = indexes.find((i) => i.name === 'taste_note_parent_name_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['parent_id', 'name']);
    expect(idx!.isUnique).toBe(false);
  });

  it('has taste_note_depth_name_idx on (depth, name)', () => {
    const idx = indexes.find((i) => i.name === 'taste_note_depth_name_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['depth', 'name']);
    expect(idx!.isUnique).toBe(false);
  });
});

describe('Reports table composite indexes', () => {
  let indexes: ReturnType<typeof getTableIndexes>;

  beforeAll(() => {
    indexes = getTableIndexes(reports);
  });

  it('has report_status_created_idx on (status, createdAt)', () => {
    const idx = indexes.find((i) => i.name === 'report_status_created_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['status', 'created_at']);
    expect(idx!.isUnique).toBe(false);
  });
});

describe('Equipment table composite indexes', () => {
  let indexes: ReturnType<typeof getTableIndexes>;

  beforeAll(() => {
    indexes = getTableIndexes(equipment);
  });

  it('has equipment_type_name_idx on (type, name)', () => {
    const idx = indexes.find((i) => i.name === 'equipment_type_name_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['type', 'name']);
    expect(idx!.isUnique).toBe(false);
  });
});

describe('Coffee varieties table composite indexes', () => {
  let indexes: ReturnType<typeof getTableIndexes>;

  beforeAll(() => {
    indexes = getTableIndexes(coffeeVarieties);
  });

  it('has coffee_variety_category_name_idx on (category, name)', () => {
    const idx = indexes.find((i) => i.name === 'coffee_variety_category_name_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['category', 'name']);
    expect(idx!.isUnique).toBe(false);
  });
});

describe('Collections table indexes', () => {
  let indexes: ReturnType<typeof getTableIndexes>;

  beforeAll(() => {
    indexes = getTableIndexes(collections);
  });

  it('has collection_user_id_idx on (userId)', () => {
    const idx = indexes.find((i) => i.name === 'collection_user_id_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['user_id']);
    expect(idx!.isUnique).toBe(false);
  });

  it('has collection_visibility_idx on (visibility)', () => {
    const idx = indexes.find((i) => i.name === 'collection_visibility_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['visibility']);
    expect(idx!.isUnique).toBe(false);
  });

  it('has collection_created_at_idx on (createdAt)', () => {
    const idx = indexes.find((i) => i.name === 'collection_created_at_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['created_at']);
    expect(idx!.isUnique).toBe(false);
  });

  it('has collection_deleted_at_idx on (deletedAt)', () => {
    const idx = indexes.find((i) => i.name === 'collection_deleted_at_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['deleted_at']);
    expect(idx!.isUnique).toBe(false);
  });
});

describe('Collection items table indexes', () => {
  let indexes: ReturnType<typeof getTableIndexes>;
  let uniques: ReturnType<typeof getTableUniqueConstraints>;

  beforeAll(() => {
    indexes = getTableIndexes(collectionItems);
    uniques = getTableUniqueConstraints(collectionItems);
  });

  it('has collection_item_collection_id_idx on (collectionId)', () => {
    const idx = indexes.find((i) => i.name === 'collection_item_collection_id_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['collection_id']);
    expect(idx!.isUnique).toBe(false);
  });

  it('has collection_item_recipe_id_idx on (recipeId)', () => {
    const idx = indexes.find((i) => i.name === 'collection_item_recipe_id_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['recipe_id']);
    expect(idx!.isUnique).toBe(false);
  });

  it('has collection_item_collection_id_recipe_id_unique on (collectionId, recipeId)', () => {
    const uc = uniques.find((u) => u.name === 'collection_item_collection_id_recipe_id_unique');
    expect(uc).toBeDefined();
    expect(uc!.columns).toEqual(['collection_id', 'recipe_id']);
  });
});

describe('Brew logs table indexes', () => {
  let indexes: ReturnType<typeof getTableIndexes>;

  beforeAll(() => {
    indexes = getTableIndexes(brewLogs);
  });

  it('has brew_log_user_brewed_idx on (userId, brewedAt)', () => {
    const idx = indexes.find((i) => i.name === 'brew_log_user_brewed_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['user_id', 'brewed_at']);
    expect(idx!.isUnique).toBe(false);
  });

  it('has brew_log_recipe_brewed_idx on (recipeId, brewedAt)', () => {
    const idx = indexes.find((i) => i.name === 'brew_log_recipe_brewed_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['recipe_id', 'brewed_at']);
    expect(idx!.isUnique).toBe(false);
  });

  it('has brew_log_deleted_at_idx on (deletedAt)', () => {
    const idx = indexes.find((i) => i.name === 'brew_log_deleted_at_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['deleted_at']);
    expect(idx!.isUnique).toBe(false);
  });
});
