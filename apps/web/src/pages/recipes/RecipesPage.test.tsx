/**
 * RecipesPage Tests - Filtering Functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { Client as Styletron } from 'styletron-engine-monolithic';
import { Provider as StyletronProvider } from 'styletron-react';
import { BaseProvider, LightTheme } from 'baseui';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n';
import RecipesPage from './RecipesPage';
import { AuthProvider } from '../../contexts/AuthContext';

// Mock SWR
vi.mock('swr', () => ({
  default: vi.fn(),
}));

import useSWR from 'swr';

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
    vi.clearAllMocks();
  });

  describe('Initial URL params', () => {
    it('should load with single tag filter from URL', () => {
      vi.mocked(useSWR).mockReturnValue({
        data: mockRecipes,
        isLoading: false,
        error: undefined,
        mutate: vi.fn(),
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
      vi.mocked(useSWR).mockReturnValue({
        data: mockRecipes,
        isLoading: false,
        error: undefined,
        mutate: vi.fn(),
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

    it('should load with brew method filter from URL', () => {
      vi.mocked(useSWR).mockReturnValue({
        data: mockRecipes,
        isLoading: false,
        error: undefined,
        mutate: vi.fn(),
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

    it('should load with drink type filter from URL', () => {
      vi.mocked(useSWR).mockReturnValue({
        data: mockRecipes,
        isLoading: false,
        error: undefined,
        mutate: vi.fn(),
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

    it('should load with combined filters from URL', () => {
      vi.mocked(useSWR).mockReturnValue({
        data: mockRecipes,
        isLoading: false,
        error: undefined,
        mutate: vi.fn(),
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
      vi.mocked(useSWR).mockReturnValue({
        data: mockRecipes,
        isLoading: false,
        error: undefined,
        mutate: vi.fn(),
        isValidating: false,
      });

      render(
        <TestWrapper initialRoute="/recipes?tags=chocolatey&tags=fruity">
          <RecipesPage />
        </TestWrapper>
      );

      // Both tags should be present initially
      expect(screen.getByText('#Chocolatey')).toBeInTheDocument();
      expect(screen.getByText('#Fruity')).toBeInTheDocument();

      // Find and click the close button for chocolatey tag
      const chocolateTag = screen.getByText('#Chocolatey').closest('[data-baseweb="tag"]');
      const closeButton = chocolateTag?.querySelector('[aria-label="close"]') || 
                         chocolateTag?.querySelector('svg')?.parentElement;
      
      if (closeButton) {
        fireEvent.click(closeButton);
      }

      // After removal, chocolatey should be gone but fruity remains
      await waitFor(() => {
        expect(screen.queryByText('#Chocolatey')).not.toBeInTheDocument();
      });
      expect(screen.getByText('#Fruity')).toBeInTheDocument();
    });

    it('should clear all filters when clicking Clear All', async () => {
      vi.mocked(useSWR).mockReturnValue({
        data: mockRecipes,
        isLoading: false,
        error: undefined,
        mutate: vi.fn(),
        isValidating: false,
      });

      render(
        <TestWrapper initialRoute="/recipes?tags=chocolatey&tags=fruity&brewMethod=ESPRESSO_MACHINE">
          <RecipesPage />
        </TestWrapper>
      );

      // Find and click Clear All button
      const clearAllButtons = screen.getAllByRole('button', { name: /clear all/i });
      fireEvent.click(clearAllButtons[0]);

      // All filters should be removed
      await waitFor(() => {
        expect(screen.queryByText('#Chocolatey')).not.toBeInTheDocument();
        expect(screen.queryByText('#Fruity')).not.toBeInTheDocument();
      });
    });
  });

  describe('Recipe display', () => {
    it('should display recipes when loaded', () => {
      vi.mocked(useSWR).mockReturnValue({
        data: mockRecipes,
        isLoading: false,
        error: undefined,
        mutate: vi.fn(),
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
      vi.mocked(useSWR).mockReturnValue({
        data: undefined,
        isLoading: true,
        error: undefined,
        mutate: vi.fn(),
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
      vi.mocked(useSWR).mockReturnValue({
        data: [],
        isLoading: false,
        error: undefined,
        mutate: vi.fn(),
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
      vi.mocked(useSWR).mockImplementation(((url: unknown) => {
        capturedUrl = url as string;
        return {
          data: mockRecipes,
          isLoading: false,
          error: undefined,
          mutate: vi.fn(),
          isValidating: false,
        };
      }) as typeof useSWR);

      render(
        <TestWrapper initialRoute="/recipes?tags=chocolatey&tags=fruity">
          <RecipesPage />
        </TestWrapper>
      );

      // API URL should contain comma-separated tags
      expect(capturedUrl).toContain('tags=chocolatey');
    });

    it('should build correct API URL with brew method', () => {
      let capturedUrl = '';
      vi.mocked(useSWR).mockImplementation(((url: unknown) => {
        capturedUrl = url as string;
        return {
          data: mockRecipes,
          isLoading: false,
          error: undefined,
          mutate: vi.fn(),
          isValidating: false,
        };
      }) as typeof useSWR);

      render(
        <TestWrapper initialRoute="/recipes?brewMethod=ESPRESSO_MACHINE">
          <RecipesPage />
        </TestWrapper>
      );

      expect(capturedUrl).toContain('brewMethod=ESPRESSO_MACHINE');
    });
  });
});
