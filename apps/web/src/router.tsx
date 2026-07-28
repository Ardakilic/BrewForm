import { createBrowserRouter, Navigate } from 'react-router';
import { Layout } from './components/layout/Layout.tsx';
import { RequireAuth } from './components/auth/RequireAuth.tsx';

// Eagerly loaded: high-traffic public pages and lightweight auth pages
import { HomePage, loader as homeLoader } from './pages/HomePage.tsx';
import { NotFoundPage } from './pages/ErrorPage.tsx';
import { LoginPage } from './pages/auth/LoginPage.tsx';
import { RegisterPage } from './pages/auth/RegisterPage.tsx';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage.tsx';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage.tsx';
import { loader as recipeListLoader, RecipeListPage } from './pages/recipes/RecipeListPage.tsx';
import {
  loader as starredLoader,
  StarredRecipesPage,
} from './pages/recipes/StarredRecipesPage.tsx';
import { loader as detailLoader, RecipeDetailPage } from './pages/recipes/RecipeDetailPage.tsx';
import {
  CollectionListPage,
  loader as collectionListLoader,
} from './pages/collections/CollectionListPage.tsx';
import {
  CollectionDetailPage,
  loader as collectionDetailLoader,
} from './pages/collections/CollectionDetailPage.tsx';
import { CollectionCreatePage } from './pages/collections/CollectionCreatePage.tsx';
import {
  CollectionEditPage,
  loader as collectionEditLoader,
} from './pages/collections/CollectionEditPage.tsx';
import {
  CollectionsBrowsePage,
  loader as collectionsBrowseLoader,
} from './pages/collections/CollectionsBrowsePage.tsx';
import { RecipeVersionsPage } from './pages/recipes/RecipeVersionsPage.tsx';
import { RecipeFocusModePage } from './pages/recipes/RecipeFocusModePage.tsx';
import { RecipeNotAvailablePage } from './pages/recipes/RecipeNotAvailablePage.tsx';
import { loader as profileLoader, UserProfilePage } from './pages/users/UserProfilePage.tsx';
import { loader as settingsLoader, SettingsPage } from './pages/settings/SettingsPage.tsx';
import {
  loader as notificationListLoader,
  NotificationListPage,
} from './pages/notifications/NotificationListPage.tsx';
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

// Resource route actions
import { likeAction } from './routes/like.ts';
import { favouriteAction } from './routes/favourite.ts';
import { rateAction } from './routes/rate.ts';
import { followAction } from './routes/follow.ts';
import { createCommentAction, deleteCommentAction, listCommentsLoader } from './routes/comments.ts';

/** Application browser router — declares all routes, loaders, and resource-route actions. */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    errorElement: <RootErrorBoundary />,
    children: [
      {
        index: true,
        element: <HomePage />,
        loader: homeLoader,
        errorElement: <RootErrorBoundary />,
      },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'forgot-password', element: <ForgotPasswordPage /> },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      { path: 'verify-email', element: <VerifyEmailPage /> },
      {
        path: 'recipes',
        loader: recipeListLoader,
        element: <RecipeListPage />,
        errorElement: <RootErrorBoundary />,
      },
      {
        path: 'recipes/starred',
        element: (
          <RequireAuth>
            <StarredRecipesPage />
          </RequireAuth>
        ),
        loader: starredLoader,
        errorElement: <RootErrorBoundary />,
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
        path: 'recipes/compare/:slug1/:slug2',
        lazy: async () => {
          const { RecipeComparePage } = await import('./pages/recipes/RecipeComparePage.tsx');
          return { Component: RecipeComparePage };
        },
      },
      {
        path: 'recipes/:slug/versions/diff',
        lazy: async () => {
          const { VersionDiffPage } = await import('./pages/recipes/VersionDiffPage.tsx');
          return { Component: VersionDiffPage };
        },
      },
      { path: 'recipes/:slug/versions', element: <RecipeVersionsPage /> },
      {
        path: 'recipes/:slug',
        element: <RecipeDetailPage />,
        loader: detailLoader,
        errorElement: <RootErrorBoundary />,
      },
      {
        path: 'collections',
        element: (
          <RequireAuth>
            <CollectionListPage />
          </RequireAuth>
        ),
        loader: collectionListLoader,
        errorElement: <RootErrorBoundary />,
      },
      {
        path: 'collections/browse',
        element: <CollectionsBrowsePage />,
        loader: collectionsBrowseLoader,
        errorElement: <RootErrorBoundary />,
      },
      {
        path: 'collections/new',
        element: (
          <RequireAuth>
            <CollectionCreatePage />
          </RequireAuth>
        ),
        errorElement: <RootErrorBoundary />,
      },
      {
        path: 'collections/:id',
        element: <CollectionDetailPage />,
        loader: collectionDetailLoader,
        errorElement: <RootErrorBoundary />,
      },
      {
        path: 'collections/:id/edit',
        element: (
          <RequireAuth>
            <CollectionEditPage />
          </RequireAuth>
        ),
        loader: collectionEditLoader,
        errorElement: <RootErrorBoundary />,
      },
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
      {
        path: 'recipes/:id/fork',
        lazy: async () => {
          const { RecipeForkPage } = await import('./pages/recipes/RecipeForkPage.tsx');
          return {
            Component: function RecipeForkPageGuarded() {
              return (
                <RequireAuth>
                  <RecipeForkPage />
                </RequireAuth>
              );
            },
          };
        },
      },
      {
        path: 'u/:username',
        element: <UserProfilePage />,
        loader: profileLoader,
        errorElement: <RootErrorBoundary />,
      },
      {
        path: 'settings',
        element: (
          <RequireAuth>
            <SettingsPage />
          </RequireAuth>
        ),
        loader: settingsLoader,
        errorElement: <RootErrorBoundary />,
      },
      {
        path: 'notifications',
        element: (
          <RequireAuth>
            <NotificationListPage />
          </RequireAuth>
        ),
        loader: notificationListLoader,
        errorElement: <RootErrorBoundary />,
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
      {
        path: 'equipments',
        lazy: async () => {
          const { EquipmentCatalogPage } = await import(
            './pages/equipment/EquipmentCatalogPage.tsx'
          );
          return { Component: EquipmentCatalogPage };
        },
      },
      {
        path: 'equipment/catalog',
        element: <Navigate to='/equipments' replace />,
      },
      {
        path: 'equipment/:id',
        lazy: async () => {
          const { EquipmentDetailPage } = await import('./pages/equipment/EquipmentDetailPage.tsx');
          return { Component: EquipmentDetailPage };
        },
      },
      {
        path: 'coffee-varieties',
        lazy: async () => {
          const { CoffeeVarietiesPage } = await import(
            './pages/coffee-varieties/CoffeeVarietiesPage.tsx'
          );
          return { Component: CoffeeVarietiesPage };
        },
      },
      {
        path: 'coffee-varieties/:id',
        lazy: async () => {
          const { CoffeeVarietyDetailPage } = await import(
            './pages/coffee-varieties/CoffeeVarietyDetailPage.tsx'
          );
          return { Component: CoffeeVarietyDetailPage };
        },
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

      // Resource routes (action-only, no element):
      { path: 'recipes/:id/like', action: likeAction },
      { path: 'recipes/:id/favourite', action: favouriteAction },
      { path: 'recipes/:id/rate', action: rateAction },
      { path: 'follow/:userId', action: followAction },
      {
        path: 'comments/recipe/:recipeId',
        loader: listCommentsLoader,
        action: createCommentAction,
      },
      { path: 'comments/:id', action: deleteCommentAction },

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
        path: 'coffee-varieties',
        lazy: async () => {
          const { AdminCoffeeVarietiesPage } = await import(
            './pages/admin/AdminCoffeeVarietiesPage.tsx'
          );
          return { Component: AdminCoffeeVarietiesPage };
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
