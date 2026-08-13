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
 *  - `notifications` (`notification`) columns added by F04 (@mention notifications)
 *  - `userPreferences` gains `mentionedInComment` (F04) notNull + default
 *
 * The pattern mirrors `userRecipeLikes.createdAt` (the established house style
 * for join-table audit columns added by D23).
 */

import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { getTableConfig } from 'drizzle-orm/pg-core';
import type { PgTableWithColumns } from 'drizzle-orm/pg-core';
import {
  brewLogs,
  collectionItems,
  notifications,
  recipeEquipment,
  recipeTasteNotes,
  recipeVersionPhotos,
  userPreferences,
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
  // deno-lint-ignore no-explicit-any -- test any usage
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

describe('notifications table columns (F04)', () => {
  it('has an id primary-key column', () => {
    const column = getColumnConfig(notifications, 'id');
    expect(column).toBeDefined();
    expect(column!.primary).toBe(true);
  });

  it('has a notNull userId (recipient) column', () => {
    const column = getColumnConfig(notifications, 'user_id');
    expect(column).toBeDefined();
    expect(column!.notNull).toBe(true);
  });

  it('has a nullable actorId column', () => {
    const column = getColumnConfig(notifications, 'actor_id');
    expect(column).toBeDefined();
    expect(column!.notNull).toBe(false);
  });

  it('has a notNull type column', () => {
    const column = getColumnConfig(notifications, 'type');
    expect(column).toBeDefined();
    expect(column!.notNull).toBe(true);
  });

  it('has a nullable referenceId column', () => {
    const column = getColumnConfig(notifications, 'reference_id');
    expect(column).toBeDefined();
    expect(column!.notNull).toBe(false);
  });

  it('has a nullable referenceType column', () => {
    const column = getColumnConfig(notifications, 'reference_type');
    expect(column).toBeDefined();
    expect(column!.notNull).toBe(false);
  });

  it('has a nullable metadata column', () => {
    const column = getColumnConfig(notifications, 'metadata');
    expect(column).toBeDefined();
    expect(column!.notNull).toBe(false);
  });

  it('has a nullable readAt column', () => {
    const column = getColumnConfig(notifications, 'read_at');
    expect(column).toBeDefined();
    expect(column!.notNull).toBe(false);
  });

  it('has a notNull createdAt column with a default expression (now())', () => {
    const column = getColumnConfig(notifications, 'created_at');
    expect(column).toBeDefined();
    expect(column!.notNull).toBe(true);
    expect(column!.default).toBeDefined();
  });

  it('has a nullable deletedAt (soft-delete) column', () => {
    const column = getColumnConfig(notifications, 'deleted_at');
    expect(column).toBeDefined();
    expect(column!.notNull).toBe(false);
  });
});

describe('brewLogs table columns (F02)', () => {
  it('has a notNull brewedAt column with a default expression (now())', () => {
    const column = getColumnConfig(brewLogs, 'brewed_at');
    expect(column).toBeDefined();
    expect(column!.notNull).toBe(true);
    expect(column!.default).toBeDefined();
  });

  it('has a nullable yieldActual column', () => {
    const column = getColumnConfig(brewLogs, 'yield_actual');
    expect(column).toBeDefined();
    expect(column!.notNull).toBe(false);
  });

  it('has a nullable doseActual column', () => {
    const column = getColumnConfig(brewLogs, 'dose_actual');
    expect(column).toBeDefined();
    expect(column!.notNull).toBe(false);
  });

  it('has a nullable notes column', () => {
    const column = getColumnConfig(brewLogs, 'notes');
    expect(column).toBeDefined();
    expect(column!.notNull).toBe(false);
  });

  it('has a nullable personalRating column', () => {
    const column = getColumnConfig(brewLogs, 'personal_rating');
    expect(column).toBeDefined();
    expect(column!.notNull).toBe(false);
  });

  it('has a notNull createdAt column with a default expression (now())', () => {
    const column = getColumnConfig(brewLogs, 'created_at');
    expect(column).toBeDefined();
    expect(column!.notNull).toBe(true);
    expect(column!.default).toBeDefined();
  });

  it('has a notNull updatedAt column with a default expression (now())', () => {
    const column = getColumnConfig(brewLogs, 'updated_at');
    expect(column).toBeDefined();
    expect(column!.notNull).toBe(true);
    expect(column!.default).toBeDefined();
  });

  it('has a nullable deletedAt (soft-delete) column', () => {
    const column = getColumnConfig(brewLogs, 'deleted_at');
    expect(column).toBeDefined();
    expect(column!.notNull).toBe(false);
  });
});

describe('userPreferences notifyMentionedInComment column (F04)', () => {
  it('has a notifyMentionedInComment column', () => {
    const column = getColumnConfig(userPreferences, 'notify_mentioned_in_comment');
    expect(column).toBeDefined();
  });

  it('notifyMentionedInComment is notNull', () => {
    const column = getColumnConfig(userPreferences, 'notify_mentioned_in_comment');
    expect(column).toBeDefined();
    expect(column!.notNull).toBe(true);
  });

  it('notifyMentionedInComment has a default expression', () => {
    const column = getColumnConfig(userPreferences, 'notify_mentioned_in_comment');
    expect(column).toBeDefined();
    expect(column!.default).toBeDefined();
  });
});
