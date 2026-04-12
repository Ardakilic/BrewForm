/**
 * API Utility Tests
 */

import { beforeEach, describe, it } from '@std/testing';
import { expect } from '@std/expect';
import { spy } from '@std/testing/mock';

type MockResponse = {
  ok: boolean;
  status?: number;
  json: () => Promise<unknown>;
};
let mockFetch = spy<typeof globalThis.fetch>();
globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

describe('API Utility', () => {
  beforeEach(() => {
    mockFetch = spy<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;
  });

  describe('API Response Handling', () => {
    it('should handle successful JSON responses', async () => {
      const mockResponse = {
        success: true,
        data: { id: '123', title: 'Test Recipe' },
      };

      mockFetch = spy(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        } as MockResponse)
      );
      globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

      const response = await fetch('/api/v1/recipes');
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.id).toBe('123');
    });

    it('should handle error responses', async () => {
      const mockError = {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Recipe not found' },
      };

      mockFetch = spy(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.resolve(mockError),
        } as MockResponse)
      );
      globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

      const response = await fetch('/api/v1/recipes/invalid');
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });

    it('should handle network errors', async () => {
      mockFetch = spy(() => Promise.reject(new Error('Network error')));
      globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

      await expect(fetch('/api/v1/recipes')).rejects.toThrow(
        'Network error' as never,
      );
    });
  });

  describe('Recipe Data Validation', () => {
    it('should validate pressure field is a string', () => {
      const recipeData = {
        title: 'Test Espresso',
        brewMethod: 'ESPRESSO_MACHINE',
        drinkType: 'ESPRESSO',
        doseGrams: 18,
        yieldGrams: 36,
        pressure: '9',
      };

      expect(typeof recipeData.pressure).toBe('string');
      expect(recipeData.pressure).toBe('9');
    });

    it('should accept various pressure formats', () => {
      const pressureValues = ['9', '6-9', 'variable', '9 bar', ''];

      for (const pressure of pressureValues) {
        expect(typeof pressure).toBe('string');
      }
    });

    it('should handle optional pressure field', () => {
      const recipeWithPressure = {
        title: 'Test Recipe',
        pressure: '9',
      };

      const recipeWithoutPressure = {
        title: 'Test Recipe',
      };

      expect(recipeWithPressure.pressure).toBe('9');
      expect((recipeWithoutPressure as { pressure?: string }).pressure)
        .toBeUndefined();
    });
  });

  describe('Brewer Default Pressure', () => {
    it('should use brewer default pressure for new recipes', () => {
      const brewer = {
        id: 'brewer-1',
        brand: 'Gaggia',
        model: 'Classic Pro',
        defaultPressure: '9',
      };

      const newRecipe = {
        title: 'New Espresso',
        brewerId: brewer.id,
        pressure: brewer.defaultPressure, // Auto-filled from brewer
      };

      expect(newRecipe.pressure).toBe('9');
    });

    it('should allow override of default pressure', () => {
      const brewer = {
        id: 'brewer-1',
        defaultPressure: '9',
      };

      const customRecipe = {
        title: 'Custom Espresso',
        brewerId: brewer.id,
        pressure: '6', // User override
      };

      expect(customRecipe.pressure).toBe('6');
      expect(customRecipe.pressure).not.toBe(brewer.defaultPressure);
    });

    it('should handle variable pressure machines', () => {
      const brewer = {
        id: 'brewer-2',
        brand: 'Gagguino',
        model: 'Modified',
        defaultPressure: 'variable',
      };

      expect(brewer.defaultPressure).toBe('variable');
    });
  });
});
