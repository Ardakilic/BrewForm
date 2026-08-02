import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import {
  UserPreferencesPatchSchema,
  UserPreferencesSchema,
  UserProfileUpdateSchema,
} from './user.ts';

describe('UserPreferencesSchema', () => {
  it('should apply defaults', () => {
    const result = UserPreferencesSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.unitSystem).toBe('metric');
      expect(result.data.temperatureUnit).toBe('celsius');
      expect(result.data.theme).toBe('light');
      expect(result.data.locale).toBe('en');
      expect(result.data.dateFormat).toBe('YYYY_MM_DD');
      expect(result.data.notifyNewFollower).toBe(true);
      expect(result.data.notifyRecipeLiked).toBe(true);
      expect(result.data.notifyRecipeCommented).toBe(true);
      expect(result.data.notifyFollowedUserPosted).toBe(true);
      expect(result.data.notifyMentionedInComment).toBe(true);
    }
  });

  it('should default notifyMentionedInComment to true when partial input omits it', () => {
    const result = UserPreferencesSchema.safeParse({
      notifyNewFollower: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notifyNewFollower).toBe(false);
      expect(result.data.notifyRecipeLiked).toBe(true);
      expect(result.data.notifyRecipeCommented).toBe(true);
      expect(result.data.notifyFollowedUserPosted).toBe(true);
      expect(result.data.notifyMentionedInComment).toBe(true);
    }
  });

  it('treats legacy { emailNotifications: {...} } payload as no-op (Zod strips unknown keys)', () => {
    const result = UserPreferencesSchema.safeParse({
      emailNotifications: { newFollower: false },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notifyNewFollower).toBe(true);
      expect(result.data.notifyRecipeLiked).toBe(true);
      expect(result.data.notifyRecipeCommented).toBe(true);
      expect(result.data.notifyFollowedUserPosted).toBe(true);
      expect(result.data.notifyMentionedInComment).toBe(true);
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

  it('should accept flat notify fields', () => {
    const result = UserPreferencesSchema.safeParse({
      notifyNewFollower: false,
      notifyRecipeLiked: true,
      notifyRecipeCommented: true,
      notifyFollowedUserPosted: true,
      notifyMentionedInComment: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notifyNewFollower).toBe(false);
      expect(result.data.notifyRecipeLiked).toBe(true);
      expect(result.data.notifyRecipeCommented).toBe(true);
      expect(result.data.notifyFollowedUserPosted).toBe(true);
      expect(result.data.notifyMentionedInComment).toBe(false);
    }
  });
});

/** DateFormat / TemperatureUnit regression coverage for the D07 storage-vs-display fix. */
describe('UserPreferencesSchema: DateFormat fix (D07)', () => {
  it('should accept every stored DateFormat value (DD_MM_YYYY / MM_DD_YYYY / YYYY_MM_DD)', () => {
    for (const dateFormat of ['DD_MM_YYYY', 'MM_DD_YYYY', 'YYYY_MM_DD'] as const) {
      const result = UserPreferencesSchema.safeParse({ dateFormat });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.dateFormat).toBe(dateFormat);
    }
  });

  it('should reject the old slash/dash DateFormat values', () => {
    for (const dateFormat of ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']) {
      const result = UserPreferencesSchema.safeParse({ dateFormat });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('dateFormat'))).toBe(true);
      }
    }
  });

  it('should accept every TemperatureUnit value', () => {
    for (const temperatureUnit of ['celsius', 'fahrenheit'] as const) {
      const result = UserPreferencesSchema.safeParse({ temperatureUnit });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.temperatureUnit).toBe(temperatureUnit);
    }
  });

  it('should reject invalid TemperatureUnit', () => {
    const result = UserPreferencesSchema.safeParse({ temperatureUnit: 'kelvin' });
    expect(result.success).toBe(false);
  });
});

describe('UserPreferencesPatchSchema', () => {
  it('omitted fields parse to undefined (no default fill)', () => {
    const result = UserPreferencesPatchSchema.safeParse({ theme: 'dark' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.theme).toBe('dark');
      expect(result.data.notifyNewFollower).toBeUndefined();
      expect(result.data.notifyRecipeLiked).toBeUndefined();
      expect(result.data.notifyRecipeCommented).toBeUndefined();
      expect(result.data.notifyFollowedUserPosted).toBeUndefined();
      expect(result.data.notifyMentionedInComment).toBeUndefined();
      expect(result.data.unitSystem).toBeUndefined();
    }
  });

  it('accepts flat notify fields when present', () => {
    const result = UserPreferencesPatchSchema.safeParse({ notifyNewFollower: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notifyNewFollower).toBe(false);
      expect(result.data.notifyRecipeLiked).toBeUndefined();
    }
  });

  it('empty object parses to all-undefined', () => {
    const result = UserPreferencesPatchSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notifyNewFollower).toBeUndefined();
      expect(result.data.theme).toBeUndefined();
    }
  });

  it('rejects invalid enum values', () => {
    expect(UserPreferencesPatchSchema.safeParse({ theme: 'neon' }).success).toBe(false);
    expect(UserPreferencesPatchSchema.safeParse({ unitSystem: 'kelvin' }).success).toBe(false);
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
