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
      expect(result.data.dateFormat).toBe('YYYY_MM_DD');
      expect(result.data.emailNotifications.mentionedInComment).toBe(true);
    }
  });

  it('should default mentionedInComment to true when emailNotifications is partial', () => {
    const result = UserPreferencesSchema.safeParse({
      emailNotifications: { newFollower: false },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.emailNotifications.newFollower).toBe(false);
      expect(result.data.emailNotifications.mentionedInComment).toBe(true);
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
        mentionedInComment: false,
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.emailNotifications.mentionedInComment).toBe(false);
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
