/**
 * Truncate all database tables.
 *
 * Usage:
 *   deno run --allow-env --allow-net apps/api/scripts/flush-db.ts
 *   make flush-db
 */

import { client } from '@brewform/db';

const TABLE_NAMES = [
  'recipe_version_photo',
  'recipe_taste_note',
  'recipe_equipment',
  'recipe_additional_preparation',
  'user_recipe_favourite',
  'user_recipe_like',
  'user_recipe_rating',
  'user_follow',
  'user_badge',
  'comment',
  'report',
  'password_reset',
  'email_verification_token',
  'audit_log',
  'recipe_version',
  'setup',
  'recipe',
  'photo',
  'equipment',
  'bean',
  'vendor',
  'taste_note',
  'badge',
  'brew_method_equipment_rule',
  'user_preferences',
  'user',
];

console.log('Truncating all database tables...');
await client.unsafe(`TRUNCATE TABLE ${TABLE_NAMES.join(', ')} RESTART IDENTITY CASCADE`);
console.log(`Truncated ${TABLE_NAMES.length} tables successfully.`);

await client.end();
