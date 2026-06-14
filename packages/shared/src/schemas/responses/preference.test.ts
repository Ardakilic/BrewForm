import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { UserPreferencesOutputSchema } from './preference.ts';

function wire<T>(payload: T): unknown {
  return JSON.parse(JSON.stringify(payload));
}

describe('UserPreferencesOutputSchema', () => {
  it('parses the flat preferences row and round-trips', () => {
    const payload = {
      id: 'pref-1',
      userId: 'user-1',
      unitSystem: 'metric',
      temperatureUnit: 'celsius',
      theme: 'light',
      locale: 'en',
      timezone: 'UTC',
      dateFormat: 'YYYY_MM_DD',
      newFollower: true,
      recipeLiked: true,
      recipeCommented: false,
      followedUserPosted: true,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    };
    const result = UserPreferencesOutputSchema.safeParse(wire(payload));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(wire(payload));
  });

  it('rejects a nested emailNotifications object (request-body shape, not the flat row)', () => {
    const payload = {
      id: 'pref-1',
      userId: 'user-1',
      unitSystem: 'metric',
      temperatureUnit: 'celsius',
      theme: 'light',
      locale: 'en',
      timezone: 'UTC',
      dateFormat: 'YYYY_MM_DD',
      emailNotifications: { newFollower: true },
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };
    expect(UserPreferencesOutputSchema.safeParse(payload).success).toBe(false);
  });
});
