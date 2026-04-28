import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';

describe('Preference Service Logic', () => {
  describe('Email notification flattening', () => {
    it('should flatten email notification booleans', () => {
      const preferences = {
        unitSystem: 'metric',
        temperatureUnit: 'celsius',
        theme: 'light',
        emailNotifications: {
          newFollower: true,
          recipeLiked: true,
          recipeCommented: false,
          followedUserPosted: true,
        },
      };

      const flat = {
        ...preferences,
        emailNewFollower: preferences.emailNotifications.newFollower,
        emailRecipeLiked: preferences.emailNotifications.recipeLiked,
        emailRecipeCommented: preferences.emailNotifications.recipeCommented,
        emailFollowedUserPosted: preferences.emailNotifications.followedUserPosted,
      };

      expect(flat.emailNewFollower).toBe(true);
      expect(flat.emailRecipeLiked).toBe(true);
      expect(flat.emailRecipeCommented).toBe(false);
      expect(flat.emailFollowedUserPosted).toBe(true);
    });
  });
});
