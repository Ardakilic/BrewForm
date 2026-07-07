// deno-lint-ignore-file no-explicit-any require-await

import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { eq } from 'drizzle-orm';
import { db } from '@brewform/db';
import { userPreferences, users } from '@brewform/db/schema';
import * as model from './model.ts';

/**
 * findByUserId — Find the preferences row for a user. Returns null if the user
 * has no preferences row yet.
 */
describe('findByUserId', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
  });

  afterEach(async () => {
    await db.delete(userPreferences).where(eq(userPreferences.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should return null when no preferences row exists', async () => {
    const result = await model.findByUserId(userId);
    expect(result).toBeNull();
  });

  it('should return the preferences row when it exists', async () => {
    await db.insert(userPreferences).values({
      userId,
      unitSystem: 'imperial',
      temperatureUnit: 'fahrenheit',
      theme: 'dark',
      locale: 'tr',
      timezone: 'Europe/Istanbul',
      dateFormat: 'DD_MM_YYYY',
    });
    const result = await model.findByUserId(userId);
    expect(result).not.toBeNull();
    expect(result!.userId).toBe(userId);
    expect(result!.unitSystem).toBe('imperial');
    expect(result!.temperatureUnit).toBe('fahrenheit');
    expect(result!.theme).toBe('dark');
    expect(result!.locale).toBe('tr');
    expect(result!.timezone).toBe('Europe/Istanbul');
    expect(result!.dateFormat).toBe('DD_MM_YYYY');
  });
});

/**
 * upsert — Insert or update preferences for a user. Uses onConflictDoUpdate on
 * the userId unique constraint, so calling upsert twice for the same user
 * updates the existing row rather than inserting a duplicate.
 */
describe('upsert', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
  });

  afterEach(async () => {
    await db.delete(userPreferences).where(eq(userPreferences.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should insert a new preferences row when none exists', async () => {
    const result = await model.upsert(userId, {
      unitSystem: 'imperial',
      temperatureUnit: 'fahrenheit',
      theme: 'dark',
    });
    expect(result).not.toBeNull();
    expect(result.userId).toBe(userId);
    expect(result.unitSystem).toBe('imperial');
    expect(result.temperatureUnit).toBe('fahrenheit');
    expect(result.theme).toBe('dark');
    const [row] = await db.select().from(userPreferences)
      .where(eq(userPreferences.userId, userId));
    expect(row).toBeDefined();
    expect(row.unitSystem).toBe('imperial');
  });

  it('should update an existing preferences row on conflict', async () => {
    await model.upsert(userId, { unitSystem: 'metric', theme: 'light' });
    const result = await model.upsert(userId, {
      unitSystem: 'imperial',
      temperatureUnit: 'fahrenheit',
      theme: 'dark',
    });
    expect(result).not.toBeNull();
    expect(result.userId).toBe(userId);
    expect(result.unitSystem).toBe('imperial');
    expect(result.temperatureUnit).toBe('fahrenheit');
    expect(result.theme).toBe('dark');
    // Only one row should exist for this user (no duplicate insert).
    const rows = await db.select().from(userPreferences)
      .where(eq(userPreferences.userId, userId));
    expect(rows.length).toBe(1);
    expect(rows[0].unitSystem).toBe('imperial');
  });

  it('should not mutate the userId field on update', async () => {
    await model.upsert(userId, { theme: 'light' });
    const result = await model.upsert(userId, { theme: 'dark' });
    expect(result).not.toBeNull();
    expect(result.userId).toBe(userId);
    const [row] = await db.select().from(userPreferences)
      .where(eq(userPreferences.userId, userId));
    expect(row.userId).toBe(userId);
  });
});
