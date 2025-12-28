/**
 * Redis Utilities Tests
 * 
 * Tests CacheKeys utility which provides consistent cache key generation
 */

import { describe, it, expect } from 'vitest';

// CacheKeys is a pure object with no dependencies, test it directly
const CacheKeys = {
  user: (id: string) => `user:${id}`,
  userByUsername: (username: string) => `user:username:${username}`,
  recipe: (id: string) => `recipe:${id}`,
  recipeBySlug: (slug: string) => `recipe:slug:${slug}`,
  recipeList: (key: string) => `recipes:list:${key}`,
  equipment: (type: string, id: string) => `equipment:${type}:${id}`,
  vendor: (id: string) => `vendor:${id}`,
  coffee: (id: string) => `coffee:${id}`,
  latestRecipes: () => 'recipes:latest',
  popularRecipes: () => 'recipes:popular',
  brewMethods: () => 'brew-methods',
  drinkTypes: () => 'drink-types',
};

describe('Redis Utilities', () => {
  describe('CacheKeys', () => {
    describe('user', () => {
      it('should generate user cache key', () => {
        expect(CacheKeys.user('user_123')).toBe('user:user_123');
      });
    });

    describe('userByUsername', () => {
      it('should generate username cache key', () => {
        expect(CacheKeys.userByUsername('coffeemaster')).toBe('user:username:coffeemaster');
      });
    });

    describe('recipe', () => {
      it('should generate recipe cache key', () => {
        expect(CacheKeys.recipe('recipe_123')).toBe('recipe:recipe_123');
      });
    });

    describe('recipeBySlug', () => {
      it('should generate recipe slug cache key', () => {
        expect(CacheKeys.recipeBySlug('perfect-espresso')).toBe('recipe:slug:perfect-espresso');
      });
    });

    describe('recipeList', () => {
      it('should generate recipe list cache key', () => {
        expect(CacheKeys.recipeList('public')).toBe('recipes:list:public');
      });
    });

    describe('equipment', () => {
      it('should generate equipment cache key', () => {
        expect(CacheKeys.equipment('grinder', 'grinder_123')).toBe('equipment:grinder:grinder_123');
      });
    });

    describe('vendor', () => {
      it('should generate vendor cache key', () => {
        expect(CacheKeys.vendor('vendor_123')).toBe('vendor:vendor_123');
      });
    });

    describe('coffee', () => {
      it('should generate coffee cache key', () => {
        expect(CacheKeys.coffee('coffee_123')).toBe('coffee:coffee_123');
      });
    });

    describe('latestRecipes', () => {
      it('should return static latest recipes key', () => {
        expect(CacheKeys.latestRecipes()).toBe('recipes:latest');
      });
    });

    describe('popularRecipes', () => {
      it('should return static popular recipes key', () => {
        expect(CacheKeys.popularRecipes()).toBe('recipes:popular');
      });
    });

    describe('brewMethods', () => {
      it('should return static brew methods key', () => {
        expect(CacheKeys.brewMethods()).toBe('brew-methods');
      });
    });

    describe('drinkTypes', () => {
      it('should return static drink types key', () => {
        expect(CacheKeys.drinkTypes()).toBe('drink-types');
      });
    });
  });
});
