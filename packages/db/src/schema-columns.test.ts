// deno-lint-ignore-file no-explicit-any require-await

/**
 * Schema column-existence tests for join-table audit timestamps.
 *
 * Locks the presence and properties of the `createdAt` column on the three
 * recipe join tables added by D43 (`wave-4-independent-fillers`). Uses the
 * public, stable `getTableConfig` function from `drizzle-orm/pg-core` to
 * introspect column definitions — the same pattern as `schema-indexes.test.ts`.
 *
 * Coverage:
 *  - `recipeTasteNotes` (`recipe_taste_note`) has `createdAt` notNull + default
 *  - `recipeEquipment` (`recipe_equipment`) has `createdAt` notNull + default
 *  - `recipeVersionPhotos` (`recipe_version_photo`) has `createdAt` notNull + default
 *
 * The pattern mirrors `userRecipeLikes.createdAt` (the established house style
 * for join-table audit columns added by D23).
 */

import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { getTableConfig } from 'drizzle-orm/pg-core';
import type { PgTableWithColumns } from 'drizzle-orm/pg-core';
import {
  collectionItems,
  recipeEquipment,
  recipeTasteNotes,
  recipeVersionPhotos,
} from './schema.ts';

/**
 * Look up a column config from a Drizzle `pgTable` instance.
 *
 * Uses {@link getTableConfig} to introspect column definitions. Returns the
 * column config object or `undefined` when the column is not declared.
 *
 * @param table - A Drizzle `pgTable` instance (e.g., `recipeTasteNotes`)
 * @param columnName - The Drizzle property name (NOT the SQL column name)
 * @returns The column config object, or `undefined` when missing.
 */
function getColumnConfig(
  table: PgTableWithColumns<any>,
  columnName: string,
) {
  const { columns } = getTableConfig(table);
  return columns.find((col) => col.name === columnName);
}

describe('recipeTasteNotes createdAt audit column', () => {
  it('has a createdAt column', () => {
    const column = getColumnConfig(recipeTasteNotes, 'created_at');
    expect(column).toBeDefined();
  });

  it('createdAt is notNull', () => {
    const column = getColumnConfig(recipeTasteNotes, 'created_at');
    expect(column).toBeDefined();
    expect(column!.notNull).toBe(true);
  });

  it('createdAt has a default expression (now())', () => {
    const column = getColumnConfig(recipeTasteNotes, 'created_at');
    expect(column).toBeDefined();
    expect(column!.default).toBeDefined();
  });
});

describe('recipeEquipment createdAt audit column', () => {
  it('has a createdAt column', () => {
    const column = getColumnConfig(recipeEquipment, 'created_at');
    expect(column).toBeDefined();
  });

  it('createdAt is notNull', () => {
    const column = getColumnConfig(recipeEquipment, 'created_at');
    expect(column).toBeDefined();
    expect(column!.notNull).toBe(true);
  });

  it('createdAt has a default expression (now())', () => {
    const column = getColumnConfig(recipeEquipment, 'created_at');
    expect(column).toBeDefined();
    expect(column!.default).toBeDefined();
  });
});

describe('recipeVersionPhotos createdAt audit column', () => {
  it('has a createdAt column', () => {
    const column = getColumnConfig(recipeVersionPhotos, 'created_at');
    expect(column).toBeDefined();
  });

  it('createdAt is notNull', () => {
    const column = getColumnConfig(recipeVersionPhotos, 'created_at');
    expect(column).toBeDefined();
    expect(column!.notNull).toBe(true);
  });

  it('createdAt has a default expression (now())', () => {
    const column = getColumnConfig(recipeVersionPhotos, 'created_at');
    expect(column).toBeDefined();
    expect(column!.default).toBeDefined();
  });
});

describe('collectionItems createdAt audit column', () => {
  it('has a createdAt column', () => {
    const column = getColumnConfig(collectionItems, 'created_at');
    expect(column).toBeDefined();
  });

  it('createdAt is notNull', () => {
    const column = getColumnConfig(collectionItems, 'created_at');
    expect(column).toBeDefined();
    expect(column!.notNull).toBe(true);
  });

  it('createdAt has a default expression (now())', () => {
    const column = getColumnConfig(collectionItems, 'created_at');
    expect(column).toBeDefined();
    expect(column!.default).toBeDefined();
  });
});
