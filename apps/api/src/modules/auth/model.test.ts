/**
 * Integration tests for the auth data-access layer (`model.ts`).
 *
 * Exercises the real model functions against the PostgreSQL test database:
 * user lookups (by email / username / id, with soft-delete filtering),
 * password hashing + verification, password-reset persistence, and the
 * SHA-256 hashed email-verification-token lifecycle.
 *
 * Follows the established model-test pattern: test-setup first import,
 * inline `crypto.randomUUID()` fixtures, hard-delete teardown, and
 * `{ sanitizeOps: false, sanitizeResources: false }`.
 */

import '../../test-setup.ts';
import { afterEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { db } from '@brewform/db';
import {
  emailVerificationTokens,
  passwordResets,
  userPreferences,
  users,
} from '@brewform/db/schema';
import { eq, inArray } from 'drizzle-orm';
import * as model from './model.ts';

describe(
  { name: 'Auth model', sanitizeResources: false, sanitizeOps: false },
  () => {
    const createdUsers: string[] = [];
    const createdPasswordResets: string[] = [];
    const createdVerificationTokens: string[] = [];

    /** Insert a user row directly (no preferences) and track it for cleanup. */
    async function insertUser(
      prefix: string,
      overrides: Partial<typeof users.$inferInsert> = {},
    ) {
      const id = crypto.randomUUID();
      const [user] = await db.insert(users).values({
        id,
        email: `${prefix}-${id}@example.com`,
        username: `${prefix}-${id.slice(0, 8)}`,
        passwordHash: 'hash',
        ...overrides,
      }).returning();
      createdUsers.push(user.id);
      return user;
    }

    /** Insert a preferences row for a user and track the user for cleanup. */
    async function insertPreferences(userId: string) {
      const [prefs] = await db.insert(userPreferences).values({ userId }).returning();
      return prefs;
    }

    afterEach(async () => {
      if (createdPasswordResets.length) {
        await db.delete(passwordResets).where(inArray(passwordResets.id, createdPasswordResets));
        createdPasswordResets.length = 0;
      }
      if (createdVerificationTokens.length) {
        await db.delete(emailVerificationTokens).where(
          inArray(emailVerificationTokens.id, createdVerificationTokens),
        );
        createdVerificationTokens.length = 0;
      }
      if (createdUsers.length) {
        await db.delete(userPreferences).where(inArray(userPreferences.userId, createdUsers));
        await db.delete(users).where(inArray(users.id, createdUsers));
        createdUsers.length = 0;
      }
    });

    describe('createUser', () => {
      it('should create a user with a hashed password and a preferences row', async () => {
        const id = crypto.randomUUID();
        const email = `create-${id}@example.com`;
        const username = `create-${id.slice(0, 8)}`;
        const user = await model.createUser({
          email,
          username,
          password: 'SuperSecret123!',
          displayName: 'Created User',
        });
        createdUsers.push(user.id);

        expect(user.id).toBeDefined();
        expect(user.email).toBe(email);
        expect(user.username).toBe(username);
        expect(user.displayName).toBe('Created User');
        expect(user.passwordHash).not.toBe('SuperSecret123!');
        expect(model.verifyPassword('SuperSecret123!', user.passwordHash)).toBe(true);

        const [prefs] = await db.select().from(userPreferences).where(
          eq(userPreferences.userId, user.id),
        );
        expect(prefs).toBeDefined();
      });

      it('should default displayName to null when not provided', async () => {
        const id = crypto.randomUUID();
        const user = await model.createUser({
          email: `noname-${id}@example.com`,
          username: `noname-${id.slice(0, 8)}`,
          password: 'SuperSecret123!',
        });
        createdUsers.push(user.id);
        expect(user.displayName).toBeNull();
      });
    });

    describe('verifyPassword', () => {
      it('should return true for a matching password', async () => {
        const user = await insertUser('verify-ok');
        const updated = await model.updateUserPassword(user.id, 'CorrectHorse1!');
        expect(model.verifyPassword('CorrectHorse1!', updated!.passwordHash)).toBe(true);
      });

      it('should return false for a non-matching password', async () => {
        const user = await insertUser('verify-bad');
        const updated = await model.updateUserPassword(user.id, 'CorrectHorse1!');
        expect(model.verifyPassword('WrongPassword1!', updated!.passwordHash)).toBe(false);
      });
    });

    describe('findUserByEmail', () => {
      it('should return the user with preferences when found', async () => {
        const user = await insertUser('by-email');
        await insertPreferences(user.id);

        const found = await model.findUserByEmail(user.email);
        expect(found).not.toBeNull();
        expect(found!.id).toBe(user.id);
        expect(found!.preferences).toBeDefined();
        expect(found!.preferences!.userId).toBe(user.id);
      });

      it('should return null when the email does not exist', async () => {
        const found = await model.findUserByEmail('ghost@nowhere.example.com');
        expect(found).toBeNull();
      });

      it('should return null for a soft-deleted user', async () => {
        const user = await insertUser('by-email-del', { deletedAt: new Date() });
        const found = await model.findUserByEmail(user.email);
        expect(found).toBeNull();
      });
    });

    describe('findUserByUsername', () => {
      it('should return the user when found', async () => {
        const user = await insertUser('by-username');
        const found = await model.findUserByUsername(user.username);
        expect(found).not.toBeNull();
        expect(found!.id).toBe(user.id);
      });

      it('should return null when the username does not exist', async () => {
        const found = await model.findUserByUsername('no-such-user');
        expect(found).toBeNull();
      });

      it('should return null for a soft-deleted user', async () => {
        const user = await insertUser('by-username-del', { deletedAt: new Date() });
        const found = await model.findUserByUsername(user.username);
        expect(found).toBeNull();
      });
    });

    describe('findUserById', () => {
      it('should return the user with preferences when found', async () => {
        const user = await insertUser('by-id');
        await insertPreferences(user.id);

        const found = await model.findUserById(user.id);
        expect(found).not.toBeNull();
        expect(found!.id).toBe(user.id);
        expect(found!.preferences).toBeDefined();
      });

      it('should return null when the id does not exist', async () => {
        const found = await model.findUserById(crypto.randomUUID());
        expect(found).toBeNull();
      });

      it('should return null for a soft-deleted user', async () => {
        const user = await insertUser('by-id-del', { deletedAt: new Date() });
        const found = await model.findUserById(user.id);
        expect(found).toBeNull();
      });
    });

    describe('updateUserPassword', () => {
      it('should persist a new bcrypt hash and return the updated user', async () => {
        const user = await insertUser('pw-update');
        const updated = await model.updateUserPassword(user.id, 'NewPassword1!');
        expect(updated).not.toBeNull();
        expect(updated!.id).toBe(user.id);
        expect(model.verifyPassword('NewPassword1!', updated!.passwordHash)).toBe(true);
      });

      it('should return null for a nonexistent user', async () => {
        const updated = await model.updateUserPassword(crypto.randomUUID(), 'NewPassword1!');
        expect(updated).toBeNull();
      });
    });

    describe('password reset persistence', () => {
      it('should create a reset record and look it up with the associated user', async () => {
        const user = await insertUser('pw-reset');
        const token = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 3600 * 1000);

        const created = await model.createPasswordReset(user.id, token, expiresAt);
        createdPasswordResets.push(created.id);
        expect(created.userId).toBe(user.id);
        expect(created.token).toBe(token);
        expect(created.usedAt).toBeNull();

        const found = await model.findPasswordResetByToken(token);
        expect(found).not.toBeNull();
        expect(found!.id).toBe(created.id);
        expect(found!.userId).toBe(user.id);
        expect(found!.user).toBeDefined();
        expect(found!.user!.id).toBe(user.id);
      });

      it('should return null when looking up an unknown reset token', async () => {
        const found = await model.findPasswordResetByToken('no-such-token');
        expect(found).toBeNull();
      });

      it('should mark a reset record as used', async () => {
        const user = await insertUser('pw-reset-used');
        const created = await model.createPasswordReset(
          user.id,
          crypto.randomUUID(),
          new Date(Date.now() + 3600 * 1000),
        );
        createdPasswordResets.push(created.id);

        const marked = await model.markPasswordResetUsed(created.id);
        expect(marked).not.toBeNull();
        expect(marked!.id).toBe(created.id);
        expect(marked!.usedAt).not.toBeNull();
      });

      it('should return null when marking a nonexistent reset record', async () => {
        const marked = await model.markPasswordResetUsed(crypto.randomUUID());
        expect(marked).toBeNull();
      });
    });

    describe('markOnboardingComplete', () => {
      it('should set onboardingCompleted to true', async () => {
        const user = await insertUser('onboarding');
        expect(user.onboardingCompleted).toBe(false);

        const updated = await model.markOnboardingComplete(user.id);
        expect(updated).not.toBeNull();
        expect(updated!.onboardingCompleted).toBe(true);
      });

      it('should return null for a nonexistent user', async () => {
        const updated = await model.markOnboardingComplete(crypto.randomUUID());
        expect(updated).toBeNull();
      });
    });

    describe('isEmailTaken', () => {
      it('should return true when the email belongs to an existing user', async () => {
        const user = await insertUser('email-taken');
        expect(await model.isEmailTaken(user.email)).toBe(true);
      });

      it('should return false when the email is unused', async () => {
        expect(await model.isEmailTaken('free@nowhere.example.com')).toBe(false);
      });

      it('should ignore the excluded user id', async () => {
        const user = await insertUser('email-exclude');
        expect(await model.isEmailTaken(user.email, user.id)).toBe(false);
      });

      it('should not count a soft-deleted user as taken', async () => {
        const user = await insertUser('email-deleted', { deletedAt: new Date() });
        expect(await model.isEmailTaken(user.email)).toBe(false);
      });
    });

    describe('isUsernameTaken', () => {
      it('should return true when the username belongs to an existing user', async () => {
        const user = await insertUser('username-taken');
        expect(await model.isUsernameTaken(user.username)).toBe(true);
      });

      it('should return false when the username is unused', async () => {
        expect(await model.isUsernameTaken('free-username')).toBe(false);
      });

      it('should ignore the excluded user id', async () => {
        const user = await insertUser('username-exclude');
        expect(await model.isUsernameTaken(user.username, user.id)).toBe(false);
      });

      it('should not count a soft-deleted user as taken', async () => {
        const user = await insertUser('username-deleted', { deletedAt: new Date() });
        expect(await model.isUsernameTaken(user.username)).toBe(false);
      });
    });

    describe('email verification token lifecycle', () => {
      it('should store a SHA-256 hash rather than the raw token', async () => {
        const user = await insertUser('verify-hash');
        const rawToken = crypto.randomUUID();
        const created = await model.createEmailVerificationToken(
          user.id,
          rawToken,
          new Date(Date.now() + 3600 * 1000),
        );
        createdVerificationTokens.push(created.id);

        expect(created.token).not.toBe(rawToken);
        expect(created.token).toMatch(/^[0-9a-f]{64}$/);
      });

      it('should find a token by its raw value via hash comparison', async () => {
        const user = await insertUser('verify-find');
        const rawToken = crypto.randomUUID();
        const created = await model.createEmailVerificationToken(
          user.id,
          rawToken,
          new Date(Date.now() + 3600 * 1000),
        );
        createdVerificationTokens.push(created.id);

        const found = await model.findEmailVerificationByToken(rawToken);
        expect(found).not.toBeNull();
        expect(found!.id).toBe(created.id);
        expect(found!.userId).toBe(user.id);
      });

      it('should return null for an unknown raw token', async () => {
        const found = await model.findEmailVerificationByToken(crypto.randomUUID());
        expect(found).toBeNull();
      });

      it('should mark the email verified and consume the token atomically', async () => {
        const user = await insertUser('verify-mark');
        const rawToken = crypto.randomUUID();
        const created = await model.createEmailVerificationToken(
          user.id,
          rawToken,
          new Date(Date.now() + 3600 * 1000),
        );
        createdVerificationTokens.push(created.id);

        await model.markEmailVerified(user.id, created.id);

        const [consumed] = await db.select().from(emailVerificationTokens).where(
          eq(emailVerificationTokens.id, created.id),
        );
        expect(consumed.usedAt).not.toBeNull();

        const [updatedUser] = await db.select().from(users).where(eq(users.id, user.id));
        expect(updatedUser.emailVerifiedAt).not.toBeNull();
      });

      it('should throw TOKEN_ALREADY_USED when consuming a token twice', async () => {
        const user = await insertUser('verify-reuse');
        const rawToken = crypto.randomUUID();
        const created = await model.createEmailVerificationToken(
          user.id,
          rawToken,
          new Date(Date.now() + 3600 * 1000),
        );
        createdVerificationTokens.push(created.id);

        await model.markEmailVerified(user.id, created.id);
        await expect(model.markEmailVerified(user.id, created.id)).rejects.toThrow(
          'TOKEN_ALREADY_USED',
        );
      });
    });
  },
);
