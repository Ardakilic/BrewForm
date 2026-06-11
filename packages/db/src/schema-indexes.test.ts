// deno-lint-ignore-file no-explicit-any require-await

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
 *  - All 17 new composite indexes across 11 tables
 *  - The 1 new single-column parity index on tasteNotes.deletedAt
 */

import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { getTableConfig } from 'drizzle-orm/pg-core';
import type { IndexedColumn, PgTableWithColumns } from 'drizzle-orm/pg-core';
import {
  beans,
  coffeeVarieties,
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

describe('Recipe table composite indexes', () => {
  it('has recipe_author_visibility_idx on (authorId, visibility)', () => {
    const indexes = getTableIndexes(recipes);
    const idx = indexes.find((i) => i.name === 'recipe_author_visibility_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['author_id', 'visibility']);
    expect(idx!.isUnique).toBe(false);
  });

  it('has recipe_visibility_created_idx on (visibility, createdAt)', () => {
    const indexes = getTableIndexes(recipes);
    const idx = indexes.find((i) => i.name === 'recipe_visibility_created_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['visibility', 'created_at']);
    expect(idx!.isUnique).toBe(false);
  });

  it('has recipe_visibility_like_count_idx on (visibility, likeCount)', () => {
    const indexes = getTableIndexes(recipes);
    const idx = indexes.find((i) => i.name === 'recipe_visibility_like_count_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['visibility', 'like_count']);
    expect(idx!.isUnique).toBe(false);
  });
});

describe('Recipe versions table composite indexes', () => {
  it('has recipe_version_coffee_variety_idx on (coffeeVarietyId, recipeId)', () => {
    const indexes = getTableIndexes(recipeVersions);
    const idx = indexes.find((i) => i.name === 'recipe_version_coffee_variety_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['coffee_variety_id', 'recipe_id']);
    expect(idx!.isUnique).toBe(false);
  });
});

describe('Comments table composite indexes', () => {
  it('has comment_recipe_parent_created_idx on (recipeId, parentCommentId, createdAt)', () => {
    const indexes = getTableIndexes(comments);
    const idx = indexes.find((i) => i.name === 'comment_recipe_parent_created_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['recipe_id', 'parent_comment_id', 'created_at']);
    expect(idx!.isUnique).toBe(false);
  });

  it('has comment_parent_created_idx on (parentCommentId, createdAt)', () => {
    const indexes = getTableIndexes(comments);
    const idx = indexes.find((i) => i.name === 'comment_parent_created_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['parent_comment_id', 'created_at']);
    expect(idx!.isUnique).toBe(false);
  });
});

describe('User follows table composite indexes', () => {
  it('has user_follow_following_created_idx on (followingId, createdAt)', () => {
    const indexes = getTableIndexes(userFollows);
    const idx = indexes.find((i) => i.name === 'user_follow_following_created_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['following_id', 'created_at']);
    expect(idx!.isUnique).toBe(false);
  });

  it('has user_follow_follower_created_idx on (followerId, createdAt)', () => {
    const indexes = getTableIndexes(userFollows);
    const idx = indexes.find((i) => i.name === 'user_follow_follower_created_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['follower_id', 'created_at']);
    expect(idx!.isUnique).toBe(false);
  });
});

describe('Setups table composite indexes', () => {
  it('has setup_user_created_idx on (userId, createdAt)', () => {
    const indexes = getTableIndexes(setups);
    const idx = indexes.find((i) => i.name === 'setup_user_created_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['user_id', 'created_at']);
    expect(idx!.isUnique).toBe(false);
  });
});

describe('Beans table composite indexes', () => {
  it('has bean_user_created_idx on (userId, createdAt)', () => {
    const indexes = getTableIndexes(beans);
    const idx = indexes.find((i) => i.name === 'bean_user_created_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['user_id', 'created_at']);
    expect(idx!.isUnique).toBe(false);
  });
});

describe('Photos table composite indexes', () => {
  it('has photo_recipe_sort_order_idx on (recipeId, sortOrder)', () => {
    const indexes = getTableIndexes(photos);
    const idx = indexes.find((i) => i.name === 'photo_recipe_sort_order_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['recipe_id', 'sort_order']);
    expect(idx!.isUnique).toBe(false);
  });
});

describe('Taste notes table indexes', () => {
  it('has taste_note_deleted_at_idx on (deletedAt)', () => {
    const indexes = getTableIndexes(tasteNotes);
    const idx = indexes.find((i) => i.name === 'taste_note_deleted_at_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['deleted_at']);
    expect(idx!.isUnique).toBe(false);
  });

  it('has taste_note_parent_name_idx on (parentId, name)', () => {
    const indexes = getTableIndexes(tasteNotes);
    const idx = indexes.find((i) => i.name === 'taste_note_parent_name_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['parent_id', 'name']);
    expect(idx!.isUnique).toBe(false);
  });

  it('has taste_note_depth_name_idx on (depth, name)', () => {
    const indexes = getTableIndexes(tasteNotes);
    const idx = indexes.find((i) => i.name === 'taste_note_depth_name_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['depth', 'name']);
    expect(idx!.isUnique).toBe(false);
  });
});

describe('Reports table composite indexes', () => {
  it('has report_status_created_idx on (status, createdAt)', () => {
    const indexes = getTableIndexes(reports);
    const idx = indexes.find((i) => i.name === 'report_status_created_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['status', 'created_at']);
    expect(idx!.isUnique).toBe(false);
  });
});

describe('Equipment table composite indexes', () => {
  it('has equipment_type_name_idx on (type, name)', () => {
    const indexes = getTableIndexes(equipment);
    const idx = indexes.find((i) => i.name === 'equipment_type_name_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['type', 'name']);
    expect(idx!.isUnique).toBe(false);
  });
});

describe('Coffee varieties table composite indexes', () => {
  it('has coffee_variety_category_name_idx on (category, name)', () => {
    const indexes = getTableIndexes(coffeeVarieties);
    const idx = indexes.find((i) => i.name === 'coffee_variety_category_name_idx');
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['category', 'name']);
    expect(idx!.isUnique).toBe(false);
  });
});
