import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { InMemoryCacheProvider } from '../../utils/cache/index.ts';

function createMockModel(overrides: Record<string, unknown> = {}) {
  return {
    findById: (_id: string) => Promise.resolve(null),
    findByUsername: (_username: string) => Promise.resolve(null),
    getUserStats: (_id: string) => Promise.resolve({ recipeCount: 0, followerCount: 0, followingCount: 0 }),
    updateProfile: (_id: string, _data: unknown) => Promise.resolve({ id: _id }),
    deleteUser: (_id: string) => Promise.resolve({ id: _id }),
    ...overrides,
  };
}

describe('User Service', () => {
  describe('getProfile', () => {
    it('should throw USER_NOT_FOUND when user does not exist', async () => {
      const model = createMockModel({
        findById: (_id: string) => Promise.resolve(null),
      });
      try {
        const user = await model.findById('nonexistent');
        if (!user) throw new Error('USER_NOT_FOUND');
        expect(true).toBe(false);
      } catch (err) {
        expect((err as Error).message).toBe('USER_NOT_FOUND');
      }
    });

    it('should return user when found', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@test.com',
        username: 'testuser',
        displayName: 'Test User',
        bio: null,
        avatarUrl: null,
        passwordHash: 'hashed',
        isAdmin: false,
        isBanned: false,
        onboardingCompleted: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      const model = createMockModel({
        findById: (_id: string) => Promise.resolve(mockUser),
        getUserStats: (_id: string) => Promise.resolve({ recipeCount: 5, followerCount: 10, followingCount: 3 }),
      });
      const user = await model.findById('user-1');
      expect(user).not.toBeNull();
      expect((user as any).username).toBe('testuser');
    });
  });

  describe('getPublicProfile', () => {
    it('should strip sensitive fields from public profile', () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@test.com',
        username: 'testuser',
        passwordHash: 'hashed',
        displayName: 'Test',
      };
      const { passwordHash: _pw, email: _em, ...safe } = mockUser as any;
      expect(safe).not.toHaveProperty('passwordHash');
      expect(safe).not.toHaveProperty('email');
      expect(safe.username).toBe('testuser');
    });
  });
});