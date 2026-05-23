import { createBrowserRouter } from 'react-router';
import { Layout } from './components/layout/Layout.tsx';
import { RequireAuth } from './components/auth/RequireAuth.tsx';

// Eagerly loaded: high-traffic public pages and lightweight auth pages
import { HomePage } from './pages/HomePage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { LoginPage } from './pages/auth/LoginPage.tsx';
import { RegisterPage } from './pages/auth/RegisterPage.tsx';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage.tsx';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage.tsx';
import { RecipeListPage } from './pages/recipes/RecipeListPage.tsx';
import { StarredRecipesPage } from './pages/recipes/StarredRecipesPage.tsx';
import { RecipeDetailPage } from './pages/recipes/RecipeDetailPage.tsx';
import { RecipeVersionsPage } from './pages/recipes/RecipeVersionsPage.tsx';
import { RecipeFocusModePage } from './pages/recipes/RecipeFocusModePage.tsx';
import { RecipeNotAvailablePage } from './pages/recipes/RecipeNotAvailablePage.tsx';
import { UserProfilePage } from './pages/users/UserProfilePage.tsx';
import { SetupListPage } from './pages/setups/SetupListPage.tsx';
import { BeanListPage } from './pages/beans/BeanListPage.tsx';
import { EquipmentListPage } from './pages/equipment/EquipmentListPage.tsx';
import { TasteNotesPage } from './pages/TasteNotesPage.tsx';
import { OnboardingWizard } from './components/onboarding/OnboardingWizard.tsx';
import { PrivacyPage } from './pages/PrivacyPage.tsx';
import { TermsPage } from './pages/TermsPage.tsx';
import { RootErrorBoundary } from './components/ErrorBoundary.tsx';
import { VerifyEmailPage } from './pages/auth/VerifyEmailPage.tsx';
import { ContactPage } from './pages/ContactPage.tsx';

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
          const { RecipeCreatePage } = await import('./pages/recipes/RecipeCreatePage.tsx');
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
          const { RecipeComparePage } = await import('./pages/recipes/RecipeComparePage.tsx');
          return { Component: RecipeComparePage };
        },
      },
      { path: 'recipes/:slug/versions', element: <RecipeVersionsPage /> },
      { path: 'recipes/:slug', element: <RecipeDetailPage /> },
      { path: 'recipes/:slug/focus', element: <RecipeFocusModePage /> },
      {
        path: 'recipes/:id/edit',
        lazy: async () => {
          const { RecipeEditPage } = await import('./pages/recipes/RecipeEditPage.tsx');
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
          const { SettingsPage } = await import('./pages/settings/SettingsPage.tsx');
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
      { path: 'contact', element: <ContactPage /> },
      { path: 'privacy', element: <PrivacyPage /> },
      { path: 'terms', element: <TermsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    path: '/admin',
    lazy: async () => {
      const { AdminLayout } = await import('./pages/admin/AdminLayout.tsx');
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
          const { AdminDashboard } = await import('./pages/admin/AdminDashboard.tsx');
          return { Component: AdminDashboard };
        },
      },
      {
        path: 'users',
        lazy: async () => {
          const { AdminUsersPage } = await import('./pages/admin/AdminUsersPage.tsx');
          return { Component: AdminUsersPage };
        },
      },
      {
        path: 'users/new',
        lazy: async () => {
          const { AdminUserCreatePage } = await import('./pages/admin/AdminUserCreatePage.tsx');
          return { Component: AdminUserCreatePage };
        },
      },
      {
        path: 'users/:id',
        lazy: async () => {
          const { AdminUserDetailPage } = await import('./pages/admin/AdminUserDetailPage.tsx');
          return { Component: AdminUserDetailPage };
        },
      },
      {
        path: 'users/:id/edit',
        lazy: async () => {
          const { AdminUserEditPage } = await import('./pages/admin/AdminUserEditPage.tsx');
          return { Component: AdminUserEditPage };
        },
      },
      {
        path: 'recipes',
        lazy: async () => {
          const { AdminRecipesPage } = await import('./pages/admin/AdminRecipesPage.tsx');
          return { Component: AdminRecipesPage };
        },
      },
      {
        path: 'equipment',
        lazy: async () => {
          const { AdminEquipmentPage } = await import('./pages/admin/AdminEquipmentPage.tsx');
          return { Component: AdminEquipmentPage };
        },
      },
      {
        path: 'vendors',
        lazy: async () => {
          const { AdminVendorsPage } = await import('./pages/admin/AdminVendorsPage.tsx');
          return { Component: AdminVendorsPage };
        },
      },
      {
        path: 'taste-notes',
        lazy: async () => {
          const { AdminTasteNotesPage } = await import('./pages/admin/AdminTasteNotesPage.tsx');
          return { Component: AdminTasteNotesPage };
        },
      },
      {
        path: 'compatibility',
        lazy: async () => {
          const { AdminCompatibilityPage } = await import(
            './pages/admin/AdminCompatibilityPage.tsx'
          );
          return { Component: AdminCompatibilityPage };
        },
      },
      {
        path: 'badges',
        lazy: async () => {
          const { AdminBadgesPage } = await import('./pages/admin/AdminBadgesPage.tsx');
          return { Component: AdminBadgesPage };
        },
      },
      {
        path: 'audit-log',
        lazy: async () => {
          const { AdminAuditLogPage } = await import('./pages/admin/AdminAuditLogPage.tsx');
          return { Component: AdminAuditLogPage };
        },
      },
      {
        path: 'cache',
        lazy: async () => {
          const { AdminCachePage } = await import('./pages/admin/AdminCachePage.tsx');
          return { Component: AdminCachePage };
        },
      },
    ],
  },
]);
