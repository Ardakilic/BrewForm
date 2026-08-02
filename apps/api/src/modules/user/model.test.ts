import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { eq } from 'drizzle-orm';
import { db } from '@brewform/db';
import { userPreferences, users } from '@brewform/db/schema';
import * as model from './model.ts';

describe('User Model', { sanitizeOps: false, sanitizeResources: false }, () => {
  describe('findById', () => {
    describe('user with preferences', () => {
      let userId: string;

      beforeEach(async () => {
        userId = crypto.randomUUID();
        await db.insert(users).values({
          id: userId,
          email: `test-${userId}@example.com`,
          username: `testuser-${userId}`,
          passwordHash: 'hash',
        });
        await db.insert(userPreferences).values({
          userId: userId,
          unitSystem: 'imperial',
          temperatureUnit: 'fahrenheit',
          theme: 'dark',
          locale: 'tr',
          timezone: 'Europe/Istanbul',
          dateFormat: 'DD_MM_YYYY',
          notifyNewFollower: false,
          notifyRecipeLiked: false,
          notifyRecipeCommented: false,
          notifyFollowedUserPosted: false,
          notifyMentionedInComment: false,
        });
      });

      afterEach(async () => {
        await db.delete(userPreferences).where(eq(userPreferences.userId, userId));
        await db.delete(users).where(eq(users.id, userId));
      });

      it('should return user with preferences object', async () => {
        const result = await model.findById(userId);
        expect(result).not.toBeNull();
        expect(result!.id).toBe(userId);
        expect(result!.email).toBe(`test-${userId}@example.com`);
        expect(result!.username).toBe(`testuser-${userId}`);
        expect(result!.passwordHash).toBe('hash');
        expect(result!.preferences).not.toBeNull();
        expect(result!.preferences!.unitSystem).toBe('imperial');
        expect(result!.preferences!.temperatureUnit).toBe('fahrenheit');
        expect(result!.preferences!.theme).toBe('dark');
        expect(result!.preferences!.locale).toBe('tr');
        expect(result!.preferences!.timezone).toBe('Europe/Istanbul');
        expect(result!.preferences!.dateFormat).toBe('DD_MM_YYYY');
        expect(result!.preferences!.notifyNewFollower).toBe(false);
        expect(result!.preferences!.notifyRecipeLiked).toBe(false);
        expect(result!.preferences!.notifyRecipeCommented).toBe(false);
        expect(result!.preferences!.notifyFollowedUserPosted).toBe(false);
        expect(result!.preferences!.notifyMentionedInComment).toBe(false);
      });
    });

    describe('user without preferences row', () => {
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
        await db.delete(users).where(eq(users.id, userId));
      });

      it('should return user with preferences as null', async () => {
        const result = await model.findById(userId);
        expect(result).not.toBeNull();
        expect(result!.id).toBe(userId);
        expect(result!.email).toBe(`test-${userId}@example.com`);
        expect(result!.username).toBe(`testuser-${userId}`);
        expect(result!.preferences).toBeNull();
      });
    });

    describe('soft-deleted user', () => {
      let userId: string;

      beforeEach(async () => {
        userId = crypto.randomUUID();
        await db.insert(users).values({
          id: userId,
          email: `test-${userId}@example.com`,
          username: `testuser-${userId}`,
          passwordHash: 'hash',
          deletedAt: new Date(),
        });
      });

      afterEach(async () => {
        await db.delete(users).where(eq(users.id, userId));
      });

      it('should return null', async () => {
        const result = await model.findById(userId);
        expect(result).toBeNull();
      });
    });

    describe('non-existent user', () => {
      it('should return null', async () => {
        const result = await model.findById(crypto.randomUUID());
        expect(result).toBeNull();
      });
    });
  });
});
