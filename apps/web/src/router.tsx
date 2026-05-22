import { createBrowserRouter } from 'react-router';
import { Layout } from './components/layout/Layout';
import { RequireAuth } from './components/auth/RequireAuth';

// Eagerly loaded: high-traffic public pages and lightweight auth pages
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';
import { RecipeListPage } from './pages/recipes/RecipeListPage';
import { StarredRecipesPage } from './pages/recipes/StarredRecipesPage';
import { RecipeDetailPage } from './pages/recipes/RecipeDetailPage';
import { RecipeFocusModePage } from './pages/recipes/RecipeFocusModePage';
import { RecipeNotAvailablePage } from './pages/recipes/RecipeNotAvailablePage';
import { UserProfilePage } from './pages/users/UserProfilePage';
import { SetupListPage } from './pages/setups/SetupListPage';
import { BeanListPage } from './pages/beans/BeanListPage';
import { EquipmentListPage } from './pages/equipment/EquipmentListPage';
import { TasteNotesPage } from './pages/TasteNotesPage';
import { OnboardingWizard } from './components/onboarding/OnboardingWizard';
import { PrivacyPage } from './pages/PrivacyPage';
import { TermsPage } from './pages/TermsPage';
import { RootErrorBoundary } from './components/ErrorBoundary';
import { VerifyEmailPage } from './pages/auth/VerifyEmailPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    errorElement: <RootErrorBoundary />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'forgot-password', element: <ForgotPasswordPage /> },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      { path: 'verify-email', element: <VerifyEmailPage /> },
      { path: 'recipes', element: <RecipeListPage /> },
      {
        path: 'recipes/starred',
        element: (
          <RequireAuth>
            <StarredRecipesPage />
          </RequireAuth>
        ),
      },
      { path: 'recipes/unavailable', element: <RecipeNotAvailablePage /> },
      {
        path: 'recipes/new',
        lazy: async () => {
          const { RecipeCreatePage } = await import('./pages/recipes/RecipeCreatePage');
          return {
            Component: function RecipeCreatePageGuarded() {
              return (
                <RequireAuth>
                  <RecipeCreatePage />
                </RequireAuth>
              );
            },
          };
        },
      },
      {
        path: 'recipes/compare/:id1/:id2',
        lazy: async () => {
          const { RecipeComparePage } = await import('./pages/recipes/RecipeComparePage');
          return { Component: RecipeComparePage };
        },
      },
      { path: 'recipes/:slug', element: <RecipeDetailPage /> },
      { path: 'recipes/:slug/focus', element: <RecipeFocusModePage /> },
      {
        path: 'recipes/:id/edit',
        lazy: async () => {
          const { RecipeEditPage } = await import('./pages/recipes/RecipeEditPage');
          return {
            Component: function RecipeEditPageGuarded() {
              return (
                <RequireAuth>
                  <RecipeEditPage />
                </RequireAuth>
              );
            },
          };
        },
      },
      { path: 'u/:username', element: <UserProfilePage /> },
      {
        path: 'settings',
        lazy: async () => {
          const { SettingsPage } = await import('./pages/settings/SettingsPage');
          return {
            Component: function SettingsPageGuarded() {
              return (
                <RequireAuth>
                  <SettingsPage />
                </RequireAuth>
              );
            },
          };
        },
      },
      {
        path: 'setups',
        element: (
          <RequireAuth>
            <SetupListPage />
          </RequireAuth>
        ),
      },
      {
        path: 'beans',
        element: (
          <RequireAuth>
            <BeanListPage />
          </RequireAuth>
        ),
      },
      {
        path: 'equipment',
        element: (
          <RequireAuth>
            <EquipmentListPage />
          </RequireAuth>
        ),
      },
      { path: 'taste-notes', element: <TasteNotesPage /> },
      {
        path: 'onboarding',
        element: (
          <RequireAuth>
            <OnboardingWizard />
          </RequireAuth>
        ),
      },
      { path: 'privacy', element: <PrivacyPage /> },
      { path: 'terms', element: <TermsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    path: '/admin',
    lazy: async () => {
      const { AdminLayout } = await import('./pages/admin/AdminLayout');
      return {
        Component: function AdminLayoutGuarded() {
          return (
            <RequireAuth requireAdmin>
              <AdminLayout />
            </RequireAuth>
          );
        },
      };
    },
    errorElement: <RootErrorBoundary />,
    children: [
      {
        index: true,
        lazy: async () => {
          const { AdminDashboard } = await import('./pages/admin/AdminDashboard');
          return { Component: AdminDashboard };
        },
      },
      {
        path: 'users',
        lazy: async () => {
          const { AdminUsersPage } = await import('./pages/admin/AdminUsersPage');
          return { Component: AdminUsersPage };
        },
      },
      {
        path: 'users/new',
        lazy: async () => {
          const { AdminUserCreatePage } = await import('./pages/admin/AdminUserCreatePage');
          return { Component: AdminUserCreatePage };
        },
      },
      {
        path: 'users/:id',
        lazy: async () => {
          const { AdminUserDetailPage } = await import('./pages/admin/AdminUserDetailPage');
          return { Component: AdminUserDetailPage };
        },
      },
      {
        path: 'users/:id/edit',
        lazy: async () => {
          const { AdminUserEditPage } = await import('./pages/admin/AdminUserEditPage');
          return { Component: AdminUserEditPage };
        },
      },
      {
        path: 'recipes',
        lazy: async () => {
          const { AdminRecipesPage } = await import('./pages/admin/AdminRecipesPage');
          return { Component: AdminRecipesPage };
        },
      },
      {
        path: 'equipment',
        lazy: async () => {
          const { AdminEquipmentPage } = await import('./pages/admin/AdminEquipmentPage');
          return { Component: AdminEquipmentPage };
        },
      },
      {
        path: 'vendors',
        lazy: async () => {
          const { AdminVendorsPage } = await import('./pages/admin/AdminVendorsPage');
          return { Component: AdminVendorsPage };
        },
      },
      {
        path: 'taste-notes',
        lazy: async () => {
          const { AdminTasteNotesPage } = await import('./pages/admin/AdminTasteNotesPage');
          return { Component: AdminTasteNotesPage };
        },
      },
      {
        path: 'compatibility',
        lazy: async () => {
          const { AdminCompatibilityPage } = await import('./pages/admin/AdminCompatibilityPage');
          return { Component: AdminCompatibilityPage };
        },
      },
      {
        path: 'badges',
        lazy: async () => {
          const { AdminBadgesPage } = await import('./pages/admin/AdminBadgesPage');
          return { Component: AdminBadgesPage };
        },
      },
      {
        path: 'audit-log',
        lazy: async () => {
          const { AdminAuditLogPage } = await import('./pages/admin/AdminAuditLogPage');
          return { Component: AdminAuditLogPage };
        },
      },
      {
        path: 'cache',
        lazy: async () => {
          const { AdminCachePage } = await import('./pages/admin/AdminCachePage');
          return { Component: AdminCachePage };
        },
      },
    ],
  },
]);
