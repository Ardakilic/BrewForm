import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { UserPreferencesSchema, UserProfileUpdateSchema } from './user.ts';

describe('UserPreferencesSchema', () => {
  it('should apply defaults', () => {
    const result = UserPreferencesSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.unitSystem).toBe('metric');
      expect(result.data.temperatureUnit).toBe('celsius');
      expect(result.data.theme).toBe('light');
      expect(result.data.locale).toBe('en');
      expect(result.data.dateFormat).toBe('YYYY-MM-DD');
    }
  });

  it('should accept valid theme values', () => {
    for (const theme of ['light', 'dark', 'coffee'] as const) {
      const result = UserPreferencesSchema.safeParse({ theme });
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid theme', () => {
    const result = UserPreferencesSchema.safeParse({ theme: 'neon' });
    expect(result.success).toBe(false);
  });

  it('should accept valid unit systems', () => {
    for (const unitSystem of ['metric', 'imperial'] as const) {
      const result = UserPreferencesSchema.safeParse({ unitSystem });
      expect(result.success).toBe(true);
    }
  });

  it('should accept email notifications object', () => {
    const result = UserPreferencesSchema.safeParse({
      emailNotifications: {
        newFollower: false,
        recipeLiked: true,
        recipeCommented: true,
        followedUserPosted: true,
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('UserProfileUpdateSchema', () => {
  it('should accept partial updates', () => {
    const result = UserProfileUpdateSchema.safeParse({
      displayName: 'New Name',
    });
    expect(result.success).toBe(true);
  });

  it('should accept all optional fields', () => {
    const result = UserProfileUpdateSchema.safeParse({
      displayName: 'New Name',
      bio: 'My bio',
      avatarUrl: 'https://example.com/avatar.jpg',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid avatar URL', () => {
    const result = UserProfileUpdateSchema.safeParse({
      avatarUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('should reject displayName exceeding 50 chars', () => {
    const result = UserProfileUpdateSchema.safeParse({
      displayName: 'a'.repeat(51),
    });
    expect(result.success).toBe(false);
  });

  it('should reject bio exceeding 500 chars', () => {
    const result = UserProfileUpdateSchema.safeParse({
      bio: 'a'.repeat(501),
    });
    expect(result.success).toBe(false);
  });
});
