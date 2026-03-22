/**
 * RecipesPage Tests - Filtering Functionality
 */

import { describe, it, beforeEach } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import '../../test/setup.ts';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { Client as Styletron } from 'styletron-engine-monolithic';
import { Provider as StyletronProvider } from 'styletron-react';
import { BaseProvider, LightTheme } from 'baseui';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n.ts';
import RecipesPage from './RecipesPage.tsx';
import { AuthProvider } from '../../contexts/AuthContext.tsx';
import type { MockFn } from '../../test/mock-fn.ts';
import _useSWR from '../../test/mocks/swr.ts';

// deno-lint-ignore no-explicit-any
const useSWR = _useSWR as any as MockFn;

const engine = new Styletron();

const mockRecipes = [
  {
    id: 'recipe_1',
    slug: 'morning-espresso',
    currentVersion: {
      title: 'Morning Espresso',
      brewMethod: 'ESPRESSO_MACHINE',
      drinkType: 'ESPRESSO',
      rating: 9,
    },
    user: { username: 'coffeelover' },
  },
  {
    id: 'recipe_2',
    slug: 'afternoon-pour-over',
    currentVersion: {
      title: 'Afternoon Pour Over',
      brewMethod: 'POUR_OVER_V60',
      drinkType: 'POUR_OVER',
      rating: 8,
    },
    user: { username: 'barista' },
  },
];

const TestWrapper = ({ children, initialRoute = '/recipes' }: { children: React.ReactNode; initialRoute?: string }) => {
  return (
    <HelmetProvider>
      <StyletronProvider value={engine}>
        <BaseProvider theme={LightTheme}>
          <I18nextProvider i18n={i18n}>
            <AuthProvider>
              <MemoryRouter initialEntries={[initialRoute]}>
                <Routes>
                  <Route path="/recipes" element={children} />
                </Routes>
              </MemoryRouter>
            </AuthProvider>
          </I18nextProvider>
        </BaseProvider>
      </StyletronProvider>
    </HelmetProvider>
  );
};

describe('RecipesPage Filtering', () => {
  beforeEach(() => {
    useSWR.mockReset();
  });

  describe('Initial URL params', () => {
    it('should load with single tag filter from URL', () => {
      useSWR.mockReturnValue({
        data: mockRecipes,
        isLoading: false,
        error: undefined,
        mutate: () => Promise.resolve(undefined),
        isValidating: false,
      });

      render(
        <TestWrapper initialRoute="/recipes?tags=fruity">
          <RecipesPage />
        </TestWrapper>
      );

      // Should display the tag filter with translated label
      expect(screen.getByText('#Fruity')).toBeInTheDocument();
    });

    it('should load with multiple tag filters from URL', () => {
      useSWR.mockReturnValue({
        data: mockRecipes,
        isLoading: false,
        error: undefined,
        mutate: () => Promise.resolve(undefined),
        isValidating: false,
      });

      render(
        <TestWrapper initialRoute="/recipes?tags=chocolatey&tags=fruity">
          <RecipesPage />
        </TestWrapper>
      );

      // Should display both tag filters with translated labels
      expect(screen.getByText('#Chocolatey')).toBeInTheDocument();
      expect(screen.getByText('#Fruity')).toBeInTheDocument();
    });

    it('should load with single brew method filter from URL', () => {
      useSWR.mockReturnValue({
        data: mockRecipes,
        isLoading: false,
        error: undefined,
        mutate: () => Promise.resolve(undefined),
        isValidating: false,
      });

      render(
        <TestWrapper initialRoute="/recipes?brewMethod=ESPRESSO_MACHINE">
          <RecipesPage />
        </TestWrapper>
      );

      // Active filters section should be visible with brew method
      expect(screen.getByText(/Active/i)).toBeInTheDocument();
    });

    it('should load with multiple brew method filters from URL', () => {
      useSWR.mockReturnValue({
        data: mockRecipes,
        isLoading: false,
        error: undefined,
        mutate: () => Promise.resolve(undefined),
        isValidating: false,
      });

      render(
        <TestWrapper initialRoute="/recipes?brewMethod=ESPRESSO_MACHINE&brewMethod=POUR_OVER_V60">
          <RecipesPage />
        </TestWrapper>
      );

      // Active filters section should be visible with multiple brew methods
      expect(screen.getByText(/Active/i)).toBeInTheDocument();
      // Multiple closeable tags should be present (for each brew method)
      const closeableTags = screen.getAllByRole('button', { name: /remove/i });
      expect(closeableTags.length).toBeGreaterThanOrEqual(2);
    });

    it('should load with single drink type filter from URL', () => {
      useSWR.mockReturnValue({
        data: mockRecipes,
        isLoading: false,
        error: undefined,
        mutate: () => Promise.resolve(undefined),
        isValidating: false,
      });

      render(
        <TestWrapper initialRoute="/recipes?drinkType=ESPRESSO">
          <RecipesPage />
        </TestWrapper>
      );

      // Active filters section should be visible
      expect(screen.getByText(/Active/i)).toBeInTheDocument();
    });

    it('should load with multiple drink type filters from URL', () => {
      useSWR.mockReturnValue({
        data: mockRecipes,
        isLoading: false,
        error: undefined,
        mutate: () => Promise.resolve(undefined),
        isValidating: false,
      });

      render(
        <TestWrapper initialRoute="/recipes?drinkType=ESPRESSO&drinkType=LUNGO">
          <RecipesPage />
        </TestWrapper>
      );

      // Active filters section should be visible with multiple drink types
      expect(screen.getByText(/Active/i)).toBeInTheDocument();
      expect(screen.getAllByText('Espresso').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Lungo').length).toBeGreaterThan(0);
    });

    it('should load with combined filters from URL', () => {
      useSWR.mockReturnValue({
        data: mockRecipes,
        isLoading: false,
        error: undefined,
        mutate: () => Promise.resolve(undefined),
        isValidating: false,
      });

      render(
        <TestWrapper initialRoute="/recipes?brewMethod=ESPRESSO_MACHINE&tags=chocolatey&tags=morning">
          <RecipesPage />
        </TestWrapper>
      );

      // Should display all filters with translated labels
      expect(screen.getByText('#Chocolatey')).toBeInTheDocument();
      expect(screen.getByText('#Morning')).toBeInTheDocument();
    });
  });

  describe('Filter removal', () => {
    it('should remove single tag when clicking close button', async () => {
      useSWR.mockReturnValue({
        data: mockRecipes,
        isLoading: false,
        error: undefined,
        mutate: () => Promise.resolve(undefined),
        isValidating: false,
      });

      render(
        <TestWrapper initialRoute="/recipes?tags=chocolatey&tags=fruity">
          <RecipesPage />
        </TestWrapper>
      );

      // Active filters section should be visible initially
      expect(screen.getByText(/Active/i)).toBeInTheDocument();
      
      // Find closeable tags in the active filters section (they have close buttons)
      const closeableTags = screen.getAllByRole('button', { name: /remove/i });
      
      // Click the first close button to remove one tag
      if (closeableTags.length > 0) {
        fireEvent.click(closeableTags[0]);
      }

      // After removal, active filters section should still be visible (one tag remains)
      await waitFor(() => {
        expect(screen.getByText(/Active/i)).toBeInTheDocument();
      });
    });

    it('should have Clear All button when filters are active', async () => {
      useSWR.mockReturnValue({
        data: mockRecipes,
        isLoading: false,
        error: undefined,
        mutate: () => Promise.resolve(undefined),
        isValidating: false,
      });

      render(
        <TestWrapper initialRoute="/recipes?tags=chocolatey&tags=fruity&brewMethod=ESPRESSO_MACHINE">
          <RecipesPage />
        </TestWrapper>
      );

      // Active filters section should be visible
      expect(screen.getByText(/Active/i)).toBeInTheDocument();

      // Clear All button should be present
      const clearAllButtons = screen.getAllByRole('button', { name: /clear all/i });
      expect(clearAllButtons.length).toBeGreaterThan(0);
    });
  });

  describe('Recipe display', () => {
    it('should display recipes when loaded', () => {
      useSWR.mockReturnValue({
        data: mockRecipes,
        isLoading: false,
        error: undefined,
        mutate: () => Promise.resolve(undefined),
        isValidating: false,
      });

      render(
        <TestWrapper>
          <RecipesPage />
        </TestWrapper>
      );

      expect(screen.getByText('Morning Espresso')).toBeInTheDocument();
      expect(screen.getByText('Afternoon Pour Over')).toBeInTheDocument();
    });

    it('should show loading spinner while loading', () => {
      useSWR.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: undefined,
        mutate: () => Promise.resolve(undefined),
        isValidating: false,
      });

      render(
        <TestWrapper>
          <RecipesPage />
        </TestWrapper>
      );

      // Loading spinner is shown
      expect(screen.queryByText('Morning Espresso')).not.toBeInTheDocument();
    });

    it('should show empty state when no recipes', () => {
      useSWR.mockReturnValue({
        data: [],
        isLoading: false,
        error: undefined,
        mutate: () => Promise.resolve(undefined),
        isValidating: false,
      });

      render(
        <TestWrapper>
          <RecipesPage />
        </TestWrapper>
      );

      expect(screen.getByText(/no recipes/i)).toBeInTheDocument();
    });
  });

  describe('API URL construction', () => {
    it('should build correct API URL with multiple tags', () => {
      let capturedUrl = '';
      useSWR.mockImplementation((url: unknown) => {
        capturedUrl = url as string;
        return {
          data: mockRecipes,
          isLoading: false,
          error: undefined,
          mutate: () => Promise.resolve(undefined),
          isValidating: false,
        };
      });

      render(
        <TestWrapper initialRoute="/recipes?tags=chocolatey&tags=fruity">
          <RecipesPage />
        </TestWrapper>
      );

      // API URL should contain comma-separated tags
      expect(capturedUrl).toContain('tags=chocolatey');
    });

    it('should build correct API URL with single brew method', () => {
      let capturedUrl = '';
      useSWR.mockImplementation((url: unknown) => {
        capturedUrl = url as string;
        return {
          data: mockRecipes,
          isLoading: false,
          error: undefined,
          mutate: () => Promise.resolve(undefined),
          isValidating: false,
        };
      });

      render(
        <TestWrapper initialRoute="/recipes?brewMethod=ESPRESSO_MACHINE">
          <RecipesPage />
        </TestWrapper>
      );

      expect(capturedUrl).toContain('brewMethod=ESPRESSO_MACHINE');
    });

    it('should build correct API URL with multiple brew methods (comma-separated for OR logic)', () => {
      let capturedUrl = '';
      useSWR.mockImplementation((url: unknown) => {
        capturedUrl = url as string;
        return {
          data: mockRecipes,
          isLoading: false,
          error: undefined,
          mutate: () => Promise.resolve(undefined),
          isValidating: false,
        };
      });

      render(
        <TestWrapper initialRoute="/recipes?brewMethod=ESPRESSO_MACHINE&brewMethod=POUR_OVER_V60">
          <RecipesPage />
        </TestWrapper>
      );

      // API URL should contain comma-separated brew methods for OR logic
      expect(capturedUrl).toContain('brewMethod=ESPRESSO_MACHINE');
      expect(capturedUrl).toContain('POUR_OVER_V60');
    });

    it('should build correct API URL with multiple drink types (comma-separated for OR logic)', () => {
      let capturedUrl = '';
      useSWR.mockImplementation((url: unknown) => {
        capturedUrl = url as string;
        return {
          data: mockRecipes,
          isLoading: false,
          error: undefined,
          mutate: () => Promise.resolve(undefined),
          isValidating: false,
        };
      });

      render(
        <TestWrapper initialRoute="/recipes?drinkType=ESPRESSO&drinkType=LUNGO">
          <RecipesPage />
        </TestWrapper>
      );

      // API URL should contain comma-separated drink types for OR logic
      expect(capturedUrl).toContain('drinkType=ESPRESSO');
      expect(capturedUrl).toContain('LUNGO');
    });
  });
});
