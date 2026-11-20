import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { RequireAuth } from './components/auth/RequireAuth.tsx';
import { RootErrorBoundary } from './components/ErrorBoundary.tsx';
import { Layout } from './components/layout/Layout.tsx';
import {
  action as onboardingAction,
  loader as onboardingLoader,
} from './components/onboarding/OnboardingWizard.data.ts';
import { OnboardingWizard } from './components/onboarding/OnboardingWizard.tsx';
import { RouteErrorState } from './components/RouteErrorState.tsx';
import { action as forgotPasswordAction } from './pages/auth/ForgotPasswordPage.data.ts';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage.tsx';
import { LoginPage } from './pages/auth/LoginPage.tsx';
import { RegisterPage } from './pages/auth/RegisterPage.tsx';
import { action as resetPasswordAction } from './pages/auth/ResetPasswordPage.data.ts';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage.tsx';
import {
  shouldRevalidate as shouldRevalidateVerifyEmail,
  loader as verifyEmailLoader,
} from './pages/auth/VerifyEmailPage.data.ts';
import { VerifyEmailPage, VerifyEmailPending } from './pages/auth/VerifyEmailPage.tsx';
import { BeanListPage } from './pages/beans/BeanListPage.tsx';
import {
  BrewLogFormPage,
  loader as brewLogFormLoader,
} from './pages/brew-logs/BrewLogFormPage.tsx';
import {
  BrewLogListPage,
  loader as brewLogListLoader,
} from './pages/brew-logs/BrewLogListPage.tsx';
import { action as contactAction } from './pages/ContactPage.data.ts';
import { ContactPage } from './pages/ContactPage.tsx';
import { CollectionCreatePage } from './pages/collections/CollectionCreatePage.tsx';
import {
  CollectionDetailPage,
  loader as collectionDetailLoader,
} from './pages/collections/CollectionDetailPage.tsx';
import {
  CollectionEditPage,
  loader as collectionEditLoader,
} from './pages/collections/CollectionEditPage.tsx';
import {
  CollectionListPage,
  loader as collectionListLoader,
} from './pages/collections/CollectionListPage.tsx';
import {
  CollectionsBrowsePage,
  loader as collectionsBrowseLoader,
} from './pages/collections/CollectionsBrowsePage.tsx';
import { NotFoundPage } from './pages/ErrorPage.tsx';
import { EquipmentListPage } from './pages/equipment/EquipmentListPage.tsx';
// Eagerly loaded: high-traffic public pages and lightweight auth pages
import { HomePage, loader as homeLoader } from './pages/HomePage.tsx';
import {
  NotificationListPage,
  loader as notificationListLoader,
} from './pages/notifications/NotificationListPage.tsx';
import { PrivacyPage } from './pages/PrivacyPage.tsx';
import { loader as detailLoader, RecipeDetailPage } from './pages/recipes/RecipeDetailPage.tsx';
import { RecipeFocusModePage } from './pages/recipes/RecipeFocusModePage.tsx';
import { RecipeListPage, loader as recipeListLoader } from './pages/recipes/RecipeListPage.tsx';
import { RecipeNotAvailablePage } from './pages/recipes/RecipeNotAvailablePage.tsx';
import { RecipeVersionsPage } from './pages/recipes/RecipeVersionsPage.tsx';
import {
  StarredRecipesPage,
  loader as starredLoader,
} from './pages/recipes/StarredRecipesPage.tsx';
import {
  action as settingsAction,
  loader as settingsLoader,
} from './pages/settings/SettingsPage.data.ts';
import { SettingsPage } from './pages/settings/SettingsPage.tsx';
import { SetupListPage } from './pages/setups/SetupListPage.tsx';
import { TasteNotesPage } from './pages/TasteNotesPage.tsx';
import { TermsPage } from './pages/TermsPage.tsx';
import { loader as profileLoader, UserProfilePage } from './pages/users/UserProfilePage.tsx';
import { createCommentAction, deleteCommentAction, listCommentsLoader } from './routes/comments.ts';
import { favouriteAction } from './routes/favourite.ts';
import { followAction } from './routes/follow.ts';
// Resource route actions
import { likeAction } from './routes/like.ts';
import { rateAction } from './routes/rate.ts';
import { sendVerificationAction } from './routes/resources/auth.ts';
import { ROOT_ROUTE_ID, rootLoader, shouldRevalidateRoot } from './routes/root.ts';

/**
 * The application route tree: every page route, loader and resource-route action.
 * Exported as plain data so tests (the router smoke test) can render it through
 * `createMemoryRouter`; importing this module does not start a router.
 */
export const routes: RouteObject[] = [
  {
    id: ROOT_ROUTE_ID,
    path: '/',
    element: <Layout />,
    loader: rootLoader,
    shouldRevalidate: shouldRevalidateRoot,
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
      { path: 'forgot-password', element: <ForgotPasswordPage />, action: forgotPasswordAction },
      { path: 'reset-password', element: <ResetPasswordPage />, action: resetPasswordAction },
      {
        path: 'verify-email',
        element: <VerifyEmailPage />,
        loader: verifyEmailLoader,
        shouldRevalidate: shouldRevalidateVerifyEmail,
        HydrateFallback: VerifyEmailPending,
        errorElement: <RouteErrorState />,
      },
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
            element: (
              <RequireAuth>
                <RecipeCreatePage />
              </RequireAuth>
            ),
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
      {
        path: 'brew-logs',
        element: (
          <RequireAuth>
            <BrewLogListPage />
          </RequireAuth>
        ),
        loader: brewLogListLoader,
        errorElement: <RootErrorBoundary />,
      },
      {
        path: 'brew-logs/new',
        element: (
          <RequireAuth>
            <BrewLogFormPage />
          </RequireAuth>
        ),
        loader: brewLogFormLoader,
        errorElement: <RootErrorBoundary />,
      },
      {
        path: 'brew-logs/:id/edit',
        element: (
          <RequireAuth>
            <BrewLogFormPage />
          </RequireAuth>
        ),
        loader: brewLogFormLoader,
        errorElement: <RootErrorBoundary />,
      },
      { path: 'recipes/:slug/focus', element: <RecipeFocusModePage /> },
      {
        path: 'recipes/:id/edit',
        lazy: async () => {
          const { RecipeEditPage } = await import('./pages/recipes/RecipeEditPage.tsx');
          return {
            element: (
              <RequireAuth>
                <RecipeEditPage />
              </RequireAuth>
            ),
          };
        },
      },
      {
        path: 'recipes/:id/fork',
        lazy: async () => {
          const { RecipeForkPage } = await import('./pages/recipes/RecipeForkPage.tsx');
          return {
            element: (
              <RequireAuth>
                <RecipeForkPage />
              </RequireAuth>
            ),
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
        action: settingsAction,
        errorElement: <RouteErrorState />,
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
        element: <Navigate to="/equipments" replace />,
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
        loader: onboardingLoader,
        action: onboardingAction,
        errorElement: <RouteErrorState />,
      },
      { path: 'contact', element: <ContactPage />, action: contactAction },
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
      { path: 'resources/auth/send-verification', action: sendVerificationAction },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    path: '/admin',
    lazy: async () => {
      const { AdminLayout } = await import('./pages/admin/AdminLayout.tsx');
      return {
        element: (
          <RequireAuth requireAdmin>
            <AdminLayout />
          </RequireAuth>
        ),
      };
    },
    errorElement: <RootErrorBoundary />,
    children: [
      {
        index: true,
        lazy: {
          loader: async () => (await import('./pages/admin/AdminDashboard.data.ts')).loader,
          Component: async () => (await import('./pages/admin/AdminDashboard.tsx')).AdminDashboard,
        },
        errorElement: <RouteErrorState />,
      },
      {
        path: 'users',
        lazy: {
          loader: async () => (await import('./pages/admin/AdminUsersPage.data.ts')).loader,
          action: async () => (await import('./pages/admin/AdminUsersPage.data.ts')).action,
          Component: async () => (await import('./pages/admin/AdminUsersPage.tsx')).AdminUsersPage,
        },
        errorElement: <RouteErrorState />,
      },
      {
        path: 'users/new',
        lazy: {
          action: async () => (await import('./pages/admin/AdminUserCreatePage.data.ts')).action,
          Component: async () =>
            (await import('./pages/admin/AdminUserCreatePage.tsx')).AdminUserCreatePage,
        },
        errorElement: <RouteErrorState />,
      },
      {
        path: 'users/:id',
        lazy: {
          loader: async () => (await import('./pages/admin/AdminUserDetailPage.data.ts')).loader,
          action: async () => (await import('./pages/admin/AdminUserDetailPage.data.ts')).action,
          Component: async () =>
            (await import('./pages/admin/AdminUserDetailPage.tsx')).AdminUserDetailPage,
        },
        errorElement: <RouteErrorState />,
      },
      {
        path: 'users/:id/edit',
        lazy: {
          loader: async () => (await import('./pages/admin/AdminUserEditPage.data.ts')).loader,
          action: async () => (await import('./pages/admin/AdminUserEditPage.data.ts')).action,
          Component: async () =>
            (await import('./pages/admin/AdminUserEditPage.tsx')).AdminUserEditPage,
        },
        errorElement: <RouteErrorState />,
      },
      {
        path: 'recipes',
        lazy: {
          loader: async () => (await import('./pages/admin/AdminRecipesPage.data.ts')).loader,
          action: async () => (await import('./pages/admin/AdminRecipesPage.data.ts')).action,
          Component: async () =>
            (await import('./pages/admin/AdminRecipesPage.tsx')).AdminRecipesPage,
        },
        errorElement: <RouteErrorState />,
      },
      {
        path: 'equipment',
        lazy: {
          loader: async () => (await import('./pages/admin/AdminEquipmentPage.data.ts')).loader,
          action: async () => (await import('./pages/admin/AdminEquipmentPage.data.ts')).action,
          Component: async () =>
            (await import('./pages/admin/AdminEquipmentPage.tsx')).AdminEquipmentPage,
        },
        errorElement: <RouteErrorState />,
      },
      {
        path: 'vendors',
        lazy: {
          loader: async () => (await import('./pages/admin/AdminVendorsPage.data.ts')).loader,
          action: async () => (await import('./pages/admin/AdminVendorsPage.data.ts')).action,
          Component: async () =>
            (await import('./pages/admin/AdminVendorsPage.tsx')).AdminVendorsPage,
        },
        errorElement: <RouteErrorState />,
      },
      {
        path: 'taste-notes',
        lazy: {
          loader: async () => (await import('./pages/admin/AdminTasteNotesPage.data.ts')).loader,
          action: async () => (await import('./pages/admin/AdminTasteNotesPage.data.ts')).action,
          Component: async () =>
            (await import('./pages/admin/AdminTasteNotesPage.tsx')).AdminTasteNotesPage,
        },
        errorElement: <RouteErrorState />,
      },
      {
        path: 'coffee-varieties',
        lazy: {
          loader: async () =>
            (await import('./pages/admin/AdminCoffeeVarietiesPage.data.ts')).loader,
          action: async () =>
            (await import('./pages/admin/AdminCoffeeVarietiesPage.data.ts')).action,
          Component: async () =>
            (await import('./pages/admin/AdminCoffeeVarietiesPage.tsx')).AdminCoffeeVarietiesPage,
        },
        errorElement: <RouteErrorState />,
      },
      {
        path: 'compatibility',
        lazy: {
          loader: async () => (await import('./pages/admin/AdminCompatibilityPage.data.ts')).loader,
          action: async () => (await import('./pages/admin/AdminCompatibilityPage.data.ts')).action,
          Component: async () =>
            (await import('./pages/admin/AdminCompatibilityPage.tsx')).AdminCompatibilityPage,
        },
        errorElement: <RouteErrorState />,
      },
      {
        path: 'badges',
        lazy: {
          loader: async () => (await import('./pages/admin/AdminBadgesPage.data.ts')).loader,
          Component: async () =>
            (await import('./pages/admin/AdminBadgesPage.tsx')).AdminBadgesPage,
        },
        errorElement: <RouteErrorState />,
      },
      {
        path: 'audit-log',
        lazy: {
          loader: async () => (await import('./pages/admin/AdminAuditLogPage.data.ts')).loader,
          Component: async () =>
            (await import('./pages/admin/AdminAuditLogPage.tsx')).AdminAuditLogPage,
        },
        errorElement: <RouteErrorState />,
      },
      {
        path: 'cache',
        lazy: {
          action: async () => (await import('./pages/admin/AdminCachePage.data.ts')).action,
          Component: async () => (await import('./pages/admin/AdminCachePage.tsx')).AdminCachePage,
        },
        errorElement: <RouteErrorState />,
      },
    ],
  },
];

/**
 * Creates the browser router for the running app from {@link routes}. Called once by
 * `App.tsx`; kept as a factory so module import has no side effects (no loaders start).
 */
export function createAppRouter() {
  return createBrowserRouter(routes);
}
