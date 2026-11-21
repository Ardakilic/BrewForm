import type { ComponentType } from 'react';
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
import {
  action as brewLogFormAction,
  loader as brewLogFormLoader,
} from './pages/brew-logs/BrewLogFormPage.data.ts';
import { BrewLogFormPage } from './pages/brew-logs/BrewLogFormPage.tsx';
import { loader as brewLogListLoader } from './pages/brew-logs/BrewLogListPage.data.ts';
import { BrewLogListPage } from './pages/brew-logs/BrewLogListPage.tsx';
import { action as contactAction } from './pages/ContactPage.data.ts';
import { ContactPage } from './pages/ContactPage.tsx';
import { action as collectionCreateAction } from './pages/collections/CollectionCreatePage.data.ts';
import { CollectionCreatePage } from './pages/collections/CollectionCreatePage.tsx';
import {
  action as collectionDetailAction,
  loader as collectionDetailLoader,
  reorderAction as collectionReorderAction,
} from './pages/collections/CollectionDetailPage.data.ts';
import { CollectionDetailPage } from './pages/collections/CollectionDetailPage.tsx';
import {
  action as collectionEditAction,
  loader as collectionEditLoader,
} from './pages/collections/CollectionEditPage.data.ts';
import { CollectionEditPage } from './pages/collections/CollectionEditPage.tsx';
import { loader as collectionListLoader } from './pages/collections/CollectionListPage.data.ts';
import { CollectionListPage } from './pages/collections/CollectionListPage.tsx';
import { loader as collectionsBrowseLoader } from './pages/collections/CollectionsBrowsePage.data.ts';
import { CollectionsBrowsePage } from './pages/collections/CollectionsBrowsePage.tsx';
import { NotFoundPage } from './pages/ErrorPage.tsx';
// Eagerly loaded: high-traffic public pages and lightweight auth pages
import { loader as homeLoader } from './pages/HomePage.data.ts';
import { HomePage } from './pages/HomePage.tsx';
import { loader as notificationListLoader } from './pages/notifications/NotificationListPage.data.ts';
import { NotificationListPage } from './pages/notifications/NotificationListPage.tsx';
import { PrivacyPage } from './pages/PrivacyPage.tsx';
import {
  loader as detailLoader,
  shouldRevalidate as shouldRevalidateDetail,
} from './pages/recipes/RecipeDetailPage.data.ts';
import { RecipeDetailPage } from './pages/recipes/RecipeDetailPage.tsx';
import { loader as recipeListLoader } from './pages/recipes/RecipeListPage.data.ts';
import { RecipeListPage } from './pages/recipes/RecipeListPage.tsx';
import { RecipeNotAvailablePage } from './pages/recipes/RecipeNotAvailablePage.tsx';
import { loader as starredLoader } from './pages/recipes/StarredRecipesPage.data.ts';
import { StarredRecipesPage } from './pages/recipes/StarredRecipesPage.tsx';
import {
  action as settingsAction,
  loader as settingsLoader,
} from './pages/settings/SettingsPage.data.ts';
import { SettingsPage } from './pages/settings/SettingsPage.tsx';
import { TermsPage } from './pages/TermsPage.tsx';
import { loader as profileLoader } from './pages/users/UserProfilePage.data.ts';
import { UserProfilePage } from './pages/users/UserProfilePage.tsx';
import { createCommentAction, deleteCommentAction, listCommentsLoader } from './routes/comments.ts';
import { favouriteAction } from './routes/favourite.ts';
import { followAction } from './routes/follow.ts';
// Resource route actions
import { likeAction } from './routes/like.ts';
import { rateAction } from './routes/rate.ts';
import { sendVerificationAction } from './routes/resources/auth.ts';
import {
  recipeBrewLogsLoader,
  recipeBrewStatsLoader,
  shouldRevalidateBrewLogs,
} from './routes/resources/brew-logs.ts';
import {
  coffeeVarietySearchLoader,
  shouldRevalidateCoffeeVarietySearch,
} from './routes/resources/coffee-varieties.ts';
import {
  markAllReadAction,
  markReadAction,
  notificationsPageLoader,
  shouldRevalidateNotifications,
  unreadCountLoader,
} from './routes/resources/notifications.ts';
import { uploadPhotoAction } from './routes/resources/photos.ts';
import { recipeQrLoader, shouldRevalidateRecipeQr } from './routes/resources/qrcode.ts';
import { shouldRevalidateTasteNotes, tasteNotesLoader } from './routes/resources/taste-notes.ts';
import { ROOT_ROUTE_ID, rootLoader, shouldRevalidateRoot } from './routes/root.ts';

/**
 * Wraps a lazily loaded auth-only page in the `RequireAuth` render guard (signed-out users
 * are replaced to `/login?next=…`), for granular `lazy: { Component }` routes whose page
 * module is code-split.
 */
function withRequireAuthGuard(Page: ComponentType): ComponentType {
  /** The guarded page: renders `Page` only for a signed-in user. */
  function GuardedPage() {
    return (
      <RequireAuth>
        <Page />
      </RequireAuth>
    );
  }
  GuardedPage.displayName = `RequireAuth(${Page.displayName ?? Page.name})`;
  return GuardedPage;
}

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
        errorElement: <RouteErrorState />,
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
        errorElement: <RouteErrorState />,
      },
      {
        path: 'recipes/starred',
        element: (
          <RequireAuth>
            <StarredRecipesPage />
          </RequireAuth>
        ),
        loader: starredLoader,
        errorElement: <RouteErrorState />,
      },
      { path: 'recipes/unavailable', element: <RecipeNotAvailablePage /> },
      {
        path: 'recipes/new',
        lazy: {
          loader: async () => (await import('./pages/recipes/RecipeCreatePage.data.ts')).loader,
          action: async () => (await import('./pages/recipes/RecipeCreatePage.data.ts')).action,
          Component: async () =>
            withRequireAuthGuard(
              (await import('./pages/recipes/RecipeCreatePage.tsx')).RecipeCreatePage,
            ),
        },
        errorElement: <RouteErrorState />,
      },
      {
        path: 'recipes/compare/:slug1/:slug2',
        lazy: {
          loader: async () => (await import('./pages/recipes/RecipeComparePage.data.ts')).loader,
          action: async () => (await import('./pages/recipes/RecipeComparePage.data.ts')).action,
          Component: async () =>
            (await import('./pages/recipes/RecipeComparePage.tsx')).RecipeComparePage,
        },
        errorElement: <RouteErrorState />,
      },
      {
        path: 'recipes/:slug/versions/diff',
        lazy: {
          loader: async () => (await import('./pages/recipes/VersionDiffPage.data.ts')).loader,
          Component: async () =>
            (await import('./pages/recipes/VersionDiffPage.tsx')).VersionDiffPage,
        },
        errorElement: <RouteErrorState />,
      },
      {
        path: 'recipes/:slug/versions',
        lazy: {
          loader: async () => (await import('./pages/recipes/RecipeVersionsPage.data.ts')).loader,
          Component: async () =>
            (await import('./pages/recipes/RecipeVersionsPage.tsx')).RecipeVersionsPage,
        },
        errorElement: <RouteErrorState />,
      },
      {
        path: 'recipes/:slug',
        element: <RecipeDetailPage />,
        loader: detailLoader,
        shouldRevalidate: shouldRevalidateDetail,
        errorElement: <RouteErrorState />,
      },
      {
        path: 'collections',
        element: (
          <RequireAuth>
            <CollectionListPage />
          </RequireAuth>
        ),
        loader: collectionListLoader,
        errorElement: <RouteErrorState />,
      },
      {
        path: 'collections/browse',
        element: <CollectionsBrowsePage />,
        loader: collectionsBrowseLoader,
        errorElement: <RouteErrorState />,
      },
      {
        path: 'collections/new',
        element: (
          <RequireAuth>
            <CollectionCreatePage />
          </RequireAuth>
        ),
        action: collectionCreateAction,
        errorElement: <RouteErrorState />,
      },
      {
        path: 'collections/:id',
        element: <CollectionDetailPage />,
        loader: collectionDetailLoader,
        action: collectionDetailAction,
        errorElement: <RouteErrorState />,
      },
      {
        path: 'collections/:id/edit',
        element: (
          <RequireAuth>
            <CollectionEditPage />
          </RequireAuth>
        ),
        loader: collectionEditLoader,
        action: collectionEditAction,
        errorElement: <RouteErrorState />,
      },
      {
        path: 'brew-logs',
        element: (
          <RequireAuth>
            <BrewLogListPage />
          </RequireAuth>
        ),
        loader: brewLogListLoader,
        errorElement: <RouteErrorState />,
      },
      {
        path: 'brew-logs/new',
        element: (
          <RequireAuth>
            <BrewLogFormPage />
          </RequireAuth>
        ),
        loader: brewLogFormLoader,
        action: brewLogFormAction,
        errorElement: <RouteErrorState />,
      },
      {
        path: 'brew-logs/:id/edit',
        element: (
          <RequireAuth>
            <BrewLogFormPage />
          </RequireAuth>
        ),
        loader: brewLogFormLoader,
        action: brewLogFormAction,
        errorElement: <RouteErrorState />,
      },
      {
        path: 'recipes/:slug/focus',
        lazy: {
          loader: async () => (await import('./pages/recipes/RecipeFocusModePage.data.ts')).loader,
          Component: async () =>
            (await import('./pages/recipes/RecipeFocusModePage.tsx')).RecipeFocusModePage,
        },
        errorElement: <RouteErrorState />,
      },
      {
        path: 'recipes/:id/edit',
        lazy: {
          loader: async () => (await import('./pages/recipes/RecipeEditPage.data.ts')).loader,
          action: async () => (await import('./pages/recipes/RecipeEditPage.data.ts')).action,
          Component: async () =>
            withRequireAuthGuard(
              (await import('./pages/recipes/RecipeEditPage.tsx')).RecipeEditPage,
            ),
        },
        errorElement: <RouteErrorState />,
      },
      {
        path: 'recipes/:id/fork',
        lazy: {
          loader: async () => (await import('./pages/recipes/RecipeForkPage.data.ts')).loader,
          action: async () => (await import('./pages/recipes/RecipeForkPage.data.ts')).action,
          Component: async () =>
            withRequireAuthGuard(
              (await import('./pages/recipes/RecipeForkPage.tsx')).RecipeForkPage,
            ),
        },
        errorElement: <RouteErrorState />,
      },
      {
        path: 'u/:username',
        element: <UserProfilePage />,
        loader: profileLoader,
        errorElement: <RouteErrorState />,
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
        errorElement: <RouteErrorState />,
      },
      {
        path: 'setups',
        lazy: {
          loader: async () => (await import('./pages/setups/SetupListPage.data.ts')).loader,
          action: async () => (await import('./pages/setups/SetupListPage.data.ts')).action,
          Component: async () =>
            withRequireAuthGuard((await import('./pages/setups/SetupListPage.tsx')).SetupListPage),
        },
        errorElement: <RouteErrorState />,
      },
      {
        path: 'beans',
        lazy: {
          loader: async () => (await import('./pages/beans/BeanListPage.data.ts')).loader,
          action: async () => (await import('./pages/beans/BeanListPage.data.ts')).action,
          Component: async () =>
            withRequireAuthGuard((await import('./pages/beans/BeanListPage.tsx')).BeanListPage),
        },
        errorElement: <RouteErrorState />,
      },
      {
        path: 'equipment',
        lazy: {
          loader: async () => (await import('./pages/equipment/EquipmentListPage.data.ts')).loader,
          action: async () => (await import('./pages/equipment/EquipmentListPage.data.ts')).action,
          Component: async () =>
            withRequireAuthGuard(
              (await import('./pages/equipment/EquipmentListPage.tsx')).EquipmentListPage,
            ),
        },
        errorElement: <RouteErrorState />,
      },
      {
        path: 'equipments',
        lazy: {
          loader: async () =>
            (await import('./pages/equipment/EquipmentCatalogPage.data.ts')).loader,
          Component: async () =>
            (await import('./pages/equipment/EquipmentCatalogPage.tsx')).EquipmentCatalogPage,
        },
        errorElement: <RouteErrorState />,
      },
      {
        path: 'equipment/catalog',
        element: <Navigate to="/equipments" replace />,
      },
      {
        path: 'equipment/:id',
        lazy: {
          loader: async () =>
            (await import('./pages/equipment/EquipmentDetailPage.data.ts')).loader,
          Component: async () =>
            (await import('./pages/equipment/EquipmentDetailPage.tsx')).EquipmentDetailPage,
        },
        errorElement: <RouteErrorState />,
      },
      {
        path: 'coffee-varieties',
        lazy: {
          loader: async () =>
            (await import('./pages/coffee-varieties/CoffeeVarietiesPage.data.ts')).loader,
          Component: async () =>
            (await import('./pages/coffee-varieties/CoffeeVarietiesPage.tsx')).CoffeeVarietiesPage,
        },
        errorElement: <RouteErrorState />,
      },
      {
        path: 'coffee-varieties/:id',
        lazy: {
          loader: async () =>
            (await import('./pages/coffee-varieties/CoffeeVarietyDetailPage.data.ts')).loader,
          Component: async () =>
            (await import('./pages/coffee-varieties/CoffeeVarietyDetailPage.tsx'))
              .CoffeeVarietyDetailPage,
        },
        errorElement: <RouteErrorState />,
      },
      {
        path: 'taste-notes',
        lazy: {
          loader: async () => (await import('./pages/TasteNotesPage.data.ts')).loader,
          shouldRevalidate: async () =>
            (await import('./pages/TasteNotesPage.data.ts')).shouldRevalidate,
          Component: async () => (await import('./pages/TasteNotesPage.tsx')).TasteNotesPage,
        },
        errorElement: <RouteErrorState />,
      },
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
      {
        path: 'resources/brew-logs/recipe/:recipeId',
        loader: recipeBrewLogsLoader,
        shouldRevalidate: shouldRevalidateBrewLogs,
      },
      {
        path: 'resources/brew-logs/stats/:recipeId',
        loader: recipeBrewStatsLoader,
        shouldRevalidate: shouldRevalidateBrewLogs,
      },
      {
        path: 'resources/taste-notes',
        loader: tasteNotesLoader,
        shouldRevalidate: shouldRevalidateTasteNotes,
      },
      { path: 'resources/photos', action: uploadPhotoAction },
      {
        path: 'resources/coffee-varieties/search',
        loader: coffeeVarietySearchLoader,
        shouldRevalidate: shouldRevalidateCoffeeVarietySearch,
      },
      { path: 'collections/:id/reorder', action: collectionReorderAction },
      {
        path: 'resources/notifications',
        loader: notificationsPageLoader,
        shouldRevalidate: shouldRevalidateNotifications,
      },
      {
        path: 'resources/notifications/unread-count',
        loader: unreadCountLoader,
        shouldRevalidate: shouldRevalidateNotifications,
      },
      { path: 'resources/notifications/read-all', action: markAllReadAction },
      { path: 'resources/notifications/:id/read', action: markReadAction },
      {
        path: 'resources/qrcode/recipe/:slug',
        loader: recipeQrLoader,
        shouldRevalidate: shouldRevalidateRecipeQr,
      },

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
