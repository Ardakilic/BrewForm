/**
 * Shared test utilities for frontend tests
 */

import type React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { Client as Styletron } from 'styletron-engine-monolithic';
import { Provider as StyletronProvider } from 'styletron-react';
import { BaseProvider, LightTheme } from 'baseui';
import { SnackbarProvider } from 'baseui/snackbar';
import { I18nextProvider } from 'react-i18next';
import i18n from '../i18n';
import { AuthProvider } from '../contexts/AuthContext';

const engine = new Styletron();

interface WrapperProps {
  children: React.ReactNode;
  initialEntries?: string[];
}

export function TestWrapper({ children, initialEntries = ['/'] }: WrapperProps) {
  return (
    <HelmetProvider>
      <StyletronProvider value={engine}>
        <BaseProvider theme={LightTheme}>
          <SnackbarProvider>
            <I18nextProvider i18n={i18n}>
              <AuthProvider>
                <MemoryRouter initialEntries={initialEntries}>
                  {children}
                </MemoryRouter>
              </AuthProvider>
            </I18nextProvider>
          </SnackbarProvider>
        </BaseProvider>
      </StyletronProvider>
    </HelmetProvider>
  );
}

export function renderWithProviders(
  ui: React.ReactElement,
  { initialEntries = ['/'] }: { initialEntries?: string[] } = {}
) {
  return render(ui, {
    wrapper: ({ children }) => (
      <TestWrapper initialEntries={initialEntries}>{children}</TestWrapper>
    ),
  });
}

export const mockUser = {
  id: 'user_1',
  email: 'test@example.com',
  username: 'testuser',
  displayName: 'Test User',
  isAdmin: false,
};

export const mockAdminUser = {
  ...mockUser,
  id: 'admin_1',
  username: 'admin',
  isAdmin: true,
};

export const mockRecipe = {
  id: 'recipe_1',
  slug: 'test-recipe',
  visibility: 'PUBLIC',
  commentCount: 0,
  favouriteCount: 0,
  currentVersion: {
    id: 'version_1',
    title: 'Test Recipe',
    description: 'A test recipe',
    brewMethod: 'ESPRESSO_MACHINE',
    drinkType: 'ESPRESSO',
    doseGrams: 18,
    yieldGrams: 36,
    brewTimeSec: 28,
    rating: 8,
    tags: ['test', 'espresso'],
  },
  user: {
    id: 'user_1',
    username: 'testuser',
    displayName: 'Test User',
  },
};

export const mockUserProfile = {
  id: 'user_1',
  username: 'testuser',
  displayName: 'Test User',
  bio: 'Coffee enthusiast',
  website: null,
  preferredUnits: 'METRIC' as const,
  recipeCount: 5,
};
