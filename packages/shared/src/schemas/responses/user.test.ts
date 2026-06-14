import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import {
  PublicUserOutputSchema,
  SelfUserOutputSchema,
  UserRowOutputSchema,
} from './user.ts';

function wire<T>(payload: T): unknown {
  return JSON.parse(JSON.stringify(payload));
}

const baseUser = {
  id: 'user-1',
  email: 'alice@example.com',
  emailVerifiedAt: null,
  username: 'alice',
  displayName: 'Alice',
  avatarUrl: null,
  bio: 'Coffee lover',
  onboardingCompleted: true,
  isAdmin: false,
  isBanned: false,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-02T00:00:00.000Z'),
  deletedAt: null,
};

describe('UserRowOutputSchema (PATCH /me)', () => {
  it('parses the bare row (no preferences/stats) and round-trips', () => {
    const result = UserRowOutputSchema.safeParse(wire(baseUser));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(wire(baseUser));
  });
});

describe('SelfUserOutputSchema (GET /me)', () => {
  it('parses row + nested preferences + stats and round-trips', () => {
    const payload = {
      ...baseUser,
      preferences: {
        unitSystem: 'metric',
        temperatureUnit: 'celsius',
        theme: 'light',
        locale: 'en',
        timezone: 'UTC',
        dateFormat: 'YYYY_MM_DD',
        emailNotifications: {
          newFollower: true,
          recipeLiked: true,
          recipeCommented: false,
          followedUserPosted: true,
        },
      },
      recipeCount: 5,
      followerCount: 10,
      followingCount: 3,
    };
    const result = SelfUserOutputSchema.safeParse(wire(payload));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(wire(payload));
  });

  it('accepts null preferences (no preferences row)', () => {
    const payload = {
      ...baseUser,
      preferences: null,
      recipeCount: 0,
      followerCount: 0,
      followingCount: 0,
    };
    expect(SelfUserOutputSchema.safeParse(wire(payload)).success).toBe(true);
  });
});

describe('PublicUserOutputSchema (GET /:username)', () => {
  it('parses row minus email + stats + recipes[] + badges + isFollowing', () => {
    const { email: _email, ...publicBase } = baseUser;
    const payload = {
      ...publicBase,
      recipeCount: 2,
      followerCount: 1,
      followingCount: 0,
      recipes: [
        {
          id: 'recipe-1',
          slug: 'my-pour-over',
          title: 'My Pour Over',
          likeCount: 4,
          commentCount: 1,
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          currentVersion: { brewMethod: 'v60', drinkType: 'filter' },
        },
        {
          id: 'recipe-2',
          slug: 'no-version',
          title: 'Draft',
          likeCount: 0,
          commentCount: 0,
          createdAt: new Date('2024-01-02T00:00:00.000Z'),
          currentVersion: null,
        },
      ],
      badges: [],
      isFollowing: true,
    };
    const result = PublicUserOutputSchema.safeParse(wire(payload));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(wire(payload));
  });

  it('does not include email in the public profile output (email omitted)', () => {
    const { email: _email, ...publicBase } = baseUser;
    const payload = {
      ...publicBase,
      recipeCount: 0,
      followerCount: 0,
      followingCount: 0,
      recipes: [],
      badges: [],
      isFollowing: false,
    };
    const result = PublicUserOutputSchema.safeParse(wire(payload));
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).email).toBeUndefined();
    }
  });
});
