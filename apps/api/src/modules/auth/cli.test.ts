/**
 * Auth CLI Tests
 * Tests for password reset CLI functionality
 */

import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { mockFn } from '../../test/mock-fn.ts';
import { generatePassword, findUser, resetUserPassword } from './cli.ts';

// Create mock Prisma client
const createMockPrisma = () => ({
  user: {
    findUnique: mockFn(),
    update: mockFn(),
  },
  session: {
    deleteMany: mockFn(),
  },
});

describe('Auth CLI', () => {

  describe('generatePassword', () => {
    it('should generate a password of default length 16', () => {
      const password = generatePassword();
      expect(password).toHaveLength(16);
    });

    it('should generate a password of specified length', () => {
      const password = generatePassword(24);
      expect(password).toHaveLength(24);
    });

    it('should generate different passwords on each call', () => {
      const password1 = generatePassword();
      const password2 = generatePassword();
      expect(password1).not.toBe(password2);
    });

    it('should only contain valid characters', () => {
      const validChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
      const password = generatePassword(100);
      for (const char of password) {
        expect(validChars).toContain(char);
      }
    });
  });

  describe('findUser', () => {
    it('should find user by email', async () => {
      const mockPrisma = createMockPrisma();
      const mockUser = {
        id: 'user_123',
        email: 'admin@brewform.local',
        username: 'admin',
        displayName: 'Admin',
        isAdmin: true,
      };
      mockPrisma.user.findUnique.mockResolvedValueOnce(mockUser);

      const user = await findUser(mockPrisma as never, 'admin@brewform.local');

      expect(user).toEqual(mockUser);
      expect(mockPrisma.user.findUnique.calls[0]).toEqual([{
        where: { email: 'admin@brewform.local' },
        select: { id: true, email: true, username: true, displayName: true, isAdmin: true },
      }]);
    });

    it('should find user by username when email not found', async () => {
      const mockPrisma = createMockPrisma();
      const mockUser = {
        id: 'user_123',
        email: 'admin@brewform.local',
        username: 'admin',
        displayName: 'Admin',
        isAdmin: true,
      };
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockUser);

      const user = await findUser(mockPrisma as never, 'admin');

      expect(user).toEqual(mockUser);
      expect(mockPrisma.user.findUnique.calls.length).toBe(2);
    });

    it('should return null when user not found', async () => {
      const mockPrisma = createMockPrisma();
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const user = await findUser(mockPrisma as never, 'nonexistent@example.com');

      expect(user).toBeNull();
    });

    it('should lowercase the identifier for search', async () => {
      const mockPrisma = createMockPrisma();
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await findUser(mockPrisma as never, 'ADMIN@BREWFORM.LOCAL');

      expect(mockPrisma.user.findUnique.calls[0]).toEqual([{
        where: { email: 'admin@brewform.local' },
        select: { id: true, email: true, username: true, displayName: true, isAdmin: true },
      }]);
    });
  });

  describe('resetUserPassword', () => {
    it('should successfully reset password with generated password', async () => {
      const mockPrisma = createMockPrisma();
      const mockUser = {
        id: 'user_123',
        email: 'admin@brewform.local',
        username: 'admin',
        displayName: 'Admin',
        isAdmin: true,
      };
      mockPrisma.user.findUnique.mockResolvedValueOnce(mockUser);
      mockPrisma.user.update.mockResolvedValue(mockUser);
      mockPrisma.session.deleteMany.mockResolvedValue({ count: 2 });

      const result = await resetUserPassword(mockPrisma as never, 'admin@brewform.local');

      expect(result.success).toBe(true);
      expect(result.user).toEqual(mockUser);
      expect(result.password).toBeDefined();
      expect(result.password).toHaveLength(16);
      expect(result.error).toBeUndefined();
    });

    it('should successfully reset password with provided password', async () => {
      const mockPrisma = createMockPrisma();
      const mockUser = {
        id: 'user_123',
        email: 'admin@brewform.local',
        username: 'admin',
        displayName: 'Admin',
        isAdmin: true,
      };
      mockPrisma.user.findUnique.mockResolvedValueOnce(mockUser);
      mockPrisma.user.update.mockResolvedValue(mockUser);
      mockPrisma.session.deleteMany.mockResolvedValue({ count: 2 });

      const result = await resetUserPassword(mockPrisma as never, 'admin@brewform.local', 'NewSecurePassword123!');

      expect(result.success).toBe(true);
      expect(result.user).toEqual(mockUser);
      expect(result.password).toBeUndefined();
      expect(result.error).toBeUndefined();
    });

    it('should update the password hash in database', async () => {
      const mockPrisma = createMockPrisma();
      const mockUser = {
        id: 'user_123',
        email: 'admin@brewform.local',
        username: 'admin',
        displayName: 'Admin',
        isAdmin: true,
      };
      mockPrisma.user.findUnique.mockResolvedValueOnce(mockUser);
      mockPrisma.user.update.mockResolvedValue(mockUser);
      mockPrisma.session.deleteMany.mockResolvedValue({ count: 0 });

      await resetUserPassword(mockPrisma as never, 'admin@brewform.local', 'NewPassword123!');

      expect(mockPrisma.user.update.calls[0]).toEqual([{
        where: { id: 'user_123' },
        data: { passwordHash: expect.any(String) },
      }]);
    });

    it('should invalidate all sessions after password reset', async () => {
      const mockPrisma = createMockPrisma();
      const mockUser = {
        id: 'user_123',
        email: 'admin@brewform.local',
        username: 'admin',
        displayName: 'Admin',
        isAdmin: true,
      };
      mockPrisma.user.findUnique.mockResolvedValueOnce(mockUser);
      mockPrisma.user.update.mockResolvedValue(mockUser);
      mockPrisma.session.deleteMany.mockResolvedValue({ count: 3 });

      await resetUserPassword(mockPrisma as never, 'admin@brewform.local', 'NewPassword123!');

      expect(mockPrisma.session.deleteMany.calls[0]).toEqual([{
        where: { userId: 'user_123' },
      }]);
    });

    it('should return error when user not found', async () => {
      const mockPrisma = createMockPrisma();
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await resetUserPassword(mockPrisma as never, 'nonexistent@example.com');

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found: nonexistent@example.com');
      expect(result.user).toBeUndefined();
    });

    it('should return error when password is too short', async () => {
      const mockPrisma = createMockPrisma();

      const result = await resetUserPassword(mockPrisma as never, 'admin@brewform.local', 'short');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Password must be at least 8 characters long');
      expect(mockPrisma.user.findUnique.calls.length).toBe(0);
    });

    it('should accept password of exactly 8 characters', async () => {
      const mockPrisma = createMockPrisma();
      const mockUser = {
        id: 'user_123',
        email: 'admin@brewform.local',
        username: 'admin',
        displayName: 'Admin',
        isAdmin: true,
      };
      mockPrisma.user.findUnique.mockResolvedValueOnce(mockUser);
      mockPrisma.user.update.mockResolvedValue(mockUser);
      mockPrisma.session.deleteMany.mockResolvedValue({ count: 0 });

      const result = await resetUserPassword(mockPrisma as never, 'admin@brewform.local', '12345678');

      expect(result.success).toBe(true);
    });

    it('should work with username identifier', async () => {
      const mockPrisma = createMockPrisma();
      const mockUser = {
        id: 'user_123',
        email: 'admin@brewform.local',
        username: 'admin',
        displayName: 'Admin',
        isAdmin: true,
      };
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockUser);
      mockPrisma.user.update.mockResolvedValue(mockUser);
      mockPrisma.session.deleteMany.mockResolvedValue({ count: 0 });

      const result = await resetUserPassword(mockPrisma as never, 'admin');

      expect(result.success).toBe(true);
      expect(result.user).toEqual(mockUser);
    });
  });
});
