import { createBrowserRouter } from 'react-router';
import { Layout } from './components/layout/Layout';
import { RequireAuth } from './components/auth/RequireAuth';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';
import { RecipeListPage } from './pages/recipes/RecipeListPage';
import { RecipeDetailPage } from './pages/recipes/RecipeDetailPage';
import { RecipeCreatePage } from './pages/recipes/RecipeCreatePage';
import { RecipeEditPage } from './pages/recipes/RecipeEditPage';
import { RecipeComparePage } from './pages/recipes/RecipeComparePage';
import { RecipePrintViewPage } from './pages/recipes/RecipePrintViewPage';
import { RecipeFocusModePage } from './pages/recipes/RecipeFocusModePage';
import { UserProfilePage } from './pages/users/UserProfilePage';
import { SearchPage } from './pages/search/SearchPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { SetupListPage } from './pages/setups/SetupListPage';
import { BeanListPage } from './pages/beans/BeanListPage';
import { EquipmentListPage } from './pages/equipment/EquipmentListPage';
import { TasteNotesPage } from './pages/TasteNotesPage';
import { OnboardingWizard } from './components/onboarding/OnboardingWizard';
import { PrivacyPage } from './pages/PrivacyPage';
import { TermsPage } from './pages/TermsPage';
import { AdminLayout } from './pages/admin/AdminLayout';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminUsersPage } from './pages/admin/AdminUsersPage';
import { AdminRecipesPage } from './pages/admin/AdminRecipesPage';
import { AdminEquipmentPage } from './pages/admin/AdminEquipmentPage';
import { AdminVendorsPage } from './pages/admin/AdminVendorsPage';
import { AdminTasteNotesPage } from './pages/admin/AdminTasteNotesPage';
import { AdminCompatibilityPage } from './pages/admin/AdminCompatibilityPage';
import { AdminBadgesPage } from './pages/admin/AdminBadgesPage';
import { AdminAuditLogPage } from './pages/admin/AdminAuditLogPage';
import { AdminCachePage } from './pages/admin/AdminCachePage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'forgot-password', element: <ForgotPasswordPage /> },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      { path: 'recipes', element: <RecipeListPage /> },
      { path: 'recipes/new', element: <RequireAuth><RecipeCreatePage /></RequireAuth> },
      { path: 'recipes/compare/:id1/:id2', element: <RecipeComparePage /> },
      { path: 'recipes/:slug', element: <RecipeDetailPage /> },
      { path: 'recipes/:slug/print', element: <RecipePrintViewPage /> },
      { path: 'recipes/:slug/focus', element: <RecipeFocusModePage /> },
      { path: 'recipes/:id/edit', element: <RequireAuth><RecipeEditPage /></RequireAuth> },
      { path: 'search', element: <SearchPage /> },
      { path: 'u/:username', element: <UserProfilePage /> },
      { path: 'settings', element: <RequireAuth><SettingsPage /></RequireAuth> },
      { path: 'setups', element: <RequireAuth><SetupListPage /></RequireAuth> },
      { path: 'beans', element: <RequireAuth><BeanListPage /></RequireAuth> },
      { path: 'equipment', element: <RequireAuth><EquipmentListPage /></RequireAuth> },
      { path: 'taste-notes', element: <TasteNotesPage /> },
      { path: 'onboarding', element: <RequireAuth><OnboardingWizard /></RequireAuth> },
      { path: 'privacy', element: <PrivacyPage /> },
      { path: 'terms', element: <TermsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    path: '/admin',
    element: <RequireAuth requireAdmin><AdminLayout /></RequireAuth>,
    children: [
      { index: true, element: <AdminDashboard /> },
      { path: 'users', element: <AdminUsersPage /> },
      { path: 'recipes', element: <AdminRecipesPage /> },
      { path: 'equipment', element: <AdminEquipmentPage /> },
      { path: 'vendors', element: <AdminVendorsPage /> },
      { path: 'taste-notes', element: <AdminTasteNotesPage /> },
      { path: 'compatibility', element: <AdminCompatibilityPage /> },
      { path: 'badges', element: <AdminBadgesPage /> },
      { path: 'audit-log', element: <AdminAuditLogPage /> },
      { path: 'cache', element: <AdminCachePage /> },
    ],
  },
]);